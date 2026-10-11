import { z } from 'zod'
import { db } from '@/lib/db'
import { productInclude, serializeProduct } from '@/lib/serialize'
import { recordAudit } from '@/server/modules/audit/service'
import { emitNotification } from '@/server/modules/notifications/service'
import { ensureUniqueSlug, slugify, productFormSchema, type ProductTx } from '@/server/modules/products/service'
import { CatalogError, createBrand } from '@/server/modules/catalog/service'

/**
 * PHASE 9.2 + 9.3 — the admin product console backend ("moderation with teeth").
 *
 * 9.2: full-field admin creation of CURATED platform catalog records —
 *      sellerId: null + curatedById provenance (the Phase 9.1 ownership model:
 *      a curated record is never directly purchasable; vendors attach ACTIVE
 *      ProductOffers to it).
 *
 * 9.3: full-field admin edit of ANY product (seller-owned included) with a
 *      MANDATORY reason, a field-level before/after diff in the AuditLog, and
 *      a seller notification; archive/restore with reason; guarded hard delete
 *      (offers / order history / reviews / favorites / quote lines block it);
 *      bulk archive / restore / feature with one audit entry per action.
 */

export class AdminProductError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

// ── Zod: the admin form schema (productFormSchema + admin-only fields) ───────

export const adminProductSchema = productFormSchema.extend({
  // Admins may move a listing to ARCHIVED directly (moderation semantics);
  // creation still only accepts ACTIVE | DRAFT (checked in the service).
  status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']).optional(),
  brandId: z.string().trim().min(1).max(64).nullable().optional(),
  brandName: z.string().trim().min(2).max(80).nullable().optional(),
  featured: z.boolean().optional(),
  popularRank: z.number().int().min(1).max(999).nullable().optional(),
})

export type AdminProductInput = z.infer<typeof adminProductSchema>

/** Every admin mutation that touches a seller's listing carries a reason. */
export const reasonSchema = z
  .string()
  .trim()
  .min(10, 'A reason of at least 10 characters is required (it is audit-logged and shown to the seller)')
  .max(1000)

export type AdminReason = z.infer<typeof reasonSchema>

// ── Brand resolution (admin convenience: pick or create by name) ─────────────

async function resolveBrandId(input: { brandId?: string | null; brandName?: string | null }): Promise<string | null> {
  if (input.brandId) {
    const brand = await db.brand.findUnique({ where: { id: input.brandId }, select: { id: true } })
    if (!brand) throw new AdminProductError('Brand not found', 400)
    return brand.id
  }
  if (input.brandName?.trim()) {
    const name = input.brandName.trim()
    const existing = await db.brand.findFirst({ where: { name }, select: { id: true } })
    if (existing) return existing.id
    const created = await createBrand({ name })
    return created.id
  }
  return null
}

// ── Shared field writers ─────────────────────────────────────────────────────

/** Normalized "after" projection shared by create + edit (mirrors PUT /api/products). */
function productWriteData(d: AdminProductInput, opts: { slug: string | null; brandId: string | null }) {
  const variants = d.variants ?? []
  const stock = variants.length ? variants.reduce((s, v) => s + v.stock, 0) : d.stock
  return {
    title: d.title.trim(),
    description: d.description.trim(),
    price: d.price,
    compareAtPrice: d.compareAtPrice ?? null,
    images: JSON.stringify(d.images),
    categoryId: d.categoryId,
    stock,
    sku: d.sku?.trim() || null,
    barcode: d.barcode?.trim() || null,
    videoUrl: d.videoUrl?.trim() || null,
    highlights: d.highlights?.length ? JSON.stringify(d.highlights) : null,
    specs: d.specs?.length ? JSON.stringify(d.specs) : null,
    materials: d.materials?.trim() || null,
    care: d.care?.trim() || null,
    weightGrams: d.weightGrams ?? null,
    lengthCm: d.lengthCm ?? null,
    widthCm: d.widthCm ?? null,
    heightCm: d.heightCm ?? null,
    processingDays: d.processingDays ?? null,
    freeShipping: d.freeShipping ?? false,
    shippingFee: d.freeShipping ? null : (d.shippingFee ?? null),
    shippingPolicy: d.shippingPolicy?.trim() || null,
    slug: opts.slug,
    metaTitle: d.metaTitle?.trim() || null,
    metaDescription: d.metaDescription?.trim() || null,
    moq: d.moq ?? null,
    priceTiers: d.priceTiers?.length ? JSON.stringify(d.priceTiers) : null,
    gtin: d.gtin?.trim() || null,
    mpn: d.mpn?.trim() || null,
    brandId: opts.brandId,
  }
}

