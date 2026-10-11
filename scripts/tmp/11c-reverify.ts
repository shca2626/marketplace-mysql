import { db } from '../../src/lib/db'

async function main() {
  const [assessments, rules, payouts, invoices, fees] = await Promise.all([
    db.feeAssessment.findMany({ select: { id: true, event: true, status: true, amount: true, currency: true, refType: true, refId: true, reversalOfId: true } }),
    db.feeRule.findMany({ select: { id: true, event: true, scopeType: true, scopeId: true, dimension: true, value: true, isActive: true, version: true, effectiveFrom: true } }),
    db.payout.findMany({ select: { id: true, number: true, commission: true, currency: true, status: true, createdAt: true } }),
    db.subscriptionInvoice.findMany({ select: { id: true, number: true, amount: true, currency: true, status: true, createdAt: true } }),
    db.financingFee.findMany({ where: { type: 'SUCCESS' }, select: { agreementId: true, amount: true, status: true, createdAt: true } }),
  ])
  console.log('ASSESSMENTS', JSON.stringify(assessments, null, 1))
  console.log('RULES', JSON.stringify(rules, null, 1))
  console.log('PAYOUTS', JSON.stringify(payouts, null, 1))
  console.log('INVOICES', JSON.stringify(invoices, null, 1))
  console.log('FEES(success)', JSON.stringify(fees, null, 1))
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
