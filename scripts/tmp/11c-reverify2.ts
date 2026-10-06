import { db } from '../../src/lib/db'

async function main() {
  const [assessments, rules] = await Promise.all([
    db.feeAssessment.findMany({ orderBy: { assessedAt: 'asc' }, select: { id: true, event: true, status: true, amount: true, currency: true, refType: true, refId: true, reversalOfId: true, assessedAt: true, actorOrgId: true } }),
    db.feeRule.findMany({ select: { id: true, event: true, scopeType: true, scopeId: true, dimension: true, value: true, isActive: true, version: true, effectiveFrom: true } }),
  ])
  console.log('ASSESSMENTS:')
  for (const a of assessments) console.log(` ${a.assessedAt.toISOString()} ${a.event} ${a.status} ${a.amount} ${a.currency} ref=${a.refType}:${a.refId} revOf=${a.reversalOfId ?? '-'} org=${a.actorOrgId ?? '-'}`)
  console.log(`TOTAL assessments: ${assessments.length}`)
  console.log('RULES:')
  for (const r of rules) console.log(` ${r.event} ${r.scopeType}:${r.scopeId ?? '-'} v${r.version} ${r.dimension}=${r.value} active=${r.isActive} from=${r.effectiveFrom.toISOString()}`)
  const payouts = await db.payout.findMany({ orderBy: { createdAt: 'asc' }, select: { number: true, commission: true, currency: true, status: true, createdAt: true } })
  console.log('PAYOUTS:')
  for (const p of payouts) console.log(` ${p.createdAt.toISOString()} ${p.number} commission=${p.commission} ${p.currency} ${p.status}`)
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
