import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { recordConsent } from '@/server/modules/rfq/supplier-financing'
import { RfqServiceError } from '@/server/modules/rfq/service'
import { assertSameOrigin } from '@/lib/http'

const consentSchema = z.object({ note: z.string().trim().max(2000).optional().nullable() })

// POST /api/rfqs/[id]/consent — applicant records consent for the current
// supplier-RFQ version (required before routing / after material revisions).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const parsed = consentSchema.safeParse(body)
    const result = await recordConsent(user!.id, id, parsed.success ? parsed.data.note : null)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof RfqServiceError) {
      return NextResponse.json({ error: err.message, code: 'DENIED' }, { status: err.status })
    }
    console.error('rfq consent POST error', err)
    return NextResponse.json({ error: 'Failed to record consent' }, { status: 500 })
  }
}
