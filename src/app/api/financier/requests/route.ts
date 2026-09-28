import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { requireFinancierContext } from '@/server/modules/financing/shared'
import { financierInbox } from '@/server/modules/financing/requests'
import { FinancingError } from '@/server/modules/financing/shared'

// GET /api/financier/requests — THE inbox: ONLY requests that passed the
// platform gate (query-level R-4 exclusion — a financier literally cannot
// list an un-forwarded request). Filters: status + pagination.
export async function GET(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const ctx = await requireFinancierContext(user.id)
    const sp = req.nextUrl.searchParams
    const result = await financierInbox(ctx.organizationId, {
      status: sp.get('status') ?? undefined,
      page: Number(sp.get('page')) || 1,
      limit: Number(sp.get('limit')) || 20,
    })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier inbox error', err)
    return NextResponse.json({ error: 'Failed to load the inbox' }, { status: 500 })
  }
}
