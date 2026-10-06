import { db } from '@/lib/db'
async function main() {
  const payouts = await db.payout.findMany({ select: { id: true, number: true, commission: true, status: true, createdAt: true, currency: true }, orderBy: { createdAt: 'asc' } })
  console.log('PAYOUTS:', JSON.stringify(payouts.map(p => ({ n: p.number, c: p.commission, st: p.status, cur: p.currency }))))
  const assessments = await db.feeAssessment.findMany({ select: { id: true, event: true, amount: true, status: true, refType: true, refId: true, idempotencyKey: true, ruleVersion: true, ruleSnapshot: true }, orderBy: { assessedAt: 'asc' } })
  console.log('ASSESSMENTS:', JSON.stringify(assessments.map(a => ({ ev: a.event, amt: a.amount, st: a.status, ref: a.refType + ':' + String(a.refId).slice(0, 8), key: a.idempotencyKey.slice(0, 50), rv: a.ruleVersion })), null, 1))
  const invoices = await db.subscriptionInvoice.findMany({ select: { number: true, amount: true, status: true, planKey: true }, orderBy: { createdAt: 'asc' } })
  console.log('INVOICES:', JSON.stringify(invoices))
  const subs = await db.sellerSubscription.groupBy({ by: ['status', 'planId'], _count: true })
  console.log('SUB_GROUPS:', JSON.stringify(subs))
  const rules = await db.feeRule.findMany({ select: { id: true, event: true, scopeType: true, value: true, isActive: true, version: true, note: true } })
  console.log('RULES:', JSON.stringify(rules, null, 1))
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
