import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { respondToQuote, RfqServiceError } from '@/server/modules/rfq/service'
import { ApprovalServiceError } from '@/server/modules/approvals/service'
import { assertSameOrigin } from '@/lib/http'

// POST /api/quotes/[id]/accept — requester accepts an open, unexpired quote.
// Sibling quotes are auto-declined and the RFQ closes as ACCEPTED. BUYER-role
// members of an org with an approval threshold route the acceptance to their
// approvers instead (pendingApproval: true in the response).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    const result = await respondToQuote(id, user!.id, 'ACCEPT')
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof RfqServiceError || err instanceof ApprovalServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('quote accept error', err)
    return NextResponse.json({ error: 'Failed to accept quote' }, { status: 500 })
  }
}
