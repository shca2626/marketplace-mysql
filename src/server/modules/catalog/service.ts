import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { slugify } from '@/server/modules/products/service'
import { recordAudit } from '@/server/modules/audit/service'
import { userHasOrgPermission } from '@/server/authz/evaluator'

// ─────────────────────────────────────────────────────────────────────────────
// CATALOG SERVICE — shared catalog, company offers, stores & product proposals.
//
// Model (target product spec):
//   • ONE shared catalog. Companies offer existing (platform-approved)
//     products with their own price / stock / variants / lead time.
//   • A NEW product proposed by a company stays PRIVATE (approvalState
//     PENDING_APPROVAL, invisible publicly, un-purchasable) until platform
//     approval — after which ANY company may offer it.
//   • Stores belong to companies and never create private catalogs.
//     Multi-store is platform-togglable with a per-company maximum, enforced
//     transactionally on store creation.
// ─────────────────────────────────────────────────────────────────────────────

export class CatalogServiceError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

// ── Store settings (PlatformSetting: marketplace.stores) ────────────────────

export interface StoreSettings {
  multiStoreEnabled: boolean
  maxStoresPerCompany: number
}

const DEFAULT_STORE_SETTINGS: StoreSettings = { multiStoreEnabled: false, maxStoresPerCompany: 1 }

export async function getStoreSettings(): Promise<StoreSettings> {
  const row = await db.platformSetting.findUnique({ where: { key: 'marketplace.stores' } })
  if (!row) return { ...DEFAULT_STORE_SETTINGS }
  try {
    const parsed = JSON.parse(row.value) as Partial<StoreSettings>
    return {
      multiStoreEnabled: parsed.multiStoreEnabled ?? DEFAULT_STORE_SETTINGS.multiStoreEnabled,
      maxStoresPerCompany: Math.max(1, Math.min(20, parsed.maxStoresPerCompany ?? DEFAULT_STORE_SETTINGS.maxStoresPerCompany)),
    }
  } catch {
    return { ...DEFAULT_STORE_SETTINGS }
  }
}

export async function setStoreSettings(actorId: string, next: StoreSettings): Promise<StoreSettings> {
  const merged: StoreSettings = {
    multiStoreEnabled: !!next.multiStoreEnabled,
    maxStoresPerCompany: Math.max(1, Math.min(20, next.maxStoresPerCompany)),
  }
  await db.platformSetting.upsert({
    where: { key: 'marketplace.stores' },
    update: { value: JSON.stringify(merged) },
    create: { key: 'marketplace.stores', value: JSON.stringify(merged) },
  })
  await recordAudit({
    actorId,
    actorType: 'ADMIN',
    action: 'STORE_SETTINGS_UPDATED',
    entityType: 'PlatformSetting',
    entityId: 'marketplace.stores',
    summary: `Multi-store ${merged.multiStoreEnabled ? 'enabled' : 'disabled'}; max ${merged.maxStoresPerCompany} store(s) per company`,
    metadata: merged,
  })
  return merged
}

// ── Stores ──────────────────────────────────────────────────────────────────

export interface StoreDTO {
  id: string
  organizationId: string
  name: string
  slug: string
  description: string | null
  logoUrl: string | null
  city: string | null
  phone: string | null
  isActive: boolean
  isDefault: boolean
  isArchived: boolean
  createdAt: string
  offerCount?: number
}

function toStoreDTO(s: { id: string; organizationId: string; name: string; slug: string; description: string | null; logoUrl: string | null; city: string | null; phone: string | null; isActive: boolean; isDefault: boolean; isArchived: boolean; createdAt: Date }, offerCount?: number): StoreDTO {
  return {
    id: s.id,
    organizationId: s.organizationId,
    name: s.name,
    slug: s.slug,
    description: s.description,
    logoUrl: s.logoUrl,
    city: s.city,
    phone: s.phone,
    isActive: s.isActive,
    isDefault: s.isDefault,
    isArchived: s.isArchived,
    createdAt: s.createdAt.toISOString(),
    offerCount,
  }
}

export async function listOrgStores(actorUserId: string, organizationId: string): Promise<StoreDTO[]> {
  await requireOrgPerm(actorUserId, organizationId, 'org.selling.view')
  const stores = await db.store.findMany({
    where: { organizationId },
    include: { _count: { select: { offers: { where: { status: 'ACTIVE' } } } } },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  })
  return stores.map((s) => toStoreDTO(s, s._count.offers))
}

