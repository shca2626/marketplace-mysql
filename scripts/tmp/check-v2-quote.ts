import { db } from '../../src/lib/db'
async function main() {
  const rfq = await db.rfq.findFirst({ where: { number: 'RFQ-2026-000031' }, include: { quotes: true } })
  console.log('RFQ', rfq?.id, rfq?.number, 'v' + rfq?.version, 'status=' + rfq?.status, 'consentAt=' + rfq?.consentAt)
  for (const q of rfq?.quotes ?? []) console.log('QUOTE', q.id, q.number, 'status=' + q.status, 'total=' + q.total, 'sellerOrg=' + q.sellerOrgId)
  const old = await db.rfq.findFirst({ where: { number: 'RFQ-2026-000030' }, include: { quotes: true } })
  for (const q of old?.quotes ?? []) console.log('V1-QUOTE', q.id, q.number, 'status=' + q.status, 'total=' + q.total)
  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
