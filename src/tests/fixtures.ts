// Test fixtures for route-handler tests (vitest).
//
// Tests import the route handlers directly and call them with NextRequest
// objects built by the helpers below — no HTTP server involved. Session
// state is driven through the next/headers stub's cookie jar (aliased in
// vitest.config.ts), so `setSession(userId)` is exactly "this user is
// signed in" for every handler call that follows.
//
// Every fixture row created here (or registered via the track* helpers for
// rows created through API routes) is removed by cleanupFixtures(). Call
// `afterAll(() => cleanupFixtures())` in every test file.

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { createSessionToken, hashPassword, SESSION_COOKIE } from '@/lib/auth'
import { cookieJar } from '@/tests/stubs/next-headers'

// ─── unique names ─────────────────────────────────────────────────────────────

/** Time + random suffix — collision-proof within and across test runs. */
export function uniq(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

// ─── session helpers (drive the next/headers stub's cookie jar) ─────────────

/** Sign in as `userId` for every subsequent route-handler call. */
export function setSession(userId: string): void {
  cookieJar.set(SESSION_COOKIE, createSessionToken(userId))
}

/** Sign out (clears the stub session cookie). */
export function clearSession(): void {
  cookieJar.delete(SESSION_COOKIE)
}

/** The active-organization selector cookie (matches src/server/authz/context). */
export const ACTIVE_ORG_COOKIE = 'vendora_active_org'

/** Sign in as `userId` acting for `orgId` (org-context selector cookie). */
export function setOrgSession(userId: string, orgId: string): void {
  setSession(userId)
  cookieJar.set(ACTIVE_ORG_COOKIE, orgId)
}

/** Return to the personal context (drop the org selector, keep the session). */
export function clearOrgContext(): void {
  cookieJar.delete(ACTIVE_ORG_COOKIE)
}

// ─── B2B selling-company fixture ────────────────────────────────────────────

export interface SellingCompany {
  orgId: string
  ownerId: string
  ownerEmail: string
}

/**
 * A company that can quote on the shared catalog: ACTIVE org + OWNER member +
 * an ACTIVE ProductOffer on `product` (the org must hold an offer on every
 * product it quotes — server-enforced by createQuote).
 */
export async function createSellingCompany(
  product: { id: string },
  opts: { name?: string; price?: number; stock?: number; verifiedOwner?: boolean } = {}
): Promise<SellingCompany> {
  const owner = await createFixtureUser({ role: 'BUYER', verified: opts.verifiedOwner })
  const org = await db.organization.create({
    data: {
      name: opts.name ?? uniq('Selling Co'),
      slug: uniq('selling-co'),
      orgType: 'COMPANY',
      status: 'ACTIVE',
    },
  })
  trackedOrganizationIds.add(org.id)
  await db.organizationMember.create({
    data: { organizationId: org.id, userId: owner.id, role: 'OWNER' },
  })
  await db.productOffer.create({
    data: {
      productId: product.id,
      sellerId: owner.id,
      sellerOrgId: org.id,
      price: opts.price ?? 50,
      stock: opts.stock ?? 500,
      status: 'ACTIVE',
    },
  })
  return { orgId: org.id, ownerId: owner.id, ownerEmail: owner.email }
}

// ─── request builders ────────────────────────────────────────────────────────
// Routes read `req.nextUrl.searchParams`, so these MUST be real NextRequest
// instances. No Origin header is set — src/lib/http.ts assertSameOrigin lets
// Origin-less (server-to-server) requests through.

const BASE_URL = 'http://localhost:3000'

export function getReq(url: string): NextRequest {
  return new NextRequest(BASE_URL + url, { method: 'GET' })
}

export function postReq(url: string, body?: unknown): NextRequest {
  return new NextRequest(BASE_URL + url, {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
    headers: { 'content-type': 'application/json' },
  })
}

export function putReq(url: string, body?: unknown): NextRequest {
  return new NextRequest(BASE_URL + url, {
    method: 'PUT',
    body: JSON.stringify(body ?? {}),
    headers: { 'content-type': 'application/json' },
  })
}

export function patchReq(url: string, body?: unknown): NextRequest {
  return new NextRequest(BASE_URL + url, {
    method: 'PATCH',
    body: JSON.stringify(body ?? {}),
    headers: { 'content-type': 'application/json' },
  })
}

export function deleteReq(url: string): NextRequest {
  return new NextRequest(BASE_URL + url, { method: 'DELETE' })
}

/** Route context for dynamic segments: `{ params: Promise<T> }` (Next 15+). */
export function params<T extends object>(p: T): { params: Promise<T> } {
  return { params: Promise.resolve(p) }
}

// ─── fixture registries (for cleanup) ───────────────────────────────────────

const trackedUserIds = new Set<string>()
const trackedCategoryIds = new Set<string>()
const trackedProductIds = new Set<string>()
const trackedOrderIds = new Set<string>()
const trackedPayoutIds = new Set<string>()
const trackedRfqIds = new Set<string>()
const trackedOrganizationIds = new Set<string>()

/** Register a user row created through an API route (not a fixture creator). */
export function trackUser(id: string): void {
  trackedUserIds.add(id)
}
/** Register a category row created through an API route. */
export function trackCategory(id: string): void {
  trackedCategoryIds.add(id)
}
/** Register a product row created through an API route. */
export function trackProduct(id: string): void {
  trackedProductIds.add(id)
}
/** Register an order row created through an API route. */
export function trackOrder(id: string): void {
  trackedOrderIds.add(id)
}
/** Register a payout row created through an API route. */
export function trackPayout(id: string): void {
  trackedPayoutIds.add(id)
}
/** Register an RFQ row created through an API route (quotes/lines cascade). */
export function trackRfq(id: string): void {
  trackedRfqIds.add(id)
}
/** Register an organization row created through an API route. */
export function trackOrganization(id: string): void {
  trackedOrganizationIds.add(id)
}

// ─── fixture creators ────────────────────────────────────────────────────────

export interface FixtureUserOptions {
  role?: 'BUYER' | 'SELLER' | 'ADMIN'
  status?: 'ACTIVE' | 'SUSPENDED'
  email?: string
  name?: string
  storeName?: string | null
  verified?: boolean
  commissionRate?: number | null
  password?: string
}

export interface FixtureUser {
  id: string
  email: string
  password: string
  role: string
  status: string
  storeName: string | null
}

export async function createFixtureUser(opts: FixtureUserOptions = {}): Promise<FixtureUser> {
  const role = opts.role ?? 'BUYER'
  const email = opts.email ?? `${uniq(role.toLowerCase())}@t.dev`
  const password = opts.password ?? 'Passw0rd!123'
  const user = await db.user.create({
    data: {
      email,
      name: opts.name ?? uniq('Test User'),
      password: hashPassword(password),
      role,
      status: opts.status ?? 'ACTIVE',
      suspendedAt: (opts.status ?? 'ACTIVE') === 'SUSPENDED' ? new Date() : null,
      storeName:
        opts.storeName !== undefined
          ? opts.storeName
          : role === 'SELLER'
            ? uniq('Test Store')
            : null,
      commissionRate: opts.commissionRate ?? null,
      verifiedAt: opts.verified ? new Date() : null,
    },
  })
  trackedUserIds.add(user.id)
  return {
    id: user.id,
    email: user.email,
    password,
    role: user.role,
    status: user.status,
    storeName: user.storeName,
  }
}

export interface FixtureCategory {
  id: string
  name: string
  slug: string
}

export async function createFixtureCategory(name?: string): Promise<FixtureCategory> {
  const finalName = name ?? uniq('Category')
  let slug = finalName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 110)
  if (await db.category.findUnique({ where: { slug } })) slug = uniq(slug).slice(0, 120)
  const category = await db.category.create({ data: { name: finalName, slug } })
  trackedCategoryIds.add(category.id)
  return { id: category.id, name: category.name, slug: category.slug }
}

