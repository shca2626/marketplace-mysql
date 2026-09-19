import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { respondToQuote, RfqServiceError } from '@/server/modules/rfq/service'

// POST /api/quotes/[id]/accept — requester accepts an open, unexpired quote.
// Sibling quotes are auto-declined and the RFQ closes as ACCEPTED.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    const result = await respondToQuote(id, user!.id, 'ACCEPT')
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof RfqServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('quote accept error', err)
    return NextResponse.json({ error: 'Failed to accept quote' }, { status: 500 })
  }
}
