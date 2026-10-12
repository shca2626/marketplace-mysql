import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import {
  cancelCommissionStatement,
  CommissionServiceError,
} from '@/server/modules/commission/service'

const cancelSchema = z.object({
  reason: z.string().trim().max(500).optional(),
})

// POST /api/admin/commission/statements/[id]/cancel — release the statement's
// obligations back to ungrouped PENDING (mirrors payout cancellation).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin('payouts.manage')
  if (error) return error
  try {
    const { id } = await ctx.params
    const parsed = cancelSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const statement = await cancelCommissionStatement(user!.id, id, parsed.data.reason)
    return NextResponse.json({ statement })
  } catch (err) {
    if (err instanceof CommissionServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('commission statement cancel error', err)
    return NextResponse.json({ error: 'Failed to cancel statement' }, { status: 500 })
  }
}
