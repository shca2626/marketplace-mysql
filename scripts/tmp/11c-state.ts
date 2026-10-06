import { db } from '@/lib/db'
async function main() {
  const c = await db.feeAssessment.count()
  console.log('FEE ASSESSMENTS:', c)
  if (c > 0) {
    const rows = await db.feeAssessment.findMany({ select: { event: true, status: true, amount: true, currency: true, refType: true, refId: true }, take: 20 })
    console.log(JSON.stringify(rows, null, 1))
  }
  const inv = await db.subscriptionInvoice.count()
  console.log('SUB INVOICES:', inv)
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
