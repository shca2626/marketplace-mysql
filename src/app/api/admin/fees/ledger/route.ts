import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/server/guards'
import {
  listAssessments,
  ledgerEventSummary,
  FEE_EVENTS,
  FeeServiceError,
  type FeeAssessmentDTO,
} from '@/server/modules/fees/service'
import { resolveRange } from '@/server/modules/fees/revenue'

// GET /api/admin/fees/ledger — the immutable FeeAssessment ledger (Phase 11.3).
// Filters: event / actorOrgId / status (APPLIED|REVERSAL) / from / to (date
// window) / limit (1..500, default 100). Org names and human ref labels
// (payout / agreement / invoice numbers) are resolved here in single batched
// fetches so the UI never does N+1 lookups.
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin('payouts.view')
  if (error) return error
  try {
    const sp = req.nextUrl.searchParams
    const event = sp.get('event')
    if (event && !FEE_EVENTS.includes(event as (typeof FEE_EVENTS)[number])) {
      return NextResponse.json({ error: `Unknown fee event "${event}"` }, { status: 400 })
    }
    const status = sp.get('status')
    if (status && status !== 'APPLIED' && status !== 'REVERSAL') {
      return NextResponse.json({ error: 'status must be APPLIED or REVERSAL' }, { status: 400 })
    }
    const limitRaw = parseInt(sp.get('limit') || '100')
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100
    const range = resolveRange(sp.get('from'), sp.get('to'))

    const [assessments, summary] = await Promise.all([
      listAssessments({
        event: event ?? undefined,
        actorOrgId: sp.get('actorOrgId') ?? undefined,
        status: status ?? undefined,
        from: range.from ?? undefined,
        to: range.to ?? undefined,
        limit,
      }),
      ledgerEventSummary(range.from ?? undefined, range.to ?? undefined),
    ])

    // Currency-honest net for the KPI row (per-currency; never summed across).
    const netByCurrency = await db.feeAssessment.groupBy({
      by: ['currency'],
      where: {
        assessedAt: {
          ...(range.from ? { gte: range.from } : {}),
          ...(range.to ? { lte: range.to } : {}),
        },
      },
      _sum: { amount: true },
    })

    // Org name resolution — one fetch for the whole page.
    const orgIds = [...new Set(assessments.map((a) => a.actorOrgId).filter((x): x is string => !!x))]
    const orgs = orgIds.length
      ? await db.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } })
      : []
    const orgNames = new Map(orgs.map((o) => [o.id, o.name]))

    // Human ref labels — one batched fetch per refType present on the page.
    const payoutIds = assessments.filter((a) => a.refType === 'PAYOUT' && a.refId).map((a) => a.refId!)
    const agreementIds = assessments.filter((a) => a.refType === 'AGREEMENT' && a.refId).map((a) => a.refId!)
    const invoiceIds = assessments
      .filter((a) => a.refType === 'SUBSCRIPTION_INVOICE' && a.refId)
      .map((a) => a.refId!)
    const refLabels = new Map<string, string>()
    if (payoutIds.length) {
      const rows = await db.payout.findMany({ where: { id: { in: payoutIds } }, select: { id: true, number: true } })
      for (const r of rows) refLabels.set(`PAYOUT:${r.id}`, r.number)
    }
    if (agreementIds.length) {
      const rows = await db.financingAgreement.findMany({
        where: { id: { in: agreementIds } },
        select: { id: true, number: true },
      })
      for (const r of rows) refLabels.set(`AGREEMENT:${r.id}`, r.number)
    }
    if (invoiceIds.length) {
      const rows = await db.subscriptionInvoice.findMany({
        where: { id: { in: invoiceIds } },
        select: { id: true, number: true },
      })
      for (const r of rows) refLabels.set(`SUBSCRIPTION_INVOICE:${r.id}`, r.number)
    }

    const items: (FeeAssessmentDTO & { actorOrgName: string | null; refLabel: string | null })[] =
      assessments.map((a) => ({
        ...a,
        actorOrgName: a.actorOrgId ? (orgNames.get(a.actorOrgId) ?? null) : null,
        refLabel: a.refType && a.refId ? (refLabels.get(`${a.refType}:${a.refId}`) ?? null) : null,
      }))

    const eventSummary = event ? summary.filter((s) => s.event === event) : summary
    return NextResponse.json({
      assessments: items,
      count: items.length,
      summary: eventSummary,
      netByCurrency: netByCurrency
        .map((g) => ({ currency: g.currency, amount: Math.round((g._sum.amount ?? 0) * 100) / 100 }))
        .sort((a, b) => a.currency.localeCompare(b.currency)),
    })
  } catch (err) {
    if (err instanceof FeeServiceError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    }
    console.error('admin fees ledger GET error', err)
    return NextResponse.json({ error: 'Failed to load the fee ledger' }, { status: 500 })
  }
}
