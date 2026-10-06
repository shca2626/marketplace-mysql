import { db } from '@/lib/db'

async function main() {
  const [assessments, rules, payouts, fees, invoices] = await Promise.all([
    db.feeAssessment.count(),
    db.feeRule.findMany({ select: { id: true, event: true, scopeType: true, scopeId: true, value: true, dimension: true, isActive: true, version: true } }),
    db.payout.findMany({ select: { id: true, number: true, commission: true, currency: true, status: true, createdAt: true, sellerOrgId: true, commissionRate: true, grossAmount: true }, orderBy: { createdAt: 'asc' } }),
    db.financingFee.findMany({ where: { type: 'SUCCESS' }, select: { id: true, agreementId: true, amount: true, status: true, createdAt: true } }),
    db.subscriptionInvoice.findMany({ select: { id: true, number: true, amount: true, currency: true, status: true, createdAt: true } }),
  ])
  console.log('ASSESSMENTS:', assessments)
  console.log('RULES:', JSON.stringify(rules, null, 1))
  console.log('PAYOUTS:', JSON.stringify(payouts, null, 1))
  console.log('SUCCESS FEES:', JSON.stringify(fees, null, 1))
  console.log('SUB INVOICES:', JSON.stringify(invoices, null, 1))
  // orgs for names
  const orgs = await db.organization.findMany({ select: { id: true, name: true, orgType: true }, take: 200 })
  console.log('ORG COUNT:', orgs.length)
  console.log('BANK/MFI/EWALLET ORGS:', JSON.stringify(orgs.filter(o => o.orgType !== 'COMPANY').map(o => ({ id: o.id, name: o.name, type: o.orgType })), null, 1))
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
