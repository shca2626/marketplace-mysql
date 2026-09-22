import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { createDispute, listMyDisputes, DisputeServiceError } from '@/server/modules/rfq/disputes'

// GET /api/disputes — my disputes (raised by me; sellers also get against-me)
export async function GET() {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const data = await listMyDisputes(user!.id, user!.role)
    return NextResponse.json(data)
  } catch (err) {
    if (err instanceof DisputeServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('disputes GET error', err)
    return NextResponse.json({ error: 'Failed to load disputes' }, { status: 500 })
  }
}

const createSchema = z.object({
  orderId: z.string().min(1),
  sellerId: z.string().optional().nullable(),
  reason: z.string().min(1).max(32),
  description: z.string().trim().min(10, 'Describe the issue (at least 10 characters)').max(4000),
  amount: z.number().min(0).max(10_000_000).optional().nullable(),
})

// POST /api/disputes — buyer opens a dispute on an order
export async function POST(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'disputes:create', { limit: 10, windowMs: 60_000 })
  if (rl) return rl

  try {
    const parsed = createSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid dispute payload' },
        { status: 400 }
      )
    }
    const dispute = await createDispute(parsed.data, { id: user!.id, role: user!.role })
    return NextResponse.json({ dispute }, { status: 201 })
  } catch (err) {
    if (err instanceof DisputeServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('disputes POST error', err)
    return NextResponse.json({ error: 'Failed to open dispute' }, { status: 500 })
  }
}
