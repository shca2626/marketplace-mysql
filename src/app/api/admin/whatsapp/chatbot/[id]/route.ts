import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin } from '@/lib/http'
import { recordAudit } from '@/server/modules/audit/service'
import { WhatsAppAdminError } from '@/server/modules/whatsapp/admin'
import { chatbotRuleUpdateSchema, deleteChatbotRule, updateChatbotRule } from '@/server/modules/whatsapp/chatbot'

// PATCH /api/admin/whatsapp/chatbot/[id] — partial update, including the
// active toggle used by the console switch. Rule edits are picked up by the
// mini-service within its 30s rule cache window.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdmin('whatsapp.manage')
  if (error) return error
  try {
    const { id } = await ctx.params
    const parsed = chatbotRuleUpdateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const rule = await updateChatbotRule(id, parsed.data)

    await recordAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'WHATSAPP_CHATBOT_RULE_UPDATED',
      entityType: 'ChatbotRule',
      entityId: rule.id,
      summary: `Chatbot rule "${rule.name}" updated`,
      metadata: { fields: Object.keys(parsed.data) },
    })

    return NextResponse.json({ rule })
  } catch (err) {
    if (err instanceof WhatsAppAdminError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin whatsapp chatbot rule PATCH error', err)
    return NextResponse.json({ error: 'Failed to update chatbot rule' }, { status: 500 })
  }
}

// DELETE /api/admin/whatsapp/chatbot/[id] — remove a rule.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdmin('whatsapp.manage')
  if (error) return error
  try {
    const { id } = await ctx.params
    await deleteChatbotRule(id)

    await recordAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'WHATSAPP_CHATBOT_RULE_DELETED',
      entityType: 'ChatbotRule',
      entityId: id,
      summary: `Chatbot rule ${id} removed`,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof WhatsAppAdminError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin whatsapp chatbot rule DELETE error', err)
    return NextResponse.json({ error: 'Failed to delete chatbot rule' }, { status: 500 })
  }
}
