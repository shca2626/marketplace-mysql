import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { requireFinancierContext, FinancingError } from '@/server/modules/financing/shared'
import { exportAnalyticsCsv, type AnalyticsCsvType } from '@/server/modules/financing/analytics'

const CSV_TYPES: AnalyticsCsvType[] = ['overview', 'aging', 'branches', 'programs']

// GET /api/financier/analytics/export?type=overview|aging|branches|programs —
// CSV download (attachment) of one analytics lens. Optional from/to range
// bounds the same way the overview does.
export async function GET(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const ctx = await requireFinancierContext(user.id, 'financier.requests.view')
    const sp = req.nextUrl.searchParams
    const type = sp.get('type') as AnalyticsCsvType | null
    if (!type || !CSV_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `type must be one of ${CSV_TYPES.join(', ')}` },
        { status: 400 }
      )
    }
    const csv = await exportAnalyticsCsv(ctx.organizationId, type, {
      from: sp.get('from'),
      to: sp.get('to'),
    })
    const stamp = new Date().toISOString().slice(0, 10)
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="vendora-analytics-${type}-${stamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier analytics export error', err)
    return NextResponse.json({ error: 'Failed to export the analytics CSV' }, { status: 500 })
  }
}
