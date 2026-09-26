import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { productInclude, serializeProduct } from '@/lib/serialize'
import { assertSameOrigin } from '@/lib/http'

// GET /api/favorites — my wishlist products
export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const favorites = await db.favorite.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { product: { include: productInclude } },
    })

    return NextResponse.json({
      products: favorites.map((f) => serializeProduct(f.product, true)),
    })
  } catch (err) {
    console.error('favorites GET error', err)
    return NextResponse.json({ error: 'Failed to load favorites' }, { status: 500 })
  }
}

// POST /api/favorites — toggle favorite
export async function POST(req: NextRequest) {
  try {
    const csrf = assertSameOrigin(req)
    if (csrf) return csrf
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Please sign in to save favorites' }, { status: 401 })

    const body = await req.json()
    const parsed = z.object({ productId: z.string() }).safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

    const product = await db.product.findUnique({ where: { id: parsed.data.productId } })
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

    const existing = await db.favorite.findUnique({
      where: { userId_productId: { userId: user.id, productId: parsed.data.productId } },
    })

    if (existing) {
      await db.favorite.delete({ where: { id: existing.id } })
      return NextResponse.json({ favorited: false })
    }

    await db.favorite.create({ data: { userId: user.id, productId: parsed.data.productId } })
    return NextResponse.json({ favorited: true })
  } catch (err) {
    console.error('favorites POST error', err)
    return NextResponse.json({ error: 'Failed to toggle favorite' }, { status: 500 })
  }
}
