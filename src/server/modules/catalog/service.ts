import { randomBytes } from 'crypto'
import { db } from '@/lib/db'
import { slugify, ensureUniqueSlug, productFormSchema, type ProductTx } from '@/server/modules/products/service'
import { recordAudit } from '@/server/modules/audit/service'

/**
 * PHASE 4 — the platform catalog console backend (owner Q1, Q7, Q8):
 * brands, units of measure, category CRUD (with re-assignment), org-type
 * metadata, admin product creation (curated listings owned by the Vendora
 * Catalog system account), clone, CSV bulk import, popular-product curation
 * and duplicate governance (similarity scan + merge).
 */

export class CatalogError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

// ── The Vendora Catalog system account ──────────────────────────────────────
// Curated/admin-created listings need a seller of record. A dedicated system
// account (random unusable password, never surfaces in registration) keeps
// Product.sellerId non-null so every existing display/payout/order flow keeps
// working. Public storefront name: "Vendora Official".

const CATALOG_ACCOUNT_EMAIL = 'catalog@vendora.com'

export async function ensureCatalogAccount(): Promise<{ id: string }> {
  const existing = await db.user.findUnique({ where: { email: CATALOG_ACCOUNT_EMAIL }, select: { id: true } })
  if (existing) return existing
  const created = await db.user.create({
    data: {
      email: CATALOG_ACCOUNT_EMAIL,
      password: randomBytes(24).toString('hex'), // 48-char random — login impossible
      name: 'Vendora Catalog',
      storeName: 'Vendora Official',
      role: 'SELLER',
      status: 'ACTIVE',
      kycLevel: 3, // system account — exempt from identity gates
      phoneVerifiedAt: new Date(),
    },
    select: { id: true },
  })
  return created
}

// ── Brands ────────────────────────────────────────────────────────────────────

export async function listBrands(q = '') {
  const where = q
    ? { OR: [{ name: { contains: q } }, { slug: { contains: q } }, { originCountry: { contains: q } }] }
    : {}
  return db.brand.findMany({
    where,
    include: { _count: { select: { products: true } } },
    orderBy: [{ isVerified: 'desc' }, { name: 'asc' }],
    take: 200,
  })
}

export async function createBrand(input: { name: string; logoUrl?: string | null; description?: string | null; websiteUrl?: string | null; originCountry?: string | null; isVerified?: boolean }) {
  const name = input.name.trim()
  if (name.length < 2 || name.length > 80) throw new CatalogError('Brand name must be 2–80 characters')
  const slug = slugify(name)
  if (!slug) throw new CatalogError('Brand name must contain letters or digits')
  const clash = await db.brand.findFirst({ where: { OR: [{ name }, { slug }] }, select: { id: true, name: true } })
  if (clash) throw new CatalogError(`A brand named "${clash.name}" already exists`, 409)
  return db.brand.create({
    data: {
      name,
      slug,
      logoUrl: input.logoUrl?.trim() || null,
      description: input.description?.trim() || null,
      websiteUrl: input.websiteUrl?.trim() || null,
      originCountry: input.originCountry?.trim() || null,
      isVerified: input.isVerified ?? false,
    },
  })
}

export async function updateBrand(id: string, patch: { name?: string; logoUrl?: string | null; description?: string | null; websiteUrl?: string | null; originCountry?: string | null; isVerified?: boolean }) {
  const brand = await db.brand.findUnique({ where: { id }, select: { id: true, name: true, slug: true } })
  if (!brand) throw new CatalogError('Brand not found', 404)
  const data: Record<string, unknown> = {}
  if (patch.name !== undefined && patch.name.trim() !== brand.name) {
    const name = patch.name.trim()
    const slug = slugify(name)
    const clash = await db.brand.findFirst({ where: { OR: [{ name }, { slug }], id: { not: id } }, select: { id: true } })
    if (clash) throw new CatalogError('Another brand with that name/slug exists', 409)
    data.name = name
    data.slug = slug
  }
  if (patch.logoUrl !== undefined) data.logoUrl = patch.logoUrl?.trim() || null
  if (patch.description !== undefined) data.description = patch.description?.trim() || null
  if (patch.websiteUrl !== undefined) data.websiteUrl = patch.websiteUrl?.trim() || null
  if (patch.originCountry !== undefined) data.originCountry = patch.originCountry?.trim() || null
  if (patch.isVerified !== undefined) data.isVerified = patch.isVerified
  return db.brand.update({ where: { id }, data })
}

