import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser } from '@/lib/auth'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import {
  listProductCertifications,
  createProductCertification,
  CertificationError,
} from '@/server/modules/kyc/certifications'

// GET /api/products/[id]/certifications — all active certifications for a
// product (any viewer — statuses power the seller chips and the public
// "Verified specs" badge logic; artifact details are public trust signals).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const certifications = await listProductCertifications(id)
    return NextResponse.json({ certifications })
  } catch (err) {
    console.error('product certifications GET error', err)
    return NextResponse.json({ error: 'Failed to load certifications' }, { status: 500 })
  }
}

const createSchema = z.object({
  kind: z.enum(['DATASHEET', 'WARRANTY', 'ORIGIN', 'TEST_REPORT', 'CERTIFICATE', 'OTHER']),
  title: z.string().trim().min(3).max(120),
  url: z.string().trim().max(512).optional().nullable(),
  issuedBy: z.string().trim().max(120).optional().nullable(),
  issuedAt: z.string().trim().max(10).optional().nullable(),
  expiresAt: z.string().trim().max(10).optional().nullable(),
})

// POST /api/products/[id]/certifications — seller attaches a KYP artifact to
// their own product (PENDING until platform review).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Please sign in first' }, { status: 401 })
  const rl = enforceRateLimit(req, 'productWrite', RATE_LIMITS.productWrite, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const parsed = createSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const certification = await createProductCertification(user.id, id, parsed.data)
    return NextResponse.json({ certification }, { status: 201 })
  } catch (err) {
    if (err instanceof CertificationError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('product certifications POST error', err)
    return NextResponse.json({ error: 'Failed to add certification' }, { status: 500 })
  }
}
