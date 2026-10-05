import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin } from '@/server/guards'
import { normalizePhone, waServiceSend } from '@/server/modules/whatsapp/send'

// ─────────────────────────────────────────────────────────────────────────────
// /api/whatsapp/send — single direct message (Connection tab test send).
// Sends through the bridge and logs the attempt in the message log.
// ─────────────────────────────────────────────────────────────────────────────

const sendSchema = z.object({
  to: z.string().trim().min(1, 'Phone number is required').max(30),
  message: z.string().trim().min(1, 'Message is required').max(2000),
})

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin('storefront.manage')
  if (error) return error
  try {
    const parsed = sendSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    const to = normalizePhone(parsed.data.to)
    if (!to) return NextResponse.json({ error: 'That phone number is not valid' }, { status: 400 })

    const result = await waServiceSend(to, parsed.data.message)
    const row = await db.whatsAppMessage.create({
      data: {
        toNumber: to,
        body: parsed.data.message,
        direction: 'OUT',
        status: result.ok ? 'SENT' : 'FAILED',
        error: result.ok ? null : result.error ?? 'Send failed',
        waMessageId: result.ok ? (result.id ?? null) : null,
        sentAt: result.ok ? new Date() : null,
      },
    })
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? 'Send failed', messageId: row.id },
        { status: 502 }
      )
    }
    return NextResponse.json({ ok: true, id: result.id, messageId: row.id })
  } catch (err) {
    console.error('[api/whatsapp/send] POST failed', err)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}