export async function deleteBrand(id: string) {
  const inUse = await db.product.count({ where: { brandId: id } })
  if (inUse > 0) throw new CatalogError(`This brand is used by ${inUse} listing(s) — detach them first`, 409)
  await db.brand.delete({ where: { id } })
}

// ── Units of measure ──────────────────────────────────────────────────────────

export async function listUnits() {
  return db.unitOfMeasure.findMany({ orderBy: [{ dimension: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }] })
}

export async function createUnit(input: { code: string; label: string; dimension: string }) {
  const code = input.code.trim().toLowerCase()
  if (!/^[a-z0-9%/°.]{1,10}$/.test(code)) throw new CatalogError('Unit code must be 1–10 chars (letters, digits, %, /)')
  const label = input.label.trim()
  if (label.length < 1 || label.length > 40) throw new CatalogError('Unit label must be 1–40 characters')
  const dims = ['POWER', 'VOLTAGE', 'CURRENT', 'WEIGHT', 'LENGTH', 'AREA', 'VOLUME', 'COUNT', 'TIME', 'OTHER']
  if (!dims.includes(input.dimension)) throw new CatalogError('Invalid dimension')
  const clash = await db.unitOfMeasure.findUnique({ where: { code }, select: { id: true } })
  if (clash) throw new CatalogError(`Unit "${code}" already exists`, 409)
  return db.unitOfMeasure.create({ data: { code, label, dimension: input.dimension } })
}

export async function updateUnit(id: string, patch: { label?: string; dimension?: string; isActive?: boolean; sortOrder?: number }) {
  const unit = await db.unitOfMeasure.findUnique({ where: { id }, select: { id: true } })
  if (!unit) throw new CatalogError('Unit not found', 404)
  const data: Record<string, unknown> = {}
  if (patch.label !== undefined) data.label = patch.label.trim()
  if (patch.dimension !== undefined) data.dimension = patch.dimension
  if (patch.isActive !== undefined) data.isActive = patch.isActive
  if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder
  return db.unitOfMeasure.update({ where: { id }, data })
}

export async function deleteUnit(id: string) {
  const unit = await db.unitOfMeasure.findUnique({ where: { id }, select: { code: true } })
  if (!unit) throw new CatalogError('Unit not found', 404)
  // SpecAttribute.unit stores the free-text label; soft-delete keeps history coherent
  await db.unitOfMeasure.update({ where: { id }, data: { isActive: false } })
}

// ── Categories (admin CRUD — re-assignment aware) ────────────────────────────

export async function createCategory(input: { name: string; icon?: string | null; description?: string | null; sortOrder?: number }) {
  const name = input.name.trim()
  if (name.length < 2 || name.length > 60) throw new CatalogError('Category name must be 2–60 characters')
  const slug = slugify(name)
  const clash = await db.category.findFirst({ where: { OR: [{ name }, { slug }] }, select: { id: true, name: true } })
  if (clash) throw new CatalogError(`Category "${clash.name}" already exists`, 409)
  return db.category.create({
    data: { name, slug, icon: input.icon?.trim() || null, description: input.description?.trim() || null, sortOrder: input.sortOrder ?? 0 },
  })
}

export async function updateCategory(id: string, patch: { name?: string; icon?: string | null; description?: string | null; sortOrder?: number }) {
  const category = await db.category.findUnique({ where: { id }, select: { id: true, name: true, slug: true } })
  if (!category) throw new CatalogError('Category not found', 404)
  const data: Record<string, unknown> = {}
  if (patch.name !== undefined && patch.name.trim() !== category.name) {
    const name = patch.name.trim()
    const slug = slugify(name)
    const clash = await db.category.findFirst({ where: { OR: [{ name }, { slug }], id: { not: id } }, select: { id: true } })
    if (clash) throw new CatalogError('Another category with that name/slug exists', 409)
    data.name = name
    data.slug = slug
  }
  if (patch.icon !== undefined) data.icon = patch.icon?.trim() || null
  if (patch.description !== undefined) data.description = patch.description?.trim() || null
  if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder
  return db.category.update({ where: { id }, data })
}

