import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { adminSetInstitutionStatus } from '@/server/modules/financing/services'
import { FinancingError } from '@/server/modules/financing/shared'

// POST /api/admin/financing/institutions/[id]/suspend — suspend a financier
// institution: org → SUSPENDED (staff notified; public directory drops their
// services). ?reactivate=true flips back to ACTIVE.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin('financing.institutions.manage')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:institution', { limit: 30, windowMs: 60_000 }, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const reactivate = req.nextUrl.searchParams.get('reactivate') === 'true'
    const result = await adminSetInstitutionStatus(user.id, id, reactivate ? 'REACTIVATE' : 'SUSPEND')
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin institution suspend error', err)
    return NextResponse.json({ error: 'Failed to update the institution' }, { status: 500 })
  }
}
