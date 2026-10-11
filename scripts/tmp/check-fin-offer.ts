import { db } from '../../src/lib/db'
async function main() {
  const req = await db.financingRequest.findFirstOrThrow({ where: { number: 'FIN-2026-000042' } })
  console.log('REQUEST', req.id, 'status=' + req.status)
  const offers = await db.financingOffer.findMany({ where: { requestId: req.id } })
  for (const o of offers) console.log('OFFER', o.id, o.number, 'status=' + o.status, 'amount=' + o.amount, 'rate=' + o.ratePercent, 'tenor=' + o.tenorMonths, 'sentAt=' + o.sentAt?.toISOString())
  if (offers[0]) {
    const inst = await db.financingOfferInstallment.findMany({ where: { offerId: offers[0].id }, orderBy: { installmentNo: 'asc' } })
    console.log('installments:', inst.length, 'total=' + inst.reduce((s, i) => s + i.amount, 0))
  }
  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
