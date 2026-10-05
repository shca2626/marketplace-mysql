import { db } from '@/lib/db'
import { recordAudit } from '@/server/modules/audit/service'
import { emitNotification } from '@/server/modules/notifications/service'
import { recordConsent } from './agreements'

/**
 * PHASE 4 — publish-approval workflow.
 *
 * One mechanism, three subjects (owner Q6): product listings, multi-vendor
 * offers, and financier services. New/unestablished publishers land in
 * PENDING_REVIEW; the admin queue approves (→ live) or rejects (→ REJECTED
 * + reason). Every decision emits a notification to the owner and an audit
 * entry; the Publication Agreement consent is audit-logged separately.
 */

export class ReviewError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

/**
 * Audit-log the seller's Publication Agreement consent (owner Q6).
 *
 * Phase 9.4 — dual-write: alongside the classic audit entry, every NEW
 * acceptance also lands in the immutable PublicationConsent ledger (via
 * recordConsent — idempotent, resolved against the ACTIVE template). Returns
 * the ledger template version the consent was recorded against (null only if
 * no template could be resolved).
 */
export async function recordPublicationConsent(
  sellerId: string,
  productId: string,
  productTitle: string,
  version: string,
  ipAddress?: string | null
): Promise<string | null> {
  const consent = await recordConsent({
    userId: sellerId,
    productId,
    productTitle,
    ipAddress: ipAddress ?? null,
  })
  await recordAudit({
    actorId: sellerId,
    actorType: 'SELLER',
    action: 'PRODUCT_PUBLICATION_CONSENT',
    entityType: 'Product',
    entityId: productId,
    summary: `Seller accepted the Publication Agreement (v${version}) for "${productTitle}"`,
    metadata: { productId, agreementVersion: version, ledgerVersion: consent?.version ?? null },
  })
  return consent?.version ?? null
}

// ── Products ──────────────────────────────────────────────────────────────────

export async function decideProductReview(
  admin: { id: string; name: string },
  productId: string,
  action: 'APPROVE' | 'REJECT',
  note?: string
) {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { id: true, title: true, status: true, sellerId: true, images: true },
  })
  if (!product) throw new ReviewError('Product not found', 404)
  if (product.status !== 'PENDING_REVIEW' && product.status !== 'REJECTED')
    throw new ReviewError('This listing is not in the review queue', 400)

  if (action === 'REJECT' && !note?.trim())
    throw new ReviewError('A rejection reason is required — it is shown to the seller', 400)

  const images = (() => {
    try {
      const arr = JSON.parse(product.images || '[]')
      return Array.isArray(arr) ? arr.length : 0
    } catch {
      return 0
    }
  })()
  if (action === 'APPROVE' && images === 0)
    throw new ReviewError('This listing has no images — ask the seller to add at least one before approval', 400)

  const updated = await db.product.update({
    where: { id: productId },
    data: {
      status: action === 'APPROVE' ? 'ACTIVE' : 'REJECTED',
      reviewNote: action === 'APPROVE' ? null : note!.trim(),
      reviewedAt: new Date(),
      reviewedById: admin.id,
      // approvals always clear the featured flag unless explicitly set later
      featured: action === 'APPROVE' ? product.status === 'REJECTED' ? false : undefined : false,
    },
  })

  await recordAudit({
    actorId: admin.id,
    actorType: 'ADMIN',
    action: 'PRODUCT_REVIEW_DECIDED',
    entityType: 'Product',
    entityId: productId,
    summary: `Admin ${action === 'APPROVE' ? 'approved' : 'rejected'} listing "${product.title}"${action === 'REJECT' ? ` — ${note!.trim()}` : ''}`,
    metadata: { action, note: note?.trim() ?? null, before: product.status, after: updated.status },
  })

  // 9.1: curated records have no seller to notify (platform-owned decision).
  if (product.sellerId) {
    await emitNotification({
      userId: product.sellerId,
      type: 'PRODUCT_REVIEW_STATUS',
      title: action === 'APPROVE' ? 'Listing approved' : 'Listing rejected',
      body:
        action === 'APPROVE'
          ? `"${product.title}" passed platform review and is now live in the catalog.`
          : `"${product.title}" was rejected: ${note!.trim()}`,
      linkView: 'seller',
      linkId: productId,
    })
  }

  return updated
}

// ── Offers ────────────────────────────────────────────────────────────────────

export async function decideOfferReview(
  admin: { id: string; name: string },
  offerId: string,
  action: 'APPROVE' | 'REJECT',
  note?: string
) {
  const offer = await db.productOffer.findUnique({
    where: { id: offerId },
    select: { id: true, sellerId: true, status: true, price: true, productId: true, product: { select: { title: true } } },
  })
  if (!offer) throw new ReviewError('Offer not found', 404)
  if (offer.status !== 'PENDING_REVIEW' && offer.status !== 'REJECTED')
    throw new ReviewError('This offer is not in the review queue', 400)

  if (action === 'REJECT' && !note?.trim())
    throw new ReviewError('A rejection reason is required — it is shown to the seller', 400)

  const updated = await db.productOffer.update({
    where: { id: offerId },
    data: {
      status: action === 'APPROVE' ? 'ACTIVE' : 'REJECTED',
    },
  })

  await recordAudit({
    actorId: admin.id,
    actorType: 'ADMIN',
    action: 'OFFER_REVIEW_DECIDED',
    entityType: 'ProductOffer',
    entityId: offerId,
    summary: `Admin ${action === 'APPROVE' ? 'approved' : 'rejected'} offer on "${offer.product.title}"${action === 'REJECT' ? ` — ${note!.trim()}` : ''}`,
    metadata: { action, note: note?.trim() ?? null, productId: offer.productId, before: offer.status, after: updated.status },
  })

  await emitNotification({
    userId: offer.sellerId,
    type: 'OFFER_REVIEW_STATUS',
    title: action === 'APPROVE' ? 'Offer approved' : 'Offer rejected',
    body:
      action === 'APPROVE'
        ? `Your offer on "${offer.product.title}" passed review and is now live on the product page.`
        : `Your offer on "${offer.product.title}" was rejected: ${note!.trim()}`,
    linkView: 'seller',
    linkId: offer.productId,
  })

  return updated
}

