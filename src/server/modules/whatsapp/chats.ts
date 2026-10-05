import { z } from 'zod'
import { db } from '@/lib/db'
import { sendWhatsAppText } from '@/lib/whatsapp'
import { WhatsAppAdminError } from './admin'
import { renderBody, buildUserContext } from './variables'
import { matchActiveChatbotRule } from './chatbot'

// ─────────────────────────────────────────────────────────────────────────────
// WA-CHAT — the unified conversation inbox (admin "Chats" tab + the public
// webchat widget).
//
// Every inbound WhatsApp text and every website-widget message lands in a
// WhatsAppChatThread as an IN WhatsAppChatMessage; auto-replies and human
// agent replies are OUT rows. The mini-service owns the WhatsApp side of this
// pipeline (it sees the socket events); THIS module owns the admin console
// reads/writes and the widget flow (runs the SAME rule matcher in-process,
// so auto-replies are demonstrable even without a paired line).
// ─────────────────────────────────────────────────────────────────────────────

export const chatThreadPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    autoReply: z.boolean().optional(),
  })
  .refine(
    (patch) => patch.name !== undefined || patch.autoReply !== undefined,
    'Nothing to update — provide a name and/or autoReply'
  )

export const chatReplySchema = z.object({
  body: z.string().trim().min(1).max(2000),
})

// ── DTO ─────────────────────────────────────────────────────────────────────

export interface ChatThreadDTO {
  id: string
  name: string
  phone: string | null
  source: string
  unreadCount: number
  lastMessageAt: string
  lastMessageBody: string | null
  autoReply: boolean
}

export interface ChatMessageDTO {
  id: string
  direction: string
  body: string
  author: string | null
  createdAt: string
}

type ThreadRow = {
  id: string
  name: string
  phone: string | null
  source: string
  unreadCount: number
  lastMessageAt: Date
  lastMessageBody: string | null
  autoReply: boolean
}

export function serializeChatThread(row: ThreadRow): ChatThreadDTO {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    source: row.source,
    unreadCount: row.unreadCount,
    lastMessageAt: row.lastMessageAt.toISOString(),
    lastMessageBody: row.lastMessageBody,
    autoReply: row.autoReply,
  }
}

export function serializeChatMessage(row: {
  id: string
  direction: string
  body: string
  author: string | null
  createdAt: Date
}): ChatMessageDTO {
  return {
    id: row.id,
    direction: row.direction,
    body: row.body,
    author: row.author,
    createdAt: row.createdAt.toISOString(),
  }
}

const THREAD_SELECT = {
  id: true,
  name: true,
  phone: true,
  source: true,
  userId: true,
  unreadCount: true,
  lastMessageAt: true,
  lastMessageBody: true,
  autoReply: true,
} as const

const MESSAGE_SELECT = {
  id: true,
  direction: true,
  body: true,
  author: true,
  createdAt: true,
} as const

// ── Admin console ───────────────────────────────────────────────────────────

/** Recent threads (newest activity first) + the global unread badge count. */
export async function listChatThreads(): Promise<{ threads: ChatThreadDTO[]; totalUnread: number }> {
  const [rows, unread] = await Promise.all([
    db.whatsAppChatThread.findMany({
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
      select: THREAD_SELECT,
    }),
    db.whatsAppChatThread.aggregate({ _sum: { unreadCount: true } }),
  ])
  return { threads: rows.map(serializeChatThread), totalUnread: unread._sum.unreadCount ?? 0 }
}

async function requireThread(threadId: string) {
  const thread = await db.whatsAppChatThread.findUnique({
    where: { id: threadId },
    select: THREAD_SELECT,
  })
  if (!thread) throw new WhatsAppAdminError(404, 'Chat thread not found')
  return thread
}

