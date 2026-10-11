import { db } from '@/lib/db'
async function main() {
  const agId = process.argv[2]
  const agr = await db.financingAgreement.findUniqueOrThrow({
    where: { id: agId },
    include: { offer: { select: { amount: true, currency: true } }, fees: true },
  })
  console.log('AGREEMENT', agr.number, agr.id)
  const successFee = agr.fees.find((f) => f.type === 'SUCCESS')
  if (!successFee) { console.log('NO SUCCESS FEE ROW'); return }
  console.log(`FinancingFee SUCCESS: amount=${successFee.amount} ${agr.offer.currency} status=${successFee.status} (offer ${agr.offer.amount} ${agr.offer.currency} → implied ${((Number(successFee.amount) / agr.offer.amount) * 100).toFixed(4)}%)`)
  const key = `FINANCING_SUCCESS:agreement:${agId}`
  const a = await db.feeAssessment.findUnique({ where: { idempotencyKey: key } })
  if (!a) { console.log('NO ASSESSMENT — HOOK DID NOT FIRE'); return }
  console.log(`FeeAssessment: amount=${a.amount} ${a.currency} base=${a.baseAmount} status=${a.status}`)
  console.log(`  rule=${a.ruleId ?? 'none (legacy)'} v${a.ruleVersion ?? '—'}`)
  console.log(`  calcInputs=${a.calcInputs}`)
  console.log(`  ruleSnapshot=${a.ruleSnapshot}`)
  console.log(`  actorType=${a.actorType} actorOrgId=${a.actorOrgId} refType=${a.refType} refId=${a.refId}`)
  console.log(`PARITY fee==assessment: ${Number(successFee.amount) === a.amount} (${successFee.amount} vs ${a.amount})`)
  const ci = JSON.parse(a.calcInputs ?? '{}')
  const implied = (Number(successFee.amount) / agr.offer.amount) * 100
  console.log(`PERCENT CHECK: calcInputs.percent=${ci.percent} vs implied-from-fee=${implied.toFixed(4)}`)
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