async function uniqueStoreSlug(name: string, organizationId: string): Promise<string> {
  const base = slugify(`${name}`) || 'store'
  let slug = base
  for (let i = 2; i < 60; i++) {
    const existing = await db.store.findUnique({ where: { slug } })
    if (!existing) return slug
    slug = `${base}-${i}`
  }
  return `${base}-${organizationId.slice(-6)}`
}

/**
 * Create a store for a company — the multi-store limit is enforced
 * TRANSACTIONALLY (count + create in one tx with a Serializable-safe guard).
 */
export async function createStore(
  actorUserId: string,
  organizationId: string,
  input: { name: string; description?: string | null; city?: string | null; phone?: string | null; logoUrl?: string | null }
): Promise<StoreDTO> {
  await requireOrgPerm(actorUserId, organizationId, 'org.stores.manage')
  const org = await db.organization.findUnique({ where: { id: organizationId } })
  if (!org) throw new CatalogServiceError('Organization not found', 404)
  if (org.orgType !== 'COMPANY') {
    throw new CatalogServiceError('Only companies can operate stores on the marketplace', 403)
  }
  const name = input.name.trim()
  if (name.length < 2 || name.length > 80) throw new CatalogServiceError('Store name must be 2–80 characters')

  const settings = await getStoreSettings()
  const store = await db.$transaction(async (tx) => {
    const count = await tx.store.count({ where: { organizationId, isArchived: false } })
    if (count >= 1 && !settings.multiStoreEnabled) {
      throw new CatalogServiceError('Multi-store is currently disabled by the platform — each company operates one store', 403)
    }
    if (count >= settings.maxStoresPerCompany) {
      throw new CatalogServiceError(
        `Store limit reached (${settings.maxStoresPerCompany} per company) — archive a store first or contact the platform`,
        409
      )
    }
    const created = await tx.store.create({
      data: {
        organizationId,
        name,
        slug: await uniqueStoreSlug(name, organizationId),
        description: input.description?.trim() || null,
        city: input.city?.trim() || null,
        phone: input.phone?.trim() || null,
        logoUrl: input.logoUrl?.trim() || null,
        isDefault: count === 0,
      },
    })
    return created
  })

  await recordAudit({
    actorId: actorUserId,
    actorType: 'USER',
    action: 'STORE_CREATED',
    entityType: 'Store',
    entityId: store.id,
    summary: `Store "${store.name}" created for ${org.name}`,
    metadata: { organizationId, storeId: store.id },
  })
  return toStoreDTO(store, 0)
}

export async function updateStore(
  actorUserId: string,
  organizationId: string,
  storeId: string,
  input: { name?: string; description?: string | null; city?: string | null; phone?: string | null; logoUrl?: string | null; isActive?: boolean }
): Promise<StoreDTO> {
  await requireOrgPerm(actorUserId, organizationId, 'org.stores.manage')
  const store = await db.store.findFirst({ where: { id: storeId, organizationId } })
  if (!store || store.isArchived) throw new CatalogServiceError('Store not found', 404)
  const updated = await db.store.update({
    where: { id: storeId },
    data: {
      name: input.name !== undefined ? input.name.trim() : undefined,
      description: input.description !== undefined ? input.description?.trim() || null : undefined,
      city: input.city !== undefined ? input.city?.trim() || null : undefined,
      phone: input.phone !== undefined ? input.phone?.trim() || null : undefined,
      logoUrl: input.logoUrl !== undefined ? input.logoUrl?.trim() || null : undefined,
      isActive: input.isActive !== undefined ? input.isActive : undefined,
    },
  })
  await recordAudit({
    actorId: actorUserId,
    actorType: 'USER',
    action: 'STORE_UPDATED',
    entityType: 'Store',
    entityId: storeId,
    summary: `Store "${updated.name}" updated`,
    metadata: { organizationId, changes: Object.keys(input) },
  })
  return toStoreDTO(updated)
}

