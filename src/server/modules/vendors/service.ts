import { db } from '@/lib/db'
import { recordAudit, recordAuditTx } from '@/server/modules/audit/service'
import { emitNotification } from '@/server/modules/notifications/service'

/**
 * Vendor management — the platform owner's control surface over marketplace
 * sellers. Suspended vendors: products vanish from every public surface, the
 * session is rejected (getSessionUser), login is blocked and writes 403.
 * Verification (User.verifiedAt) is the KYC-lite stamp RFQ routing reacts to.
 */

export class VendorServiceError extends Error {
  constructor(message: string, public status = 400) {
    super(message)
  }
}

export interface VendorListFilters {
  q?: string
  status?: 'ACTIVE' | 'SUSPENDED'
  verified?: 'yes' | 'no'
  page?: number
  limit?: number
}

export async function listVendors(filters: VendorListFilters) {
  const page = Math.max(1, filters.page ?? 1)
  const limit = Math.min(50, Math.max(1, filters.limit ?? 20))

  const where: Record<string, unknown> = { role: 'SELLER' }
  const q = filters.q?.trim()
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { email: { contains: q } },
      { storeName: { contains: q } },
    ]
  }
  if (filters.status) where.status = filters.status
  if (filters.verified === 'yes') where.verifiedAt = { not: null }
  if (filters.verified === 'no') where.verifiedAt = null

  const [total, sellers] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        storeName: true,
        storeBio: true,
        image: true,
        status: true,
        suspendedAt: true,
        verifiedAt: true,
        commissionRate: true,
        createdAt: true,
        // 7.0: the seller-org tenant + its verification state
        sellerProfilesOwned: {
          select: {
            organizationId: true,
            verificationState: true,
            verifiedAt: true,
            organization: { select: { id: true, name: true, status: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])

  const ids = sellers.map((s) => s.id)
  const [productRows, revenueRows, ratingRows, gmvItems] = await Promise.all([
    ids.length
      ? db.product.groupBy({
          by: ['sellerId'],
          where: { sellerId: { in: ids } },
          _count: { _all: true },
        })
      : Promise.resolve([] as { sellerId: string; _count: { _all: number } }[]),
    ids.length
      ? db.orderItem.groupBy({
          by: ['sellerId'],
          where: { sellerId: { in: ids }, order: { status: { not: 'CANCELLED' } } },
          _sum: { quantity: true },
        })
      : Promise.resolve([] as { sellerId: string; _sum: { quantity: number | null } }[]),
    ids.length
      ? db.product.groupBy({
          by: ['sellerId'],
          where: { sellerId: { in: ids } },
          _avg: { rating: true },
          _sum: { reviewCount: true },
        })
      : Promise.resolve([] as { sellerId: string; _avg: { rating: number | null }; _sum: { reviewCount: number | null } }[]),
    ids.length
      ? db.orderItem.findMany({
          where: { sellerId: { in: ids }, order: { status: { not: 'CANCELLED' } } },
          select: { sellerId: true, price: true, quantity: true },
        })
      : Promise.resolve([] as { sellerId: string; price: number; quantity: number }[]),
  ])

  const countBySeller = new Map(productRows.map((r) => [r.sellerId, r._count._all]))
  const unitsBySeller = new Map(revenueRows.map((r) => [r.sellerId, r._sum.quantity ?? 0]))
  const ratingBySeller = new Map(ratingRows.map((r) => [r.sellerId, r._avg.rating ?? 0]))
  const reviewsBySeller = new Map(ratingRows.map((r) => [r.sellerId, r._sum.reviewCount ?? 0]))
  const gmvMap = new Map<string, number>()
  for (const it of gmvItems) gmvMap.set(it.sellerId, (gmvMap.get(it.sellerId) ?? 0) + it.price * it.quantity)

  return {
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    vendors: sellers.map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      storeName: s.storeName,
      storeBio: s.storeBio,
      image: s.image,
      status: s.status,
      suspendedAt: s.suspendedAt?.toISOString() ?? null,
      verified: !!s.verifiedAt,
      verifiedAt: s.verifiedAt?.toISOString() ?? null,
      commissionRate: s.commissionRate,
      memberSince: s.createdAt.toISOString(),
      // 7.0: seller-org tenant identity (three-concept model)
      sellerOrg: s.sellerProfilesOwned[0]
        ? {
            organizationId: s.sellerProfilesOwned[0].organizationId,
            organizationName: s.sellerProfilesOwned[0].organization.name,
            organizationStatus: s.sellerProfilesOwned[0].organization.status,
            verificationState: s.sellerProfilesOwned[0].verificationState,
            verifiedAt: s.sellerProfilesOwned[0].verifiedAt?.toISOString() ?? null,
          }
        : null,
      products: countBySeller.get(s.id) ?? 0,
      unitsSold: unitsBySeller.get(s.id) ?? 0,
      gmv: Math.round((gmvMap.get(s.id) ?? 0) * 100) / 100,
      rating: Math.round((ratingBySeller.get(s.id) ?? 0) * 10) / 10,
      reviews: reviewsBySeller.get(s.id) ?? 0,
    })),
  }
}

