import { db } from '@/lib/db'

/**
 * PRICING ENGINE — price is RESOLVED, never just read.
 *
 * Resolution pipeline (first match wins):
 *   1. ORG-scope price lists  → contract prices for a specific organization
 *   2. GROUP-scope price lists → segment prices (B2B tiers AND B2C segments)
 *   3. CHANNEL-scope lists    → B2B2C channel prices (wired, populated later)
 *   4. Product.price          → retail fallback
 *
 * Business rules:
 *   - An organization must be ACTIVE for its contract/group pricing to apply
 *     (PENDING_VERIFICATION / SUSPENDED / REJECTED orgs buy at retail).
 *   - Within a winning list, the entry with the largest minQuantity ≤ requested
 *     quantity applies (quantity-break ladder).
 *   - Between lists: ORG beats GROUP beats CHANNEL; ties broken by priority
 *     (higher wins), then oldest list (stable, predictable).
 *   - Savings are computed against the retail list price for buyer display.
 */

export type PriceSource = 'CONTRACT' | 'GROUP' | 'RETAIL'

export interface BuyerContext {
  userId: string
  /** Active organization the user is buying on behalf of (validated). */
  organizationId: string | null
  organizationStatus: string | null
  /** Effective customer groups (org groups first, then personal groups). */
  customerGroupIds: string[]
}

export interface PriceResolveItem {
  productId: string
  quantity: number
}

export interface ResolvedPrice {
  productId: string
  quantity: number
  unitPrice: number
  listPrice: number
  source: PriceSource
  priceListId?: string
  priceListName?: string
  savingsAmount: number
  savingsPercent: number
}

function scopeRank(scope: string): number {
  if (scope === 'ORG') return 3
  if (scope === 'CHANNEL') return 2
  return 1 // GROUP
}

/**
 * Build the buyer context for a user: which organization they are acting for
 * (explicitly requested, validated against membership, defaulting to their
 * first membership) and which customer groups apply. B2B pricing requires an
 * ACTIVE organization; otherwise the buyer resolves at retail/personal groups.
 */
export async function buildBuyerContext(
  userId: string,
  requestedOrgId?: string | null
): Promise<BuyerContext> {
  const [user, memberships] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { groups: { select: { customerGroupId: true } } } }),
    db.organizationMember.findMany({
      where: { userId },
      select: { organizationId: true },
    }),
  ])

  const userGroupIds = (user?.groups ?? []).map((cg) => cg.customerGroupId)

  let organizationId: string | null = null
  if (requestedOrgId && memberships.some((m) => m.organizationId === requestedOrgId)) {
    organizationId = requestedOrgId
  } else if (!requestedOrgId && memberships.length > 0) {
    organizationId = memberships[0].organizationId
  }

  let organizationStatus: string | null = null
  let orgGroupIds: string[] = []
  if (organizationId) {
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { status: true, groups: { select: { customerGroupId: true } } },
    })
    if (org) {
      organizationStatus = org.status
      orgGroupIds = org.groups.map((cg) => cg.customerGroupId)
    }
  }

  const orgActive = organizationStatus === 'ACTIVE'
  return {
    userId,
    organizationId: orgActive ? organizationId : null,
    organizationStatus,
    customerGroupIds: orgActive ? [...orgGroupIds, ...userGroupIds] : userGroupIds,
  }
}

/**
 * Resolve unit prices for a basket of items under a buyer context.
 * Returns a map keyed by productId (one entry per product; the caller passes
 * the intended quantity per product).
 */
export async function resolvePrices(
  items: PriceResolveItem[],
  ctx: BuyerContext
): Promise<Map<string, ResolvedPrice>> {
  const out = new Map<string, ResolvedPrice>()
  if (!items.length) return out

  const products = await db.product.findMany({
    where: { id: { in: items.map((i) => i.productId) } },
    select: { id: true, price: true },
  })
  const productMap = new Map(products.map((p) => [p.id, p]))

  const now = new Date()
  const listWhere: object[] = [
    { status: 'ACTIVE' },
    { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
    { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
  ]
  const targets: object[] = []
  if (ctx.organizationId) targets.push({ organizationId: ctx.organizationId })
  if (ctx.customerGroupIds.length > 0)
    targets.push({ customerGroupId: { in: ctx.customerGroupIds } })

  if (targets.length === 0) {
    // No B2B context at all → everything resolves at retail.
    for (const item of items) {
      const p = productMap.get(item.productId)
      if (!p) continue
      out.set(item.productId, retailPrice(item, p.price))
    }
    return out
  }

  const lists = await db.priceList.findMany({
    where: { AND: [...listWhere, { OR: targets }] },
    include: { entries: true },
  })

  lists.sort(
    (a, b) =>
      scopeRank(b.scope) - scopeRank(a.scope) ||
      b.priority - a.priority ||
      a.createdAt.getTime() - b.createdAt.getTime()
  )

  for (const item of items) {
    const p = productMap.get(item.productId)
    if (!p) continue

    let resolved: ResolvedPrice | null = null
    for (const list of lists) {
      const ladder = list.entries.filter(
        (e) => e.productId === item.productId && e.minQuantity <= item.quantity
      )
      if (ladder.length === 0) continue
      const best = ladder.reduce((a, b) => (b.minQuantity > a.minQuantity ? b : a))
      const unitPrice = best.unitPrice
      resolved = {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice,
        listPrice: p.price,
        source: list.scope === 'ORG' ? 'CONTRACT' : 'GROUP',
        priceListId: list.id,
        priceListName: list.name,
        savingsAmount:
          p.price > unitPrice
            ? Math.round((p.price - unitPrice) * item.quantity * 100) / 100
            : 0,
        savingsPercent:
          p.price > unitPrice ? Math.round((1 - unitPrice / p.price) * 1000) / 10 : 0,
      }
      break
    }
    if (!resolved) resolved = retailPrice(item, p.price)
    out.set(item.productId, resolved)
  }
  return out
}

function retailPrice(item: PriceResolveItem, price: number): ResolvedPrice {
  return {
    productId: item.productId,
    quantity: item.quantity,
    unitPrice: price,
    listPrice: price,
    source: 'RETAIL',
    savingsAmount: 0,
    savingsPercent: 0,
  }
}