export async function deleteCategory(id: string, reassignTo?: string | null) {
  const category = await db.category.findUnique({ where: { id }, select: { id: true, name: true } })
  if (!category) throw new CatalogError('Category not found', 404)
  const productCount = await db.product.count({ where: { categoryId: id } })
  const specCount = await db.specAttribute.count({ where: { categoryId: id } })

  if (productCount > 0 && !reassignTo)
    throw new CatalogError(`Category "${category.name}" still has ${productCount} listing(s) — pick a category to move them to, or empty it first`, 409)
  if (reassignTo) {
    const target = await db.category.findUnique({ where: { id: reassignTo }, select: { id: true } })
    if (!target) throw new CatalogError('Re-assignment target category not found', 404)
    if (reassignTo === id) throw new CatalogError('Cannot re-assign a category to itself')
    await db.product.updateMany({ where: { categoryId: id }, data: { categoryId: reassignTo } })
    if (specCount > 0) await db.specAttribute.deleteMany({ where: { categoryId: id } }) // dictionary is per-category; target keeps its own
  }
  if (productCount === 0 && specCount > 0) await db.specAttribute.deleteMany({ where: { categoryId: id } })
  await db.category.delete({ where: { id } })
  return { deleted: true, movedProducts: reassignTo ? productCount : 0 }
}

// ── Organization types (metadata dictionary over the enum) ────────────────────

const SEED_ORG_TYPES = [
  { key: 'COMPANY', name: 'Company / Merchant', icon: 'Building2', sortOrder: 1, description: 'Registered businesses trading on the marketplace — Exclusive Agents, Authorized Agents, Distributors, Wholesalers and Retailers.' },
  { key: 'BANK', name: 'Bank', icon: 'Landmark', sortOrder: 2, description: 'Licensed commercial banks providing financing programs to Vendora members.' },
  { key: 'MFI', name: 'Microfinance Institution', icon: 'HandCoins', sortOrder: 3, description: 'Licensed microfinance institutions serving micro and small businesses.' },
  { key: 'EWALLET', name: 'E-Wallet Provider', icon: 'Wallet', sortOrder: 4, description: 'Digital wallet providers enabling payments and financing disbursement.' },
]

export async function listOrgTypes() {
  const existing = await db.organizationType.findMany({ orderBy: { sortOrder: 'asc' } })
  if (existing.length === 0) {
    await db.organizationType.createMany({ data: SEED_ORG_TYPES })
    return db.organizationType.findMany({ orderBy: { sortOrder: 'asc' } })
  }
  return existing
}

export async function updateOrgType(id: string, patch: { name?: string; description?: string | null; icon?: string | null; isActive?: boolean; sortOrder?: number }) {
  const row = await db.organizationType.findUnique({ where: { id }, select: { id: true } })
  if (!row) throw new CatalogError('Organization type not found', 404)
  const data: Record<string, unknown> = {}
  if (patch.name !== undefined) data.name = patch.name.trim()
  if (patch.description !== undefined) data.description = patch.description?.trim() || null
  if (patch.icon !== undefined) data.icon = patch.icon?.trim() || null
  if (patch.isActive !== undefined) data.isActive = patch.isActive
  if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder
  return db.organizationType.update({ where: { id }, data })
}

// ── Curated product creation / clone / import / popular ─────────────────────

export interface CuratedProductInput {
  title: string
  description: string
  price: number
  compareAtPrice?: number | null
  images: string[]
  categoryId: string
  stock?: number
  status?: 'ACTIVE' | 'DRAFT'
  brandId?: string | null
  brandName?: string | null // convenience — resolved/created by name
  gtin?: string | null
  mpn?: string | null
  moq?: number | null
  sku?: string | null
  popularRank?: number | null
}

