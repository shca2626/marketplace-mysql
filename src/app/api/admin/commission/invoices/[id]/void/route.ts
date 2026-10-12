import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import {
  voidCommissionInvoice,
  CommissionServiceError,
} from '@/server/modules/commission/service'

const voidSchema = z.object({
  reason: z.string().trim().max(500).optional(),
})

// POST /api/admin/commission/invoices/[id]/void — void an issued (unpaid)
// commission invoice.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin('payouts.manage')
  if (error) return error
  try {
    const { id } = await ctx.params
    const parsed = voidSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const invoice = await voidCommissionInvoice(user!.id, id, parsed.data.reason)
    return NextResponse.json({ invoice: { id: invoice.id, status: invoice.status } })
  } catch (err) {
    if (err instanceof CommissionServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('commission invoice void error', err)
    return NextResponse.json({ error: 'Failed to void invoice' }, { status: 500 })
  }
}
