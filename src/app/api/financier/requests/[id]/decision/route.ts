import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { requireFinancierStaffOrThrow } from '@/server/modules/financing/guards'
import { financingError } from '@/server/modules/financing/catalog'
import { declineRequest } from '@/server/modules/financing/offers'
import { declineRequestSchema } from '@/server/modules/financing/types'

// POST /api/financier/requests/[id]/decision — decline a request with a note
// (the note is required and lives in the audit trail + notification).

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:inbox', { limit: 30, windowMs: 60_000 }, user!.id)
  if (rl) return rl

  try {
    const staff = await requireFinancierStaffOrThrow({ id: user!.id })
    const { id } = await ctx.params
    const parsed = declineRequestSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'A decline note is required' },
        { status: 400 }
      )
    }
    const result = await declineRequest(staff, id, parsed.data.note)
    return NextResponse.json(result)
  } catch (err) {
    const svc = financingError(err)
    if (svc) return NextResponse.json({ error: svc.message }, { status: svc.status })
    console.error('financier decision POST error', err)
    return NextResponse.json({ error: 'Failed to decline request' }, { status: 500 })
  }
}
