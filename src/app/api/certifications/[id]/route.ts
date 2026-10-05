import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser } from '@/lib/auth'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import {
  updateProductCertification,
  CertificationError,
} from '@/server/modules/kyc/certifications'

const patchSchema = z.object({
  title: z.string().trim().min(3).max(120).optional(),
  url: z.string().trim().max(512).optional().nullable(),
  issuedBy: z.string().trim().max(120).optional().nullable(),
  issuedAt: z.string().trim().max(10).optional().nullable(),
  expiresAt: z.string().trim().max(10).optional().nullable(),
  isActive: z.boolean().optional(),
})

// PATCH /api/certifications/[id] — the owning seller edits or deactivates
// (soft delete) a certification. Editing a decided row reopens review.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Please sign in first' }, { status: 401 })
  const rl = enforceRateLimit(req, 'productWrite', RATE_LIMITS.productWrite, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const parsed = patchSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const certification = await updateProductCertification(user.id, id, parsed.data)
    return NextResponse.json({ certification })
  } catch (err) {
    if (err instanceof CertificationError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('certification PATCH error', err)
    return NextResponse.json({ error: 'Failed to update certification' }, { status: 500 })
  }
}
