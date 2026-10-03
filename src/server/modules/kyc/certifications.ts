import { db } from '@/lib/db'
import { recordAudit } from '@/server/modules/audit/service'
import { emitNotification } from '@/server/modules/notifications/service'

/**
 * KYP — KNOW YOUR PRODUCT (Phase 3). Certification/compliance artifacts
 * attached to a listing (datasheet, warranty, origin, test report, generic
 * certificate, other). Sellers create them (PENDING), the platform verifies
 * once (VERIFIED/REJECTED) and the storefront shows the "Verified specs" badge
 * for products with ≥1 VERIFIED row — mirroring the vault's verify-once
 * philosophy (DP-27).
 */

export const CERTIFICATION_KINDS = ['DATASHEET', 'WARRANTY', 'ORIGIN', 'TEST_REPORT', 'CERTIFICATE', 'OTHER'] as const
export type CertificationKind = (typeof CERTIFICATION_KINDS)[number]

export const CERTIFICATION_KIND_LABELS: Record<string, string> = {
  DATASHEET: 'Datasheet',
  WARRANTY: 'Warranty',
  ORIGIN: 'Certificate of origin',
  TEST_REPORT: 'Test report',
  CERTIFICATE: 'Certificate',
  OTHER: 'Other',
}

export interface ProductCertificationDTO {
  id: string
  productId: string
  productTitle?: string
  sellerId?: string
  sellerName?: string | null
  kind: string
  title: string
  mediaId: string | null
  url: string | null
  issuedBy: string | null
  issuedAt: string | null
  expiresAt: string | null
  status: string
  verifiedById: string | null
  verifiedAt: string | null
  note: string | null
  isActive: boolean
  createdAt: string
}

export class CertificationError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

type CertRaw = {
  id: string
  productId: string
  kind: string
  title: string
  mediaId: string | null
  url: string | null
  issuedBy: string | null
  issuedAt: Date | null
  expiresAt: Date | null
  status: string
  verifiedById: string | null
  verifiedAt: Date | null
  note: string | null
  isActive: boolean
  createdAt: Date
  product?: { title: string; sellerId: string; seller: { name: string } | null }
}

const iso = (d: Date | null) => (d ? d.toISOString() : null)

export function serializeCertification(c: CertRaw): ProductCertificationDTO {
  return {
    id: c.id,
    productId: c.productId,
    productTitle: c.product?.title,
    sellerId: c.product?.sellerId,
    sellerName: c.product?.seller?.name ?? null,
    kind: c.kind,
    title: c.title,
    mediaId: c.mediaId,
    url: c.url,
    issuedBy: c.issuedBy,
    issuedAt: iso(c.issuedAt),
    expiresAt: iso(c.expiresAt),
    status: c.status,
    verifiedById: c.verifiedById,
    verifiedAt: iso(c.verifiedAt),
    note: c.note,
    isActive: c.isActive,
    createdAt: c.createdAt.toISOString(),
  }
}

const certInclude = {
  product: { select: { title: true, sellerId: true, seller: { select: { name: true } } } },
} as const

// ── Seller side ─────────────────────────────────────────────────────────────

export async function listProductCertifications(productId: string): Promise<ProductCertificationDTO[]> {
  const rows = await db.productCertification.findMany({
    where: { productId, isActive: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  return rows.map((r) => serializeCertification(r as CertRaw))
}

export interface CreateCertificationInput {
  kind: string
  title: string
  url?: string | null
  issuedBy?: string | null
  issuedAt?: string | null
  expiresAt?: string | null
}

function parseCertDate(raw: string | undefined | null, label: string): Date | null {
  if (!raw) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim())
  if (!m) throw new CertificationError(`${label} must be a valid date (YYYY-MM-DD)`)
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) throw new CertificationError(`${label} is not a valid calendar date`)
  return d
}

export async function createProductCertification(
  sellerId: string,
  productId: string,
  input: CreateCertificationInput
): Promise<ProductCertificationDTO> {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { id: true, sellerId: true, title: true, status: true },
  })
  if (!product) throw new CertificationError('Product not found', 404)
  if (product.sellerId !== sellerId) throw new CertificationError('You can only manage certifications on your own products', 403)

  if (!CERTIFICATION_KINDS.includes(input.kind as CertificationKind)) {
    throw new CertificationError('Kind must be one of: datasheet, warranty, origin, test report, certificate, other')
  }
  const title = input.title.trim()
  if (title.length < 3 || title.length > 120) {
    throw new CertificationError('Title must be 3–120 characters')
  }
  const url = input.url?.trim() || null
  if (url && !/^https?:\/\//.test(url)) {
    throw new CertificationError('Link must be a valid http(s) URL')
  }

  const issuedAt = parseCertDate(input.issuedAt, 'Issued date')
  const expiresAt = parseCertDate(input.expiresAt, 'Expiry date')
  if (issuedAt && expiresAt && expiresAt < issuedAt) {
    throw new CertificationError('Expiry date cannot be before the issued date')
  }

  const count = await db.productCertification.count({ where: { productId, isActive: true } })
  if (count >= 20) throw new CertificationError('A product can carry up to 20 certifications')

  const created = await db.productCertification.create({
    data: {
      productId,
      kind: input.kind,
      title,
      url,
      issuedBy: input.issuedBy?.trim() || null,
      issuedAt,
      expiresAt,
      status: 'PENDING',
    },
  })
  await recordAudit({
    actorId: sellerId,
    actorType: 'USER',
    action: 'CERTIFICATION_ADDED',
    entityType: 'ProductCertification',
    entityId: created.id,
    summary: `${CERTIFICATION_KIND_LABELS[input.kind] ?? input.kind} "${title}" attached to "${product.title}"`,
    metadata: { productId, kind: input.kind },
  })
  return serializeCertification(created as CertRaw)
}

