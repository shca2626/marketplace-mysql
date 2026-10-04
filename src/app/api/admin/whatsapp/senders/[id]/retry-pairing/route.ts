import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin } from '@/lib/http'
import { recordAudit } from '@/server/modules/audit/service'
import {
  serializeWhatsAppSender,
  waService,
  WhatsAppAdminError,
} from '@/server/modules/whatsapp/admin'
import { db } from '@/lib/db'

const SENDER_SELECT = {
  id: true,
  label: true,
  phoneNumber: true,
  status: true,
  isDefault: true,
  pairingCode: true,
  lastUsedAt: true,
  lastError: true,
  createdAt: true,
} as const

// POST /api/admin/whatsapp/senders/[id]/retry-pairing — restart pairing for a
// sender that never completed it (PENDING_PAIRING) or was disconnected. The
// row already exists, so this only asks the mini-service for a fresh pairing
// code and surfaces it to the admin UI (user-reported: a failed first
// attempt used to dead-end the sender row with no retry path).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdmin('whatsapp.manage')
  if (error) return error
  try {
    const { id } = await ctx.params
    const row = await db.whatsAppSender.findUnique({ where: { id }, select: SENDER_SELECT })
    if (!row) throw new WhatsAppAdminError(404, 'Sender not found')
    if (row.status === 'PAIRED') {
      throw new WhatsAppAdminError(409, 'This number is already paired — disconnect it first to re-pair.')
    }

    // Begin pairing in the service (~30-60s: socket wait, then code issue).
    const res = await waService<{ ok: boolean; pairingCode?: string; error?: string }>('/senders/start', {
      method: 'POST',
      body: { senderId: row.id, phoneNumber: row.phoneNumber },
      timeoutMs: 70_000,
    })
    if (res.ok && res.data.pairingCode) {
      const updated = await db.whatsAppSender.update({
        where: { id: row.id },
        data: { pairingCode: res.data.pairingCode, status: 'PENDING_PAIRING', lastError: null },
        select: SENDER_SELECT,
      })
      await recordAudit({
        actorId: user.id,
        actorType: 'ADMIN',
        action: 'WHATSAPP_SENDER_PAIRING_RETRIED',
        entityType: 'WhatsAppSender',
        entityId: row.id,
        summary: `Pairing restarted for WhatsApp sender "${row.label}" (${row.phoneNumber})`,
      }).catch(() => undefined)
      return NextResponse.json({ sender: serializeWhatsAppSender(updated), pairingCode: res.data.pairingCode })
    }

    const msg = (res.data as { error?: string })?.error ?? `service responded ${res.status}`
    const updated = await db.whatsAppSender.update({
      where: { id: row.id },
      data: { lastError: `Pairing failed to start: ${msg}` },
      select: SENDER_SELECT,
    })
    return NextResponse.json(
      {
        sender: serializeWhatsAppSender(updated),
        pairingCode: null,
        warning: `Pairing could not start: ${msg}. Check the WhatsApp service and try again.`,
      },
      { status: 502 }
    )
  } catch (err) {
    if (err instanceof WhatsAppAdminError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin whatsapp retry-pairing error', err)
    return NextResponse.json({ error: 'Failed to restart pairing' }, { status: 500 })
  }
}