/** Replace-all variant write (same strategy as PUT /api/products — the form grid is the truth). */
async function replaceVariants(tx: ProductTx, productId: string, variants: NonNullable<AdminProductInput['variants']>) {
  await tx.productVariant.deleteMany({ where: { productId } })
  if (variants.length > 0) {
    await tx.productVariant.createMany({
      data: variants.map((v, i) => ({
        productId,
        name: v.name,
        options: JSON.stringify(v.options ?? {}),
        price: v.price ?? null,
        compareAtPrice: v.compareAtPrice ?? null,
        stock: v.stock,
        sku: v.sku?.trim() || null,
        position: i,
        isActive: v.isActive ?? true,
      })),
    })
  }
}

// ── 9.2 — admin creation of a CURATED platform record ───────────────────────

export async function createAdminCuratedProduct(adminId: string, input: AdminProductInput) {
  if (input.status === 'ARCHIVED') {
    throw new AdminProductError('A new listing cannot start archived — publish it as ACTIVE or save it as a DRAFT')
  }
  const status = input.status ?? 'ACTIVE'
  if (status === 'ACTIVE' && input.images.length === 0) {
    throw new AdminProductError('Add at least one image before publishing (or save as draft)')
  }

  const category = await db.category.findUnique({ where: { id: input.categoryId }, select: { id: true } })
  if (!category) throw new AdminProductError('Category not found', 400)

  const brandId = await resolveBrandId(input)
  const slug = await ensureUniqueSlug(input.slug?.trim() || slugify(input.title))

  const created = await db.$transaction(async (tx) => {
    const row = await tx.product.create({
      data: {
        ...productWriteData(input, { slug, brandId }),
        // 9.1 ownership model: null seller = platform-curated catalog record,
        // purchasable ONLY via a real vendor's ACTIVE ProductOffer.
        sellerId: null,
        curatedById: adminId,
        isCurated: true,
        status,
        featured: input.featured ?? false,
        popularRank: input.popularRank ?? null,
        // platform-authored records are pre-approved
        reviewedAt: new Date(),
        reviewedById: adminId,
      },
    })
    await replaceVariants(tx, row.id, input.variants ?? [])
    return tx.product.findUnique({ where: { id: row.id }, include: productInclude })
  })

  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'PRODUCT_CATALOG_CREATED',
    entityType: 'Product',
    entityId: created!.id,
    summary: `Admin created curated catalog record "${created!.title}"`,
    metadata: {
      sellerId: null,
      curatedById: adminId,
      status,
      brandId,
      gtin: input.gtin ?? null,
      mpn: input.mpn ?? null,
      variants: input.variants?.length ?? 0,
      images: input.images.length,
    },
  })

  return created!
}

// ── 9.3 — full-field admin edit of ANY product (reason + diff + notify) ─────

type DiffField = { field: string; before: unknown; after: unknown }

function parseJsonColumn(raw: string | null | undefined): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function summarizeVariants(variants: { name: string; stock: number; sku: string | null }[]): string {
  if (variants.length === 0) return 'none'
  return variants.map((v) => `${v.name}×${v.stock}`).join(', ').slice(0, 400)
}

/**
 * Field-level before/after diff for the audit trail. `before` is the DB row
 * (with JSON columns parsed); `after` is the normalized write projection.
 * categoryId/brandId are resolved to names so the diff viewer is readable.
 */
