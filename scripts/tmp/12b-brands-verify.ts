// 12-b E2E: independent brands directory ground truth vs API + detail + brand filter
import { db } from '@/lib/db'

async function main() {
  const [brands, rows] = await Promise.all([
    db.brand.findMany({ select: { id: true, name: true, slug: true, isVerified: true, originCountry: true } }),
    db.product.findMany({
      where: { status: 'ACTIVE', OR: [{ sellerId: null }, { seller: { status: 'ACTIVE' } }], brandId: { not: null } },
      select: { brandId: true, title: true, categoryId: true, category: { select: { slug: true, name: true } } },
    }),
  ])
  const byBrand = new Map<string, typeof rows>()
  for (const r of rows) { if (!r.brandId) continue; const l = byBrand.get(r.brandId) ?? []; l.push(r); byBrand.set(r.brandId, l) }

  const api = await (await fetch('http://localhost:3000/api/brands')).json()
  console.log('api total:', api.total, '| db brands with public products:', [...byBrand.keys()].length)

  let allMatch = true
  for (const b of api.brands) {
    const dbCount = byBrand.get(brands.find(x => x.slug === b.slug)?.id ?? '')?.length ?? 0
    if (dbCount !== b.productCount) { allMatch = false; console.log('MISMATCH', b.slug, b.productCount, dbCount) }
    // topCategories check
    const catCounts = new Map<string, number>()
    for (const p of byBrand.get(brands.find(x => x.slug === b.slug)?.id ?? '') ?? []) catCounts.set(p.category.slug, (catCounts.get(p.category.slug) ?? 0) + 1)
    const topCats = [...catCounts.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, 3).map(([slug]) => slug)
    if (JSON.stringify(topCats) !== JSON.stringify(b.topCategories.map((c: { slug: string }) => c.slug))) { allMatch = false; console.log('CATS MISMATCH', b.slug, topCats, b.topCategories) }
  }
  console.log('every brand count + topCategories match DB:', allMatch)

  // detail endpoint for Helios
  const detail = await (await fetch('http://localhost:3000/api/brands/helios')).json()
  console.log('detail helios:', JSON.stringify({ name: detail.brand?.name, productCount: detail.brand?.productCount, verified: detail.brand?.isVerified, items: detail.items?.map((i: { title: string }) => i.title) }))

  // products?brand= filter — only that brand
  const list = await (await fetch('http://localhost:3000/api/products?brand=helios&limit=24')).json()
  const heliosId = brands.find(b => b.slug === 'helios')?.id
  const onlyBrand = (list.items ?? []).every((p: { brandName?: string; title: string }) => p.title.startsWith('Helios'))
  console.log('products?brand=helios:', list.total, 'items:', (list.items ?? []).map((p: { title: string }) => p.title), '| all titles Helios:', onlyBrand, '| heliosId:', heliosId)

  // brand search-within + sort
  const searched = await (await fetch('http://localhost:3000/api/brands/helios?q=450&sort=newest')).json()
  console.log('brand helios q=450:', searched.total, (searched.items ?? []).map((i: { title: string }) => i.title))
  // 404
  const nf = await fetch('http://localhost:3000/api/brands/doesnotexist')
  console.log('404 brand:', nf.status)
  // facets 404 + missing param
  const f404 = await fetch('http://localhost:3000/api/products/facets?category=nope')
  const f400 = await fetch('http://localhost:3000/api/products/facets')
  console.log('facets 404:', f404.status, '| facets 400 (no param):', f400.status)
  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
