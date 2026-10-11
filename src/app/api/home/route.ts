import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { favoriteIdsFor, productInclude, serializeCategory, serializeProduct } from '@/lib/serialize'

// GET /api/home — aggregated landing page feed
export async function GET() {
  try {
    const [featured, trending, newArrivals, categories, productCount, sellerCount, reviewCount, orderCount] =
      await Promise.all([
        db.product.findMany({
          where: { status: 'ACTIVE', featured: true, seller: { status: 'ACTIVE' } },
          include: productInclude,
          orderBy: [{ rating: 'desc' }, { soldCount: 'desc' }],
          take: 8,
        }),
        db.product.findMany({
          where: { status: 'ACTIVE', seller: { status: 'ACTIVE' } },
          include: productInclude,
          orderBy: { soldCount: 'desc' },
          take: 8,
        }),
        db.product.findMany({
          where: { status: 'ACTIVE', seller: { status: 'ACTIVE' } },
          include: productInclude,
          orderBy: { createdAt: 'desc' },
          take: 8,
        }),
        db.category.findMany({
          orderBy: { name: 'asc' },
          include: { products: { where: { status: 'ACTIVE', seller: { status: 'ACTIVE' } }, select: { images: true } } },
        }),
        db.product.count({ where: { status: 'ACTIVE', seller: { status: 'ACTIVE' } } }),
        // C2C retirement: "stores" are now the companies selling on the shared
        // catalog — count distinct ACTIVE orgs holding an ACTIVE offer.
        db.organization.count({
          where: {
            orgType: 'COMPANY',
            status: 'ACTIVE',
            offers: { some: { status: 'ACTIVE' } },
          },
        }),
        db.review.count(),
        db.order.count(),
      ])

    const session = await getSessionUser()
    const allIds = [...featured, ...trending, ...newArrivals].map((p) => p.id)
    const favIds = await favoriteIdsFor(session?.id, allIds)

    const coverFor = (products: { images: string }[]) => {
      for (const p of products) {
        try {
          const imgs = JSON.parse(p.images || '[]')
          if (Array.isArray(imgs) && imgs.length > 0) return imgs[0] as string
        } catch {
          continue
        }
      }
      return null
    }

    return NextResponse.json({
      featured: featured.map((p) => serializeProduct(p, favIds.has(p.id))),
      trending: trending.map((p) => serializeProduct(p, favIds.has(p.id))),
      newArrivals: newArrivals.map((p) => serializeProduct(p, favIds.has(p.id))),
      categories: categories.map((c) =>
        serializeCategory(c, c.products.length, coverFor(c.products))
      ),
      stats: { productCount, sellerCount, reviewCount, orderCount },
    })
  } catch (err) {
    console.error('home GET error', err)
    return NextResponse.json({ error: 'Failed to load home feed' }, { status: 500 })
  }
}
