/**
 * DIGEST-13 QA seed — fresh notifications for the demo buyer so the DAILY
 * digest window (last 24h) is populated for E2E verification.
 * The demo account's existing feed is days old (outside the digest window).
 * One-off: run manually, not part of the seed pipeline.
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const demo = await db.user.findUnique({ where: { email: 'demo@vendora.com' } })
  if (!demo) throw new Error('demo@vendora.com not found')

  const now = Date.now()
  const h = (hours: number) => new Date(now - hours * 3600 * 1000)

  const items: {
    type: string
    title: string
    body: string | null
    linkView: string
    linkId?: string | null
    hoursAgo: number
    read?: boolean
  }[] = [
    // quotes family (bell's orange cluster)
    { type: 'RFQ_QUOTE_RECEIVED', title: 'New quote on RFQ-2026-000012', body: 'Atlas Industrial quoted $1,284.00 for 40 units of Hydraulic Seal Kit.', linkView: 'rfq', hoursAgo: 1 },
    { type: 'RFQ_QUOTE_RECEIVED', title: 'New quote on RFQ-2026-000012', body: 'Northline Supply quoted $1,342.50 for 40 units of Hydraulic Seal Kit.', linkView: 'rfq', hoursAgo: 4, read: true },
    { type: 'RFQ_STATUS', title: 'RFQ-2026-000011 is under review', body: 'The platform team is reviewing your request before routing it to sellers.', linkView: 'rfq', hoursAgo: 9, read: true },
    // messages family (stone cluster)
    { type: 'RFQ_MESSAGE', title: 'New message on RFQ-2026-000012', body: 'Atlas Industrial asked: "Can you confirm the required certification for these kits?"', linkView: 'rfq', hoursAgo: 2 },
    { type: 'RFQ_MESSAGE', title: 'New message on RFQ-2026-000009', body: 'Northline Supply shared updated lead times for the bulk order.', linkView: 'rfq', hoursAgo: 11, read: true },
    // approvals family (rose cluster)
    { type: 'APPROVAL_DECIDED', title: 'Purchase approved', body: 'PO-2026-000048 ($2,150.00) was approved by Al-Amal procurement.', linkView: 'business', hoursAgo: 6 },
    // recurring family (teal cluster)
    { type: 'RECURRING_PREVIEW', title: 'Recurring RFQ publishes tomorrow', body: 'Monthly restock — Fasteners & Fittings will publish in 24 hours.', linkView: 'rfq', hoursAgo: 3, read: true },
    // platform family (fallback cluster) — 7 rows to exercise the "+1 more" cap
    { type: 'PAYMENT_STATUS', title: 'Payment captured — Order ORD-10241', body: 'Your card payment of $486.20 was captured successfully.', linkView: 'orders', hoursAgo: 2 },
    { type: 'PAYMENT_STATUS', title: 'Payment captured — Order ORD-10238', body: 'Your card payment of $118.75 was captured successfully.', linkView: 'orders', hoursAgo: 5, read: true },
    { type: 'PAYMENT_STATUS', title: 'Payment captured — Order ORD-10235', body: 'Your card payment of $742.00 was captured successfully.', linkView: 'orders', hoursAgo: 8 },
    { type: 'PAYMENT_STATUS', title: 'Payment captured — Order ORD-10231', body: 'Your card payment of $35.90 was captured successfully.', linkView: 'orders', hoursAgo: 10, read: true },
    { type: 'PAYMENT_STATUS', title: 'Payment captured — Order ORD-10229', body: 'Your card payment of $1,024.10 was captured successfully.', linkView: 'orders', hoursAgo: 13 },
    { type: 'PAYMENT_STATUS', title: 'Payment captured — Order ORD-10227', body: 'Your card payment of $219.99 was captured successfully.', linkView: 'orders', hoursAgo: 16, read: true },
    { type: 'PAYMENT_STATUS', title: 'Payment captured — Order ORD-10224', body: 'Your card payment of $608.45 was captured successfully.', linkView: 'orders', hoursAgo: 20 },
  ]

  for (const item of items) {
    await db.notification.create({
      data: {
        userId: demo.id,
        type: item.type,
        title: item.title,
        body: item.body,
        linkView: item.linkView,
        linkId: item.linkId ?? null,
        readAt: item.read ? h(item.hoursAgo + 0.5) : null,
        createdAt: h(item.hoursAgo),
      },
    })
  }
  console.log(`seeded ${items.length} fresh notifications for ${demo.email}`)
}

main().finally(() => db.$disconnect())
