import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { adminVerifyCertification, CertificationError } from '@/server/modules/kyc/certifications'

const schema = z.object({
  approve: z.boolean(),
  note: z.string().trim().max(500).optional(),
})

// POST /api/admin/certifications/[id]/verify — platform verdict on a KYP
// artifact: VERIFIED (→ the product earns the "Verified specs" badge) or
// REJECTED (note surfaced to the seller). Verify once, reused everywhere.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin('financing.documents.verify')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:certification-verify', { limit: 120, windowMs: 60_000 }, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid verdict' },
        { status: 400 }
      )
    }
    const certification = await adminVerifyCertification(
      user.id,
      id,
      parsed.data.approve,
      parsed.data.note
    )
    return NextResponse.json({ certification })
  } catch (err) {
    if (err instanceof CertificationError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin certification verify error', err)
    return NextResponse.json({ error: 'Failed to verify the certification' }, { status: 500 })
  }
}
