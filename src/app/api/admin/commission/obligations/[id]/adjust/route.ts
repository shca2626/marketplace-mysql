import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import {
  adjustCommissionObligation,
  CommissionServiceError,
} from '@/server/modules/commission/service'

const adjustSchema = z.object({
  action: z.enum(['WAIVE', 'WRITE_OFF']),
  reason: z.string().trim().max(500).optional(),
})

// POST /api/admin/commission/obligations/[id]/adjust — waive or write off an
// obligation (goodwill / uncollectable).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin()
  if (error) return error
  try {
    const { id } = await ctx.params
    const parsed = adjustSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const obligation = await adjustCommissionObligation(user!.id, id, parsed.data.action, parsed.data.reason)
    return NextResponse.json({
      obligation: {
        id: obligation.id,
        status: obligation.status,
        note: obligation.note,
      },
    })
  } catch (err) {
    if (err instanceof CommissionServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('commission adjust error', err)
    return NextResponse.json({ error: 'Failed to adjust obligation' }, { status: 500 })
  }
}