async function resolveBrandId(input: { brandId?: string | null; brandName?: string | null }): Promise<string | null> {
  if (input.brandId) {
    const brand = await db.brand.findUnique({ where: { id: input.brandId }, select: { id: true } })
    if (!brand) throw new CatalogError('Brand not found', 400)
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

/** Admin product creation — a CURATED listing owned by the Vendora Catalog system account. */
export async function createCuratedProduct(adminId: string, input: CuratedProductInput) {
  const account = await ensureCatalogAccount()
  const brandId = await resolveBrandId(input)

  const parsed = productFormSchema.safeParse({
    title: input.title,
    description: input.description,
    price: input.price,
    compareAtPrice: input.compareAtPrice ?? null,
    images: input.images,
    categoryId: input.categoryId,
    stock: input.stock ?? 0,
    status: input.status ?? 'ACTIVE',
    moq: input.moq ?? null,
    sku: input.sku ?? null,
  })
  if (!parsed.success) throw new CatalogError(parsed.error.issues[0]?.message ?? 'Invalid product input')

  const d = parsed.data
  if (d.status === 'ACTIVE' && d.images.length === 0)
    throw new CatalogError('Add at least one image before publishing (or save as draft)')

  const slug = await ensureUniqueSlug(slugify(d.title))
  const created = await db.product.create({
    data: {
      title: d.title.trim(),
      description: d.description.trim(),
      price: d.price,
      compareAtPrice: d.compareAtPrice ?? null,
      images: JSON.stringify(d.images),
      categoryId: d.categoryId,
      sellerId: account.id,
      stock: d.stock,
      status: d.status,
      sku: d.sku?.trim() || null,
      moq: d.moq ?? null,
      slug,
      brandId,
      gtin: input.gtin?.trim() || null,
      mpn: input.mpn?.trim() || null,
      isCurated: true,
      popularRank: input.popularRank ?? null,
      reviewedAt: new Date(),
      reviewedById: adminId,
    },
  })

  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'PRODUCT_CATALOG_CREATED',
    entityType: 'Product',
    entityId: created.id,
    summary: `Admin created curated listing "${created.title}"`,
    metadata: { brandId, gtin: input.gtin ?? null, mpn: input.mpn ?? null },
  })

  return created
}

/** Clone any listing into a curated DRAFT (platform standardization tool). */
export async function cloneProductAsCurated(adminId: string, productId: string) {
  const source = await db.product.findUnique({
    where: { id: productId },
    include: { variants: true, certifications: true },
  })
  if (!source) throw new CatalogError('Product not found', 404)
  const account = await ensureCatalogAccount()
  const title = `${source.title} (Copy)`.slice(0, 120)
  const slug = await ensureUniqueSlug(slugify(title))

  const created = await db.product.create({
    data: {
      title,
      description: source.description,
      price: source.price,
      compareAtPrice: source.compareAtPrice,
      images: source.images,
      categoryId: source.categoryId,
      sellerId: account.id,
      stock: source.stock,
      status: 'DRAFT',
      sku: source.sku,
      barcode: source.barcode,
      videoUrl: source.videoUrl,
      highlights: source.highlights,
      specs: source.specs,
      materials: source.materials,
      care: source.care,
      weightGrams: source.weightGrams,
      lengthCm: source.lengthCm,
      widthCm: source.widthCm,
      heightCm: source.heightCm,
      processingDays: source.processingDays,
      freeShipping: source.freeShipping,
      shippingFee: source.shippingFee,
      shippingPolicy: source.shippingPolicy,
      slug,
      moq: source.moq,
      priceTiers: source.priceTiers,
      brandId: source.brandId,
      gtin: source.gtin,
      mpn: source.mpn,
      isCurated: true,
      reviewedAt: new Date(),
      reviewedById: adminId,
      variants: {
        create: source.variants.map((v, i) => ({
          name: v.name,
          options: v.options,
          price: v.price,
          compareAtPrice: v.compareAtPrice,
          stock: v.stock,
          sku: v.sku,
          position: i,
          isActive: v.isActive,
        })),
      },
    },
  })

  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'PRODUCT_CLONED',
    entityType: 'Product',
    entityId: created.id,
    summary: `Admin cloned "${source.title}" into curated draft ${created.id}`,
    metadata: { sourceId: source.id },
  })

  return created
}