// ── Financier services (same mechanism — owner Q6) ───────────────────────────

export async function decideFinancierServiceReview(
  admin: { id: string; name: string },
  serviceId: string,
  action: 'APPROVE' | 'REJECT',
  note?: string
) {
  const service = await db.financierService.findUnique({
    where: { id: serviceId },
    select: { id: true, name: true, status: true, financierProfileId: true },
  })
  if (!service) throw new ReviewError('Service not found', 404)
  if (service.status !== 'PENDING_REVIEW' && service.status !== 'REJECTED')
    throw new ReviewError('This service is not in the review queue', 400)

  if (action === 'REJECT' && !note?.trim())
    throw new ReviewError('A rejection reason is required — it is shown to the institution', 400)

  const updated = await db.financierService.update({
    where: { id: serviceId },
    data: {
      status: action === 'APPROVE' ? 'ACTIVE' : 'REJECTED',
      reviewNote: action === 'APPROVE' ? null : note!.trim(),
      reviewedAt: new Date(),
      reviewedById: admin.id,
    },
  })

  // Notify every OWNER of the institution (staff with the lender console)
  const owners = await db.organizationMember.findMany({
    where: { organization: { financierProfile: { id: service.financierProfileId } }, role: 'OWNER' },
    select: { userId: true },
  })

  await recordAudit({
    actorId: admin.id,
    actorType: 'ADMIN',
    action: 'SERVICE_REVIEW_DECIDED',
    entityType: 'FinancierService',
    entityId: serviceId,
    summary: `Admin ${action === 'APPROVE' ? 'approved' : 'rejected'} service "${service.name}"${action === 'REJECT' ? ` — ${note!.trim()}` : ''}`,
    metadata: { action, note: note?.trim() ?? null, before: service.status, after: updated.status },
  })

  for (const owner of owners) {
    await emitNotification({
      userId: owner.userId,
      type: 'SERVICE_REVIEW_STATUS',
      title: action === 'APPROVE' ? 'Service approved' : 'Service rejected',
      body:
        action === 'APPROVE'
          ? `"${service.name}" passed platform review and is now live on the funding hub.`
          : `"${service.name}" was rejected: ${note!.trim()}`,
      linkView: 'financier',
      linkId: serviceId,
    })
  }

  return updated
}

// ── The unified queue (admin console) ─────────────────────────────────────────

export async function listReviewQueue() {
  const [products, offers, services] = await Promise.all([
    db.product.findMany({
      where: { status: { in: ['PENDING_REVIEW', 'REJECTED'] } },
      select: {
        id: true, title: true, status: true, createdAt: true, reviewNote: true,
        price: true, images: true,
        category: { select: { name: true } },
        seller: { select: { id: true, name: true, storeName: true, kycLevel: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    }),
    db.productOffer.findMany({
      where: { status: { in: ['PENDING_REVIEW', 'REJECTED'] } },
      select: {
        id: true, price: true, status: true, createdAt: true,
        product: { select: { id: true, title: true, category: { select: { name: true } } } },
        seller: { select: { id: true, name: true, storeName: true, kycLevel: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    }),
    db.financierService.findMany({
      where: { status: { in: ['PENDING_REVIEW', 'REJECTED'] } },
      select: {
        id: true, name: true, serviceKind: true, category: true, status: true, createdAt: true, reviewNote: true,
        financierProfile: { select: { id: true, organization: { select: { name: true, status: true } } } },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    }),
  ])

  return {
    products: products.map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      price: p.price,
      createdAt: p.createdAt.toISOString(),
      reviewNote: p.reviewNote,
      category: p.category.name,
      // 9.1: curated records carry no seller — the queue labels them as the
      // platform catalog instead of a vendor.
      seller: p.seller
        ? { id: p.seller.id, name: p.seller.name, storeName: p.seller.storeName, kycLevel: p.seller.kycLevel }
        : { id: 'vendora-catalog', name: 'Vendora Catalog', storeName: 'Vendora Catalog', kycLevel: null },
      hasImage: (() => {
        try {
          const arr = JSON.parse(p.images || '[]')
          return Array.isArray(arr) && arr.length > 0
        } catch {
          return false
        }
      })(),
    })),
    offers: offers.map((o) => ({
      id: o.id,
      price: o.price,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      product: { id: o.product.id, title: o.product.title, category: o.product.category.name },
      seller: { id: o.seller.id, name: o.seller.name, storeName: o.seller.storeName, kycLevel: o.seller.kycLevel },
    })),
    services: services.map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.serviceKind,
      category: s.category,
      status: s.status,
      createdAt: s.createdAt.toISOString(),
      reviewNote: s.reviewNote,
      institution: s.financierProfile.organization?.name ?? 'Institution',
    })),
    counts: {
      products: products.filter((p) => p.status === 'PENDING_REVIEW').length,
      offers: offers.filter((o) => o.status === 'PENDING_REVIEW').length,
      services: services.filter((s) => s.status === 'PENDING_REVIEW').length,
    },
  }
}
