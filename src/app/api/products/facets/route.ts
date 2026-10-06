import { NextRequest, NextResponse } from 'next/server'
import { categoryFacets } from '@/server/modules/catalog/facets'

// GET /api/products/facets?category=<slug> — Phase 12 spec-attribute facet
// aggregation for the catalog's "Refine" rail: per spec label, distinct values
// with counts (count-desc, top 8). Label order follows the category's
// SpecAttribute dictionary first (category rows, then globals), then any extra
// labels found in the products' specs JSON. Aggregation is cached 60s
// in-memory and invalidated on product writes (see modules/catalog/facets.ts).
export async function GET(req: NextRequest) {
  try {
    const categorySlug = req.nextUrl.searchParams.get('category')?.trim() || ''
    if (!categorySlug)
      return NextResponse.json({ error: 'category query param is required' }, { status: 400 })

    const facets = await categoryFacets(categorySlug)
    if (!facets.category)
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })

    return NextResponse.json(facets)
  } catch (err) {
    console.error('products facets GET error', err)
    return NextResponse.json({ error: 'Failed to load facets' }, { status: 500 })
  }
}
