import { db } from '../../src/lib/db'
async function main() {
  const req = await db.financingRequest.findFirstOrThrow({ where: { number: 'FIN-2026-000042' } })
  console.log('REQUEST status=' + req.status, 'closedAt=' + req.closedAt?.toISOString())
  const offers = await db.financingOffer.findMany({ where: { requestId: req.id }, include: { installments: true } })
  for (const o of offers) console.log('OFFER', o.id, o.status, 'accepted=' + o.acceptedAt?.toISOString(), 'installments=' + o.installments.length)
  const agr = await db.financingAgreement.findFirst({ where: { offer: { requestId: req.id } }, include: { offer: { include: { installments: true } }, fees: true, events: true } })
  if (agr) {
    console.log('AGREEMENT', agr.id, agr.number, 'status=' + agr.status, 'funding=' + agr.fundingStatus, 'accepted=' + agr.acceptedAt?.toISOString())
    console.log('repayment schedule (frozen offer installments):', agr.offer.installments.length, 'first=' + JSON.stringify(agr.offer.installments[0]?.dueDate), 'total=' + agr.offer.installments.reduce((s,i)=>s+i.amount,0))
    for (const f of agr.fees) console.log('FEE', f.type, f.amount, f.status, 'base=' + f.baseAmount, 'pct=' + f.percentApplied)
    for (const e of agr.events) console.log('EVENT', e.type, e.createdAt.toISOString())
  } else {
    console.log('NO AGREEMENT')
  }
  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