export async function archiveStore(actorUserId: string, organizationId: string, storeId: string): Promise<void> {
  await requireOrgPerm(actorUserId, organizationId, 'org.stores.manage')
  const store = await db.store.findFirst({ where: { id: storeId, organizationId } })
  if (!store) throw new CatalogServiceError('Store not found', 404)
  const activeOthers = await db.store.count({ where: { organizationId, isArchived: false, id: { not: storeId } } })
  if (store.isDefault && activeOthers === 0) {
    throw new CatalogServiceError('Cannot archive the only store — a company keeps at least one store', 409)
  }
  await db.$transaction(async (tx) => {
    await tx.store.update({ where: { id: storeId }, data: { isArchived: true, isActive: false } })
    // Offers attributed to the archived store pause; attribution history preserved.
    await tx.productOffer.updateMany({ where: { storeId }, data: { status: 'PAUSED' } })
    if (store.isDefault) {
      const next = await tx.store.findFirst({ where: { organizationId, isArchived: false }, orderBy: { createdAt: 'asc' } })
      if (next) await tx.store.update({ where: { id: next.id }, data: { isDefault: true } })
    }
  })
  await recordAudit({
    actorId: actorUserId,
    actorType: 'USER',
    action: 'STORE_ARCHIVED',
    entityType: 'Store',
    entityId: storeId,
    summary: `Store "${store.name}" archived; its offers paused`,
    metadata: { organizationId },
  })
}

/** Lazily ensure the org's default store exists (first offer/first visit). */
export async function ensureDefaultStore(organizationId: string): Promise<{ id: string; name: string; slug: string }> {
  const existing = await db.store.findFirst({ where: { organizationId, isArchived: false, isDefault: true } })
  if (existing) return { id: existing.id, name: existing.name, slug: existing.slug }
  const any = await db.store.findFirst({ where: { organizationId, isArchived: false }, orderBy: { createdAt: 'asc' } })
  if (any) {
    await db.store.update({ where: { id: any.id }, data: { isDefault: true } })
    return { id: any.id, name: any.name, slug: any.slug }
  }
  const org = await db.organization.findUnique({ where: { id: organizationId } })
  if (!org) throw new CatalogServiceError('Organization not found', 404)
  const created = await db.store.create({
    data: {
      organizationId,
      name: `${org.name} Store`,
      slug: await uniqueStoreSlug(`${org.name} Store`, organizationId),
      isDefault: true,
    },
  })
  await recordAudit({
    actorId: null,
    actorType: 'SYSTEM',
    action: 'STORE_AUTO_CREATED',
    entityType: 'Store',
    entityId: created.id,
    summary: `Default store auto-created for ${org.name}`,
    metadata: { organizationId },
  })
  return { id: created.id, name: created.name, slug: created.slug }
}

// ── Offers ──────────────────────────────────────────────────────────────────

export interface OfferDTO {
  id: string
  productId: string
  productTitle: string
  productSlug: string | null
  productImages: string[]
  storeId: string | null
  storeName: string | null
  sellerOrgId: string | null
  sellerOrgName: string | null
  sellerOrgSlug: string | null
  price: number
  compareAtPrice: number | null
  stock: number
  moq: number | null
  sku: string | null
  freeShipping: boolean
  shippingFee: number | null
  processingDays: number | null
  leadTimeNote: string | null
  status: string
  soldCount: number
  updatedAt: string
  variants: { id: string; variantId: string; name: string; price: number | null; stock: number; sku: string | null; isActive: boolean }[]
}

const offerInclude = {
  product: { select: { id: true, title: true, slug: true, images: true } },
  store: { select: { id: true, name: true } },
  sellerOrg: { select: { id: true, name: true, slug: true } },
  variants: { where: { isActive: true }, orderBy: { createdAt: 'asc' as const } },
} as const

type OfferRaw = {
  id: string
  productId: string
  storeId: string | null
  sellerOrgId: string | null
  price: number
  compareAtPrice: number | null
  stock: number
  moq: number | null
  sku: string | null
  freeShipping: boolean
  shippingFee: number | null
  processingDays: number | null
  leadTimeNote: string | null
  status: string
  soldCount: number
  updatedAt: Date
  product: { id: string; title: string; slug: string | null; images: string }
  store: { id: string; name: string } | null
  sellerOrg: { id: string; name: string; slug: string } | null
  variants: { id: string; variantId: string; price: number | null; stock: number; sku: string | null; isActive: boolean; variant?: { name: string } }[]
}

