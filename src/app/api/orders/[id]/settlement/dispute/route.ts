import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser } from '@/lib/auth'
import { disputeSettlement, SettlementServiceError } from '@/server/modules/settlements/service'

const disputeSchema = z.object({
  note: z.string().trim().min(10, 'Describe the problem in at least 10 characters').max(500),
})

// POST /api/orders/[id]/settlement/dispute — either party flags the declared
// settlement as wrong (wrong amount, no money received…). An admin resolves.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { id } = await ctx.params
    const parsed = disputeSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const settlement = await disputeSettlement(user.id, user.role, id, parsed.data.note)
    return NextResponse.json({ settlement })
  } catch (err) {
    if (err instanceof SettlementServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('settlement dispute error', err)
    return NextResponse.json({ error: 'Failed to dispute settlement' }, { status: 500 })
  }
}
