import { NextRequest, NextResponse } from 'next/server'
import { listProductOffers } from '@/server/modules/catalog/service'

export const dynamic = 'force-dynamic'

// GET /api/products/[id]/offers — public: ACTIVE offers on a shared-catalog product
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const offers = await listProductOffers(id)
    return NextResponse.json({ offers })
  } catch (err) {
    console.error('product offers GET error', err)
    return NextResponse.json({ error: 'Failed to load offers' }, { status: 500 })
  }
}
