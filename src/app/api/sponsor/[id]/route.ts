import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { assertSameOrigin } from '@/lib/http'
import { cancelSponsorship, SponsorshipError } from '@/server/modules/sponsorships/service'

// PATCH /api/sponsor/[id] — cancel an ACTIVE placement (sponsoring org
// OWNER/ADMIN only, verified inside the service). Cancelling stops the boost
// immediately; the ledger row stands (admin-side reversal available).
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    await cancelSponsorship(user.id, id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof SponsorshipError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    console.error('sponsor PATCH error', err)
    return NextResponse.json({ error: 'Failed to cancel sponsorship' }, { status: 500 })
  }
}