export interface FixtureProductOptions {
  sellerId: string
  categoryId: string
  title?: string
  description?: string
  price?: number
  stock?: number
  status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
  featured?: boolean
  images?: string[]
}

export interface FixtureProduct {
  id: string
  title: string
  sellerId: string
  categoryId: string
  price: number
  status: string
}

export async function createFixtureProduct(opts: FixtureProductOptions): Promise<FixtureProduct> {
  const product = await db.product.create({
    data: {
      title: opts.title ?? uniq('Test Product'),
      description: opts.description ?? 'Fixture product for automated tests.',
      price: opts.price ?? 19.99,
      compareAtPrice: null,
      images: JSON.stringify(opts.images ?? ['https://example.com/x.jpg']),
      categoryId: opts.categoryId,
      sellerId: opts.sellerId,
      stock: opts.stock ?? 10,
      status: opts.status ?? 'ACTIVE',
      featured: opts.featured ?? false,
    },
  })
  trackedProductIds.add(product.id)
  return {
    id: product.id,
    title: product.title,
    sellerId: product.sellerId,
    categoryId: product.categoryId,
    price: product.price,
    status: product.status,
  }
}

export interface FixtureOrderItemInput {
  sellerId: string
  productId: string
  price: number
  quantity: number
  variantId?: string | null
  variantName?: string | null
}

