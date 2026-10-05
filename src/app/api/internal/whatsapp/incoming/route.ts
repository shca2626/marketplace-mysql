import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { runAutoReply } from '@/server/modules/whatsapp/chatbot'
import { normalizePhone, waServiceSend } from '@/server/modules/whatsapp/send'

// ─────────────────────────────────────────────────────────────────────────────
// /api/internal/whatsapp/incoming — webhook called by the WhatsApp bridge
// (mini-service :3031) for every inbound message. NOT session-guarded — the
// shared `x-internal-token` header is the gate.
//
// Pipeline: find/create the WHATSAPP conversation → store the visitor
// message → update the conversation → try the chatbot auto-reply (BOT message
// + outbound send + WhatsAppMessage log rows both directions).
// ─────────────────────────────────────────────────────────────────────────────

const incomingSchema = z.object({
  from: z.string().trim().min(1, 'from is required'),
  name: z.string().trim().max(200).optional(),
  message: z.string().min(1, 'message is required').max(4000),
  timestampMs: z.number().int().optional(),
})

export async function POST(req: NextRequest) {
  const token = req.headers.get('x-internal-token')
  if (token !== 'vendora-internal') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const parsed = incomingSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload' }, { status: 400 })
    }
    const { from: rawFrom, name, message } = parsed.data
    const from = normalizePhone(rawFrom)
    if (!from) return NextResponse.json({ error: 'Unrecognized sender number' }, { status: 400 })

    // 1) Find or create the conversation for this sender.
    let conversation = await db.chatConversation.findFirst({
      where: { kind: 'WHATSAPP', channelRef: from },
    })
    const isNew = !conversation
    if (!conversation) {
      conversation = await db.chatConversation.create({
        data: {
          kind: 'WHATSAPP',
          channelRef: from,
          visitorName: name || from,
          visitorPhone: from,
          unreadStaff: 0, // incremented below with the message
        },
      })
    }

    // 2) Store the visitor message + advance the conversation.
    await db.chatMessage.create({
      data: {
        conversationId: conversation.id,
        senderRole: 'VISITOR',
        senderName: name || from,
        body: message,
      },
    })
    await db.chatConversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: message.slice(0, 140),
        unreadStaff: { increment: 1 },
        ...(isNew && name ? { visitorName: name } : {}),
      },
    })

    // 3) Log the inbound message in the WhatsApp log.
    await db.whatsAppMessage.create({
      data: {
        toNumber: from,
        body: message,
        direction: 'IN',
        status: 'RECEIVED',
      },
    }).catch((err) => console.error('[internal/whatsapp/incoming] IN log failed', err))

    // 4) Chatbot auto-reply.
    const reply = await runAutoReply(message)
    if (!reply) {
      return NextResponse.json({ autoReplied: false })
    }

    await db.chatMessage.create({
      data: {
        conversationId: conversation.id,
        senderRole: 'BOT',
        senderName: 'Vendora Assistant',
        body: reply,
      },
    })
    await db.chatConversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: reply.slice(0, 140),
      },
    })

    const sendResult = await waServiceSend(from, reply)
    await db.whatsAppMessage.create({
      data: {
        toNumber: from,
        body: reply,
        direction: 'OUT',
        status: sendResult.ok ? 'SENT' : 'FAILED',
        error: sendResult.ok ? null : sendResult.error ?? 'Auto-reply delivery failed',
        waMessageId: sendResult.ok ? (sendResult.id ?? null) : null,
        sentAt: sendResult.ok ? new Date() : null,
      },
    }).catch((err) => console.error('[internal/whatsapp/incoming] OUT log failed', err))

    return NextResponse.json({ autoReplied: true, reply })
  } catch (err) {
    console.error('[internal/whatsapp/incoming] POST failed', err)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
