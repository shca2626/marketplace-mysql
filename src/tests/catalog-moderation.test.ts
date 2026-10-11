// Catalog search + product moderation + bulk import test suite (task TEST-C).
//
// Covers, against the dedicated vendora_test database:
//   A. GET /api/products — search (title / category name / store name,
//      multi-term AND), price min/max, all sort orders, pagination,
//      public visibility rules (+ home feed), scope=all (admin-only),
//      mine=1, ids= ordering, featured=1
//   B. Ownership & moderation — PUT (owner ok / other seller 403 / admin
//      override + PRODUCT_ADMIN_EDITED), PATCH moderation (archive →
//      hidden publicly, restore, featured toggle, non-admin 403,
//      PRODUCT_MODERATED audit), DELETE (archive with order history /
//      hard-delete without + PRODUCT_TAKEDOWN audit / seller own delete),
//      POST create guards (anon / buyer / suspended seller)
//   C. POST /api/products/bulk — ImportRow field mapping per
//      src/lib/product-io.ts (weightKg→weightGrams, handlingDays→
//      processingDays, minOrderQty→moq, variants[].priceDelta, imageless
//      → DRAFT), per-row error reporting, role guards, and the
//      status / price / delete bulk operations over mixed-ownership ids.
//
// SPEC-NOTE (suspended sellers): src/lib/auth.ts getSessionUser() returns
// null for SUSPENDED accounts (auth.ts:77), so a suspended seller is
// indistinguishable from an anonymous caller on every guard that starts
// with `if (!user) return 401`. These tests pin that observable behavior
// (401); the routes' own SUSPENDED→403 branches are defense-in-depth
// behind a session that can no longer resolve.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { GET as productsGET, POST as productsPOST } from '@/app/api/products/route'
import {
  DELETE as productDELETE,
  PATCH as productPATCH,
  PUT as productPUT,
} from '@/app/api/products/[id]/route'
import { POST as bulkPOST } from '@/app/api/products/bulk/route'
import { GET as homeGET } from '@/app/api/home/route'
import { db } from '@/lib/db'
import { cookieJar } from '@/tests/stubs/next-headers'
import type { ImportRow } from '@/lib/product-io'
import {
  cleanupFixtures,
  clearSession,
  createFixtureCategory,
  createFixtureOrder,
  createFixtureProduct,
  createFixtureUser,
  deleteReq,
  getReq,
  params,
  patchReq,
  postReq,
  putReq,
  setSession,
  trackProduct,
  uniq,
} from '@/tests/fixtures'
import type { FixtureUser } from '@/tests/fixtures'

// ─── helpers ─────────────────────────────────────────────────────────────────

/** A product form payload that satisfies productFormSchema and publishes ACTIVE. */
function validProductForm(categoryId: string) {
  return {
    title: uniq('Form Product'),
    description: 'A fixture product description that is comfortably long enough.',
    price: 29.5,
    images: ['https://example.com/form.jpg'],
    categoryId,
    stock: 10,
    status: 'ACTIVE' as const,
  }
}

/** A minimal valid ImportRow (src/lib/product-io.ts) with overridable fields. */
function importRow(
  fields: Partial<ImportRow> &
    Pick<ImportRow, 'title' | 'description' | 'price' | 'categorySlug'>,
): ImportRow {
  return {
    tags: [],
    attributes: {},
    images: ['https://example.com/import.jpg'],
    stock: 10,
    ...fields,
  }
}

/** GET /api/products and assert 200, returning the parsed list payload. */
async function listBody(url: string) {
  const res = await productsGET(getReq(url))
  expect(res.status).toBe(200)
  return (await res.json()) as {
    items: { id: string; price: number }[]
    total: number
    pages: number
    page: number
  }
}

/** GET /api/products and assert 200, returning just the item ids. */
async function listIds(url: string): Promise<string[]> {
  return (await listBody(url)).items.map((i) => i.id)
}

/** Shape of the bulk-import response rows (POST /api/products/bulk). */
interface BulkImportBody {
  summary: { total: number; created: number; failed: number }
  results: { index: number; title: string; ok: boolean; error?: string; productId?: string }[]
}