export function diffProductRows(
  before: Record<string, unknown> & { variants?: { name: string; stock: number; sku: string | null }[] },
  after: Record<string, unknown>,
  names: { beforeCategory?: string; afterCategory?: string; beforeBrand?: string | null; afterBrand?: string | null }
): DiffField[] {
  const scalarFields = [
    'title', 'description', 'price', 'compareAtPrice', 'images', 'stock', 'sku', 'barcode', 'videoUrl',
    'highlights', 'specs', 'materials', 'care', 'weightGrams', 'lengthCm', 'widthCm', 'heightCm',
    'processingDays', 'freeShipping', 'shippingFee', 'shippingPolicy', 'slug', 'metaTitle',
    'metaDescription', 'moq', 'priceTiers', 'gtin', 'mpn', 'featured', 'popularRank', 'status',
  ]
  const norm = (v: unknown): string | null => {
    if (v === undefined || v === null) return null
    if (Array.isArray(v)) return JSON.stringify(v)
    if (typeof v === 'object') return JSON.stringify(v)
    return String(v)
  }
  const out: DiffField[] = []
  for (const f of scalarFields) {
    const b = norm(before[f])
    const a = norm(after[f])
    if (b !== a) out.push({ field: f, before: before[f] ?? null, after: after[f] ?? null })
  }
  // relational ids → readable names
  if ((before.categoryId as string | null | undefined) !== (after.categoryId as string | null | undefined)) {
    out.push({
      field: 'category',
      before: names.beforeCategory ?? (before.categoryId as string | null),
      after: names.afterCategory ?? (after.categoryId as string | null),
    })
  }
  if ((before.brandId as string | null | undefined) !== (after.brandId as string | null | undefined)) {
    out.push({
      field: 'brand',
      before: names.beforeBrand ?? (before.brandId as string | null),
      after: names.afterBrand ?? (after.brandId as string | null),
    })
  }
  // variants summarized (full grid replace)
  const bVar = summarizeVariants(before.variants ?? [])
  const aVar = summarizeVariants((after.variants as { name: string; stock: number; sku: string | null }[] | undefined) ?? [])
  if (bVar !== aVar) out.push({ field: 'variants', before: bVar, after: aVar })
  return out
}

/** Load a product row with parsed JSON columns + names for diffing. */
async function loadProductForDiff(id: string) {
  const row = await db.product.findUnique({
    where: { id },
    include: { variants: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] }, category: { select: { name: true } }, brand: { select: { name: true } } },
  })
  if (!row) return null
  return {
    raw: row,
    fields: {
      ...row,
      images: parseJsonColumn(row.images),
      highlights: parseJsonColumn(row.highlights),
      specs: parseJsonColumn(row.specs),
      priceTiers: parseJsonColumn(row.priceTiers),
      variants: row.variants.map((v) => ({ name: v.name, stock: v.stock, sku: v.sku })),
      categoryName: row.category?.name ?? null,
      brandName: row.brand?.name ?? null,
    },
  }
}

export async function updateAdminProduct(adminId: string, productId: string, input: AdminProductInput, reason: AdminReason) {
  const existing = await db.product.findUnique({ where: { id: productId } })
  if (!existing) throw new AdminProductError('Product not found', 404)

  const category = await db.category.findUnique({ where: { id: input.categoryId }, select: { id: true, name: true } })
  if (!category) throw new AdminProductError('Category not found', 400)

  const status = input.status ?? existing.status
  if (status === 'ACTIVE' && input.images.length === 0) {
    throw new AdminProductError('Add at least one image before publishing (or save as draft)')
  }

  const brandId = await resolveBrandId(input)
  const slug = input.slug?.trim()
    ? await ensureUniqueSlug(input.slug, productId)
    : (existing.slug ?? (await ensureUniqueSlug(input.title, productId)))

  const write = {
    ...productWriteData(input, { slug, brandId }),
    status,
    featured: input.featured ?? existing.featured,
    popularRank: input.popularRank ?? null,
  }

  const before = await loadProductForDiff(productId)

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.product.update({ where: { id: productId }, data: write })
    await replaceVariants(tx, productId, input.variants ?? [])
    return tx.product.findUnique({ where: { id: row.id }, include: productInclude })
  })

  // Field-level diff for the audit trail (before row vs the write projection)
  const changed = before
    ? diffProductRows(
        before.fields as unknown as Record<string, unknown>,
        { ...write, images: input.images, variants: input.variants ?? [] } as Record<string, unknown>,
        {
          beforeCategory: before.fields.categoryName,
          afterCategory: category.name,
          beforeBrand: before.fields.brandName,
          afterBrand: brandId ? (await db.brand.findUnique({ where: { id: brandId }, select: { name: true } }))?.name ?? brandId : null,
        }
      )
    : []

  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'PRODUCT_ADMIN_EDITED',
    entityType: 'Product',
    entityId: productId,
    summary: `Admin edited "${updated!.title}" (${changed.length} field${changed.length === 1 ? '' : 's'} changed) — ${reason}`,
    metadata: {
      reason,
      changed,
      changedCount: changed.length,
      sellerId: existing.sellerId,
      changedFields: changed.map((c) => c.field),
    },
  })

  // 9.3: the seller is told when the platform edits their listing
  if (existing.sellerId) {
    await emitNotification({
      userId: existing.sellerId,
      type: 'PRODUCT_ADMIN_EDIT',
      title: 'Platform edited your listing',
      body:
        changed.length > 0
          ? `"${existing.title}" was updated by the platform (${changed.map((c) => c.field).join(', ')}). Reason: ${reason}`
          : `"${existing.title}" was re-saved by the platform. Reason: ${reason}`,
      linkView: 'seller',
      linkId: productId,
    })
  }

  return updated!
}

