// Commission & Payouts — route-handler tests for the Vendora marketplace.
//
// Covers: platform-default vs vendor-override commission math, settlement
// eligibility (paid / not cancelled / not already settled), atomic payout
// generation (OrderItem.payoutId stamping, audit + notification), duplicate
// prevention, no double settlement, mark-paid authorization, cancel/release,
// the seller earnings endpoint, config validation and the admin listing.
//
// Route handlers are called directly with NextRequests built by the fixture
// helpers; sessions are driven through the next/headers stub cookie jar.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { GET as payoutsListGET } from '@/app/api/admin/payouts/route'
import { GET as payoutsPreviewGET } from '@/app/api/admin/payouts/preview/route'
import { POST as payoutGeneratePOST } from '@/app/api/admin/payouts/generate/route'
import { POST as payoutMarkPaidPOST } from '@/app/api/admin/payouts/[id]/mark-paid/route'
import { POST as payoutCancelPOST } from '@/app/api/admin/payouts/[id]/cancel/route'
import { GET as payoutsConfigGET, PUT as payoutsConfigPUT } from '@/app/api/admin/payouts/config/route'
import { GET as sellerEarningsGET } from '@/app/api/seller/earnings/route'
import { PATCH as vendorPATCH } from '@/app/api/admin/vendors/[id]/route'
import { db } from '@/lib/db'
import { cookieJar } from '@/tests/stubs/next-headers'
import {
  cleanupFixtures,
  clearSession,
  createFixtureCategory,
  createFixtureOrder,
  createFixtureProduct,
  createFixtureUser,
  getReq,
  params,
  patchReq,
  postReq,
  putReq,
  setSession,
  trackPayout,
} from '@/tests/fixtures'

// ─── shared state ────────────────────────────────────────────────────────────

let admin: { id: string }
let buyer: { id: string }
/** Original PlatformSetting "payouts" row (null = row absent) — restored in afterAll. */
let originalPayoutsSetting: string | null = null

/** Seller + category + product with the given price (and optional commission override). */
async function newSellerWithProduct(price: number, commissionRate: number | null = null) {
  const seller = await createFixtureUser({ role: 'SELLER', commissionRate })
  const category = await createFixtureCategory()
  const product = await createFixtureProduct({ sellerId: seller.id, categoryId: category.id, price })
  return { seller, product }
}

/** One settleable (PAID + SUCCEEDED payment) order for a single seller item. */
async function buy(
  sellerId: string,
  productId: string,
  price: number,
  quantity: number,
  opts: { orderStatus?: string; paymentStatus?: string } = {},
) {
  return createFixtureOrder({
    buyerId: buyer.id,
    orderStatus: opts.orderStatus,
    paymentStatus: opts.paymentStatus,
    items: [{ sellerId, productId, price, quantity }],
  })
}

/** Admin-authenticated preview call → parsed preview body. */
async function previewFor(sellerId: string): Promise<Record<string, unknown>> {
  const res = await payoutsPreviewGET(getReq(`/api/admin/payouts/preview?sellerId=${sellerId}`))
  expect(res.status).toBe(200)
  return (await res.json()).preview as Record<string, unknown>
}

/** Admin-authenticated generate call → parsed payout body. */
async function generateFor(sellerId: string): Promise<Record<string, unknown>> {
  const res = await payoutGeneratePOST(postReq('/api/admin/payouts/generate', { sellerId }))
  expect(res.status).toBe(201)
  const payout = (await res.json()).payout as Record<string, unknown>
  trackPayout(payout.id as string)
  return payout
}

// ─── the suite ────────────────────────────────────────────────────────────────

