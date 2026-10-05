import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin } from '@/lib/http'
import { recordAudit } from '@/server/modules/audit/service'
import { WhatsAppAdminError } from '@/server/modules/whatsapp/admin'
import { chatbotRuleCreateSchema, createChatbotRule, listChatbotRules } from '@/server/modules/whatsapp/chatbot'

// GET /api/admin/whatsapp/chatbot — auto-reply rules, priority asc (the same
// order the mini-service evaluates them in).
export async function GET() {
  const { error } = await requireAdmin('whatsapp.manage')
  if (error) return error
  try {
    const rules = await listChatbotRules()
    return NextResponse.json({ rules })
  } catch (err) {
    console.error('admin whatsapp chatbot GET error', err)
    return NextResponse.json({ error: 'Failed to load chatbot rules' }, { status: 500 })
  }
}

// POST /api/admin/whatsapp/chatbot — create a rule. Lower priority runs first;
// REGEX sources are compile-checked here so a broken pattern can never be
// saved (the matcher would silently never fire).
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdmin('whatsapp.manage')
  if (error) return error
  try {
    const parsed = chatbotRuleCreateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const rule = await createChatbotRule(parsed.data)

    await recordAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'WHATSAPP_CHATBOT_RULE_CREATED',
      entityType: 'ChatbotRule',
      entityId: rule.id,
      summary: `Chatbot rule "${rule.name}" created (${rule.matchType}, priority ${rule.priority})`,
    })

    return NextResponse.json({ rule }, { status: 201 })
  } catch (err) {
    if (err instanceof WhatsAppAdminError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin whatsapp chatbot POST error', err)
    return NextResponse.json({ error: 'Failed to create chatbot rule' }, { status: 500 })
  }
}