// ── 9.3 — archive / restore ─────────────────────────────────────────────────

export async function adminArchiveOrRestoreProduct(
  adminId: string,
  productId: string,
  action: 'archive' | 'restore',
  reason: AdminReason
) {
  const product = await db.product.findUnique({ where: { id: productId }, select: { id: true, title: true, status: true, sellerId: true } })
  if (!product) throw new AdminProductError('Product not found', 404)

  if (action === 'archive' && product.status === 'ARCHIVED') {
    throw new AdminProductError('This listing is already archived')
  }
  if (action === 'restore' && product.status !== 'ARCHIVED') {
    throw new AdminProductError('Only archived listings can be restored')
  }

  const updated = await db.product.update({
    where: { id: productId },
    data: {
      status: action === 'archive' ? 'ARCHIVED' : 'ACTIVE',
      ...(action === 'archive' ? { featured: false } : {}),
    },
  })

  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'PRODUCT_MODERATED',
    entityType: 'Product',
    entityId: productId,
    summary: `Admin ${action === 'archive' ? 'archived' : 'restored'} "${product.title}" — ${reason}`,
    metadata: { action, reason, before: { status: product.status }, after: { status: updated.status }, sellerId: product.sellerId },
  })

  if (product.sellerId) {
    await emitNotification({
      userId: product.sellerId,
      type: 'PRODUCT_ADMIN_EDIT',
      title: action === 'archive' ? 'Listing archived by the platform' : 'Listing restored by the platform',
      body:
        action === 'archive'
          ? `"${product.title}" was hidden from the storefront by the platform. Reason: ${reason}`
          : `"${product.title}" was restored to the public catalog by the platform. Reason: ${reason}`,
      linkView: 'seller',
      linkId: productId,
    })
  }

  return updated
}

// ── 9.3 — guarded hard delete ───────────────────────────────────────────────
//
// "Moderation with teeth" cuts BOTH ways: destroying commerce history is the
// one action that can never be undone, so it is refused whenever the product
// is woven into the platform:
//   • vendor ProductOffers (cascade would silently delete other sellers' work)
//   • order items (purchase history — financial integrity, Law from Phase 7)
//   • quote lines (required FK — DB would refuse anyway)
//   • reviews / favorites (community + buyer signals)
// Archive preserves everything; delete is only for truly unreferenced rows.

export async function adminDeleteProduct(adminId: string, productId: string, reason: AdminReason) {
  const product = await db.product.findUnique({ where: { id: productId }, select: { id: true, title: true, sellerId: true, isCurated: true } })
  if (!product) throw new AdminProductError('Product not found', 404)

  const [offers, orderItems, reviews, favorites, quoteLines] = await Promise.all([
    db.productOffer.count({ where: { productId } }),
    db.orderItem.count({ where: { productId } }),
    db.review.count({ where: { productId } }),
    db.favorite.count({ where: { productId } }),
    db.quoteLine.count({ where: { productId } }),
  ])

  if (offers > 0) {
    throw new AdminProductError(
      `Delete refused — "${product.title}" has ${offers} vendor offer${offers === 1 ? '' : 's'} attached. Hard-deleting it would destroy other sellers' listings. Archive it instead.`,
      409
    )
  }
  if (orderItems > 0) {
    throw new AdminProductError(
      `Delete refused — "${product.title}" appears on ${orderItems} order item${orderItems === 1 ? '' : 's'}. Order history must be preserved. Archive it instead.`,
      409
    )
  }
  if (reviews > 0 || favorites > 0) {
    throw new AdminProductError(
      `Delete refused — "${product.title}" has ${reviews} review${reviews === 1 ? '' : 's'} and ${favorites} favorite${favorites === 1 ? '' : 's'} from buyers. Archive it instead.`,
      409
    )
  }
  if (quoteLines > 0) {
    throw new AdminProductError(
      `Delete refused — "${product.title}" is referenced by ${quoteLines} quote line${quoteLines === 1 ? '' : 's'}. Archive it instead.`,
      409
    )
  }

  // Variants / certifications / price-list entries cascade with the row;
  // RFQ lines keep their snapshot title (productId set null by the FK).
  await db.product.delete({ where: { id: productId } })

  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'PRODUCT_TAKEDOWN',
    entityType: 'Product',
    entityId: productId,
    summary: `Admin hard-deleted "${product.title}" — ${reason}`,
    metadata: { reason, hard: true, sellerId: product.sellerId, wasCurated: product.isCurated, title: product.title },
  })

  if (product.sellerId) {
    await emitNotification({
      userId: product.sellerId,
      type: 'PRODUCT_ADMIN_EDIT',
      title: 'Listing permanently removed by the platform',
      body: `"${product.title}" was permanently deleted. Reason: ${reason}`,
      linkView: 'seller',
      linkId: null,
    })
  }

  return { ok: true }
}

