import { db } from '../../src/lib/db'
async function main() {
  const buyers = ['maya@example.com', 'leo@example.com', 'sofia@example.com', 'jamal@example.com', 'nina@example.com']
  const users = await db.user.findMany({ where: { email: { in: buyers } }, select: { id: true, email: true } })
  const orders = await db.order.findMany({
    where: { buyerId: { in: users.map((u) => u.id) } },
    select: { id: true, status: true, poNumber: true, organizationId: true, payment: { select: { status: true, method: true } }, buyer: { select: { email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
  for (const o of orders) console.log(o.buyer.email.padEnd(22), o.status.padEnd(16), 'pay:' + (o.payment?.status ?? 'none').padEnd(10), o.id.slice(-6))
  console.log('total:', orders.length)
}
main().finally(() => db.$disconnect())
