import { db } from '../../src/lib/db'
async function main() {
  const payoutId = process.argv[2]
  const p = await db.payout.findUniqueOrThrow({ where: { id: payoutId }, include: { lines: true } })
  const a = await db.feeAssessment.findUnique({ where: { idempotencyKey: `ORDER_COMMISSION:payout:${payoutId}` } })
  console.log('PAYOUT', p.number, 'gross', p.grossAmount, 'rate', p.commissionRate, 'commission', p.commission)
  if (!a) { console.log('NO ASSESSMENT FOUND'); return }
  console.log('ASSESSMENT', a.id)
  console.log('  amount=', a.amount, 'event=', a.event, 'status=', a.status)
  console.log('  ruleId=', a.ruleId, 'ruleVersion=', a.ruleVersion)
  console.log('  actorType=', a.actorType, 'actorOrgId=', a.actorOrgId, 'refType=', a.refType, 'refId=', a.refId)
  console.log('  baseAmount=', a.baseAmount, 'currency=', a.currency, 'calcInputs=', a.calcInputs)
  console.log('  snapshot=', a.ruleSnapshot)
  console.log('PARITY commission==assessment:', p.commission === a.amount, `(${p.commission} vs ${a.amount})`)
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
