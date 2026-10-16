import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { attachServiceRequirement } from '@/server/modules/financing/conditions'
import { FinancingError } from '@/server/modules/financing/shared'

// POST /api/financier/requirements — attach a condition template to a service
// (per-attachment config: required/order/instructions/autoPass — DP-24).
const schema = z.object({
  serviceId: z.string(),
  conditionTemplateId: z.string(),
  isRequired: z.boolean().optional(),
  displayOrder: z.number().int().min(0).max(999).optional(),
  phase: z.string().trim().max(60).nullable().optional().transform((v) => (v === undefined ? undefined : v && v.trim() ? v.trim() : null)),
  instructions: z.string().trim().max(1000).nullable().optional(),
  autoPassAccredited: z.boolean().optional(),
})

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:requirements', { limit: 60, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl

  try {
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid attachment payload', details: parsed.error.flatten() }, { status: 400 })
    }
    const requirement = await attachServiceRequirement(user.id, parsed.data)
    return NextResponse.json({ requirement }, { status: 201 })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier requirements POST error', err)
    return NextResponse.json({ error: 'Failed to attach the requirement' }, { status: 500 })
  }
}
