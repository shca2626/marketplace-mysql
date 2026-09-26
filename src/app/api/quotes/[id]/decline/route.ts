import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { respondToQuote, RfqServiceError } from '@/server/modules/rfq/service'
import { assertSameOrigin } from '@/lib/http'

// POST /api/quotes/[id]/decline — requester declines a quote (others stay open)
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    const result = await respondToQuote(id, user!.id, 'DECLINE')
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof RfqServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('quote decline error', err)
    return NextResponse.json({ error: 'Failed to decline quote' }, { status: 500 })
  }
}
