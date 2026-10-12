import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { requireFinancierContext, FinancingError } from '@/server/modules/financing/shared'
import { getRiskConfig, updateRiskConfig } from '@/server/modules/financing/risk'

// GET /api/financier/risk-config — the scoring config (lazy-upserts the
// default row on first read; auto-decision defaults to OFF).
export async function GET() {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const ctx = await requireFinancierContext(user.id, 'financier.offers.manage')
    const config = await getRiskConfig(ctx.organizationId)
    return NextResponse.json({ config })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier risk-config GET error', err)
    return NextResponse.json({ error: 'Failed to load the risk config' }, { status: 500 })
  }
}

const weightField = z.number().int().min(0).max(100)

const putSchema = z.object({
  autoDecisionEnabled: z.boolean().optional(),
  autoApproveThreshold: z.number().min(0).max(100).optional(),
  autoDeclineThreshold: z.number().min(0).max(100).optional(),
  weightAmount: weightField.optional(),
  weightTenor: weightField.optional(),
  weightGuarantee: weightField.optional(),
  weightCapacity: weightField.optional(),
  weightHistory: weightField.optional(),
  weightDocuments: weightField.optional(),
})

// PUT /api/financier/risk-config — update the scoring policy. Institution
// OWNER/ADMIN only; every change is audited. Auto-decision stays
// decision-support until explicitly enabled here.
export async function PUT(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:risk-config', { limit: 30, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl

  try {
    const ctx = await requireFinancierContext(user.id, 'financier.offers.manage')
    const parsed = putSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid risk config payload', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const config = await updateRiskConfig(user.id, ctx.organizationId, parsed.data)
    return NextResponse.json({ config })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier risk-config PUT error', err)
    return NextResponse.json({ error: 'Failed to update the risk config' }, { status: 500 })
  }
}