export function toOfferDTO(o: OfferRaw): OfferDTO {
  let images: string[] = []
  try {
    const parsed = JSON.parse(o.product.images || '[]')
    if (Array.isArray(parsed)) images = parsed.filter((x) => typeof x === 'string')
  } catch {
    images = []
  }
  return {
    id: o.id,
    productId: o.productId,
    productTitle: o.product.title,
    productSlug: o.product.slug,
    productImages: images,
    storeId: o.storeId,
    storeName: o.store?.name ?? null,
    sellerOrgId: o.sellerOrgId,
    sellerOrgName: o.sellerOrg?.name ?? null,
    sellerOrgSlug: o.sellerOrg?.slug ?? null,
    price: o.price,
    compareAtPrice: o.compareAtPrice,
    stock: o.stock,
    moq: o.moq,
    sku: o.sku,
    freeShipping: o.freeShipping,
    shippingFee: o.shippingFee,
    processingDays: o.processingDays,
    leadTimeNote: o.leadTimeNote,
    status: o.status,
    soldCount: o.soldCount,
    updatedAt: o.updatedAt.toISOString(),
    variants: o.variants.map((v) => ({
      id: v.id,
      variantId: v.variantId,
      name: v.variant?.name ?? '',
      price: v.price,
      stock: v.stock,
      sku: v.sku,
      isActive: v.isActive,
    })),
  }
}

