import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { financingError } from '@/server/modules/financing/catalog'
import { adminVerifyDocument } from '@/server/modules/financing/documents'

// PATCH /api/admin/documents/[id] — verify or reject any user's document
// ({ verdict: 'verify' | 'reject', note } — a note is REQUIRED on rejection).
// The 'verified'/'rejected' long forms sent by some clients are normalized.

const patchSchema = z
  .object({
    verdict: z.enum(['verify', 'reject', 'verified', 'rejected']),
    note: z.string().trim().max(2000).optional().nullable(),
  })
  .transform((data) => ({
    note: data.note,
    verdict: data.verdict === 'verified' ? ('verify' as const) : data.verdict === 'rejected' ? ('reject' as const) : data.verdict,
  }))

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:documents', { limit: 120, windowMs: 60_000 }, user!.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid verdict payload' },
        { status: 400 }
      )
    }
    const document = await adminVerifyDocument({
      admin: { id: user!.id, role: user!.role },
      id,
      payload: parsed.data,
    })
    return NextResponse.json({ document })
  } catch (err) {
    const svc = financingError(err)
    if (svc) return NextResponse.json({ error: svc.message }, { status: svc.status })
    console.error('admin document PATCH error', err)
    return NextResponse.json({ error: 'Failed to review document' }, { status: 500 })
  }
}