describe('catalog search, product moderation & bulk operations', () => {
  let admin: FixtureUser
  let sellerA: FixtureUser
  let sellerB: FixtureUser
  let suspendedSeller: FixtureUser
  let buyer: FixtureUser

  beforeAll(async () => {
    admin = await createFixtureUser({ role: 'ADMIN' })
    sellerA = await createFixtureUser({ role: 'SELLER' })
    sellerB = await createFixtureUser({ role: 'SELLER' })
    suspendedSeller = await createFixtureUser({ role: 'SELLER', status: 'SUSPENDED' })
    buyer = await createFixtureUser({ role: 'BUYER' })
  })

  beforeEach(() => {
    cookieJar.clear()
  })

  afterAll(async () => {
    await cleanupFixtures()
  })

  // ── A. SEARCH & FILTERS ───────────────────────────────────────────────────

  describe('A. search & filters (GET /api/products)', () => {
    it('matches q against title, category name and seller store name', async () => {
      const titleTerm = uniq('titlematch')
      const catTerm = uniq('catmatch')
      const storeTerm = uniq('storematch')

      const catPlain = await createFixtureCategory(uniq('Plain Shelf'))
      const catNamed = await createFixtureCategory(`${catTerm} Corner`)
      const storeSeller = await createFixtureUser({
        role: 'SELLER',
        storeName: `${storeTerm} Trading`,
      })
      const otherSeller = await createFixtureUser({ role: 'SELLER' })

      const pTitle = await createFixtureProduct({
        sellerId: otherSeller.id,
        categoryId: catPlain.id,
        title: `${titleTerm} Vase`,
      })
      const pCat = await createFixtureProduct({
        sellerId: otherSeller.id,
        categoryId: catNamed.id,
        title: uniq('Quiet Bowl'),
      })
      const pStore = await createFixtureProduct({
        sellerId: storeSeller.id,
        categoryId: catPlain.id,
        title: uniq('Silent Lamp'),
      })

      const byTitle = await listIds(`/api/products?q=${titleTerm}`)
      expect(new Set(byTitle)).toEqual(new Set([pTitle.id]))

      const byCat = await listIds(`/api/products?q=${catTerm}`)
      expect(new Set(byCat)).toEqual(new Set([pCat.id]))

      const byStore = await listIds(`/api/products?q=${storeTerm}`)
      expect(new Set(byStore)).toEqual(new Set([pStore.id]))
    })

    it('ANDs multi-term q: only products matching every term are returned', async () => {
      const candleTerm = uniq('candle')
      const lavenderTerm = uniq('lavender')
      const catLavender = await createFixtureCategory(`${lavenderTerm} Collection`)
      const catPlain = await createFixtureCategory(uniq('General Shelf'))
      const s = await createFixtureUser({ role: 'SELLER' })

      // matches candleTerm via title and lavenderTerm only via its category name
      const pBoth = await createFixtureProduct({
        sellerId: s.id,
        categoryId: catLavender.id,
        title: `${candleTerm} Jar`,
        description: 'Scented jar fixture with a comfortably long description.',
      })
      // matches candleTerm only (plain category)
      const pCandleOnly = await createFixtureProduct({
        sellerId: s.id,
        categoryId: catPlain.id,
        title: `${candleTerm} Holder`,
        description: 'Holder fixture with a comfortably long description.',
      })
      // matches lavenderTerm only (through the category)
      const pLavOnly = await createFixtureProduct({
        sellerId: s.id,
        categoryId: catLavender.id,
        title: uniq('Room Spray'),
        description: 'Spray fixture with a comfortably long description.',
      })

      const one = await listIds(`/api/products?q=${candleTerm}`)
      expect(new Set(one)).toEqual(new Set([pBoth.id, pCandleOnly.id]))

      // two terms that each match different fields → only rows matching BOTH
      const both = await listIds(
        `/api/products?q=${encodeURIComponent(`${candleTerm} ${lavenderTerm}`)}`,
      )
      expect(both).toEqual([pBoth.id])
    })

    it('filters by price min/max and sorts by price-asc, price-desc, newest and popular', async () => {
      const cat = await createFixtureCategory(uniq('Priced'))
      const s = await createFixtureUser({ role: 'SELLER' })
      const pCheap = await createFixtureProduct({ sellerId: s.id, categoryId: cat.id, price: 5.5, title: uniq('Cheap') })
      const pMid = await createFixtureProduct({ sellerId: s.id, categoryId: cat.id, price: 50, title: uniq('Mid') })
      const pHigh = await createFixtureProduct({ sellerId: s.id, categoryId: cat.id, price: 500, title: uniq('High') })

      // distinct soldCount + createdAt drive the popular / newest sorts
      await db.product.update({
        where: { id: pCheap.id },
        data: { soldCount: 50, createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
      })
      await db.product.update({
        where: { id: pMid.id },
        data: { soldCount: 30, createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000) },
      })
      await db.product.update({ where: { id: pHigh.id }, data: { soldCount: 10, createdAt: new Date() } })

      const base = `category=${cat.slug}`

      const above = await listIds(`/api/products?${base}&min=10`)
      expect(new Set(above)).toEqual(new Set([pMid.id, pHigh.id]))

      const below = await listIds(`/api/products?${base}&max=100`)
      expect(new Set(below)).toEqual(new Set([pCheap.id, pMid.id]))

      const band = await listIds(`/api/products?${base}&min=10&max=100`)
      expect(band).toEqual([pMid.id])

      const asc = (await listBody(`/api/products?${base}&sort=price-asc`)).items.map((i) => i.price)
      expect(asc).toEqual([5.5, 50, 500])

      const desc = (await listBody(`/api/products?${base}&sort=price-desc`)).items.map((i) => i.price)
      expect(desc).toEqual([500, 50, 5.5])

      const newest = await listIds(`/api/products?${base}&sort=newest`)
      expect(newest).toEqual([pHigh.id, pMid.id, pCheap.id])

      const popular = await listIds(`/api/products?${base}&sort=popular`)
      expect(popular).toEqual([pCheap.id, pMid.id, pHigh.id])
    })

    it('paginates: limit=2 page 1 vs page 2 are disjoint and totals stay stable', async () => {
      const cat = await createFixtureCategory(uniq('Paged'))
      const s = await createFixtureUser({ role: 'SELLER' })
      const p1 = await createFixtureProduct({ sellerId: s.id, categoryId: cat.id, price: 10 })
      const p2 = await createFixtureProduct({ sellerId: s.id, categoryId: cat.id, price: 20 })
      const p3 = await createFixtureProduct({ sellerId: s.id, categoryId: cat.id, price: 30 })
      const url = (page: number) => `/api/products?category=${cat.slug}&sort=price-asc&limit=2&page=${page}`

      const first = await listBody(url(1))
      expect(first.total).toBe(3)
      expect(first.pages).toBe(2)
      expect(first.page).toBe(1)
      expect(first.items.map((i) => i.id)).toEqual([p1.id, p2.id])

      const second = await listBody(url(2))
      expect(second.page).toBe(2)
      expect(second.items.map((i) => i.id)).toEqual([p3.id])

      // disjoint pages + stable repeated reads
      expect(first.items.some((i) => second.items.some((j) => j.id === i.id))).toBe(false)
      const again = await listBody(url(1))
      expect(again).toEqual(first)
    })

    it('hides DRAFT, ARCHIVED and suspended-seller ACTIVE products from the public catalog and home feed', async () => {
      const cat = await createFixtureCategory(uniq('Visibility'))
      const pDraft = await createFixtureProduct({ sellerId: sellerA.id, categoryId: cat.id, status: 'DRAFT' })
      const pArchived = await createFixtureProduct({ sellerId: sellerA.id, categoryId: cat.id, status: 'ARCHIVED' })
      const pSuspended = await createFixtureProduct({ sellerId: suspendedSeller.id, categoryId: cat.id, status: 'ACTIVE' })
      const pLive = await createFixtureProduct({ sellerId: sellerB.id, categoryId: cat.id, status: 'ACTIVE' })
      // pump soldCount so pLive leads the trending feed regardless of other rows
      await db.product.update({ where: { id: pLive.id }, data: { soldCount: 99999 } })

      expect(await listIds(`/api/products?category=${cat.slug}`)).toEqual([pLive.id])

      // the home feed (featured / trending / new arrivals) applies the same rules
      const homeRes = await homeGET()
      expect(homeRes.status).toBe(200)
      const home = await homeRes.json()
      const feedIds = [...home.featured, ...home.trending, ...home.newArrivals].map(
        (i: { id: string }) => i.id,
      )
      expect(feedIds).toContain(pLive.id)
      expect(feedIds).not.toContain(pDraft.id)
      expect(feedIds).not.toContain(pArchived.id)
      expect(feedIds).not.toContain(pSuspended.id)
    })

    it('scope=all is admin-only and includes DRAFT/ARCHIVED rows; status=DRAFT returns only drafts', async () => {
      const cat = await createFixtureCategory(uniq('Scope'))
      const pDraft = await createFixtureProduct({ sellerId: sellerA.id, categoryId: cat.id, status: 'DRAFT' })
      const pArchived = await createFixtureProduct({ sellerId: sellerA.id, categoryId: cat.id, status: 'ARCHIVED' })
      const pSuspended = await createFixtureProduct({ sellerId: suspendedSeller.id, categoryId: cat.id, status: 'ACTIVE' })
      const pLive = await createFixtureProduct({ sellerId: sellerB.id, categoryId: cat.id, status: 'ACTIVE' })
      const url = `/api/products?scope=all&category=${cat.slug}`

      clearSession()
      expect((await productsGET(getReq(url))).status).toBe(403)
      setSession(buyer.id)
      expect((await productsGET(getReq(url))).status).toBe(403)
      setSession(sellerA.id)
      expect((await productsGET(getReq(url))).status).toBe(403)

      setSession(admin.id)
      const all = await listIds(url)
      expect(new Set(all)).toEqual(new Set([pDraft.id, pArchived.id, pSuspended.id, pLive.id]))

      const drafts = await listIds(`${url}&status=DRAFT`)
      expect(drafts).toEqual([pDraft.id])
    })

    it('mine=1 returns own products including DRAFTs but never other sellers; anon gets 401', async () => {
      const cat = await createFixtureCategory(uniq('Mine'))
      const pA1 = await createFixtureProduct({ sellerId: sellerA.id, categoryId: cat.id, status: 'ACTIVE' })
      const pA2 = await createFixtureProduct({ sellerId: sellerA.id, categoryId: cat.id, status: 'DRAFT' })
      const pB1 = await createFixtureProduct({ sellerId: sellerB.id, categoryId: cat.id, status: 'ACTIVE' })

      clearSession()
      const anonRes = await productsGET(getReq('/api/products?mine=1'))
      expect(anonRes.status).toBe(401)

      setSession(sellerA.id)
      const mine = await listIds(`/api/products?mine=1&category=${cat.slug}`)
      expect(new Set(mine)).toEqual(new Set([pA1.id, pA2.id]))
      expect(mine).not.toContain(pB1.id)
    })

    it('ids= preserves the caller order and paginates', async () => {
      const cat = await createFixtureCategory(uniq('Ids'))
      const s = await createFixtureUser({ role: 'SELLER' })
      const p1 = await createFixtureProduct({ sellerId: s.id, categoryId: cat.id, title: uniq('Ids One') })
      const p2 = await createFixtureProduct({ sellerId: s.id, categoryId: cat.id, title: uniq('Ids Two') })
      const p3 = await createFixtureProduct({ sellerId: s.id, categoryId: cat.id, title: uniq('Ids Three') })
      const idsParam = `${p3.id},${p1.id},${p2.id}` // deliberately not creation order

      const full = await listBody(`/api/products?ids=${idsParam}`)
      expect(full.total).toBe(3)
      expect(full.items.map((i) => i.id)).toEqual([p3.id, p1.id, p2.id])

      const page1 = await listIds(`/api/products?ids=${idsParam}&limit=2&page=1`)
      expect(page1).toEqual([p3.id, p1.id])
      const page2 = await listIds(`/api/products?ids=${idsParam}&limit=2&page=2`)
      expect(page2).toEqual([p2.id])
    })

    it('featured=1 returns only featured products', async () => {
      const cat = await createFixtureCategory(uniq('Featured'))
      const s = await createFixtureUser({ role: 'SELLER' })
      const pFeatured = await createFixtureProduct({ sellerId: s.id, categoryId: cat.id, featured: true })
      await createFixtureProduct({ sellerId: s.id, categoryId: cat.id, featured: false })

      expect(await listIds(`/api/products?featured=1&category=${cat.slug}`)).toEqual([pFeatured.id])
    })
  })

  // ── B. OWNERSHIP & MODERATION ─────────────────────────────────────────────

  describe('B. ownership & moderation', () => {
    it('seller PUT updates own product; another seller gets 403', async () => {
      const cat = await createFixtureCategory(uniq('Put'))
      const pOwn = await createFixtureProduct({ sellerId: sellerA.id, categoryId: cat.id, price: 40 })
      const form = {
        title: uniq('Updated Title'),
        description: 'An updated fixture description that is comfortably long enough.',
        price: 88.25,
        images: ['https://example.com/updated.jpg'],
        categoryId: cat.id,
        stock: 7,
      }

      setSession(sellerA.id)
      const res = await productPUT(putReq(`/api/products/${pOwn.id}`, form), params({ id: pOwn.id }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.product).toMatchObject({ id: pOwn.id, title: form.title, price: 88.25, stock: 7 })
      expect(await db.product.findUnique({ where: { id: pOwn.id } })).toMatchObject({
        title: form.title,
        price: 88.25,
        stock: 7,
      })

      setSession(sellerB.id)
      const forbidden = await productPUT(putReq(`/api/products/${pOwn.id}`, form), params({ id: pOwn.id }))
      expect(forbidden.status).toBe(403)
    })

    it('admin PUT edits any seller product and records a PRODUCT_ADMIN_EDITED audit row', async () => {
      const cat = await createFixtureCategory(uniq('AdminPut'))
      const p = await createFixtureProduct({ sellerId: sellerA.id, categoryId: cat.id, price: 60 })

      setSession(admin.id)
      const res = await productPUT(
        putReq(`/api/products/${p.id}`, { ...validProductForm(cat.id), price: 123.45 }),
        params({ id: p.id }),
      )
      expect(res.status).toBe(200)
      expect((await res.json()).product.price).toBe(123.45)

      const audit = await db.auditLog.findFirst({
        where: { action: 'PRODUCT_ADMIN_EDITED', entityId: p.id, actorId: admin.id },
      })
      expect(audit).not.toBeNull()
    })

    it('admin PATCH archives/restores/feature-toggles a product; non-admin gets 403; PRODUCT_MODERATED audited', async () => {
      const cat = await createFixtureCategory(uniq('Moderation'))
      const p = await createFixtureProduct({ sellerId: sellerA.id, categoryId: cat.id, status: 'ACTIVE' })
      const publicUrl = `/api/products?category=${cat.slug}`

      setSession(admin.id)

      const archived = await productPATCH(
        patchReq(`/api/products/${p.id}`, { status: 'ARCHIVED' }),
        params({ id: p.id }),
      )
      expect(archived.status).toBe(200)
      expect((await archived.json()).product).toMatchObject({ id: p.id, status: 'ARCHIVED' })

      // archived → gone from the public catalog, still visible in the admin scope
      expect(await listIds(publicUrl)).toEqual([])
      expect(await listIds(`/api/products?scope=all&category=${cat.slug}`)).toEqual([p.id])

      const restored = await productPATCH(
        patchReq(`/api/products/${p.id}`, { status: 'ACTIVE' }),
        params({ id: p.id }),
      )
      expect(restored.status).toBe(200)
      expect(await listIds(publicUrl)).toEqual([p.id])

      const featured = await productPATCH(
        patchReq(`/api/products/${p.id}`, { featured: true }),
        params({ id: p.id }),
      )
      expect(featured.status).toBe(200)
      expect((await featured.json()).product.featured).toBe(true)
      expect(
        (await db.product.findUnique({ where: { id: p.id }, select: { featured: true } }))?.featured,
      ).toBe(true)

      // the owning seller may not use the moderation endpoint either
      setSession(sellerA.id)
      const forbidden = await productPATCH(
        patchReq(`/api/products/${p.id}`, { status: 'ARCHIVED' }),
        params({ id: p.id }),
      )
      expect(forbidden.status).toBe(403)

      const moderated = await db.auditLog.count({
        where: { action: 'PRODUCT_MODERATED', entityId: p.id, actorId: admin.id },
      })
      expect(moderated).toBeGreaterThanOrEqual(3) // archive + restore + feature
    })

    it('admin DELETE archives with order history, hard-deletes without one (PRODUCT_TAKEDOWN both); seller DELETE own history-free product', async () => {
      const cat = await createFixtureCategory(uniq('Takedown'))
      const pWithHistory = await createFixtureProduct({ sellerId: sellerA.id, categoryId: cat.id })
      const pNoHistory = await createFixtureProduct({ sellerId: sellerA.id, categoryId: cat.id })
      const pOwn = await createFixtureProduct({ sellerId: sellerB.id, categoryId: cat.id })

      await createFixtureOrder({
        buyerId: buyer.id,
        items: [{ sellerId: sellerA.id, productId: pWithHistory.id, price: 20, quantity: 2 }],
      })

      setSession(admin.id)

      const archived = await productDELETE(
        deleteReq(`/api/products/${pWithHistory.id}`),
        params({ id: pWithHistory.id }),
      )
      expect(archived.status).toBe(200)
      expect(await archived.json()).toEqual({ ok: true, archived: true })
      expect(
        (await db.product.findUnique({ where: { id: pWithHistory.id }, select: { status: true } }))?.status,
      ).toBe('ARCHIVED')

      const deleted = await productDELETE(
        deleteReq(`/api/products/${pNoHistory.id}`),
        params({ id: pNoHistory.id }),
      )
      expect(deleted.status).toBe(200)
      expect(await deleted.json()).toEqual({ ok: true, archived: false })
      expect(await db.product.findUnique({ where: { id: pNoHistory.id } })).toBeNull()

      const takedowns = await db.auditLog.count({
        where: {
          action: 'PRODUCT_TAKEDOWN',
          actorId: admin.id,
          entityId: { in: [pWithHistory.id, pNoHistory.id] },
        },
      })
      expect(takedowns).toBe(2)

      // sellers can delete their own history-free listings (no audit — not an admin action)
      setSession(sellerB.id)
      const own = await productDELETE(deleteReq(`/api/products/${pOwn.id}`), params({ id: pOwn.id }))
      expect(own.status).toBe(200)
      expect(await own.json()).toEqual({ ok: true, archived: false })
      expect(await db.product.findUnique({ where: { id: pOwn.id } })).toBeNull()
    })

    it('POST /api/products rejects anon (401), buyer (403) and suspended seller (401 — session rejection)', async () => {
      const cat = await createFixtureCategory(uniq('CreateGuard'))
      const form = validProductForm(cat.id)

      clearSession()
      expect((await productsPOST(postReq('/api/products', form))).status).toBe(401)

      setSession(buyer.id)
      expect((await productsPOST(postReq('/api/products', form))).status).toBe(403)

      // SPEC-NOTE: suspended sessions do not resolve (src/lib/auth.ts:77), so
      // the suspended seller reads as anonymous (401). The route's own
      // SUSPENDED→403 branch (src/app/api/products/route.ts:138) is unreachable
      // defense-in-depth behind a session that can no longer exist.
      setSession(suspendedSeller.id)
      expect((await productsPOST(postReq('/api/products', form))).status).toBe(401)
    })
  })

  // ── C. BULK IMPORT + OPERATIONS ───────────────────────────────────────────

  describe('C. bulk import & operations (POST /api/products/bulk)', () => {
    it('imports 3 valid rows with ImportRow field mapping; imageless rows land as DRAFT', async () => {
      const cat = await createFixtureCategory(uniq('Import'))
      const s = await createFixtureUser({ role: 'SELLER' })

      const rows: ImportRow[] = [
        importRow({
          title: uniq('Spec Heavy Widget'),
          description: 'A spec-heavy fixture product for the import pipeline.',
          price: 42,
          categorySlug: cat.slug,
          images: ['https://example.com/spec-widget.jpg'],
          weightKg: 2.5,
          handlingDays: 3,
          minOrderQty: 5,
          stock: 12,
        }),
        importRow({
          title: uniq('Variant Widget'),
          description: 'A variant-carrying fixture product for the import pipeline.',
          price: 100,
          categorySlug: cat.slug,
          variants: [{ name: 'Large', options: { size: 'L' }, priceDelta: 10, stock: 7 }],
        }),
        importRow({
          title: uniq('Bare Draft Widget'),
          description: 'An imageless fixture product that must land as a draft.',
          price: 9.5,
          categorySlug: cat.slug,
          images: [],
        }),
      ]

      setSession(s.id)
      const res = await bulkPOST(postReq('/api/products/bulk', { action: 'import', rows }))
      expect(res.status).toBe(200)
      const body = (await res.json()) as BulkImportBody
      expect(body.summary).toEqual({ total: 3, created: 3, failed: 0 })
      expect(body.results.map((r) => r.ok)).toEqual([true, true, true])

      const ids = body.results.map((r) => r.productId)
      ids.forEach((id) => {
        if (id) trackProduct(id)
      })

      const spec = await db.product.findUnique({ where: { id: ids[0]! } })
      expect(spec).toMatchObject({
        sellerId: s.id,
        weightGrams: 2500, // weightKg 2.5 → grams
        processingDays: 3, // handlingDays
        moq: 5, // minOrderQty
        stock: 12,
        status: 'ACTIVE',
      })

      const variantHost = await db.product.findUnique({ where: { id: ids[1]! }, include: { variants: true } })
      expect(variantHost?.stock).toBe(7) // variant stock is authoritative for the product total
      expect(variantHost?.variants).toHaveLength(1)
      expect(variantHost?.variants[0]).toMatchObject({ name: 'Large', price: 110 }) // 100 + priceDelta 10

      const bare = await db.product.findUnique({ where: { id: ids[2]! }, select: { status: true, images: true } })
      expect(bare?.status).toBe('DRAFT') // no images → cannot publish
      expect(bare?.images).toBe('[]')
    })

    it('reports per-row errors (unknown categorySlug, missing title); 2 valid + 2 invalid → total 4 created 2 failed 2', async () => {
      const cat = await createFixtureCategory(uniq('ImportErr'))
      const s = await createFixtureUser({ role: 'SELLER' })
      const ghostSlug = uniq('no-such-category')

      const rows = [
        importRow({
          title: uniq('Valid One'),
          description: 'First valid import fixture description.',
          price: 10,
          categorySlug: cat.slug,
        }),
        importRow({
          title: uniq('Ghost Category'),
          description: 'Row pointing at a category that does not exist.',
          price: 10,
          categorySlug: ghostSlug,
        }),
        importRow({
          title: '',
          description: 'Row missing its title entirely.',
          price: 10,
          categorySlug: cat.slug,
        }),
        importRow({
          title: uniq('Valid Two'),
          description: 'Second valid import fixture description.',
          price: 10,
          categorySlug: cat.slug,
        }),
      ]

      setSession(s.id)
      const res = await bulkPOST(postReq('/api/products/bulk', { action: 'import', rows }))
      expect(res.status).toBe(200)
      const body = (await res.json()) as BulkImportBody

      expect(body.summary).toEqual({ total: 4, created: 2, failed: 2 })

      expect(body.results[0].ok).toBe(true)
      expect(body.results[3].ok).toBe(true)
      expect(body.results[1].ok).toBe(false)
      expect(body.results[1].error).toContain(ghostSlug) // per-row error lists the unknown slug
      expect(body.results[1].productId).toBeUndefined()
      expect(body.results[2].ok).toBe(false)
      expect(body.results[2].error).toContain('Title') // missing/short title rejected by the form schema

      for (const r of body.results) {
        if (r.ok && r.productId) trackProduct(r.productId)
      }
      expect(await db.product.count({ where: { sellerId: s.id, categoryId: cat.id } })).toBe(2)
    })

    it('bulk import as buyer → 403; as suspended seller → 401 (session rejection)', async () => {
      const cat = await createFixtureCategory(uniq('ImportGuard'))
      const row = importRow({
        title: uniq('Guard Row'),
        description: 'Guard fixture description for import perms.',
        price: 5,
        categorySlug: cat.slug,
      })

      setSession(buyer.id)
      expect((await bulkPOST(postReq('/api/products/bulk', { action: 'import', rows: [row] }))).status).toBe(403)

      // SPEC-NOTE: suspended sessions do not resolve (src/lib/auth.ts:77) → 401,
      // not the route's own 403 suspended branch.
      setSession(suspendedSeller.id)
      expect((await bulkPOST(postReq('/api/products/bulk', { action: 'import', rows: [row] }))).status).toBe(401)
    })

    it('bulk status changes only the caller own products among mixed ids', async () => {
      const cat = await createFixtureCategory(uniq('BulkStatus'))
      const a1 = await createFixtureProduct({ sellerId: sellerA.id, categoryId: cat.id })
      const a2 = await createFixtureProduct({ sellerId: sellerA.id, categoryId: cat.id })
      const b1 = await createFixtureProduct({ sellerId: sellerB.id, categoryId: cat.id })

      setSession(sellerA.id)
      const res = await bulkPOST(
        postReq('/api/products/bulk', { action: 'status', ids: [a1.id, a2.id, b1.id], status: 'ARCHIVED' }),
      )
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ updated: 2 })

      const rows = await db.product.findMany({
        where: { id: { in: [a1.id, a2.id, b1.id] } },
        select: { id: true, status: true },
      })
      const statuses = Object.fromEntries(rows.map((r) => [r.id, r.status]))
      expect(statuses[a1.id]).toBe('ARCHIVED')
      expect(statuses[a2.id]).toBe('ARCHIVED')
      expect(statuses[b1.id]).toBe('ACTIVE') // belongs to seller B — untouched
    })

    it('bulk price: percent +10 → 110, fixed -5 → 95, floor bound 0.01, percent -95 → 400', async () => {
      const cat = await createFixtureCategory(uniq('BulkPrice'))
      const s = await createFixtureUser({ role: 'SELLER' })
      const pPercent = await createFixtureProduct({ sellerId: s.id, categoryId: cat.id, price: 100 })
      const pFixed = await createFixtureProduct({ sellerId: s.id, categoryId: cat.id, price: 100 })
      const pFloor = await createFixtureProduct({ sellerId: s.id, categoryId: cat.id, price: 3 })
      const priceOf = async (id: string) =>
        (await db.product.findUnique({ where: { id }, select: { price: true } }))?.price

      setSession(s.id)

      const pct = await bulkPOST(
        postReq('/api/products/bulk', { action: 'price', ids: [pPercent.id], mode: 'percent', value: 10 }),
      )
      expect(pct.status).toBe(200)
      expect(await pct.json()).toEqual({ updated: 1 })
      expect(await priceOf(pPercent.id)).toBe(110)

      const fixed = await bulkPOST(
        postReq('/api/products/bulk', { action: 'price', ids: [pFixed.id], mode: 'fixed', value: -5 }),
      )
      expect(fixed.status).toBe(200)
      expect(await priceOf(pFixed.id)).toBe(95)

      const floor = await bulkPOST(
        postReq('/api/products/bulk', { action: 'price', ids: [pFloor.id], mode: 'fixed', value: -5 }),
      )
      expect(floor.status).toBe(200)
      expect(await priceOf(pFloor.id)).toBe(0.01) // adjustment is floored at one cent

      const tooSteep = await bulkPOST(
        postReq('/api/products/bulk', { action: 'price', ids: [pPercent.id], mode: 'percent', value: -95 }),
      )
      expect(tooSteep.status).toBe(400)
    })

    it('bulk delete: own history-free deleted, own with history archived, other sellers rows ignored', async () => {
      const cat = await createFixtureCategory(uniq('BulkDelete'))
      const d1 = await createFixtureProduct({ sellerId: sellerA.id, categoryId: cat.id })
      const d2 = await createFixtureProduct({ sellerId: sellerA.id, categoryId: cat.id })
      const foreign = await createFixtureProduct({ sellerId: sellerB.id, categoryId: cat.id })

      await createFixtureOrder({
        buyerId: buyer.id,
        items: [{ sellerId: sellerA.id, productId: d2.id, price: 15, quantity: 1 }],
      })

      setSession(sellerA.id)
      const res = await bulkPOST(
        postReq('/api/products/bulk', { action: 'delete', ids: [d1.id, d2.id, foreign.id] }),
      )
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ deleted: 1, archived: 1 })

      expect(await db.product.findUnique({ where: { id: d1.id } })).toBeNull()
      expect((await db.product.findUnique({ where: { id: d2.id }, select: { status: true } }))?.status).toBe('ARCHIVED')
      expect((await db.product.findUnique({ where: { id: foreign.id }, select: { status: true } }))?.status).toBe('ACTIVE')
    })
  })
})
