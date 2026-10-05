import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { requireFinancierContext, FinancingError } from '@/server/modules/financing/shared'
import { listCertifications, upsertCertification } from '@/server/modules/financing/sharia'

// GET /api/financier/sharia/certifications — the org's scholar-attestation
// register with computed expiry status (entering the ≤30d window emits one
// idempotent reminder per row per 30 days — remindersEmitted).
export async function GET() {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const ctx = await requireFinancierContext(user.id)
    const result = await listCertifications(ctx.organizationId)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('sharia certifications GET error', err)
    return NextResponse.json({ error: 'Failed to load the certifications' }, { status: 500 })
  }
}

const certSchema = z.object({
  scholarName: z.string().trim().min(2).max(120),
  scholarInstitution: z.string().trim().min(2).max(160),
  certificateRef: z.string().trim().min(2).max(80),
  scope: z.string().trim().max(1000).nullable().optional(),
  issuedAt: z.string(),
  expiresAt: z.string(),
  documentUrl: z.string().trim().max(500).nullable().optional(),
})

// POST /api/financier/sharia/certifications — record a certification
// (OWNER/ADMIN staff of the active financier org; audited).
export async function POST(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:sharia-cert', { limit: 40, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl
  try {
    const ctx = await requireFinancierContext(user.id)
    const parsed = certSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid certification payload', details: parsed.error.flatten() }, { status: 400 })
    }
    const certification = await upsertCertification(user.id, ctx.organizationId, null, parsed.data)
    return NextResponse.json({ certification }, { status: 201 })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('sharia certification POST error', err)
    return NextResponse.json({ error: 'Failed to save the certification' }, { status: 500 })
  }
}
