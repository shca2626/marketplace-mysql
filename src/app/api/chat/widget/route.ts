import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { runAutoReply } from '@/server/modules/whatsapp/chatbot'

/**
 * /api/chat/widget — PUBLIC token-gated endpoint backing the floating
 * marketplace chat widget (visitor side). No auth: the conversation secret is
 * the per-conversation `widgetToken` (uuid) handed to the visitor on creation
 * and persisted in their localStorage.
 *
 *  GET  ?cid=<id>&token=<widgetToken>&after=<iso>   → poll the thread
 *  POST { name?, phone?, email?, sellerId?, subject?, message, cid?, token? }
 *        → send a visitor message (continues an existing conversation when
 *          cid+token are provided, otherwise opens a new one) and runs the
 *          seeded chatbot for an instant auto-reply.
 */

const messageSelect = {
  id: true,
  senderRole: true,
  senderName: true,
  body: true,
  createdAt: true,
} as const

const postSchema = z.object({
  name: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(24).optional(),
  email: z
    .string()
    .trim()
    .max(120)
    .optional()
    .refine((v) => !v || /.+@.+\..+/.test(v), { message: 'Please provide a valid email address' }),
  sellerId: z.string().trim().max(64).optional(),
  subject: z.string().trim().max(120).optional(),
  message: z
    .string()
    .trim()
    .min(1, 'Message is required')
    .max(2000, 'Message must be 2000 characters or fewer'),
  // continuation — the client passes these when it already owns a conversation
  cid: z.string().trim().max(64).optional(),
  token: z.string().trim().max(64).optional(),
})

/** Resolve the display name of the seller (store) behind a conversation, if any. */
async function sellerStoreNameFor(sellerOrgId: string | null | undefined): Promise<string | null> {
  if (!sellerOrgId) return null
  try {
    const seller = await db.user.findUnique({
      where: { id: sellerOrgId },
      select: { storeName: true, name: true },
    })
    return seller?.storeName || seller?.name || null
  } catch {
    return null
  }
}

// ── GET: poll the thread (token-gated) ─────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams
    const cid = params.get('cid')?.trim()
    const token = params.get('token')?.trim()
    const after = params.get('after')?.trim()

    if (!cid || !token) {
      return NextResponse.json({ error: 'Missing cid or token' }, { status: 400 })
    }

    let afterDate: Date | undefined
    if (after) {
      const parsed = new Date(after)
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: 'Invalid "after" timestamp' }, { status: 400 })
      }
      afterDate = parsed
    }

    const conversation = await db.chatConversation.findUnique({
      where: { id: cid },
      select: { id: true, widgetToken: true, status: true, subject: true, sellerOrgId: true },
    })

    // Unknown conversation OR wrong secret → indistinguishable 404 (no probing).
    if (!conversation || !conversation.widgetToken || conversation.widgetToken !== token) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // latest 200 messages, returned ascending (newest-first query then flipped
    // so a long thread shows its TAIL, like WhatsApp)
    const messages = (await db.chatMessage.findMany({
      where: { conversationId: cid, ...(afterDate ? { createdAt: { gt: afterDate } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: messageSelect,
    })).reverse()

    // Visitor is looking at the thread → clear their unread counter
    // (fire-and-forget; a failure must never break the poll).
    void db.chatConversation.update({ where: { id: cid }, data: { unreadVisitor: 0 } }).catch(() => {})

    const sellerStoreName = await sellerStoreNameFor(conversation.sellerOrgId)

    return NextResponse.json({
      conversation: {
        id: conversation.id,
        status: conversation.status,
        subject: conversation.subject,
        sellerStoreName,
      },
      messages,
    })
  } catch (err) {
    console.error('[api/chat/widget] GET failed', err)
    return NextResponse.json({ error: 'Failed to load conversation' }, { status: 500 })
  }
}

// ── POST: send a visitor message (new or continued conversation) ────────────
export async function POST(req: NextRequest) {
  try {
    const json = await req.json().catch(() => null)
    const parsed = postSchema.safeParse(json ?? {})
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const field = issue?.path?.join('.')
      return NextResponse.json(
        { error: issue?.message || 'Invalid request', ...(field ? { field } : {}) },
        { status: 400 },
      )
    }
    const { name, phone, email, sellerId, subject, message, cid, token } = parsed.data

    // ── 1. Locate (or create) the conversation ────────────────────────────
    let conversationId: string
    let widgetToken: string
    let sellerOrgId: string | null
    let isNew = false

    if (cid && token) {
      // CONTINUATION — the client already owns this conversation (localStorage).
      const existing = await db.chatConversation.findUnique({
        where: { id: cid },
        select: { id: true, widgetToken: true, sellerOrgId: true },
      })
      if (!existing || !existing.widgetToken || existing.widgetToken !== token) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
      }
      conversationId = existing.id
      widgetToken = existing.widgetToken
      sellerOrgId = existing.sellerOrgId
    } else {
      // NEW conversation — the secret token stays with the visitor.
      const created = await db.chatConversation.create({
        data: {
          kind: 'WIDGET',
          widgetToken: crypto.randomUUID(),
          visitorName: name || null,
          visitorPhone: phone || null,
          visitorEmail: email || null,
          sellerOrgId: sellerId || null,
          subject: subject || 'Store inquiry',
          lastMessageAt: new Date(),
          lastMessagePreview: message.slice(0, 140),
          unreadStaff: 1, // the visitor's first message below
        },
        select: { id: true, widgetToken: true, sellerOrgId: true },
      })
      if (!created.widgetToken) throw new Error('widgetToken missing after create')
      conversationId = created.id
      widgetToken = created.widgetToken
      sellerOrgId = created.sellerOrgId
      isNew = true
    }

    // ── 2. Persist the visitor's message ─────────────────────────────────
    const visitorMessage = await db.chatMessage.create({
      data: {
        conversationId,
        senderRole: 'VISITOR',
        senderName: name || null,
        body: message,
      },
      select: messageSelect,
    })

    if (!isNew) {
      await db.chatConversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: new Date(),
          lastMessagePreview: message.slice(0, 140),
          unreadStaff: { increment: 1 },
          status: 'OPEN', // visitor replied to a closed thread → reopen (WhatsApp-style)
        },
      })
    }

    // ── 3. Chatbot auto-reply (seeded rules; null when nothing matches) ──
    const messages = [visitorMessage]
    let botReply: string | null = null
    try {
      botReply = await runAutoReply(message)
    } catch (err) {
      console.error('[api/chat/widget] auto-reply failed', err)
    }
    if (botReply) {
      const botMessage = await db.chatMessage.create({
        data: {
          conversationId,
          senderRole: 'BOT',
          senderName: 'Vendora Assistant',
          body: botReply,
        },
        select: messageSelect,
      })
      messages.push(botMessage)

      // The visitor has a bot reply waiting (their next poll clears it).
      await db.chatConversation.update({
        where: { id: conversationId },
        data: { unreadVisitor: { increment: 1 } },
      })
    }

    const sellerStoreName = await sellerStoreNameFor(sellerOrgId)

    return NextResponse.json({ conversationId, token: widgetToken, sellerStoreName, messages })
  } catch (err) {
    console.error('[api/chat/widget] POST failed', err)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}
