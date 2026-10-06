import { db } from '@/lib/db'
async function main() {
  const items = await db.orderItem.findMany({
    where: { payoutId: null, order: { status: { not: 'CANCELLED' }, payment: { status: 'SUCCEEDED' } } },
    select: { id: true, sellerId: true, sellerOrgId: true, title: true, price: true, quantity: true, orderId: true },
    orderBy: { id: 'asc' },
  })
  for (const i of items) {
    console.log(`${i.sellerOrgId} ${i.title} x${i.quantity} @ ${i.price} = ${(i.price * i.quantity).toFixed(2)} [${i.id}]`)
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
