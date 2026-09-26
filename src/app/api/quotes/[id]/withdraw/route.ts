import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { withdrawQuote, RfqServiceError } from '@/server/modules/rfq/service'
import { assertSameOrigin } from '@/lib/http'

// POST /api/quotes/[id]/withdraw — issuing seller (or admin) pulls an open
// SENT quote off the table. Completes the quote lifecycle: SENT → WITHDRAWN.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

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
