import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import {
  generateCommissionStatement,
  CommissionServiceError,
} from '@/server/modules/commission/service'

const generateSchema = z.object({
  sellerId: z.string().min(1, 'Select a supplier'),
})

// POST /api/admin/commission/statements/generate — group a seller's ungrouped
// PENDING obligations into a period statement (CS-2026-000001).
export async function POST(req: NextRequest) {
  const { user, error } = await requireAdmin('payouts.manage')
  if (error) return error
  try {
    const parsed = generateSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const statement = await generateCommissionStatement(user!.id, parsed.data.sellerId)
    return NextResponse.json({ statement }, { status: 201 })
  } catch (err) {
    if (err instanceof CommissionServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('commission statement generate error', err)
    return NextResponse.json({ error: 'Failed to generate statement' }, { status: 500 })
  }
}
