import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin } from '@/lib/http'
import { recordAudit } from '@/server/modules/audit/service'
import { setDefaultSender, WhatsAppAdminError } from '@/server/modules/whatsapp/admin'

// POST /api/admin/whatsapp/senders/[id]/default — make this line the active
// outbound sender (every OTP / notification mirror goes out through it).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdmin('whatsapp.manage')
  if (error) return error
  try {
    const { id } = await ctx.params
    const sender = await setDefaultSender(id)

    await recordAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'WHATSAPP_SENDER_DEFAULT',
      entityType: 'WhatsAppSender',
      entityId: id,
      summary: `WhatsApp sender "${sender.label}" (${sender.phoneNumber}) set as default line`,
    })

    return NextResponse.json({ sender })
  } catch (err) {
    if (err instanceof WhatsAppAdminError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin whatsapp default error', err)
    return NextResponse.json({ error: 'Failed to set default sender' }, { status: 500 })
  }
}
