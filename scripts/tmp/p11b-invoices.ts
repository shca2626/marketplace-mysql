// Task 11-b E2E — invoice + ledger fee evidence for the QA Solar org.
import { db } from '@/lib/db'
async function main() {
  const sub = await db.sellerSubscription.findUnique({
    where: { organizationId: 'cmupyeohj0003ndxmr62q7eha' },
    select: { id: true },
  })
  if (!sub) { console.log('no sub'); return }
  const invoices = await db.subscriptionInvoice.findMany({
    where: { subscriptionId: sub.id },
    orderBy: { createdAt: 'asc' },
  })
  for (const i of invoices) {
    console.log(`INVOICE ${i.number} ${i.status} ${i.amount} ${i.currency} period=${i.periodStart.toISOString().slice(0, 10)}→${i.periodEnd.toISOString().slice(0, 10)}`)
  }
  const fees = await db.feeAssessment.findMany({
    where: { event: 'SUBSCRIPTION_RENEWAL', actorOrgId: 'cmupyeohj0003ndxmr62q7eha' },
    orderBy: { assessedAt: 'asc' },
  })
  for (const f of fees) {
    console.log(`FEE ${f.event} amount=${f.amount} ${f.currency} refType=${f.refType} reversalOfId=${f.reversalOfId ?? 'null'}`)
  }
  console.log(`counts: invoices=${invoices.length} (PAID=${invoices.filter((i) => i.status === 'PAID').length}, FAILED=${invoices.filter((i) => i.status === 'FAILED').length}), SUBSCRIPTION_RENEWAL fees=${fees.length}`)
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
