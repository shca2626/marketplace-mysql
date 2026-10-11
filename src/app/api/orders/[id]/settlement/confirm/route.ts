import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser } from '@/lib/auth'
import { confirmSettlement, SettlementServiceError } from '@/server/modules/settlements/service'

const confirmSchema = z.object({
  note: z.string().trim().max(500).optional(),
})

// POST /api/orders/[id]/settlement/confirm — the counterpart (or an admin)
// confirms the external settlement: money moved buyer↔supplier, outside the
// platform. Admins may also confirm a DISPUTED settlement.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { id } = await ctx.params
    const parsed = confirmSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const settlement = await confirmSettlement(user.id, user.role, id, parsed.data.note)
    return NextResponse.json({ settlement })
  } catch (err) {
    if (err instanceof SettlementServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('settlement confirm error', err)
    return NextResponse.json({ error: 'Failed to confirm settlement' }, { status: 500 })
  }
}
