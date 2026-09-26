import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { setServiceCoverage } from '@/server/modules/financing/services'
import { FinancingError } from '@/server/modules/financing/shared'

// POST /api/financier/services/[id]/coverage — replace the coverage regions
// (free strings, normalized + deduped — DP-16).
const schema = z.object({ regions: z.array(z.string().trim().max(120)).max(60) })

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:services', { limit: 60, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid coverage payload', details: parsed.error.flatten() }, { status: 400 })
    }
    const service = await setServiceCoverage(user.id, id, parsed.data.regions)
    return NextResponse.json({ service })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier coverage error', err)
    return NextResponse.json({ error: 'Failed to update the service coverage' }, { status: 500 })
  }
}
