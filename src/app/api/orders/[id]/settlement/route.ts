import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser } from '@/lib/auth'
import {
  declareSettlement,
  getSettlementForOrder,
  SettlementServiceError,
  updateSettlementDeclaration,
} from '@/server/modules/settlements/service'

const declareSchema = z.object({
  method: z.enum(['WIRE', 'TRANSFER', 'CHEQUE', 'CASH', 'OTHER']),
  reference: z.string().trim().max(160).optional().nullable(),
  settledAt: z.string().datetime().optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
  evidenceKeys: z.array(z.string().max(180)).max(10).optional(),
})

const updateSchema = z.object({
  method: z.enum(['WIRE', 'TRANSFER', 'CHEQUE', 'CASH', 'OTHER']).optional(),
  reference: z.string().trim().max(160).optional().nullable(),
  settledAt: z.string().datetime().optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
})

// GET /api/orders/[id]/settlement — the external settlement record (sidecar).
// Buyer, a participating supplier, or an admin.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { id } = await ctx.params
    const settlement = await getSettlementForOrder(id, { userId: user.id, role: user.role })
    return NextResponse.json({ settlement })
  } catch (err) {
    if (err instanceof SettlementServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('settlement GET error', err)
    return NextResponse.json({ error: 'Failed to load settlement' }, { status: 500 })
  }
}

// POST /api/orders/[id]/settlement — declare the external settlement for an
// order (buyer or participating supplier; the counterpart confirms).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { id } = await ctx.params
    const parsed = declareSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const settlement = await declareSettlement(user.id, user.role, id, parsed.data)
    return NextResponse.json({ settlement }, { status: 201 })
  } catch (err) {
    if (err instanceof SettlementServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('settlement POST error', err)
    return NextResponse.json({ error: 'Failed to declare settlement' }, { status: 500 })
  }
}

// PATCH /api/orders/[id]/settlement — edit the declaration (declarer/admin,
// while still DECLARED).
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { id } = await ctx.params
    const parsed = updateSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const settlement = await updateSettlementDeclaration(user.id, user.role, id, parsed.data)
    return NextResponse.json({ settlement })
  } catch (err) {
    if (err instanceof SettlementServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('settlement PATCH error', err)
    return NextResponse.json({ error: 'Failed to update settlement' }, { status: 500 })
  }
}
