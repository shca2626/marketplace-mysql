import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin } from '@/lib/http'
import { recordAudit } from '@/server/modules/audit/service'
import { deleteSender, WhatsAppAdminError } from '@/server/modules/whatsapp/admin'

// DELETE /api/admin/whatsapp/senders/[id] — stop the line and remove the row
// (ledger rows keep their senderId nulled by schema — audit stays intact).
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdmin('whatsapp.manage')
  if (error) return error
  try {
    const { id } = await ctx.params
    await deleteSender(id)

    await recordAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'WHATSAPP_SENDER_DELETED',
      entityType: 'WhatsAppSender',
      entityId: id,
      summary: `WhatsApp sender ${id} removed`,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof WhatsAppAdminError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin whatsapp delete error', err)
    return NextResponse.json({ error: 'Failed to delete sender' }, { status: 500 })
  }
}
