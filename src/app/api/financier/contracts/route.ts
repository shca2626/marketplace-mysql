import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { requireFinancierContext, FinancingError } from '@/server/modules/financing/shared'
import { createTemplate, listTemplates } from '@/server/modules/financing/contracts'

// GET /api/financier/contracts — the org's contract templates (all kinds,
// all statuses, newest version first — the UI groups by kind).
export async function GET() {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const ctx = await requireFinancierContext(user.id)
    const templates = await listTemplates(ctx.organizationId)
    return NextResponse.json({ templates })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('contract templates GET error', err)
    return NextResponse.json({ error: 'Failed to load the templates' }, { status: 500 })
  }
}

const createSchema = z.object({
  kind: z.enum(['FINANCING_AGREEMENT', 'MURABAHA']),
  title: z.string().trim().min(3).max(160),
  body: z.string().min(10).max(60000),
})

// POST /api/financier/contracts — draft a new template version
// (version = max+1 for the kind; sha256 computed server-side; OWNER/ADMIN).
export async function POST(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:contract-template', { limit: 40, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl
  try {
    const ctx = await requireFinancierContext(user.id)
    const parsed = createSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid template payload', details: parsed.error.flatten() }, { status: 400 })
    }
    const template = await createTemplate(user.id, ctx.organizationId, parsed.data)
    return NextResponse.json({ template }, { status: 201 })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('contract template POST error', err)
    return NextResponse.json({ error: 'Failed to create the template' }, { status: 500 })
  }
}
