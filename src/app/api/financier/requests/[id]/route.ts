import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { financierGetRequest } from '@/server/modules/financing/requests'
import { FinancingError } from '@/server/modules/financing/shared'

// GET /api/financier/requests/[id] — forwarded request detail incl. the full
// checklist with platform verdicts (the gate's work is visible to the
// financier — that is the point of the platform) + all offers.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    const request = await financierGetRequest(user.id, id)
    return NextResponse.json({ request })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier request detail error', err)
    return NextResponse.json({ error: 'Failed to load the request' }, { status: 500 })
  }
}
