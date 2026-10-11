import { db } from '@/lib/db'
async function main() {
  const ps = await db.payout.findMany({ select: { number: true, status: true, commission: true, currency: true, grossAmount: true, createdAt: true }, orderBy: { createdAt: 'asc' } })
  console.log(JSON.stringify(ps, null, 0))
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
