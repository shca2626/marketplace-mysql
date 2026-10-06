import { reconcileRevenue } from '@/server/modules/fees/revenue'
async function main() {
  const r = await reconcileRevenue({})
  for (const e of r.events) {
    for (const c of e.currencies) {
      console.log(`${e.event} [${c.currency}] ledger=${c.ledgerSum} external=${c.externalSum} diff=${c.difference} reconciled=${c.reconciled}`)
    }
    console.log(`  unreconciled=${e.unreconciledCount} (legacy=${e.legacyCount})`, e.unreconciled.filter(u=>u.legacy).map(u=>`${u.label}:${u.amount}`).join(', '))
  }
  console.log('reversalCount:', r.reversalCount)
  console.log('buckets:', JSON.stringify(r.monthlyBuckets))
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