// ── 9.3 — bulk actions (one audit entry per action) ─────────────────────────

export type BulkProductAction = 'archive' | 'restore' | 'feature' | 'unfeature'

export async function adminBulkProducts(adminId: string, ids: string[], action: BulkProductAction, reason: AdminReason) {
  const capped = [...new Set(ids)].slice(0, 100)
  if (capped.length === 0) throw new AdminProductError('Select at least one listing')

  const affected = await db.product.updateMany({
    where: { id: { in: capped }, ...(action === 'restore' ? { status: 'ARCHIVED' } : {}) },
    data: {
      ...(action === 'archive' ? { status: 'ARCHIVED', featured: false } : {}),
      ...(action === 'restore' ? { status: 'ACTIVE' } : {}),
      ...(action === 'feature' ? { featured: true } : {}),
      ...(action === 'unfeature' ? { featured: false } : {}),
    },
  })

  if (affected.count === 0) {
    throw new AdminProductError('Nothing matched this bulk action (archived listings only respond to restore)')
  }

  // ONE audit entry for the whole action (9.3 requirement)
  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'PRODUCT_BULK_MODERATED',
    entityType: 'Product',
    entityId: capped[0],
    summary: `Admin bulk-${action} ${affected.count} listing${affected.count === 1 ? '' : 's'} — ${reason}`,
    metadata: { action, reason, ids: capped, affected: affected.count },
  })

  // Sellers are notified (deduped) for actions that change visibility
  if (action === 'archive' || action === 'restore') {
    const rows = await db.product.findMany({
      where: { id: { in: capped }, sellerId: { not: null } },
      select: { sellerId: true, title: true },
    })
    const bySeller = new Map<string, string[]>()
    for (const r of rows) {
      const list = bySeller.get(r.sellerId!) ?? []
      list.push(r.title)
      bySeller.set(r.sellerId!, list)
    }
    for (const [sellerId, titles] of bySeller) {
      await emitNotification({
        userId: sellerId,
        type: 'PRODUCT_ADMIN_EDIT',
        title: action === 'archive' ? 'Listing(s) archived by the platform' : 'Listing(s) restored by the platform',
        body: `${titles.slice(0, 3).map((t) => `"${t}"`).join(', ')}${titles.length > 3 ? ` +${titles.length - 3} more` : ''}. Reason: ${reason}`,
        linkView: 'seller',
        linkId: null,
      })
    }
  }

  return { affected: affected.count, ids: capped }
}

// ── 9.3 — product-scoped audit history (diff viewer data source) ────────────

const parseMetadata = (s: string | null): unknown => {
  if (!s) return null
  try {
    return JSON.parse(s)
  } catch {
    return s
  }
}

export async function listProductAuditTrail(productId: string, limit = 30) {
  const rows = await db.auditLog.findMany({
    where: { entityType: 'Product', entityId: productId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(100, Math.max(1, limit)),
  })
  return rows.map((l) => ({
    id: l.id,
    actorId: l.actorId,
    actorType: l.actorType,
    action: l.action,
    summary: l.summary,
    metadata: parseMetadata(l.metadata),
    createdAt: l.createdAt.toISOString(),
  }))
}

// re-export for the API layer's convenience (single import surface)
export { serializeProduct, CatalogError }
