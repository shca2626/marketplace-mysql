import { db } from '@/lib/db'
async function main() {
  const payouts = await db.payout.findMany({ select: { id: true, number: true, commission: true, commissionRate: true, grossAmount: true } })
  let allSingle = true
  for (const p of payouts) {
    const rows = await db.feeAssessment.findMany({ where: { idempotencyKey: `ORDER_COMMISSION:payout:${p.id}` }, select: { id: true, amount: true, status: true } })
    const ok = rows.length === 1 && rows[0].amount === p.commission
    if (!ok) allSingle = false
    console.log(`${p.number} commission=${p.commission} rate=${p.commissionRate}% gross=${p.grossAmount} → assessment rows=${rows.length} amount=${rows[0]?.amount ?? '—'} status=${rows[0]?.status ?? '—'} PARITY=${ok ? 'YES (commission == assessment, exactly one row)' : 'CHECK'}`)
  }
  const dupKeys = await db.feeAssessment.groupBy({ by: ['idempotencyKey'], _count: { _all: true }, having: { idempotencyKey: { _count: { gt: 1 } } } })
  console.log('duplicate idempotencyKeys in ledger:', dupKeys.length)
  console.log('ALL SINGLE+PARITY:', allSingle)
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
