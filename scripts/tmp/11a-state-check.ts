import { db } from '@/lib/db'
async function main() {
  const rules = await db.feeRule.findMany({ orderBy: { updatedAt: 'asc' } })
  for (const r of rules) {
    console.log(`RULE ${r.id} ${r.event} @ ${r.scopeType}:${r.scopeId || '—'} ${r.dimension === 'PERCENT' ? r.value + '%' : r.value + ' ' + (r.currency ?? '')} v${r.version} active=${r.isActive} prec=${r.precedence} eff=${r.effectiveFrom.toISOString().slice(0,10)}→${r.effectiveTo ? r.effectiveTo.toISOString().slice(0,10) : 'open'}`)
  }
  const org = await db.organization.findUnique({ where: { id: 'cmuum7v7x0000lwtykxosot4f' }, select: { name: true } })
  console.log('ORG cmuum7v7x0000lwtykxosot4f =', org?.name)
  const assessments = await db.feeAssessment.findMany({ orderBy: { assessedAt: 'asc' } })
  for (const a of assessments) {
    console.log(`ASSESS ${a.event} key=${a.idempotencyKey} amount=${a.amount} ${a.currency} base=${a.baseAmount} rule=${a.ruleId ?? 'legacy'} v${a.ruleVersion ?? '—'} status=${a.status} actorOrg=${a.actorOrgId ?? '—'}`)
  }
  console.log('TOTAL ASSESSMENTS:', assessments.length)
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
