import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import {
  ComplaintError,
  createComplaint,
  getFilingContext,
  listMyComplaints,
} from '@/server/modules/complaints/service'

// GET /api/complaints — the buyer-side Complaints console: everything the user
// filed (personally or on behalf of their orgs) + the filing context (companies
// they transacted with, their orders, the category list).
export async function GET() {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const [complaints, context] = await Promise.all([listMyComplaints(user.id), getFilingContext(user.id)])
    return NextResponse.json({ complaints, context })
  } catch (err) {
    if (err instanceof ComplaintError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    console.error('complaints GET error', err)
    return NextResponse.json({ error: 'Failed to load complaints' }, { status: 500 })
  }
}

// POST /api/complaints — file a complaint against a company.
//   { targetOrgId, category, subject, body, orderId?, productId?, raisedByOrgId? }
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const rl = enforceRateLimit(req, 'complaint', RATE_LIMITS.complaint, user.id)
    if (rl) return rl

    const body = (await req.json()) as {
      targetOrgId?: string
      category?: string
      subject?: string
      body?: string
      orderId?: string | null
      productId?: string | null
      raisedByOrgId?: string | null
    }
    const complaint = await createComplaint({
      userId: user.id,
      targetOrgId: body.targetOrgId ?? '',
      category: body.category ?? '',
      subject: body.subject ?? '',
      body: body.body ?? '',
      orderId: body.orderId || null,
      productId: body.productId || null,
      raisedByOrgId: body.raisedByOrgId || null,
    })
    return NextResponse.json({ complaint }, { status: 201 })
  } catch (err) {
    if (err instanceof ComplaintError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    console.error('complaints POST error', err)
    return NextResponse.json({ error: 'Failed to file complaint' }, { status: 500 })
  }
}
