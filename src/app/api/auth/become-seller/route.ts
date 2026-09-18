import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSessionUser, toSessionUser } from '@/lib/auth'

const schema = z.object({
  storeName: z.string().min(2, 'Store name must be at least 2 characters').max(60),
  storeBio: z.string().max(300).optional().nullable(),
})

// POST /api/auth/become-seller — upgrade buyer account to seller
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Please sign in first' }, { status: 401 })
    if (user.role === 'SELLER') return NextResponse.json({ user: toSessionUser(user) })

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const updated = await db.user.update({
      where: { id: user.id },
      data: {
        role: 'SELLER',
        storeName: parsed.data.storeName,
        storeBio: parsed.data.storeBio ?? null,
      },
    })

    return NextResponse.json({ user: toSessionUser(updated) })
  } catch (err) {
    console.error('become-seller error', err)
    return NextResponse.json({ error: 'Failed to upgrade account' }, { status: 500 })
  }
}
