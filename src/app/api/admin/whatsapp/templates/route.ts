import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin } from '@/lib/http'
import { recordAudit } from '@/server/modules/audit/service'
import { WhatsAppAdminError } from '@/server/modules/whatsapp/admin'
import { createTemplate, listTemplates, templateCreateSchema } from '@/server/modules/whatsapp/templates'

// GET /api/admin/whatsapp/templates — reusable message templates, newest first.
export async function GET() {
  const { error } = await requireAdmin('whatsapp.manage')
  if (error) return error
  try {
    const templates = await listTemplates()
    return NextResponse.json({ templates })
  } catch (err) {
    console.error('admin whatsapp templates GET error', err)
    return NextResponse.json({ error: 'Failed to load WhatsApp templates' }, { status: 500 })
  }
}

// POST /api/admin/whatsapp/templates — create a template ({{var}} placeholders
// allowed in the body; category drives the campaign composer filters).
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdmin('whatsapp.manage')
  if (error) return error
  try {
    const parsed = templateCreateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const template = await createTemplate(parsed.data)

    await recordAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'WHATSAPP_TEMPLATE_CREATED',
      entityType: 'WhatsAppTemplate',
      entityId: template.id,
      summary: `WhatsApp template "${template.name}" created (${template.category}/${template.language})`,
    })

    return NextResponse.json({ template }, { status: 201 })
  } catch (err) {
    if (err instanceof WhatsAppAdminError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin whatsapp templates POST error', err)
    return NextResponse.json({ error: 'Failed to create WhatsApp template' }, { status: 500 })
  }
}