/** Thread detail + full history (asc). Marks the thread read for this admin. */
export async function getChatThread(
  threadId: string
): Promise<{ thread: ChatThreadDTO; messages: ChatMessageDTO[] }> {
  const thread = await requireThread(threadId)
  const messages = await db.whatsAppChatMessage.findMany({
    where: { threadId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 500,
    select: MESSAGE_SELECT,
  })
  if (thread.unreadCount > 0) {
    await db.whatsAppChatThread.update({
      where: { id: threadId },
      data: { unreadCount: 0 },
    })
    thread.unreadCount = 0
  }
  return { thread: serializeChatThread(thread), messages: messages.map(serializeChatMessage) }
}

/**
 * Human agent reply from the console — one OUT ChatMessage. WHATSAPP-source
 * threads are ALSO delivered over the paired line (best-effort — the bubble
 * exists either way); WEBCHAT threads just get the row, which the widget
 * polls. `delivery` reports which of those happened.
 */
export async function replyToChatThread(
  threadId: string,
  body: string
): Promise<{ message: ChatMessageDTO; delivery: 'whatsapp' | 'dev' | 'webchat' }> {
  const thread = await requireThread(threadId)

  const message = await db.whatsAppChatMessage.create({
    data: { threadId, direction: 'OUT', body, author: 'agent' },
    select: MESSAGE_SELECT,
  })
  await db.whatsAppChatThread.update({
    where: { id: threadId },
    data: { lastMessageAt: new Date(), lastMessageBody: body },
  })

  let delivery: 'whatsapp' | 'dev' | 'webchat' = 'webchat'
  if (thread.source === 'WHATSAPP' && thread.phone) {
    const result = await sendWhatsAppText({
      toPhone: thread.phone,
      body,
      template: 'CUSTOM',
      userId: thread.userId,
    })
    delivery = result.delivered
  }
  return { message: serializeChatMessage(message), delivery }
}

/** Rename a thread / flip its per-thread auto-reply switch. */
export async function updateChatThread(
  threadId: string,
  patch: z.infer<typeof chatThreadPatchSchema>
): Promise<ChatThreadDTO> {
  await requireThread(threadId)
  const updated = await db.whatsAppChatThread.update({
    where: { id: threadId },
    data: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.autoReply !== undefined ? { autoReply: patch.autoReply } : {}),
    },
    select: THREAD_SELECT,
  })
  return serializeChatThread(updated)
}

/** Deletes the thread (messages cascade); returns what was removed for the audit row. */
export async function deleteChatThread(threadId: string): Promise<ChatThreadDTO> {
  const thread = await requireThread(threadId)
  await db.whatsAppChatThread.delete({ where: { id: threadId } })
  return serializeChatThread(thread)
}

// ── Auto-reply engine (shared by the widget; the mini-service has its own copy) ──

/**
 * Matches `text` against the ACTIVE rules and, on a hit, renders the reply
 * ({{name}} = the thread's display name, date/time evaluated now), appends
 * the OUT ChatMessage authored `auto-reply: <rule>` and increments hits.
 * Returns the reply for the response, or null when no rule matched.
 */
export async function runAutoReply(
  threadId: string,
  threadName: string,
  threadPhone: string | null,
  text: string
): Promise<{ name: string; body: string } | null> {
  const rule = await matchActiveChatbotRule(text)
  if (!rule) return null

  const ctx = { ...buildUserContext(null, threadPhone ?? ''), name: threadName || 'عميلنا العزيز' }
  const reply = renderBody(rule.reply, ctx)

  await db.$transaction([
    db.whatsAppChatMessage.create({
      data: { threadId, direction: 'OUT', body: reply, author: `auto-reply: ${rule.name}` },
    }),
    db.whatsAppChatThread.update({
      where: { id: threadId },
      data: { lastMessageAt: new Date(), lastMessageBody: reply },
    }),
    db.chatbotRule.update({ where: { id: rule.id }, data: { hits: { increment: 1 } } }),
  ])

  return { name: rule.name, body: reply }
}
