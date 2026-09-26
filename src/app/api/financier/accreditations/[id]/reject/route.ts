import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { decideAccreditation } from '@/server/modules/financing/accreditation'
import { FinancingError } from '@/server/modules/financing/shared'

// POST /api/financier/accreditations/[id]/reject — reject with a note.
const schema = z.object({ note: z.string().trim().min(3).max(500) })

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:reject', { limit: 30, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'A rejection note is required' }, { status: 400 })
    }
    const request = await decideAccreditation(user.id, id, { action: 'REJECT', note: parsed.data.note })
    return NextResponse.json({ request })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('accreditation reject error', err)
    return NextResponse.json({ error: 'Failed to reject the accreditation request' }, { status: 500 })
  }
}
