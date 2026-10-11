import { db } from '@/lib/db'
async function main() {
  const items = await db.orderItem.findMany({
    where: { payoutId: null, order: { status: { not: 'CANCELLED' }, payment: { status: 'SUCCEEDED' } } },
    select: { sellerId: true, sellerOrgId: true, price: true, quantity: true },
  })
  const bySeller = new Map<string, { org: string | null; count: number; gross: number }>()
  for (const i of items) {
    const e = bySeller.get(i.sellerId) ?? { org: i.sellerOrgId, count: 0, gross: 0 }
    e.count++; e.gross += i.price * i.quantity
    bySeller.set(i.sellerId, e)
  }
  const sellers = await db.user.findMany({ where: { id: { in: [...bySeller.keys()] } }, select: { id: true, name: true, storeName: true, commissionRate: true } })
  for (const s of sellers) {
    const e = bySeller.get(s.id)!
    console.log(`${s.name} (${s.storeName}) seller=${s.id} org=${e.org} override=${s.commissionRate} items=${e.count} gross=${(Math.round(e.gross * 100) / 100).toFixed(2)}`)
  }
  if (sellers.length === 0) console.log('NO ELIGIBLE ITEMS ANYWHERE')
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