export async function updateProductCertification(
  sellerId: string,
  certificationId: string,
  input: Partial<CreateCertificationInput> & { isActive?: boolean }
): Promise<ProductCertificationDTO> {
  const cert = await db.productCertification.findUnique({
    where: { id: certificationId },
    include: certInclude,
  })
  if (!cert || !cert.isActive) throw new CertificationError('Certification not found', 404)
  if (cert.product.sellerId !== sellerId) {
    throw new CertificationError('You can only manage certifications on your own products', 403)
  }

  const data: Record<string, unknown> = {}
  if (input.title !== undefined) {
    const title = input.title.trim()
    if (title.length < 3 || title.length > 120) throw new CertificationError('Title must be 3–120 characters')
    data.title = title
  }
  if (input.url !== undefined) {
    const url = input.url?.trim() || null
    if (url && !/^https?:\/\//.test(url)) throw new CertificationError('Link must be a valid http(s) URL')
    data.url = url
  }
  if (input.issuedBy !== undefined) data.issuedBy = input.issuedBy?.trim() || null
  if (input.issuedAt !== undefined) data.issuedAt = parseCertDate(input.issuedAt, 'Issued date')
  if (input.expiresAt !== undefined) data.expiresAt = parseCertDate(input.expiresAt, 'Expiry date')
  if (input.isActive !== undefined) {
    // Re-editing a decided row reopens platform review (a changed artifact
    // must be re-verified — same rule as the vault).
    if (input.isActive === false) {
      data.isActive = false
    } else if (cert.status !== 'PENDING') {
      data.status = 'PENDING'
      data.verifiedById = null
      data.verifiedAt = null
      data.note = null
    }
  }

  const updated = await db.productCertification.update({
    where: { id: certificationId },
    data,
    include: certInclude,
  })
  return serializeCertification(updated as CertRaw)
}

// ── Admin side ──────────────────────────────────────────────────────────────

export async function adminListCertifications(filter?: {
  status?: string
  take?: number
}): Promise<ProductCertificationDTO[]> {
  const rows = await db.productCertification.findMany({
    where: {
      isActive: true,
      ...(filter?.status ? { status: filter.status } : {}),
    },
    include: certInclude,
    orderBy: { createdAt: 'desc' },
    take: Math.min(filter?.take ?? 200, 300),
  })
  return rows.map((r) => serializeCertification(r as CertRaw))
}

export async function adminVerifyCertification(
  adminId: string,
  certificationId: string,
  approve: boolean,
  note?: string
): Promise<ProductCertificationDTO> {
  const cert = await db.productCertification.findUnique({
    where: { id: certificationId },
    include: certInclude,
  })
  if (!cert || !cert.isActive) throw new CertificationError('Certification not found', 404)
  if (cert.status !== 'PENDING') {
    throw new CertificationError(`Certification is already ${cert.status.toLowerCase()} — verify once, reuse everywhere`, 409)
  }

  const updated = await db.productCertification.update({
    where: { id: certificationId },
    data: {
      status: approve ? 'VERIFIED' : 'REJECTED',
      verifiedById: adminId,
      verifiedAt: new Date(),
      note: note?.trim() || null,
    },
    include: certInclude,
  })
  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: approve ? 'CERTIFICATION_VERIFIED' : 'CERTIFICATION_REJECTED',
    entityType: 'ProductCertification',
    entityId: certificationId,
    summary: `${CERTIFICATION_KIND_LABELS[cert.kind] ?? cert.kind} "${cert.title}" on "${cert.product.title}" ${approve ? 'verified' : 'rejected'}`,
    metadata: { note: note ?? null, productId: cert.productId },
  })
  // Notify the seller — the bell + (mirrored) WhatsApp channel.
  await emitNotification({
    userId: cert.product.sellerId,
    type: 'CERTIFICATION_STATUS',
    title: approve ? 'Certification verified' : 'Certification rejected',
    body: approve
      ? `Your ${CERTIFICATION_KIND_LABELS[cert.kind] ?? cert.kind.toLowerCase()} "${cert.title}" on "${cert.product.title}" passed platform review — buyers now see the Verified specs badge.`
      : `Your ${CERTIFICATION_KIND_LABELS[cert.kind] ?? cert.kind.toLowerCase()} "${cert.title}" on "${cert.product.title}" was rejected${note ? `: ${note.trim()}` : '.'}`,
    linkView: 'seller',
    linkId: cert.productId,
  })
  return serializeCertification(updated as CertRaw)
}

/** Does this product carry at least one VERIFIED certification? (badge flag) */
export async function productHasVerifiedCertification(productId: string): Promise<boolean> {
  const row = await db.productCertification.findFirst({
    where: { productId, isActive: true, status: 'VERIFIED' },
    select: { id: true },
  })
  return !!row
}