export interface FixtureOrderOptions {
  buyerId: string
  items: FixtureOrderItemInput[]
  orderStatus?: string
  paymentStatus?: string
  paymentMethod?: string
  total?: number
  sourceType?: string
}

export interface FixtureOrder {
  id: string
  itemIds: string[]
  paymentId: string
  total: number
}

export async function createFixtureOrder(opts: FixtureOrderOptions): Promise<FixtureOrder> {
  const items = opts.items
  const total =
    opts.total ?? items.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const paymentMethod = opts.paymentMethod ?? 'CARD'
  const paymentStatus = opts.paymentStatus ?? 'SUCCEEDED'

  const result = await db.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        buyerId: opts.buyerId,
        total,
        status: opts.orderStatus ?? 'PAID',
        fullName: 'Test Buyer',
        address: '1 Test Street',
        city: 'Test City',
        country: 'US',
        zip: '12345',
        sourceType: opts.sourceType ?? 'CART',
      },
    })
    const itemIds: string[] = []
    for (const item of items) {
      const created = await tx.orderItem.create({
        data: {
          orderId: order.id,
          productId: item.productId,
          sellerId: item.sellerId,
          quantity: item.quantity,
          price: item.price,
          title: 'Test item',
          image: null,
          variantId: item.variantId ?? null,
          variantName: item.variantName ?? null,
        },
      })
      itemIds.push(created.id)
    }
    const payment = await tx.payment.create({
      data: {
        orderId: order.id,
        method: paymentMethod,
        status: paymentStatus,
        amount: total,
        paidAt: paymentStatus === 'SUCCEEDED' ? new Date() : null,
      },
    })
    return { orderId: order.id, itemIds, paymentId: payment.id }
  })

  trackedOrderIds.add(result.orderId)
  return { id: result.orderId, itemIds: result.itemIds, paymentId: result.paymentId, total }
}

// ─── cleanup ─────────────────────────────────────────────────────────────────
// Children first, parents last, so no FK ever dangles. Rows are matched by
// the tracked registries AND by ownership (sellerId/buyerId/userId within the
// tracked users), so rows created indirectly through API routes are caught too.

function orWhere(...clauses: Array<Record<string, unknown> | null>): Record<string, unknown> | null {
  const valid = clauses.filter((c): c is Record<string, unknown> => c !== null)
  if (valid.length === 0) return null
  if (valid.length === 1) return valid[0]
  return { OR: valid }
}