export async function listOrgOffers(
  actorUserId: string,
  organizationId: string,
  filter: { status?: string } = {}
): Promise<OfferDTO[]> {
  await requireOrgPerm(actorUserId, organizationId, 'org.selling.view')
  const offers = await db.productOffer.findMany({
    where: { sellerOrgId: organizationId, ...(filter.status ? { status: filter.status } : {}) },
    include: {
      ...offerInclude,
      variants: { where: { isActive: true }, orderBy: { createdAt: 'asc' }, include: { variant: { select: { name: true } } } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 500,
  })
  return offers.map((o) =>
    toOfferDTO({
      ...o,
      variants: o.variants.map((v) => ({ ...v, variant: { name: v.variant.name } })),
    })
  )
}

/** Public: every ACTIVE offer for one shared-catalog product. */
export async function listProductOffers(productId: string): Promise<OfferDTO[]> {
  const offers = await db.productOffer.findMany({
    where: {
      productId,
      status: 'ACTIVE',
      product: { approvalState: 'APPROVED', status: 'ACTIVE' },
      OR: [{ sellerOrgId: null }, { sellerOrg: { status: 'ACTIVE' } }],
    },
    include: {
      ...offerInclude,
      variants: { where: { isActive: true }, orderBy: { createdAt: 'asc' }, include: { variant: { select: { name: true } } } },
    },
    orderBy: [{ price: 'asc' }, { soldCount: 'desc' }],
    take: 50,
  })
  return offers.map((o) =>
    toOfferDTO({
      ...o,
      variants: o.variants.map((v) => ({ ...v, variant: { name: v.variant.name } })),
    })
  )
}

export async function createOffer(
  actorUserId: string,
  organizationId: string,
  input: {
    productId: string
    storeId?: string | null
    price: number
    compareAtPrice?: number | null
    stock?: number
    moq?: number | null
    sku?: string | null
    freeShipping?: boolean
    shippingFee?: number | null
    processingDays?: number | null
    leadTimeNote?: string | null
    status?: string
    variants?: { variantId: string; price?: number | null; stock?: number; sku?: string | null }[]
  }
): Promise<OfferDTO> {
  await requireOrgPerm(actorUserId, organizationId, 'org.offers.manage')
  const org = await db.organization.findUnique({ where: { id: organizationId } })
  if (!org) throw new CatalogServiceError('Organization not found', 404)
  if (org.orgType !== 'COMPANY') {
    throw new CatalogServiceError('Only companies can offer products on the shared catalog', 403)
  }
  const product = await db.product.findUnique({ where: { id: input.productId } })
  if (!product) throw new CatalogServiceError('Product not found', 404)
  // Offers may reference APPROVED products, or the org's OWN pending proposal
  // (preparable while approval is in flight — it only sells after approval).
  const isOwnProposal = product.organizationId === organizationId
  if (product.approvalState !== 'APPROVED' && !isOwnProposal) {
    throw new CatalogServiceError('This product is not available for offers yet', 403)
  }
  if (product.approvalState === 'REJECTED') {
    throw new CatalogServiceError('This product proposal was rejected', 403)
  }
  if (input.price <= 0 || input.price > 10_000_000) throw new CatalogServiceError('Price must be positive')

  // store attribution: default store when not supplied; must belong to the org
  let storeId = input.storeId ?? null
  if (storeId) {
    const store = await db.store.findFirst({ where: { id: storeId, organizationId, isArchived: false } })
    if (!store) throw new CatalogServiceError('Store not found in this organization', 404)
  } else {
    storeId = (await ensureDefaultStore(organizationId)).id
  }

  const existing = await db.productOffer.findFirst({ where: { productId: input.productId, sellerOrgId: organizationId } })
  if (existing) {
    throw new CatalogServiceError('Your company already offers this product — edit the existing offer', 409)
  }

  const offer = await db.$transaction(async (tx) => {
    const created = await tx.productOffer.create({
      data: {
        productId: input.productId,
        sellerId: actorUserId,
        sellerOrgId: organizationId,
        storeId,
        price: input.price,
        compareAtPrice: input.compareAtPrice ?? null,
        stock: input.stock ?? 0,
        moq: input.moq ?? null,
        sku: input.sku ?? null,
        freeShipping: input.freeShipping ?? false,
        shippingFee: input.shippingFee ?? null,
        processingDays: input.processingDays ?? null,
        leadTimeNote: input.leadTimeNote ?? null,
        status: input.status === 'DRAFT' ? 'DRAFT' : 'ACTIVE',
        variants: input.variants?.length
          ? {
              create: input.variants.map((v) => ({
                variantId: v.variantId,
                price: v.price ?? null,
                stock: v.stock ?? 0,
                sku: v.sku ?? null,
              })),
            }
          : undefined,
      },
      include: { product: true, store: true, sellerOrg: true, variants: true },
    })
    return created
  })

  await recordAudit({
    actorId: actorUserId,
    actorType: 'USER',
    action: 'OFFER_CREATED',
    entityType: 'ProductOffer',
    entityId: offer.id,
    summary: `${org.name} offers "${product.title}" at ${input.price}`,
    metadata: { organizationId, productId: input.productId, price: input.price, storeId },
  })

  return toOfferDTO({
    ...offer,
    variants: offer.variants.map((v) => ({ ...v, variant: { name: '' } })),
  })
}

export async function updateOffer(
  actorUserId: string,
  organizationId: string,
  offerId: string,
  input: {
    price?: number
    compareAtPrice?: number | null
    stock?: number
    moq?: number | null
    sku?: string | null
    freeShipping?: boolean
    shippingFee?: number | null
    processingDays?: number | null
    leadTimeNote?: string | null
    status?: string
    storeId?: string | null
  }
): Promise<OfferDTO> {
  await requireOrgPerm(actorUserId, organizationId, 'org.offers.manage')
  const offer = await db.productOffer.findFirst({ where: { id: offerId, sellerOrgId: organizationId } })
  if (!offer) throw new CatalogServiceError('Offer not found', 404)
  if (input.storeId) {
    const store = await db.store.findFirst({ where: { id: input.storeId, organizationId, isArchived: false } })
    if (!store) throw new CatalogServiceError('Store not found in this organization', 404)
  }
  if (input.price !== undefined && (input.price <= 0 || input.price > 10_000_000)) {
    throw new CatalogServiceError('Price must be positive')
  }
  if (input.status && !['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'].includes(input.status)) {
    throw new CatalogServiceError('Invalid offer status')
  }
  const updated = await db.productOffer.update({
    where: { id: offerId },
    data: {
      price: input.price,
      compareAtPrice: input.compareAtPrice,
      stock: input.stock,
      moq: input.moq,
      sku: input.sku,
      freeShipping: input.freeShipping,
      shippingFee: input.shippingFee,
      processingDays: input.processingDays,
      leadTimeNote: input.leadTimeNote,
      status: input.status,
      storeId: input.storeId,
      updatedAt: new Date(),
    },
    include: { product: true, store: true, sellerOrg: true, variants: true },
  })
  await recordAudit({
    actorId: actorUserId,
    actorType: 'USER',
    action: 'OFFER_UPDATED',
    entityType: 'ProductOffer',
    entityId: offerId,
    summary: `Offer on "${updated.product.title}" updated (${input.status ?? 'fields'})`,
    metadata: { organizationId, changes: Object.keys(input) },
  })
  return toOfferDTO({ ...updated, variants: updated.variants.map((v) => ({ ...v, variant: { name: '' } })) })
}

// ── Product proposals (new products by companies) ────────────────────────────

export interface ProposalDTO {
  id: string
  title: string
  description: string
  price: number
  images: string[]
  categoryId: string
  categoryName?: string | null
  approvalState: string
  reviewNote: string | null
  createdAt: string
  offerCount: number
}

export async function proposeProduct(
  actorUserId: string,
  organizationId: string,
  input: {
    title: string
    description: string
    price: number
    images: string[]
    categoryId: string
    sku?: string | null
    moq?: number | null
    specs?: { label: string; value: string }[]
    highlights?: string[]
    initialOffer?: { price?: number; stock?: number; leadTimeDays?: number | null }
  }
): Promise<ProposalDTO> {
  await requireOrgPerm(actorUserId, organizationId, 'org.proposals.manage')
  const org = await db.organization.findUnique({ where: { id: organizationId } })
  if (!org) throw new CatalogServiceError('Organization not found', 404)
  if (org.orgType !== 'COMPANY') {
    throw new CatalogServiceError('Only companies can propose new catalog products', 403)
  }
  const title = input.title.trim()
  if (title.length < 3 || title.length > 200) throw new CatalogServiceError('Title must be 3–200 characters')
  if (input.price < 0 || input.price > 10_000_000) throw new CatalogServiceError('Price out of range')
  const category = await db.category.findUnique({ where: { id: input.categoryId } })
  if (!category) throw new CatalogServiceError('Category not found', 404)

  const product = await db.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        title,
        description: input.description,
        price: input.price,
        images: JSON.stringify(input.images.slice(0, 12)),
        categoryId: input.categoryId,
        sellerId: actorUserId,
        stock: 0,
        organizationId,
        approvalState: 'PENDING_APPROVAL',
        status: 'DRAFT',
        slug: await ensureUniqueProposalSlug(tx, title),
        sku: input.sku ?? null,
        moq: input.moq ?? null,
        specs: input.specs?.length ? JSON.stringify(input.specs) : null,
        highlights: input.highlights?.length ? JSON.stringify(input.highlights) : null,
      },
    })
    // The proposing company prepares its own offer immediately — it activates
    // when the platform approves the product.
    if (input.initialOffer) {
      const store = await ensureDefaultStore(organizationId)
      await tx.productOffer.create({
        data: {
          productId: created.id,
          sellerId: actorUserId,
          sellerOrgId: organizationId,
          storeId: store.id,
          price: input.initialOffer.price ?? input.price,
          stock: input.initialOffer.stock ?? 0,
          processingDays: input.initialOffer.leadTimeDays ?? null,
          status: 'DRAFT',
        },
      })
    }
    return created
  })

  await recordAudit({
    actorId: actorUserId,
    actorType: 'USER',
    action: 'PRODUCT_PROPOSED',
    entityType: 'Product',
    entityId: product.id,
    summary: `${org.name} proposed new product "${title}" — awaiting platform approval`,
    metadata: { organizationId, categoryId: input.categoryId },
  })

  return {
    id: product.id,
    title: product.title,
    description: product.description,
    price: product.price,
    images: JSON.parse(product.images || '[]'),
    categoryId: product.categoryId,
    categoryName: category.name,
    approvalState: product.approvalState,
    reviewNote: null,
    createdAt: product.createdAt.toISOString(),
    offerCount: input.initialOffer ? 1 : 0,
  }
}

