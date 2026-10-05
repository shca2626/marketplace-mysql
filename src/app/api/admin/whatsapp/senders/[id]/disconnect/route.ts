import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin } from '@/lib/http'
import { recordAudit } from '@/server/modules/audit/service'
import { disconnectSender, WhatsAppAdminError } from '@/server/modules/whatsapp/admin'

// POST /api/admin/whatsapp/senders/[id]/disconnect — unlink the number (Baileys
// logout) and mark the row DISCONNECTED so another number can be paired.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdmin('whatsapp.manage')
  if (error) return error
  try {
    const { id } = await ctx.params
    const sender = await disconnectSender(id)

    await recordAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'WHATSAPP_SENDER_DISCONNECTED',
      entityType: 'WhatsAppSender',
      entityId: id,
      summary: `WhatsApp sender "${sender.label}" (${sender.phoneNumber}) disconnected`,
    })

    return NextResponse.json({ sender })
  } catch (err) {
    if (err instanceof WhatsAppAdminError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin whatsapp disconnect error', err)
    return NextResponse.json({ error: 'Failed to disconnect sender' }, { status: 500 })
  }
}
