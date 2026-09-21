import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { withdrawQuote, RfqServiceError } from '@/server/modules/rfq/service'

// POST /api/quotes/[id]/withdraw — issuing seller (or admin) pulls an open
// SENT quote off the table. Completes the quote lifecycle: SENT → WITHDRAWN.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    const quote = await withdrawQuote(id, user!)
    return NextResponse.json({ quote })
  } catch (err) {
    if (err instanceof RfqServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('quote withdraw error', err)
    return NextResponse.json({ error: 'Failed to withdraw quote' }, { status: 500 })
  }
}