/** CSV bulk import of curated listings. Columns: title,category,brand,price,stock,moq,sku,gtin,mpn,description,imageUrl */
export async function importCatalogCsv(adminId: string, csv: string) {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length < 2) throw new CatalogError('CSV needs a header row and at least one data row')

  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase())
  const required = ['title', 'category', 'price']
  for (const col of required) {
    if (!header.includes(col)) throw new CatalogError(`CSV is missing the required "${col}" column`)
  }

  const categories = await db.category.findMany({ select: { id: true, name: true, slug: true } })
  const catByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]))
  const catBySlug = new Map(categories.map((c) => [c.slug.toLowerCase(), c]))

  const results: { row: number; status: 'created' | 'failed'; id?: string; error?: string }[] = []

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i])
    const row: Record<string, string> = {}
    header.forEach((h, idx) => (row[h] = (cells[idx] ?? '').trim()))
    try {
      const category = catByName.get(row.category.toLowerCase()) ?? catBySlug.get(row.category.toLowerCase())
      if (!category) throw new Error(`Unknown category "${row.category}"`)
      const price = Number(row.price)
      if (!Number.isFinite(price) || price <= 0) throw new Error('Price must be a positive number')
      const images = row.imageurl ? [row.imageurl] : []
      const created = await createCuratedProduct(adminId, {
        title: row.title,
        description: row.description || `${row.title} — platform catalog listing.`,
        price,
        images,
        categoryId: category.id,
        stock: row.stock ? Math.max(0, parseInt(row.stock) || 0) : 0,
        moq: row.moq ? Math.max(1, parseInt(row.moq) || 1) : null,
        sku: row.sku || null,
        brandName: row.brand || null,
        gtin: row.gtin || null,
        mpn: row.mpn || null,
        status: images.length > 0 ? 'ACTIVE' : 'DRAFT',
      })
      results.push({ row: i + 1, status: 'created', id: created.id })
    } catch (err) {
      results.push({ row: i + 1, status: 'failed', error: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'CATALOG_CSV_IMPORT',
    entityType: 'Product',
    summary: `Admin imported ${results.filter((r) => r.status === 'created').length} curated listing(s), ${results.filter((r) => r.status === 'failed').length} failed`,
    metadata: { total: results.length, created: results.filter((r) => r.status === 'created').length },
  })

  return results
}

/** Minimal CSV line parser — double-quoted cells with "" escapes, comma-separated. */
function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else inQuotes = false
      } else cur += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ',') {
      cells.push(cur)
      cur = ''
    } else cur += ch
  }
  cells.push(cur)
  return cells
}

/** Popular-product curation — ordered homepage rail. */
export async function setPopularRank(adminId: string, productId: string, rank: number | null) {
  const product = await db.product.findUnique({ where: { id: productId }, select: { id: true, title: true } })
  if (!product) throw new CatalogError('Product not found', 404)
  if (rank !== null && (!Number.isInteger(rank) || rank < 1 || rank > 999)) throw new CatalogError('Rank must be 1–999 or empty')
  await db.product.update({ where: { id: productId }, data: { popularRank: rank } })
  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'PRODUCT_POPULARITY_SET',
    entityType: 'Product',
    entityId: productId,
    summary: `Admin set popular rank of "${product.title}" to ${rank ?? 'unranked'}`,
  })
}

export async function listPopular() {
  return db.product.findMany({
    where: { popularRank: { not: null }, status: 'ACTIVE' },
    select: { id: true, title: true, price: true, popularRank: true, featured: true, images: true, category: { select: { name: true } }, seller: { select: { storeName: true } } },
    orderBy: { popularRank: 'asc' },
    take: 50,
  })
}

// ── Duplicate governance (similarity scan + merge) ───────────────────────────

function tokenize(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2) // drop short noise tokens
  )
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return inter / (a.size + b.size - inter)
}

