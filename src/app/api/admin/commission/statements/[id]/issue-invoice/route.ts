import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import {
  issueCommissionInvoice,
  CommissionServiceError,
} from '@/server/modules/commission/service'

const issueSchema = z.object({
  dueInDays: z.number().int().min(0).max(365).optional(),
})

// POST /api/admin/commission/statements/[id]/issue-invoice — bill a statement:
// creates the CommissionInvoice (CIV-2026-000001), marks the statement ISSUED
// and its obligations INVOICED. PDF downloads from the invoice route.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin('payouts.manage')
  if (error) return error
  try {
    const { id } = await ctx.params
    const parsed = issueSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const invoice = await issueCommissionInvoice(user!.id, id, parsed.data.dueInDays ?? 30)
    return NextResponse.json({ invoice }, { status: 201 })
  } catch (err) {
    if (err instanceof CommissionServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('commission invoice issue error', err)
    return NextResponse.json({ error: 'Failed to issue invoice' }, { status: 500 })
  }
}