export type VendorAction =
  | { action: 'verify' }
  | { action: 'unverify' }
  | { action: 'suspend'; reason?: string }
  | { action: 'reactivate'; note?: string }
  | { action: 'set-commission'; rate: number | null }

export async function applyVendorAction(actorId: string, vendorId: string, input: VendorAction) {
  const vendor = await db.user.findUnique({ where: { id: vendorId } })
  if (!vendor || vendor.role !== 'SELLER')
    throw new VendorServiceError('Vendor not found', 404)
  if (vendor.id === actorId)
    throw new VendorServiceError('You cannot apply actions to your own account', 400)

  let data: Record<string, unknown>
  let auditAction: string
  let summary: string
  let notify: { title: string; body: string } | null = null

  switch (input.action) {
    case 'verify': {
      if (vendor.verifiedAt) throw new VendorServiceError('Vendor is already verified', 409)
      data = { verifiedAt: new Date() }
      auditAction = 'VENDOR_VERIFIED'
      summary = `Vendor ${vendor.storeName ?? vendor.name} verified (KYC-lite stamp granted)`
      notify = {
        title: 'Your store is verified',
        body: 'Vendora has verified your business. Verified stores get priority in RFQ routing and buyer trust signals.',
      }
      break
    }
    case 'unverify': {
      if (!vendor.verifiedAt) throw new VendorServiceError('Vendor is not verified', 409)
      data = { verifiedAt: null }
      auditAction = 'VENDOR_UNVERIFIED'
      summary = `Verification removed from ${vendor.storeName ?? vendor.name}`
      notify = {
        title: 'Your verification was removed',
        body: 'Your store is no longer marked as verified. RFQ routing and trust signals no longer include the verified badge.',
      }
      break
    }
    case 'suspend': {
      if (vendor.status === 'SUSPENDED') throw new VendorServiceError('Vendor is already suspended', 409)
      data = { status: 'SUSPENDED', suspendedAt: new Date() }
      auditAction = 'VENDOR_SUSPENDED'
      summary = `Vendor ${vendor.storeName ?? vendor.name} suspended${input.reason ? ` — ${input.reason}` : ''}`
      notify = {
        title: 'Your vendor account has been suspended',
        body: `Your products are hidden from the marketplace and you cannot sign in.${input.reason ? ` Reason: ${input.reason}` : ''} Contact platform support to resolve this.`,
      }
      break
    }
    case 'reactivate': {
      if (vendor.status !== 'SUSPENDED') throw new VendorServiceError('Vendor is not suspended', 409)
      data = { status: 'ACTIVE', suspendedAt: null }
      auditAction = 'VENDOR_REACTIVATED'
      summary = `Vendor ${vendor.storeName ?? vendor.name} reactivated`
      notify = {
        title: 'Your vendor account is active again',
        body: 'Welcome back — your products are live on the marketplace and sign-in is restored.',
      }
      break
    }
    case 'set-commission': {
      if (input.rate != null && (input.rate < 0 || input.rate > 90))
        throw new VendorServiceError('Commission rate must be between 0 and 90 percent', 400)
      data = { commissionRate: input.rate }
      auditAction = 'VENDOR_COMMISSION_SET'
      summary = `Commission for ${vendor.storeName ?? vendor.name} set to ${input.rate == null ? 'platform default' : `${input.rate}%`}`
      break
    }
  }

  const updated = await db.user.update({ where: { id: vendorId }, data })

  await recordAudit({
    actorId,
    actorType: 'ADMIN',
    action: auditAction,
    entityType: 'User',
    entityId: vendorId,
    summary,
    metadata: { reason: 'reason' in input ? input.reason ?? null : null, rate: 'rate' in input ? input.rate ?? null : null },
  })

  if (notify) {
    await emitNotification({
      userId: vendorId,
      type: 'VENDOR_STATUS',
      title: notify.title,
      body: notify.body,
      linkView: 'seller',
    })
  }

  return {
    id: updated.id,
    status: updated.status,
    suspendedAt: updated.suspendedAt?.toISOString() ?? null,
    verifiedAt: updated.verifiedAt?.toISOString() ?? null,
    commissionRate: updated.commissionRate,
  }
}

