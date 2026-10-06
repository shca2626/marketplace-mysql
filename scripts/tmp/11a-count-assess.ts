import { db } from '../../src/lib/db'
async function main() {
  const rows = await db.feeAssessment.findMany({ where: { actorOrgId: 'cmuum7v7x0000lwtykxosot4f' }, select: { idempotencyKey: true, amount: true, status: true, refId: true } })
  console.log('HelioMount assessments:', JSON.stringify(rows, null, 1))
  const payoutId = process.argv[2]
  if (payoutId) {
    const forPayout = await db.feeAssessment.count({ where: { idempotencyKey: `ORDER_COMMISSION:payout:${payoutId}` } })
    console.log(`rows for ORDER_COMMISSION:payout:${payoutId}:`, forPayout)
  }
  const total = await db.feeAssessment.count()
  console.log('TOTAL assessments:', total)
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
