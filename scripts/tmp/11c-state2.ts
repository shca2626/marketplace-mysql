import { db } from '@/lib/db'
async function main() {
  const payouts = await db.payout.count()
  const assessed = await db.feeAssessment.count()
  const byEvent = await db.feeAssessment.groupBy({ by: ['event', 'status'], _count: { _all: true } })
  console.log('payouts total:', payouts, '| assessments:', assessed, JSON.stringify(byEvent))
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
