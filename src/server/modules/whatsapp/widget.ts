import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { db } from '@/lib/db'
import { normalizeE164, normalizeYemeniPhone } from '@/lib/phone'
import { sendWhatsAppText } from '@/lib/whatsapp'
import { runAutoReply, serializeChatMessage, type ChatMessageDTO } from './chats'

// ─────────────────────────────────────────────────────────────────────────────
// WA-CHAT — public webchat widget (the floating bubble on the storefront).
//
// Anyone can open a session: a logged-in user's details are reused, a phone
// that matches an account links the thread to it, everyone else chats as a
// named visitor ('زائر' fallback). Messages flow through the SAME
// WhatsAppChatThread/WhatsAppChatMessage tables the admin console reads, and
// the SAME chatbot rule matcher the paired line uses — so auto-replies work
// end-to-end even while no WhatsApp line is paired.
// ─────────────────────────────────────────────────────────────────────────────

export const widgetSessionSchema = z.object({
  name: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(30).optional(),
})

export const widgetSendSchema = z.object({
  token: z.string().trim().length(64),
  body: z.string().trim().min(1).max(2000),
})

const SUPPORT_PHONE_SETTING_KEY = 'whatsapp.supportPhone'

/** Widget-flow error with an HTTP status (translated by the routes). */
export class WidgetError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/**
 * Creates a WEBCHAT thread and returns its unguessable session token.
 * Identity resolution order:
 *   1. logged-in session user → their name/phone/userId
 *   2. phone matching an account → link userId + use the ACCOUNT name
 *   3. provided name, else 'زائر'
 */
export async function createWidgetSession(
  input: z.infer<typeof widgetSessionSchema>,
  sessionUser: { id: string; name: string; phone: string | null } | null
): Promise<{ token: string; name: string }> {
  let name = input.name?.trim() ?? ''
  let phone: string | null = null
  let userId: string | null = null

  if (sessionUser) {
    name = sessionUser.name
    phone = sessionUser.phone
    userId = sessionUser.id
  } else if (input.phone) {
    const normalized = normalizeE164(input.phone) ?? normalizeYemeniPhone(input.phone)
    if (!normalized) {
      throw new WidgetError(400, 'Enter a valid phone number, or leave it empty to chat as a guest')
    }
    phone = normalized
    // phone is a non-unique contact column — findFirst, never findUnique
    const account = await db.user.findFirst({
      where: { phone: normalized },
      select: { id: true, name: true },
    })
    if (account) {
      userId = account.id
      name = account.name // account identity beats a typed name
    }
  }

  if (!name) name = 'زائر'

  const thread = await db.whatsAppChatThread.create({
    data: {
      source: 'WEBCHAT',
      name,
      phone,
      userId,
      publicToken: randomBytes(32).toString('hex'),
      lastMessageAt: new Date(),
    },
    select: { publicToken: true, name: true },
  })
  if (!thread.publicToken) throw new WidgetError(500, 'Failed to start the chat session')

  return { token: thread.publicToken, name: thread.name }
}

async function requireWidgetThread(token: string) {
  const thread = await db.whatsAppChatThread.findUnique({
    where: { publicToken: token },
    select: { id: true, name: true, phone: true, autoReply: true },
  })
  if (!thread) throw new WidgetError(404, 'This chat session has ended — please start a new chat')
  return thread
}

/**
 * Visitor message: IN bubble + thread counters, then (when the thread has
 * auto-reply on) the first matching ACTIVE chatbot rule replies in-process.
 * Every message is ALSO mirrored best-effort to the support phone so the team
 * never misses a website chat.
 */
export async function sendWidgetMessage(
  token: string,
  body: string
): Promise<{ message: ChatMessageDTO; autoReply: { name: string; body: string } | null }> {
  const thread = await requireWidgetThread(token)

  const message = await db.whatsAppChatMessage.create({
    data: { threadId: thread.id, direction: 'IN', body, author: 'visitor' },
    select: { id: true, direction: true, body: true, author: true, createdAt: true },
  })
  await db.whatsAppChatThread.update({
    where: { id: thread.id },
    data: { lastMessageAt: new Date(), lastMessageBody: body, unreadCount: { increment: 1 } },
  })

  let autoReply: { name: string; body: string } | null = null
  if (thread.autoReply) {
    try {
      autoReply = await runAutoReply(thread.id, thread.name, thread.phone, body)
    } catch (err) {
      console.error('widget auto-reply failed', err) // the visitor's message still went through
    }
  }

  // Support-phone mirror — fire-and-forget, never blocks the visitor.
  void mirrorToSupportPhone(thread.name, thread.phone, body)

  return { message: serializeChatMessage(message), autoReply }
}

/** Incremental poll: messages with id > afterId, oldest first. */
export async function listWidgetMessages(
  token: string,
  afterId: string
): Promise<ChatMessageDTO[]> {
  await requireWidgetThread(token)
  const messages = await db.whatsAppChatMessage.findMany({
    where: { thread: { publicToken: token }, ...(afterId ? { id: { gt: afterId } } : {}) },
    orderBy: { createdAt: 'asc' },
    take: 200,
    select: { id: true, direction: true, body: true, author: true, createdAt: true },
  })
  return messages.map(serializeChatMessage)
}

// ── Support phone resolution ────────────────────────────────────────────────

/**
 * Where visitor messages are mirrored so the support team sees them on their
 * phone: PlatformSetting 'whatsapp.supportPhone' (raw digits / +E.164, or a
 * JSON-quoted string) → else the first ADMIN user with a phone → else null.
 */
export async function resolveSupportPhone(): Promise<string | null> {
  try {
    const row = await db.platformSetting.findUnique({
      where: { key: SUPPORT_PHONE_SETTING_KEY },
      select: { value: true },
    })
    if (row?.value) {
      // The value may be a bare "+966…" / digits, or JSON-quoted ("+966…").
      let raw: string = row.value
      try {
        const parsed: unknown = JSON.parse(raw)
        if (typeof parsed === 'string') raw = parsed
      } catch {
        /* bare value — use as-is */
      }
      const normalized = normalizeE164(raw) ?? normalizeYemeniPhone(raw)
      if (normalized) return normalized
    }
  } catch (err) {
    console.error('support phone setting read failed', err)
  }

  try {
    const admin = await db.user.findFirst({
      where: { role: 'ADMIN', phone: { not: null } },
      orderBy: { createdAt: 'asc' },
      select: { phone: true },
    })
    return admin?.phone ?? null
  } catch (err) {
    console.error('support phone admin lookup failed', err)
    return null
  }
}

/** Best-effort WhatsApp mirror of a visitor message (template NOTIFICATION). */
async function mirrorToSupportPhone(
  threadName: string,
  threadPhone: string | null,
  body: string
): Promise<void> {
  try {
    const supportPhone = await resolveSupportPhone()
    if (!supportPhone) return // nobody to notify — skip silently
    await sendWhatsAppText({
      toPhone: supportPhone,
      body: `💬 ${threadName}${threadPhone ? ` (${threadPhone})` : ''}: ${body}`,
      template: 'NOTIFICATION',
    })
  } catch {
    // mirroring must never affect the visitor flow
  }
}