describe('commission & payouts API', () => {
  beforeAll(async () => {
    admin = await createFixtureUser({ role: 'ADMIN' })
    buyer = await createFixtureUser({ role: 'BUYER' })

    // Remember the pristine "payouts" platform setting for afterAll restore.
    const row = await db.platformSetting.findUnique({ where: { key: 'payouts' } })
    originalPayoutsSetting = row?.value ?? null

    // Pin the platform default at 10% so every money assertion below is
    // deterministic regardless of what earlier runs left behind.
    setSession(admin.id)
    const res = await payoutsConfigPUT(
      putReq('/api/admin/payouts/config', { defaultCommissionPercent: 10 }),
    )
    expect(res.status).toBe(200)
    expect(((await res.json()).config as { defaultCommissionPercent: number }).defaultCommissionPercent).toBe(10)
  })

  beforeEach(() => {
    cookieJar.clear()
  })

  afterAll(async () => {
    // Restore the platform setting row exactly as it was found.
    if (originalPayoutsSetting === null) {
      await db.platformSetting.deleteMany({ where: { key: 'payouts' } })
    } else {
      await db.platformSetting.upsert({
        where: { key: 'payouts' },
        create: { key: 'payouts', value: originalPayoutsSetting },
        update: { value: originalPayoutsSetting },
      })
    }
    await cleanupFixtures()
  })

  // 1 ──────────────────────────────────────────────────────────────────────
  it('computes commission from the platform default — $100 paid order → gross 100, commission 10, net 90', async () => {
    const { seller, product } = await newSellerWithProduct(50)
    await buy(seller.id, product.id, 50, 2) // 50 × 2 = 100

    setSession(admin.id)
    const cfgRes = await payoutsConfigGET()
    expect(cfgRes.status).toBe(200)
    expect(((await cfgRes.json()).config as { defaultCommissionPercent: number }).defaultCommissionPercent).toBe(10)

    const preview = await previewFor(seller.id)
    expect(preview).toMatchObject({
      sellerId: seller.id,
      commissionRate: 10,
      unsettledItems: 1,
      grossAmount: 100,
      commission: 10,
      netAmount: 90,
    })
  })

  // 2 ──────────────────────────────────────────────────────────────────────
  it('honors a vendor commission override (25%) and falls back to the platform default on null', async () => {
    const { seller, product } = await newSellerWithProduct(50)
    await buy(seller.id, product.id, 50, 2) // gross 100

    setSession(admin.id)
    expect((await previewFor(seller.id)).commissionRate).toBe(10)

    const set25 = await vendorPATCH(
      patchReq(`/api/admin/vendors/${seller.id}`, { action: 'set-commission', rate: 25 }),
      params({ id: seller.id }),
    )
    expect(set25.status).toBe(200)
    expect(((await set25.json()).vendor as { commissionRate: number | null }).commissionRate).toBe(25)

    expect(await previewFor(seller.id)).toMatchObject({
      commissionRate: 25,
      unsettledItems: 1,
      grossAmount: 100,
      commission: 25,
      netAmount: 75,
    })

    const clear = await vendorPATCH(
      patchReq(`/api/admin/vendors/${seller.id}`, { action: 'set-commission', rate: null }),
      params({ id: seller.id }),
    )
    expect(clear.status).toBe(200)
    expect(((await clear.json()).vendor as { commissionRate: number | null }).commissionRate).toBeNull()

    expect(await previewFor(seller.id)).toMatchObject({
      commissionRate: 10,
      commission: 10,
      netAmount: 90,
    })
  })

  // 3 ──────────────────────────────────────────────────────────────────────
  it('counts each seller only their own item once in a multi-seller order', async () => {
    const category = await createFixtureCategory()
    const sellerA = await createFixtureUser({ role: 'SELLER' })
    const sellerB = await createFixtureUser({ role: 'SELLER' })
    const productA = await createFixtureProduct({ sellerId: sellerA.id, categoryId: category.id, price: 30 })
    const productB = await createFixtureProduct({ sellerId: sellerB.id, categoryId: category.id, price: 20 })

    await createFixtureOrder({
      buyerId: buyer.id,
      items: [
        { sellerId: sellerA.id, productId: productA.id, price: 30, quantity: 1 },
        { sellerId: sellerB.id, productId: productB.id, price: 20, quantity: 3 },
      ],
    })

    setSession(admin.id)
    expect(await previewFor(sellerA.id)).toMatchObject({
      unsettledItems: 1,
      grossAmount: 30,
      commission: 3,
      netAmount: 27,
    })
    expect(await previewFor(sellerB.id)).toMatchObject({
      unsettledItems: 1,
      grossAmount: 60,
      commission: 6,
      netAmount: 54,
    })
  })

  // 4 ──────────────────────────────────────────────────────────────────────
  it('excludes cancelled orders, pending payments and already-settled items', async () => {
    const { seller, product } = await newSellerWithProduct(50)

    await buy(seller.id, product.id, 40, 1, { orderStatus: 'CANCELLED' }) // cancelled order
    await buy(seller.id, product.id, 25, 2, { orderStatus: 'PENDING_PAYMENT', paymentStatus: 'PENDING' }) // unconfirmed payment
    await buy(seller.id, product.id, 50, 1) // the only settleable item

    setSession(admin.id)
    expect(await previewFor(seller.id)).toMatchObject({
      unsettledItems: 1,
      grossAmount: 50,
      commission: 5,
      netAmount: 45,
    })

    const payout = await generateFor(seller.id)
    expect(payout.itemCount).toBe(1)

    // Settled items (payoutId set) drop out of the pool.
    expect(await previewFor(seller.id)).toMatchObject({
      unsettledItems: 0,
      grossAmount: 0,
      commission: 0,
      netAmount: 0,
    })
  })

  // 5 ──────────────────────────────────────────────────────────────────────
  it('generates one atomic payout stamping every eligible item, with audit row and seller notification', async () => {
    const { seller, product } = await newSellerWithProduct(20)
    await buy(seller.id, product.id, 20, 5) // 100
    await buy(seller.id, product.id, 15, 2) // 30  → gross 130 across two orders

    setSession(admin.id)
    const preview = await previewFor(seller.id)
    expect(preview).toMatchObject({ unsettledItems: 2, grossAmount: 130, commission: 13, netAmount: 117 })

    const payout = await generateFor(seller.id)
    expect(payout).toMatchObject({
      itemCount: preview.unsettledItems,
      grossAmount: preview.grossAmount,
      commissionRate: preview.commissionRate,
      commission: preview.commission,
      netAmount: preview.netAmount,
      status: 'PENDING',
    })

    const row = await db.payout.findUnique({ where: { id: payout.id as string } })
    expect(row).not.toBeNull()
    expect(row!.sellerId).toBe(seller.id)
    expect(row!.status).toBe('PENDING')
    expect(row!.itemCount).toBe(2)
    expect(Number(row!.grossAmount)).toBe(130)
    expect(Number(row!.commission)).toBe(13)
    expect(Number(row!.netAmount)).toBe(117)

    // EVERY included order item is stamped with the payout id.
    const items = await db.orderItem.findMany({ where: { sellerId: seller.id } })
    expect(items).toHaveLength(2)
    for (const item of items) expect(item.payoutId).toBe(payout.id)

    const audit = await db.auditLog.findFirst({
      where: { action: 'PAYOUT_GENERATED', entityId: payout.id as string },
    })
    expect(audit).not.toBeNull()
    expect(audit!.actorId).toBe(admin.id)

    const notification = await db.notification.findFirst({
      where: { userId: seller.id, type: 'PAYOUT_STATUS' },
    })
    expect(notification).not.toBeNull()
  })

  // 6 ──────────────────────────────────────────────────────────────────────
  it('rejects a second generate with 409 when the seller has nothing new to settle', async () => {
    const { seller, product } = await newSellerWithProduct(10)
    await buy(seller.id, product.id, 10, 1)

    setSession(admin.id)
    await generateFor(seller.id)

    const second = await payoutGeneratePOST(postReq('/api/admin/payouts/generate', { sellerId: seller.id }))
    expect(second.status).toBe(409)
    expect(((await second.json()).error as string).length).toBeGreaterThan(0)

    // No duplicate payout was created.
    expect(await db.payout.count({ where: { sellerId: seller.id } })).toBe(1)
  })

  // 7 ──────────────────────────────────────────────────────────────────────
  it('settles only newly eligible items after a paid payout — no double settlement', async () => {
    const { seller, product } = await newSellerWithProduct(40)
    const order1 = await buy(seller.id, product.id, 40, 2) // 80

    setSession(admin.id)
    const payout1 = await generateFor(seller.id)
    const markPaid1 = await payoutMarkPaidPOST(
      postReq(`/api/admin/payouts/${payout1.id}/mark-paid`, { note: 'wire #1' }),
      params({ id: payout1.id as string }),
    )
    expect(markPaid1.status).toBe(200)

    const order2 = await buy(seller.id, product.id, 60, 1) // 60

    const payout2 = await generateFor(seller.id)
    expect(payout2).toMatchObject({
      itemCount: 1,
      grossAmount: 60,
      commissionRate: 10,
      commission: 6,
      netAmount: 54,
      status: 'PENDING',
    })

    const item1 = await db.orderItem.findUnique({ where: { id: order1.itemIds[0] } })
    const item2 = await db.orderItem.findUnique({ where: { id: order2.itemIds[0] } })
    expect(item1!.payoutId).toBe(payout1.id) // old item untouched — not re-included
    expect(item2!.payoutId).toBe(payout2.id)
    expect(item1!.payoutId).not.toBe(payout2.id)
  })

  // 8 ──────────────────────────────────────────────────────────────────────
  it('guards mark-paid: seller/buyer → 403, anon → 401; admin flips PENDING → PAID once, second attempt 409', async () => {
    const { seller, product } = await newSellerWithProduct(25)
    await buy(seller.id, product.id, 25, 4) // 100

    setSession(admin.id)
    const payout = await generateFor(seller.id)
    const call = () =>
      payoutMarkPaidPOST(postReq(`/api/admin/payouts/${payout.id}/mark-paid`, {}), params({ id: payout.id as string }))

    setSession(seller.id)
    expect((await call()).status).toBe(403)
    setSession(buyer.id)
    expect((await call()).status).toBe(403)
    clearSession()
    expect([401, 403]).toContain((await call()).status)

    setSession(admin.id)
    const ok = await call()
    expect(ok.status).toBe(200)
    const body = (await ok.json()).payout as { id: string; status: string; paidAt: string | null }
    expect(body.id).toBe(payout.id)
    expect(body.status).toBe('PAID')
    expect(body.paidAt).toBeTruthy()

    const row = await db.payout.findUnique({ where: { id: payout.id as string } })
    expect(row!.status).toBe('PAID')
    expect(row!.paidAt).not.toBeNull()

    const audit = await db.auditLog.findFirst({ where: { action: 'PAYOUT_PAID', entityId: payout.id as string } })
    expect(audit).not.toBeNull()

    const again = await call()
    expect(again.status).toBe(409)
  })

  // 9 ──────────────────────────────────────────────────────────────────────
  it('cancelling a pending payout releases its items for a corrected re-generate', async () => {
    const { seller, product } = await newSellerWithProduct(35)
    const order = await buy(seller.id, product.id, 35, 2) // 70

    setSession(admin.id)
    const payout1 = await generateFor(seller.id)
    expect((await db.orderItem.findUnique({ where: { id: order.itemIds[0] } }))!.payoutId).toBe(payout1.id)

    const cancelRes = await payoutCancelPOST(
      postReq(`/api/admin/payouts/${payout1.id}/cancel`, { reason: 'wrong commission' }),
      params({ id: payout1.id as string }),
    )
    expect(cancelRes.status).toBe(200)
    expect((await cancelRes.json()).payout).toMatchObject({ id: payout1.id, status: 'CANCELLED' })

    // Items are released back to the unsettled pool.
    expect((await db.orderItem.findUnique({ where: { id: order.itemIds[0] } }))!.payoutId).toBeNull()

    const audit = await db.auditLog.findFirst({ where: { action: 'PAYOUT_CANCELLED', entityId: payout1.id as string } })
    expect(audit).not.toBeNull()

    const row = await db.payout.findUnique({ where: { id: payout1.id as string } })
    expect(row!.status).toBe('CANCELLED')

    // The released items re-enter the next payout.
    const payout2 = await generateFor(seller.id)
    expect(payout2).toMatchObject({
      itemCount: 1,
      grossAmount: 70,
      commissionRate: 10,
      commission: 7,
      netAmount: 63,
      status: 'PENDING',
    })
    expect((await db.orderItem.findUnique({ where: { id: order.itemIds[0] } }))!.payoutId).toBe(payout2.id)
  })

  // 10 ─────────────────────────────────────────────────────────────────────
  it('seller earnings: pending before any payout; lifetime + status after generate+mark-paid; no cross-seller leak', async () => {
    // Explicit 10% override on both sellers pins the math regardless of the
    // platform default the config test may have left behind.
    const sellerA = await newSellerWithProduct(50, 10)
    const sellerB = await newSellerWithProduct(30, 10)
    await buy(sellerA.seller.id, sellerA.product.id, 50, 2) // 100
    await buy(sellerB.seller.id, sellerB.product.id, 30, 1) // 30

    setSession(sellerA.seller.id)
    const beforeRes = await sellerEarningsGET()
    expect(beforeRes.status).toBe(200)
    expect(await beforeRes.json()).toMatchObject({
      commissionRate: 10,
      pending: { itemCount: 1, gross: 100, commission: 10, net: 90 },
      lifetime: { payouts: 0, paidOut: 0, commissionPaid: 0 },
      payouts: [],
    })

    setSession(admin.id)
    const payoutA = await generateFor(sellerA.seller.id)
    const payoutB = await generateFor(sellerB.seller.id)
    const markPaid = await payoutMarkPaidPOST(
      postReq(`/api/admin/payouts/${payoutA.id}/mark-paid`, { note: 'weekly run' }),
      params({ id: payoutA.id as string }),
    )
    expect(markPaid.status).toBe(200)

    setSession(sellerA.seller.id)
    const afterA = (await (await sellerEarningsGET()).json()) as {
      pending: { itemCount: number; gross: number; commission: number; net: number }
      lifetime: { payouts: number; paidOut: number; commissionPaid: number }
      payouts: Array<{ id: string; status: string }>
    }
    expect(afterA.pending).toMatchObject({ itemCount: 0, gross: 0, commission: 0, net: 0 })
    expect(afterA.lifetime).toEqual({ payouts: 1, paidOut: 90, commissionPaid: 10 })
    expect(afterA.payouts.map((p) => p.id)).toEqual([payoutA.id])
    expect(afterA.payouts[0].status).toBe('PAID')

    // The other seller sees only their own payout — no leakage.
    setSession(sellerB.seller.id)
    const afterB = (await (await sellerEarningsGET()).json()) as {
      lifetime: { payouts: number; paidOut: number }
      payouts: Array<{ id: string; status: string }>
    }
    expect(afterB.payouts.map((p) => p.id)).toEqual([payoutB.id])
    expect(afterB.payouts[0].status).toBe('PENDING')
    expect(afterB.lifetime).toEqual({ payouts: 0, paidOut: 0, commissionPaid: 0 })
  })

  // 11 ─────────────────────────────────────────────────────────────────────
  it('validates the commission config: 91 → 400, -1 → 400, 15 applies to sellers without an override', async () => {
    setSession(admin.id)

    const tooHigh = await payoutsConfigPUT(putReq('/api/admin/payouts/config', { defaultCommissionPercent: 91 }))
    expect(tooHigh.status).toBe(400)
    const negative = await payoutsConfigPUT(putReq('/api/admin/payouts/config', { defaultCommissionPercent: -1 }))
    expect(negative.status).toBe(400)

    const ok = await payoutsConfigPUT(putReq('/api/admin/payouts/config', { defaultCommissionPercent: 15 }))
    expect(ok.status).toBe(200)
    expect(((await ok.json()).config as { defaultCommissionPercent: number }).defaultCommissionPercent).toBe(15)

    const plain = await newSellerWithProduct(50) // no override
    const special = await newSellerWithProduct(50, 25) // vendor override wins
    await buy(plain.seller.id, plain.product.id, 50, 2)
    await buy(special.seller.id, special.product.id, 50, 2)

    expect(await previewFor(plain.seller.id)).toMatchObject({
      commissionRate: 15,
      unsettledItems: 1,
      grossAmount: 100,
      commission: 15,
      netAmount: 85,
    })
    expect(await previewFor(special.seller.id)).toMatchObject({
      commissionRate: 25,
      commission: 25,
      netAmount: 75,
    })

    // Restore the baseline the rest of the suite expects.
    const restore = await payoutsConfigPUT(putReq('/api/admin/payouts/config', { defaultCommissionPercent: 10 }))
    expect(restore.status).toBe(200)
    expect(((await restore.json()).config as { defaultCommissionPercent: number }).defaultCommissionPercent).toBe(10)
  })

  // 12 ─────────────────────────────────────────────────────────────────────
  it('guards the payout list: non-admin → 403; admin gets totalsByStatus consistent with the created payouts', async () => {
    const { seller, product } = await newSellerWithProduct(45)
    await buy(seller.id, product.id, 45, 2) // 90 gross → 9 commission → 81 net

    setSession(buyer.id)
    const denied = await payoutsListGET(getReq('/api/admin/payouts'))
    expect(denied.status).toBe(403)

    setSession(admin.id)
    const payout = await generateFor(seller.id)

    const res = await payoutsListGET(getReq('/api/admin/payouts?limit=50'))
    expect(res.status).toBe(200)
    const data = (await res.json()) as {
      total: number
      totalsByStatus: Record<string, { count: number; net: number; commission: number }>
      payouts: Array<Record<string, unknown> & { id: string; seller: { id: string } }>
    }
    expect(data.total).toBeGreaterThanOrEqual(1)

    const mine = data.payouts.find((p) => p.id === payout.id)
    expect(mine).toBeTruthy()
    expect(mine!.seller.id).toBe(seller.id)
    expect(mine).toMatchObject({
      id: payout.id,
      itemCount: 1,
      grossAmount: 90,
      commissionRate: 10,
      commission: 9,
      netAmount: 81,
      status: 'PENDING',
    })

    // totalsByStatus must equal a direct aggregation over every payout row.
    const groups = await db.payout.groupBy({
      by: ['status'],
      _sum: { netAmount: true, commission: true },
      _count: { _all: true },
    })
    const expected = Object.fromEntries(
      groups.map((g) => [
        g.status,
        {
          count: g._count._all,
          net: Number(g._sum.netAmount ?? 0),
          commission: Number(g._sum.commission ?? 0),
        },
      ]),
    )
    expect(data.totalsByStatus).toEqual(expected)
    expect(expected.PENDING.count).toBeGreaterThanOrEqual(1)
    expect(expected.PENDING.net).toBeGreaterThanOrEqual(81)
  })
})
