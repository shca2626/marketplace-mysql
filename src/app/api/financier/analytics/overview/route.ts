import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { requireFinancierContext, FinancingError } from '@/server/modules/financing/shared'
import { portfolioOverview } from '@/server/modules/financing/analytics'

// GET /api/financier/analytics/overview?from&to — the read-only portfolio
// lens (funnel, volume/aging/NPL, per-branch, per-program). Optional date
// range bounds each funnel stage + volume by its own timestamp (YYYY-MM-DD).
export async function GET(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const ctx = await requireFinancierContext(user.id, 'financier.requests.view')
    const sp = req.nextUrl.searchParams
    const overview = await portfolioOverview(ctx.organizationId, {
      from: sp.get('from'),
      to: sp.get('to'),
    })
    return NextResponse.json(overview)
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier analytics overview error', err)
    return NextResponse.json({ error: 'Failed to compute the portfolio overview' }, { status: 500 })
  }
}