export interface DuplicatePair {
  a: { id: string; title: string; seller: string; gtin: string | null; mpn: string | null; brand: string | null }
  b: { id: string; title: string; seller: string; gtin: string | null; mpn: string | null; brand: string | null }
  category: string
  score: number
  reason: 'GTIN' | 'MPN' | 'TITLE'
}

/** Scan live + draft listings for probable duplicates (strong GTIN/MPN + weak title similarity). */
export async function findDuplicates(): Promise<{ strong: DuplicatePair[]; candidates: DuplicatePair[] }> {
  const rows = await db.product.findMany({
    where: { status: { in: ['ACTIVE', 'DRAFT', 'PENDING_REVIEW'] } },
    select: {
      id: true, title: true, gtin: true, mpn: true, categoryId: true,
      brand: { select: { name: true } },
      category: { select: { name: true } },
      seller: { select: { storeName: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  const strong: DuplicatePair[] = []
  const candidates: DuplicatePair[] = []
  const seen = new Set<string>()

  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i]
      const b = rows[j]
      const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`
      if (seen.has(key)) continue
      const aTokens = tokenize(a.title)
      const bTokens = tokenize(b.title)

      let reason: DuplicatePair['reason'] | null = null
      let score = 0

      if (a.gtin && b.gtin && a.gtin === b.gtin) {
        reason = 'GTIN'
        score = 1
      } else if (a.mpn && b.mpn && a.mpn === b.mpn && a.categoryId === b.categoryId) {
        reason = 'MPN'
        score = 0.95
      } else if (a.categoryId === b.categoryId) {
        const sim = jaccard(aTokens, bTokens)
        if (sim >= 0.75) {
          reason = 'TITLE'
          score = sim
        }
      }

      if (!reason) continue
      seen.add(key)
      const pair: DuplicatePair = {
        a: dupInfo(a),
        b: dupInfo(b),
        category: a.category.name,
        score: Math.round(score * 100) / 100,
        reason,
      }
      if (reason === 'TITLE') candidates.push(pair)
      else strong.push(pair)
    }
  }

  return { strong, candidates: candidates.slice(0, 40) }
}

function dupInfo(p: { id: string; title: string; gtin: string | null; mpn: string | null; brand: { name: string } | null; seller: { storeName: string | null; name: string } }) {
  return {
    id: p.id,
    title: p.title,
    seller: p.seller.storeName ?? p.seller.name,
    gtin: p.gtin,
    mpn: p.mpn,
    brand: p.brand?.name ?? null,
  }
}

/**
 * Merge a duplicate listing into a canonical one:
 *  - the duplicate's own listing (price/stock/terms) becomes an OFFER from its
 *    seller on the canonical product (the aggregator-model conversion)
 *  - attached offers on the duplicate re-attach to the canonical
 *  - reviews/favorites/orderItems/rfqLines/quoteLines/variants/certifications
 *    re-assign; images merge when the target has room
 *  - the duplicate ARCHIVES with a merged marker (order history stays intact)
 */
export async function mergeProducts(adminId: string, duplicateId: string, targetId: string) {
  if (duplicateId === targetId) throw new CatalogError('Cannot merge a product into itself')
  const [dup, target] = await Promise.all([
    db.product.findUnique({ where: { id: duplicateId }, include: { variants: true } }),
    db.product.findUnique({ where: { id: targetId } }),
  ])
  if (!dup) throw new CatalogError('Duplicate product not found', 404)
  if (!target) throw new CatalogError('Target product not found', 404)

  const result = await db.$transaction(async (tx) => {
    // 1) The duplicate's seller becomes an offer holder on the target (if different from target owner)
    if (dup.sellerId !== target.sellerId) {
      const existing = await tx.productOffer.findUnique({
        where: { productId_sellerId: { productId: targetId, sellerId: dup.sellerId } },
        select: { id: true, status: true },
      })
      const offerData = {
        price: dup.price,
        compareAtPrice: dup.compareAtPrice,
        stock: dup.stock,
        moq: dup.moq,
        sku: dup.sku,
        priceTiers: dup.priceTiers,
        freeShipping: dup.freeShipping,
        shippingFee: dup.shippingFee,
        processingDays: dup.processingDays,
        status: 'ACTIVE' as const,
      }
      if (!existing) {
        await tx.productOffer.create({ data: { productId: targetId, sellerId: dup.sellerId, ...offerData } })
      } else if (existing.status === 'ARCHIVED' || existing.status === 'REJECTED') {
        await tx.productOffer.update({ where: { id: existing.id }, data: offerData })
      }
    }

    // 2) Re-attach everything hanging off the duplicate
    await tx.review.updateMany({ where: { productId: duplicateId }, data: { productId: targetId } })
    await tx.favorite.updateMany({ where: { productId: duplicateId }, data: { productId: targetId } })
    await tx.orderItem.updateMany({ where: { productId: duplicateId }, data: { productId: targetId } })
    await tx.rfqLine.updateMany({ where: { productId: duplicateId }, data: { productId: targetId } })
    await tx.quoteLine.updateMany({ where: { productId: duplicateId }, data: { productId: targetId } })
    await tx.productCertification.updateMany({ where: { productId: duplicateId }, data: { productId: targetId } })
    // Offers already attached to the duplicate move over; @@unique(productId, sellerId)
    // conflicts (same seller already offers on target) keep the target's offer — archive the mover
    const dupOffers = await tx.productOffer.findMany({ where: { productId: duplicateId }, select: { id: true, sellerId: true, status: true } })
    for (const o of dupOffers) {
      const clash = await tx.productOffer.findUnique({
        where: { productId_sellerId: { productId: targetId, sellerId: o.sellerId } },
        select: { id: true },
      })
      if (clash) await tx.productOffer.update({ where: { id: o.id }, data: { status: 'ARCHIVED' } })
      else await tx.productOffer.update({ where: { id: o.id }, data: { productId: targetId } })
    }
    // Variants: keep them attached to the duplicate row? NO — they'd be invisible
    // (duplicate archives). Move them; name conflicts are acceptable (position shifts).
    if (dup.variants.length > 0) {
      const targetVariantCount = await tx.productVariant.count({ where: { productId: targetId } })
      await tx.productVariant.updateMany({ where: { productId: duplicateId }, data: { productId: targetId } })
      await tx.$executeRaw`UPDATE ProductVariant SET position = position + ${targetVariantCount} WHERE productId = ${targetId} AND position < ${targetVariantCount}`
    }

    // 3) Merge counters + images (append if the target has room, max 6)
    const targetImages = safeParseImages(target.images)
    const dupImages = safeParseImages(dup.images).filter((u) => !targetImages.includes(u))
    const mergedImages = [...targetImages, ...dupImages].slice(0, 6)
    const soldCount = target.soldCount + dup.soldCount

    await tx.product.update({
      where: { id: targetId },
      data: {
        soldCount,
        images: JSON.stringify(mergedImages),
        ...(target.brandId ? {} : { brandId: dup.brandId }),
        ...(target.gtin ? {} : { gtin: dup.gtin }),
        ...(target.mpn ? {} : { mpn: dup.mpn }),
      },
    })

    // 4) Archive the duplicate with a merge marker (slug stays unique — suffixed)
    await tx.product.update({
      where: { id: duplicateId },
      data: {
        status: 'ARCHIVED',
        featured: false,
        slug: `merged-${duplicateId}`,
        reviewNote: `Merged into "${target.title}" (${targetId})`,
        reviewedAt: new Date(),
        reviewedById: adminId,
      },
    })

    return { targetId, duplicateId }
  })

  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'PRODUCT_MERGED',
    entityType: 'Product',
    entityId: targetId,
    summary: `Admin merged duplicate "${dup.title}" into "${target.title}"`,
    metadata: { duplicateId, targetId },
  })

  return result
}

function safeParseImages(images: string): string[] {
  try {
    const arr = JSON.parse(images || '[]')
    return Array.isArray(arr) ? arr.filter((u) => typeof u === 'string') : []
  } catch {
    return []
  }
}
