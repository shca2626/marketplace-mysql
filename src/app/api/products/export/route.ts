import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { productInclude, serializeProduct } from '@/lib/serialize'
import { toCsv } from '@/lib/csv'
import { CSV_BASE_COLUMNS, csvBool, csvExportColumns } from '@/lib/product-io'
import { attributesForCategory } from '@/lib/catalog/definitions'
import type { ProductDTO } from '@/lib/types'

/**
 * GET /api/products/export — seller exports own products, admin exports all.
 *   ?format=csv|json  (default csv)
 *   ?scope=mine|all   (admin only for all)
 *   ?ids=a,b,c        (restrict to selection)
 *
 * The JSON format doubles as the archived import format for the future
 * admin/management platform (same shape the JSON import tab accepts).
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Please sign in first' }, { status: 401 })
    if (user.role !== 'SELLER' && user.role !== 'ADMIN')
      return NextResponse.json({ error: 'Sellers only' }, { status: 403 })

    const sp = req.nextUrl.searchParams
    const format = sp.get('format') === 'json' ? 'json' : 'csv'
    const scope = sp.get('scope') === 'all' && user.role === 'ADMIN' ? 'all' : 'mine'
    const idsParam = sp.get('ids') || ''
    const ids = idsParam ? idsParam.split(',').map((s) => s.trim()).filter(Boolean) : []

    const products = await db.product.findMany({
      where: {
        ...(scope === 'mine' ? { sellerId: user.id } : {}),
        ...(ids.length > 0 ? { id: { in: ids } } : {}),
      },
      include: productInclude,
      orderBy: { createdAt: 'desc' },
    })

    if (products.length === 0)
      return NextResponse.json({ error: 'No products to export' }, { status: 400 })

    const dto = products.map((p) => serializeProduct(p))

    if (format === 'json') {
      // archived admin-platform format — full objects incl. variants
      return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), products: dto }, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="vendora-products-${new Date().toISOString().slice(0, 10)}.json"`,
        },
      })
    }

    // CSV — flat, union header across all categories' attr.* columns
    const header = csvExportColumns()
    const rows: (string | number | boolean | null)[][] = [header]
    for (const p of dto) {
      const attrDefs = attributesForCategory(p.category.slug)
      rows.push([
        ...CSV_BASE_COLUMNS.map((col) => productCell(p, col)),
        ...attrDefs.map((a) => `attr.${a.key}`).map((col) => productCell(p, col)),
      ])
    }
    const csv = toCsv(rows)
    return new NextResponse(`\uFEFF${csv}`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="vendora-products-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  } catch (err) {
    console.error('products export error', err)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}

function attrCell(p: ProductDTO, key: string): string | number | boolean | null {
  const v = p.attributes?.[key]
  if (v === undefined || v === null) return ''
  if (Array.isArray(v)) return v.join('|')
  return v as string | number | boolean
}

function productCell(p: ProductDTO, col: string): string | number | boolean | null {
  switch (col) {
    case 'title': return p.title
    case 'description': return p.description
    case 'price': return p.price
    case 'compareAtPrice': return p.compareAtPrice ?? ''
    case 'category': return p.category.slug
    case 'stock': return p.stock
    case 'images': return p.images.join('|')
    case 'brand': return p.brand?.name ?? ''
    case 'sku': return p.sku ?? ''
    case 'barcode': return p.barcode ?? ''
    case 'condition': return p.condition ?? ''
    case 'tags': return (p.tags ?? []).join('|')
    case 'videoUrl': return p.videoUrl ?? ''
    case 'freeShipping': return csvBool(p.freeShipping)
    case 'shippingNote': return p.shippingNote ?? ''
    case 'handlingDays': return p.handlingDays ?? ''
    case 'weightKg': return p.weightKg ?? ''
    case 'lengthCm': return p.lengthCm ?? ''
    case 'widthCm': return p.widthCm ?? ''
    case 'heightCm': return p.heightCm ?? ''
    case 'minOrderQty': return p.minOrderQty ?? ''
    case 'maxPerOrder': return p.maxPerOrder ?? ''
    case 'warrantyMonths': return p.warrantyMonths ?? ''
    case 'metaTitle': return p.metaTitle ?? ''
    case 'metaDescription': return p.metaDescription ?? ''
    case 'status': return p.status
    default:
      if (col.startsWith('attr.')) return attrCell(p, col.slice(5))
      return ''
  }
}