// ── Phase 7.0: seller-org verification state (lastplan 7.0 / S3) ──────────
// Verification lives on SellerProfile.verificationState — Organization.status
// stays the OPERATIONAL lifecycle (suspension). The legacy User.verifiedAt
// stamp is kept in sync so RFQ routing filters and storefront badges keep
// working during the migration window.

export const SELLER_VERIFICATION_STATES = ['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'] as const
export type SellerVerificationState = (typeof SELLER_VERIFICATION_STATES)[number]

export async function setSellerVerification(
  adminId: string,
  sellerId: string,
  input: { state: SellerVerificationState; note?: string }
) {
  const seller = await db.user.findUnique({ where: { id: sellerId }, select: { id: true, name: true, storeName: true, role: true } })
  if (!seller || seller.role !== 'SELLER') throw new VendorServiceError('Vendor not found', 404)

  // The seller org + profile exist from the 7.0 backfill; create defensively
  // if a seller appeared without one (the reconciliation gate catches drift).
  let profile = await db.sellerProfile.findFirst({ where: { ownerUserId: sellerId } })
  if (!profile) {
    const org = await db.organization.findFirst({
      where: { members: { some: { userId: sellerId, role: 'OWNER' } } },
    })
    let organizationId = org?.id
    if (!organizationId) {
      const created = await db.organization.create({
        data: {
          name: `${seller.storeName ?? seller.name} (Store)`,
          slug: `store-${seller.id.slice(-8).toLowerCase()}`,
          orgType: 'COMPANY',
          status: 'ACTIVE',
        },
      })
      organizationId = created.id
      await db.organizationMember.create({ data: { organizationId, userId: sellerId, role: 'OWNER' } })
    }
    profile = await db.sellerProfile.create({ data: { organizationId, ownerUserId: sellerId } })
  }

  const now = new Date()
  const updated = await db.$transaction(async (tx) => {
    const row = await tx.sellerProfile.update({
      where: { id: profile!.id },
      data: {
        verificationState: input.state,
        verificationNote: input.note?.slice(0, 1000) ?? null,
        verifiedAt: input.state === 'VERIFIED' ? now : null,
      },
    })
    // Legacy stamp stays in sync (routing filters + storefront badges read it)
    await tx.user.update({
      where: { id: sellerId },
      data: { verifiedAt: input.state === 'VERIFIED' ? now : null },
    })
    await recordAuditTx(tx, {
      actorId: adminId,
      actorType: 'ADMIN',
      action: 'SELLER_VERIFICATION_SET',
      entityType: 'SellerProfile',
      entityId: row.id,
      summary: `Seller org verification → ${input.state} (${seller.storeName ?? seller.name})${input.note ? ` — ${input.note.slice(0, 200)}` : ''}`,
      metadata: { sellerId, organizationId: row.organizationId, state: input.state },
    })
    return row
  })

  if (input.state === 'VERIFIED') {
    await emitNotification({
      userId: sellerId,
      type: 'VENDOR_STATUS',
      title: 'Your store is verified',
      body: 'Vendora has verified your business. Verified stores get priority in RFQ routing and buyer trust signals.',
      linkView: 'seller',
    }).catch(() => {})
  }

  return {
    sellerId,
    organizationId: updated.organizationId,
    verificationState: updated.verificationState,
    verificationNote: updated.verificationNote,
    verifiedAt: updated.verifiedAt?.toISOString() ?? null,
  }
}
