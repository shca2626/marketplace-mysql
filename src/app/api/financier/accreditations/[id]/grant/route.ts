import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { decideAccreditation } from '@/server/modules/financing/accreditation'
import { FinancingError } from '@/server/modules/financing/shared'

// POST /api/financier/accreditations/[id]/grant — grant the accreditation:
// ACCREDITED + accreditedAt + validUntil (explicit → service → settings).
const schema = z.object({
  note: z.string().trim().max(500).nullable().optional(),
  validMonths: z.number().int().min(1).max(60).optional(),
})

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:grant', { limit: 30, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    let body: z.infer<typeof schema> = {}
    try {
      body = schema.parse(await req.json())
    } catch {
      body = {}
    }
    const request = await decideAccreditation(user.id, id, {
      action: 'GRANT',
      note: body.note,
      validMonths: body.validMonths,
    })
    return NextResponse.json({ request })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('accreditation grant error', err)
    return NextResponse.json({ error: 'Failed to grant the accreditation' }, { status: 500 })
  }
}
