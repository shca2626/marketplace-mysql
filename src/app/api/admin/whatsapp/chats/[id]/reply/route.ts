import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin } from '@/lib/http'
import { recordAudit } from '@/server/modules/audit/service'
import { WhatsAppAdminError } from '@/server/modules/whatsapp/admin'
import { chatReplySchema, replyToChatThread } from '@/server/modules/whatsapp/chats'

// POST /api/admin/whatsapp/chats/[id]/reply — human agent reply. Records the
// OUT bubble always; WHATSAPP-source threads additionally get a best-effort
// real send over the paired line (`delivery` in the response says which).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdmin('whatsapp.manage')
  if (error) return error
  try {
    const { id } = await ctx.params
    const parsed = chatReplySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const { message, delivery } = await replyToChatThread(id, parsed.data.body)

    await recordAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'WHATSAPP_CHAT_REPLY_SENT',
      entityType: 'WhatsAppChatMessage',
      entityId: message.id,
      summary: `Agent replied to a chat (${delivery === 'whatsapp' ? 'delivered via WhatsApp' : delivery === 'dev' ? 'dev-console delivery (no paired line)' : 'webchat — visible to the widget'})`,
      metadata: { threadId: id, delivery },
    })

    return NextResponse.json({ message, delivery })
  } catch (err) {
    if (err instanceof WhatsAppAdminError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin whatsapp chat reply POST error', err)
    return NextResponse.json({ error: 'Failed to send the reply' }, { status: 500 })
  }
}
