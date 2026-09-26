import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { getRfq, rfqTransition, RfqServiceError } from '@/server/modules/rfq/service'
import { assertSameOrigin } from '@/lib/http'

const actionSchema = z.object({
  action: z.enum(['SUBMIT', 'CANCEL', 'REVIEW', 'REJECT']),
})

// GET /api/rfqs/[id] — RFQ detail with quotes (requester/admin/involved seller)
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    const rfq = await getRfq(id, user!)
    return NextResponse.json({ rfq })
  } catch (err) {
    if (err instanceof RfqServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('rfq GET error', err)
    return NextResponse.json({ error: 'Failed to load RFQ' }, { status: 500 })
  }
}

// PATCH /api/rfqs/[id] — lifecycle transitions (SUBMIT/CANCEL by requester; REVIEW/REJECT by admin)
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    const body = await req.json()
    const parsed = actionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
    const rfq = await rfqTransition(id, user!, parsed.data.action)
    return NextResponse.json({ rfq })
  } catch (err) {
    if (err instanceof RfqServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('rfq PATCH error', err)
    return NextResponse.json({ error: 'Failed to update RFQ' }, { status: 500 })
  }
}
