import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/categories — all categories with ACTIVE product counts + cover image
export async function GET() {
  try {
    const categories = await db.category.findMany({
      orderBy: { name: 'asc' },
      include: {
        products: {
          where: { status: 'ACTIVE' },
          select: { images: true },
        },
      },
    })

    return NextResponse.json({
      categories: categories.map((c) => {
        let cover: string | null = null
        for (const p of c.products) {
          try {
            const imgs = JSON.parse(p.images || '[]')
            if (Array.isArray(imgs) && imgs.length > 0) {
              cover = imgs[0]
              break
            }
          } catch {
            continue
          }
        }
        return {
          id: c.id,
          name: c.name,
          slug: c.slug,
          icon: c.icon,
          productCount: c.products.length,
          coverImage: cover,
        }
      }),
    })
  } catch (err) {
    console.error('categories GET error', err)
    return NextResponse.json({ error: 'Failed to load categories' }, { status: 500 })
  }
}
