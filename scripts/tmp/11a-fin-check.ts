import { db } from '@/lib/db'
async function main() {
  const fees = await db.financingFee.findMany({
    where: { type: 'SUCCESS' },
    orderBy: { createdAt: 'asc' },
    include: { agreement: { select: { id: true, number: true, offer: { select: { amount: true, currency: true } } } } },
  })
  for (const f of fees) {
    const key = `FINANCING_SUCCESS:agreement:${f.agreementId}`
    const assess = await db.feeAssessment.findUnique({ where: { idempotencyKey: key } })
    console.log(`FEE ${f.id} agr=${f.agreement.number} amount=${f.amount} currency=${f.agreement.offer.currency} percent?=${(Number(f.amount) / Number(f.agreement.offer.amount) * 100).toFixed(2)}% → assess=${assess ? assess.amount + ' ' + assess.currency + ' calc=' + assess.calcInputs : 'NONE'}`)
  }
  console.log('---AGREEMENTS (latest 6)---')
  const agrs = await db.financingAgreement.findMany({ orderBy: { createdAt: 'desc' }, take: 6, select: { id: true, number: true, status: true, createdAt: true, offer: { select: { amount: true, currency: true, status: true } } } })
  for (const a of agrs) console.log(a.number, a.status, a.createdAt.toISOString(), a.offer.amount, a.offer.currency)
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
