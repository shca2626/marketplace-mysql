import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, clientIp, enforceRateLimit } from '@/lib/http'
import { FinancingError } from '@/server/modules/financing/shared'
import { EsignError, executeSignature } from '@/server/modules/financing/esign'

// POST /api/financing/agreements/[id]/sign — the applicant executes their
// financing agreement (the fail-closed chain: applicant binding → agreement
// ACTIVE + first execution → ACTIVE template → hash fail-closed → consent →
// step-up MFA → evidence package persisted + audited + financier notified).
const signSchema = z.object({
  documentSha256: z.string().trim().length(64),
  consentAccepted: z.boolean(),
  mfaCode: z.string().trim().min(6).max(10),
  typedName: z.string().trim().min(2).max(120).optional(),
  signatureImageId: z.string().trim().max(64).nullable().optional(),
})

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financing:esign', { limit: 12, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl
  try {
    const { id } = await ctx.params
    const parsed = signSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid signature payload', details: parsed.error.flatten() }, { status: 400 })
    }
    const execution = await executeSignature(user.id, id, parsed.data, {
      ip: clientIp(req),
      userAgent: req.headers.get('user-agent'),
    })
    return NextResponse.json({ execution }, { status: 201 })
  } catch (err) {
    if (err instanceof EsignError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    }
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('esign execute error', err)
    return NextResponse.json({ error: 'Failed to execute the signature' }, { status: 500 })
  }
}
