import { db } from '../../src/lib/db'
async function main() {
  const agr = await db.financingAgreement.findFirstOrThrow({ where: { number: 'AGR-2026-000032' }, include: { offer: { include: { installments: true } }, events: true, fees: true } })
  console.log('AGREEMENT', agr.number, 'status=' + agr.status, 'funding=' + agr.fundingStatus, 'fundedReportedAt=' + agr.fundedReportedAt?.toISOString())
  const o = await db.order.findFirstOrThrow({ where: { sourceQuoteId: { not: null } }, orderBy: { createdAt: 'desc' } })
  console.log('ORDER', o.id, 'status=' + o.status, 'buyer=' + o.buyerId, 'org=' + o.organizationId)
  const audit = await db.auditLog.findMany({ where: { OR: [ { entityType: 'FinancingOffer' }, { entityType: 'FinancingAgreement' }, { entityType: 'Quote' }, { entityType: 'Rfq' } ] }, orderBy: { createdAt: 'desc' }, take: 20 })
  for (const a of audit) console.log('AUDIT', a.action, a.entityType, a.entityId.slice(-8), a.createdAt.toISOString())
  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
