import { db } from '../../src/lib/db'
async function main() {
  const q = await db.quote.findFirstOrThrow({ where: { number: 'QTE-2026-000022' } })
  console.log('QUOTE', q.number, 'status=' + q.status, 'convertedAt=' + q.convertedAt?.toISOString())
  const rfq = await db.rfq.findFirstOrThrow({ where: { id: q.rfqId } })
  console.log('RFQ', rfq.number, 'status=' + rfq.status)
  const orders = await db.order.findMany({ where: { buyerId: q.rfqId ? undefined : undefined } , take: 0 })
  // find orders containing the E2EFIN product via order items
  const prod = await db.product.findFirstOrThrow({ where: { title: { startsWith: 'E2EFIN Solar Pump' } } })
  const items = await db.orderItem.findMany({ where: { productId: prod.id }, include: { order: true } })
  for (const it of items) {
    console.log('ORDERITEM', it.id, 'qty=' + it.quantity, 'price=' + it.unitPrice, 'offerId=' + it.offerId)
    const o = it.order
    console.log('ORDER', o.id, o.number, 'status=' + o.status, 'paymentStatus=' + o.paymentStatus, 'buyer=' + o.buyerId, 'total=' + o.total, 'createdAt=' + o.createdAt.toISOString())
  }
  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
