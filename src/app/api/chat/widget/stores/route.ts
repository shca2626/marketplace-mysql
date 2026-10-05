import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * /api/chat/widget/stores — PUBLIC. Powers the widget's store picker: the
 * active seller storefronts a visitor can direct their chat at. "General
 * inquiry" (no seller) is a client-side option and needs no row here.
 */
export async function GET() {
  try {
    const sellers = await db.user.findMany({
      where: {
        role: 'SELLER',
        status: 'ACTIVE',
        storeName: { not: null },
      },
      select: { id: true, storeName: true, name: true },
      orderBy: { storeName: 'asc' },
      take: 50,
    })

    return NextResponse.json({
      stores: sellers
        .filter((s) => Boolean(s.storeName))
        .map((s) => ({ id: s.id, storeName: s.storeName as string })),
    })
  } catch (err) {
    console.error('[api/chat/widget/stores] GET failed', err)
    return NextResponse.json({ error: 'Failed to load stores' }, { status: 500 })
  }
}
