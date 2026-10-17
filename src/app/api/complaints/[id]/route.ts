import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { assertSameOrigin } from '@/lib/http'
import {
  ComplaintError,
  respondToComplaint,
  withdrawComplaint,
} from '@/server/modules/complaints/service'

// PATCH /api/complaints/[id] — complainant withdraws (OPEN only) or the
// target organization posts its single response.
//   { action: 'withdraw' }
//   { action: 'respond', organizationId, message }   // organizationId = the
//     caller's own org (server-verified member + org.offers.manage/OWNER/ADMIN)
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    const body = (await req.json()) as { action?: string; organizationId?: string; message?: string }

    if (body.action === 'withdraw') {
      const complaint = await withdrawComplaint(user.id, id)
      return NextResponse.json({ complaint })
    }
    if (body.action === 'respond') {
      if (!body.organizationId) {
        return NextResponse.json({ error: 'organizationId is required to respond' }, { status: 400 })
      }
      const complaint = await respondToComplaint(user.id, body.organizationId, id, body.message ?? '')
      return NextResponse.json({ complaint })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    if (err instanceof ComplaintError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    console.error('complaint PATCH error', err)
    return NextResponse.json({ error: 'Failed to update complaint' }, { status: 500 })
  }
}