async function ensureUniqueProposalSlug(tx: { product: { findUnique({ where }: { where: { slug: string } }): Promise<unknown> } }, title: string): Promise<string> {
  const base = slugify(title) || 'product'
  let slug = base
  for (let i = 2; i < 100; i++) {
    if (!(await tx.product.findUnique({ where: { slug } }))) return slug
    slug = `${base}-${i}`
  }
  return `${base}-${Date.now().toString(36)}`
}

/** Company view: my proposals (any state) with their offer counts. */
export async function listOrgProposals(actorUserId: string, organizationId: string): Promise<ProposalDTO[]> {
  await requireOrgPerm(actorUserId, organizationId, 'org.proposals.manage')
  const products = await db.product.findMany({
    where: { organizationId },
    include: { category: true, _count: { select: { offers: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return products.map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    price: p.price,
    images: JSON.parse(p.images || '[]'),
    categoryId: p.categoryId,
    categoryName: p.category.name,
    approvalState: p.approvalState,
    reviewNote: p.reviewNote,
    createdAt: p.createdAt.toISOString(),
    offerCount: p._count.offers,
  }))
}

// ── Platform approval ───────────────────────────────────────────────────────

export async function adminReviewProduct(
  actorUserId: string,
  productId: string,
  input: { approve: boolean; note?: string | null }
): Promise<{ approvalState: string }> {
  const product = await db.product.findUnique({ where: { id: productId } })
  if (!product) throw new CatalogServiceError('Product not found', 404)
  if (product.approvalState !== 'PENDING_APPROVAL') {
    throw new CatalogServiceError(`Only pending proposals can be reviewed (current: ${product.approvalState})`, 409)
  }
  const approvalState = input.approve ? 'APPROVED' : 'REJECTED'
  const updated = await db.$transaction(async (tx) => {
    const p = await tx.product.update({
      where: { id: productId },
      data: {
        approvalState,
        reviewNote: input.note?.trim() || null,
        reviewedAt: new Date(),
        reviewedById: actorUserId,
        // Approved proposals enter the shared marketplace; rejected stay private.
        status: input.approve ? 'ACTIVE' : 'DRAFT',
      },
    })
    // On approval, activate the proposing org's prepared DRAFT offer.
    if (input.approve) {
      await tx.productOffer.updateMany({ where: { productId, status: 'DRAFT' }, data: { status: 'ACTIVE' } })
    }
    return p
  })
  await recordAudit({
    actorId: actorUserId,
    actorType: 'ADMIN',
    action: input.approve ? 'PRODUCT_APPROVED' : 'PRODUCT_REJECTED',
    entityType: 'Product',
    entityId: productId,
    summary: `"${product.title}" ${input.approve ? 'approved into the shared catalog' : 'rejected as a catalog proposal'}`,
    metadata: { note: input.note ?? null, organizationId: product.organizationId },
  })
  return { approvalState: updated.approvalState }
}

/** Admin queue: pending product proposals. */
export async function listPendingProposals(): Promise<ProposalDTO[]> {
  const products = await db.product.findMany({
    where: { approvalState: 'PENDING_APPROVAL' },
    include: { category: true, organization: { select: { name: true } }, _count: { select: { offers: true } } },
    orderBy: { createdAt: 'asc' },
    take: 200,
  })
  return products.map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    price: p.price,
    images: JSON.parse(p.images || '[]'),
    categoryId: p.categoryId,
    categoryName: p.category ? p.category.name + ' · ' + (p.organization?.name ?? 'Unknown org') : p.organization?.name ?? 'Unknown org',
    approvalState: p.approvalState,
    reviewNote: p.reviewNote,
    createdAt: p.createdAt.toISOString(),
    offerCount: p._count.offers,
  }))
}

// ── helpers ─────────────────────────────────────────────────────────────────

async function requireOrgPerm(userId: string, organizationId: string, permission: string): Promise<void> {
  const ok = await userHasOrgPermission(userId, organizationId, permission)
  if (!ok) {
    await recordAudit({
      actorId: userId,
      actorType: 'USER',
      action: 'AUTHZ_DENIED',
      entityType: 'Organization',
      entityId: organizationId,
      summary: `Denied ${permission}`,
      metadata: { permission, organizationId },
    })
    throw new CatalogServiceError(`This action requires the "${permission}" permission in this organization`, 403)
  }
}

/** Admin guard used by the approval routes (platform permission). */
export async function requireAdminPermission(permission: string): Promise<{ id: string } | null> {
  const user = await getSessionUser()
  if (!user) return null
  if (user.role === 'ADMIN') return { id: user.id }
  const count = await db.userRole.count({
    where: { userId: user.id, organizationId: '', role: { permissions: { some: { permissionKey: permission } } } },
  })
  return count > 0 ? { id: user.id } : null
}
