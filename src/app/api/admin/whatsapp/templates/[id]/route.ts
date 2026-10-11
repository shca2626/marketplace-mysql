import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin } from '@/lib/http'
import { recordAudit } from '@/server/modules/audit/service'
import { WhatsAppAdminError } from '@/server/modules/whatsapp/admin'
import { deleteTemplate, templateUpdateSchema, updateTemplate } from '@/server/modules/whatsapp/templates'

// PATCH /api/admin/whatsapp/templates/[id] — partial update (name, category,
// language, body, status). Past campaign sends keep their rendered bodies.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdmin('whatsapp.manage')
  if (error) return error
  try {
    const { id } = await ctx.params
    const parsed = templateUpdateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const template = await updateTemplate(id, parsed.data)

    await recordAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'WHATSAPP_TEMPLATE_UPDATED',
      entityType: 'WhatsAppTemplate',
      entityId: template.id,
      summary: `WhatsApp template "${template.name}" updated`,
      metadata: { fields: Object.keys(parsed.data) },
    })

    return NextResponse.json({ template })
  } catch (err) {
    if (err instanceof WhatsAppAdminError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin whatsapp template PATCH error', err)
    return NextResponse.json({ error: 'Failed to update WhatsApp template' }, { status: 500 })
  }
}

// DELETE /api/admin/whatsapp/templates/[id] — remove a template. Campaign rows
// referencing it keep their rendered body (FK is SetNull), so history stays
// fully auditable.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdmin('whatsapp.manage')
  if (error) return error
  try {
    const { id } = await ctx.params
    await deleteTemplate(id)

    await recordAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'WHATSAPP_TEMPLATE_DELETED',
      entityType: 'WhatsAppTemplate',
      entityId: id,
      summary: `WhatsApp template ${id} removed`,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof WhatsAppAdminError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin whatsapp template DELETE error', err)
    return NextResponse.json({ error: 'Failed to delete WhatsApp template' }, { status: 500 })
  }
}
