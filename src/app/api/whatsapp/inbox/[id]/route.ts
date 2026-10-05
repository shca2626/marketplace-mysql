import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/server/guards'
import { waServiceSend } from '@/server/modules/whatsapp/send'

// ─────────────────────────────────────────────────────────────────────────────
// /api/whatsapp/inbox/[id] — one conversation
//   GET   — conversation + last 100 messages (ascending)
//   POST  — { body } staff reply (also delivered over WhatsApp for WHATSAPP
//           threads, best effort) · { action: 'mark-read' } clears unreadStaff
//   PATCH — { status: OPEN | CLOSED } close / reopen
// ─────────────────────────────────────────────────────────────────────────────

async function resolveSellerName(sellerOrgId: string | null): Promise<string | null> {
  if (!sellerOrgId) return null
  const seller = await db.user.findUnique({
    where: { id: sellerOrgId },
    select: { name: true, storeName: true },
  })
  return seller ? seller.storeName || seller.name : null
}

function conversationOut(c: {
  id: string
  kind: string
  channelRef: string | null
  buyerId: string | null
  visitorName: string | null
  visitorPhone: string | null
  visitorEmail: string | null
  sellerOrgId: string | null
  subject: string | null
  lastMessageAt: Date
  lastMessagePreview: string | null
  unreadStaff: number
  status: string
  createdAt: Date
}) {
  return {
    id: c.id,
    kind: c.kind,
    channelRef: c.channelRef,
    buyerId: c.buyerId,
    visitorName: c.visitorName,
    visitorPhone: c.visitorPhone,
    visitorEmail: c.visitorEmail,
    sellerOrgId: c.sellerOrgId,
    subject: c.subject,
    lastMessageAt: c.lastMessageAt,
    lastMessagePreview: c.lastMessagePreview,
    unreadStaff: c.unreadStaff,
    status: c.status,
    createdAt: c.createdAt,
  }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin('storefront.manage')
  if (error) return error
  try {
    const { id } = await ctx.params
    const conversation = await db.chatConversation.findUnique({ where: { id } })
    if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

    const recent = await db.chatMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, senderRole: true, senderName: true, body: true, readAt: true, createdAt: true },
    })
    const messages = recent.reverse() // display order: oldest → newest

    return NextResponse.json({
      conversation: conversationOut(conversation),
      messages,
      sellerStoreName: await resolveSellerName(conversation.sellerOrgId),
    })
  } catch (err) {
    console.error('[api/whatsapp/inbox/[id]] GET failed', err)
    return NextResponse.json({ error: 'Failed to load conversation' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin('storefront.manage')
  if (error) return error
  try {
    const { id } = await ctx.params
    const body = (await req.json()) as { body?: string; action?: string }

    // mark-read action
    if (body.action === 'mark-read') {
      const conversation = await db.chatConversation.update({
        where: { id },
        data: { unreadStaff: 0 },
      })
      return NextResponse.json({ conversation: conversationOut(conversation) })
    }

    // staff reply
    const text = (body.body ?? '').trim()
    if (!text) return NextResponse.json({ error: 'Reply body is required' }, { status: 400 })
    if (text.length > 4000) return NextResponse.json({ error: 'Reply is too long (max 4000 chars)' }, { status: 400 })

    const conversation = await db.chatConversation.findUnique({ where: { id } })
    if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

    const message = await db.chatMessage.create({
      data: {
        conversationId: id,
        senderRole: 'STAFF',
        senderName: user.name || user.email,
        body: text,
      },
    })
    await db.chatConversation.update({
      where: { id },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: text.slice(0, 140),
        unreadStaff: 0,
      },
    })

    // Best-effort WhatsApp delivery for WHATSAPP threads — the chat message
    // stays regardless; a delivery failure is surfaced, not fatal.
    let delivered: boolean | null = null
    let deliveryError: string | null = null
    if (conversation.kind === 'WHATSAPP' && conversation.channelRef) {
      const result = await waServiceSend(conversation.channelRef, text)
      delivered = result.ok
      deliveryError = result.ok ? null : result.error ?? 'WhatsApp delivery failed'
      await db.whatsAppMessage.create({
        data: {
          toNumber: conversation.channelRef,
          body: text,
          direction: 'OUT',
          status: result.ok ? 'SENT' : 'FAILED',
          error: deliveryError,
          waMessageId: result.ok ? (result.id ?? null) : null,
          sentAt: result.ok ? new Date() : null,
        },
      }).catch((err) => console.error('[inbox/[id]] log outbound failed', err))
    }

    return NextResponse.json({ message, delivered, deliveryError })
  } catch (err) {
    console.error('[api/whatsapp/inbox/[id]] POST failed', err)
    return NextResponse.json({ error: 'Failed to send reply' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin('storefront.manage')
  if (error) return error
  try {
    const { id } = await ctx.params
    const body = (await req.json()) as { status?: string }
    if (body.status !== 'OPEN' && body.status !== 'CLOSED') {
      return NextResponse.json({ error: 'status must be OPEN or CLOSED' }, { status: 400 })
    }
    const existing = await db.chatConversation.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    const conversation = await db.chatConversation.update({ where: { id }, data: { status: body.status } })
    return NextResponse.json({ conversation: conversationOut(conversation) })
  } catch (err) {
    console.error('[api/whatsapp/inbox/[id]] PATCH failed', err)
    return NextResponse.json({ error: 'Failed to update conversation' }, { status: 500 })
  }
}
