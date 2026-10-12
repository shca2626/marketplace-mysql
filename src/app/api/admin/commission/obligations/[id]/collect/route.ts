import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import {
  recordCommissionCollection,
  CommissionServiceError,
} from '@/server/modules/commission/service'

const collectSchema = z.object({
  amount: z.number().positive('Collected amount must be positive'),
  note: z.string().trim().max(500).optional(),
})

// POST /api/admin/commission/obligations/[id]/collect — record money the
// platform received against a commission obligation (full or partial).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin('payouts.manage')
  if (error) return error
  try {
    const { id } = await ctx.params
    const parsed = collectSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const obligation = await recordCommissionCollection(user!.id, id, parsed.data.amount, parsed.data.note)
    return NextResponse.json({
      obligation: {
        id: obligation.id,
        status: obligation.status,
        collectedAmount: Number(obligation.collectedAmount),
        amount: Number(obligation.amount),
      },
    })
  } catch (err) {
    if (err instanceof CommissionServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('commission collect error', err)
    return NextResponse.json({ error: 'Failed to record collection' }, { status: 500 })
  }
}
