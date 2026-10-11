import { db } from '../../src/lib/db'
async function main() {
  const req = await db.financingRequest.findFirstOrThrow({ where: { number: 'FIN-2026-000042' } })
  const offers = await db.financingOffer.findMany({ where: { requestId: req.id }, include: { installments: true } })
  for (const o of offers) {
    console.log('OFFER', o.id, o.status, 'rate=' + o.ratePercent, 'sent=' + o.sentAt?.toISOString(), 'installments=' + o.installments.length, 'instTotal=' + o.installments.reduce((s,i)=>s+i.amount,0))
  }
  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