export async function cleanupFixtures(): Promise<void> {
  const users = [...trackedUserIds]
  const categories = [...trackedCategoryIds]
  const products = [...trackedProductIds]
  const orders = [...trackedOrderIds]
  const payouts = [...trackedPayoutIds]
  const rfqs = [...trackedRfqIds]
  const organizations = [...trackedOrganizationIds]

  // Payouts first: deleting one nulls OrderItem.payoutId (or must happen
  // before items go, depending on FK action) — either way this order is safe.
  const payoutWhere = orWhere(
    payouts.length ? { id: { in: payouts } } : null,
    users.length ? { sellerId: { in: users } } : null,
  )
  if (payoutWhere) await db.payout.deleteMany({ where: payoutWhere })

  // ── Intermediary model (settlement / commission / attachments) ──
  // Invoices → statements → obligations (statements SetNull obligations),
  // evidence → settlements (evidence cascades), then the references.
  const commissionInvoiceWhere = orWhere(
    users.length ? { sellerId: { in: users } } : null,
  )
  if (commissionInvoiceWhere) await db.commissionInvoice.deleteMany({ where: commissionInvoiceWhere })

  const commissionStatementWhere = orWhere(
    users.length ? { sellerId: { in: users } } : null,
  )
  if (commissionStatementWhere) await db.commissionStatement.deleteMany({ where: commissionStatementWhere })

  const obligationWhere = orWhere(
    users.length ? { sellerId: { in: users } } : null,
    orders.length ? { orderId: { in: orders } } : null,
  )
  if (obligationWhere) await db.commissionObligation.deleteMany({ where: obligationWhere })

  if (users.length) await db.paymentEvidence.deleteMany({ where: { uploadedById: { in: users } } })

  const settlementWhere = orWhere(
    orders.length ? { orderId: { in: orders } } : null,
    users.length ? { declaredById: { in: users } } : null,
  )
  if (settlementWhere) await db.externalSettlementReference.deleteMany({ where: settlementWhere })

  // ── B2B core (disputes / approvals / rfqs) ──
  const disputeWhere = orWhere(
    orders.length ? { orderId: { in: orders } } : null,
    users.length ? { raisedById: { in: users } } : null,
    users.length ? { sellerId: { in: users } } : null,
  )
  if (disputeWhere) await db.dispute.deleteMany({ where: disputeWhere })

  const approvalWhere = orWhere(
    users.length ? { requesterId: { in: users } } : null,
    users.length ? { decidedById: { in: users } } : null,
    orders.length ? { orderId: { in: orders } } : null,
    rfqs.length ? { rfqId: { in: rfqs } } : null,
  )
  if (approvalWhere) await db.approvalRequest.deleteMany({ where: approvalWhere })

  const quoteWhere = orWhere(
    users.length ? { createdById: { in: users } } : null,
    users.length ? { sellerId: { in: users } } : null,
    rfqs.length ? { rfqId: { in: rfqs } } : null,
  )
  if (quoteWhere) await db.quote.deleteMany({ where: quoteWhere })

  if (users.length) await db.rfqMessage.deleteMany({ where: { authorId: { in: users } } })

  const rfqWhere = orWhere(
    users.length ? { userId: { in: users } } : null,
    rfqs.length ? { id: { in: rfqs } } : null,
  )
  if (rfqWhere) await db.rfq.deleteMany({ where: rfqWhere })

  if (users.length) {
    await db.recurringRfq.deleteMany({ where: { userId: { in: users } } })
    await db.mediaAsset.deleteMany({ where: { uploadedById: { in: users } } })
    await db.organizationMember.deleteMany({ where: { userId: { in: users } } })
  }
  // Shared-catalog offers created by fixture selling companies (before the
  // org rows go — the FK would only null them out, leaving orphans).
  const offerWhere = orWhere(
    users.length ? { sellerId: { in: users } } : null,
    organizations.length ? { sellerOrgId: { in: organizations } } : null,
  )
  if (offerWhere) await db.productOffer.deleteMany({ where: offerWhere })

  if (organizations.length) await db.organization.deleteMany({ where: { id: { in: organizations } } })

  const orderItemWhere = orWhere(
    orders.length ? { orderId: { in: orders } } : null,
    users.length ? { sellerId: { in: users } } : null,
  )
  if (orderItemWhere) await db.orderItem.deleteMany({ where: orderItemWhere })

  if (orders.length) await db.payment.deleteMany({ where: { orderId: { in: orders } } })

  const orderWhere = orWhere(
    orders.length ? { id: { in: orders } } : null,
    users.length ? { buyerId: { in: users } } : null,
  )
  if (orderWhere) await db.order.deleteMany({ where: orderWhere })

  if (products.length) await db.productVariant.deleteMany({ where: { productId: { in: products } } })

  const productWhere = orWhere(
    products.length ? { id: { in: products } } : null,
    users.length ? { sellerId: { in: users } } : null,
  )
  if (productWhere) await db.product.deleteMany({ where: productWhere })

  if (users.length) await db.notification.deleteMany({ where: { userId: { in: users } } })

  const auditWhere = orWhere(
    users.length ? { actorId: { in: users } } : null,
    users.length ? { entityId: { in: users } } : null,
    products.length ? { entityId: { in: products } } : null,
    orders.length ? { entityId: { in: orders } } : null,
  )
  if (auditWhere) await db.auditLog.deleteMany({ where: auditWhere })

  const reviewWhere = orWhere(
    users.length ? { userId: { in: users } } : null,
    products.length ? { productId: { in: products } } : null,
  )
  if (reviewWhere) await db.review.deleteMany({ where: reviewWhere })

  const favoriteWhere = orWhere(
    users.length ? { userId: { in: users } } : null,
    products.length ? { productId: { in: products } } : null,
  )
  if (favoriteWhere) await db.favorite.deleteMany({ where: favoriteWhere })

  if (categories.length) await db.category.deleteMany({ where: { id: { in: categories } } })

  if (users.length) await db.user.deleteMany({ where: { id: { in: users } } })

  trackedUserIds.clear()
  trackedCategoryIds.clear()
  trackedProductIds.clear()
  trackedOrderIds.clear()
  trackedPayoutIds.clear()
  trackedRfqIds.clear()
  trackedOrganizationIds.clear()
}
