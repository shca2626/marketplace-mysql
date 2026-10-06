import { db } from '@/lib/db'
async function main() {
  const payouts = await db.payout.findMany({ select: { id: true, number: true, sellerId: true, seller: { select: { name: true, storeName: true } } }, orderBy: { createdAt: 'asc' } })
  for (const p of payouts) console.log(p.number, p.sellerId, p.seller.storeName ?? p.seller.name)
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
