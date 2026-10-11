import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser } from '@/lib/auth'
import { addSettlementEvidence, SettlementServiceError } from '@/server/modules/settlements/service'

const evidenceSchema = z.object({
  mediaKeys: z.array(z.string().max(180)).min(1, 'Upload at least one document').max(10),
})

// POST /api/orders/[id]/settlement/evidence — attach proof documents (bank
// transfer slips, statements, supplier invoices) uploaded through
// /api/uploads/document to the order's external settlement record.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { id } = await ctx.params
    const parsed = evidenceSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const settlement = await addSettlementEvidence(user.id, user.role, id, parsed.data.mediaKeys)
    return NextResponse.json({ settlement }, { status: 201 })
  } catch (err) {
    if (err instanceof SettlementServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('settlement evidence error', err)
    return NextResponse.json({ error: 'Failed to attach evidence' }, { status: 500 })
  }
}
