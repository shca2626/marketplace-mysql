import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { requireFinancierContext, FinancingError } from '@/server/modules/financing/shared'
import { upsertCertification, deleteCertification } from '@/server/modules/financing/sharia'

const certSchema = z.object({
  scholarName: z.string().trim().min(2).max(120),
  scholarInstitution: z.string().trim().min(2).max(160),
  certificateRef: z.string().trim().min(2).max(80),
  scope: z.string().trim().max(1000).nullable().optional(),
  issuedAt: z.string(),
  expiresAt: z.string(),
  documentUrl: z.string().trim().max(500).nullable().optional(),
})

// PUT /api/financier/sharia/certifications/[id] — update a certification
// (OWNER/ADMIN staff; audited).
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:sharia-cert', { limit: 40, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl
  try {
    const finCtx = await requireFinancierContext(user.id)
    const { id } = await ctx.params
    const parsed = certSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid certification payload', details: parsed.error.flatten() }, { status: 400 })
    }
    const certification = await upsertCertification(user.id, finCtx.organizationId, id, parsed.data)
    return NextResponse.json({ certification })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('sharia certification PUT error', err)
    return NextResponse.json({ error: 'Failed to update the certification' }, { status: 500 })
  }
}

// DELETE /api/financier/sharia/certifications/[id] — remove a certification
// (OWNER/ADMIN staff; audited).
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:sharia-cert', { limit: 40, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl
  try {
    const finCtx = await requireFinancierContext(user.id)
    const { id } = await ctx.params
    const result = await deleteCertification(user.id, finCtx.organizationId, id)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('sharia certification DELETE error', err)
    return NextResponse.json({ error: 'Failed to delete the certification' }, { status: 500 })
  }
}
