import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import {
  listAssessments,
  FEE_EVENTS,
} from '@/server/modules/fees/service'
import {
  reconcileRevenue,
  resolveRange,
  ledgerToCsv,
  reconcileToCsv,
  type LedgerCsvRow,
} from '@/server/modules/fees/revenue'

// GET /api/admin/fees/export?window=ledger|reconcile&type=…&from&to&event&status
// — CSV export for the revenue console (Phase 11.3). `type` (or `window`, the
// accepted alias) selects the dataset:
//   ledger    → one row per FeeAssessment (immutable ledger dump, 5000 cap)
//   reconcile → per event × currency: ledgerSum vs externalSum + difference
// Response: text/csv attachment vendora-<type>-<yyyymmdd>.csv.
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin('payouts.view')
  if (error) return error
  try {
    const sp = req.nextUrl.searchParams
    const type = (sp.get('type') ?? sp.get('window') ?? 'ledger').toLowerCase()
    if (type !== 'ledger' && type !== 'reconcile') {
      return NextResponse.json({ error: 'type must be "ledger" or "reconcile"' }, { status: 400 })
    }
    const range = resolveRange(sp.get('from'), sp.get('to'))
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')

    let csv: string
    if (type === 'reconcile') {
      csv = reconcileToCsv(await reconcileRevenue(range))
    } else {
      const event = sp.get('event')
      if (event && !FEE_EVENTS.includes(event as (typeof FEE_EVENTS)[number])) {
        return NextResponse.json({ error: `Unknown fee event "${event}"` }, { status: 400 })
      }
      const status = sp.get('status')
      if (status && status !== 'APPLIED' && status !== 'REVERSAL') {
        return NextResponse.json({ error: 'status must be APPLIED or REVERSAL' }, { status: 400 })
      }
      const assessments = await listAssessments({
        event: event ?? undefined,
        actorOrgId: sp.get('actorOrgId') ?? undefined,
        status: status ?? undefined,
        from: range.from ?? undefined,
        to: range.to ?? undefined,
        limit: 5000,
      })
      const rows: LedgerCsvRow[] = assessments.map((a) => ({
        id: a.id,
        assessedAt: a.assessedAt,
        event: a.event,
        actorType: a.actorType,
        actorOrgId: a.actorOrgId,
        refType: a.refType,
        refId: a.refId,
        baseAmount: a.baseAmount,
        currency: a.currency,
        fxRateToUsd: a.fxRateToUsd,
        amount: a.amount,
        status: a.status,
        ruleVersion: a.ruleVersion,
        idempotencyKey: a.idempotencyKey,
      }))
      csv = ledgerToCsv(rows)
    }

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="vendora-${type}-${today}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('admin fees export GET error', err)
    return NextResponse.json({ error: 'Failed to export the CSV' }, { status: 500 })
  }
}
