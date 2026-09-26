import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { setServiceAttributes } from '@/server/modules/financing/services'
import { FinancingError } from '@/server/modules/financing/shared'

// POST /api/financier/services/[id]/attributes — replace the text bullets of
// one kind (FEATURE | ELIGIBILITY_CONDITION). Position = array order.
const schema = z.object({
  kind: z.enum(['FEATURE', 'ELIGIBILITY_CONDITION']),
  texts: z.array(z.string().trim().max(300)).max(30),
})

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
      return NextResponse.json({ error: 'Invalid attributes payload', details: parsed.error.flatten() }, { status: 400 })
    }
    const service = await setServiceAttributes(user.id, id, parsed.data.kind, parsed.data.texts)
    return NextResponse.json({ service })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier attributes error', err)
    return NextResponse.json({ error: 'Failed to update the service attributes' }, { status: 500 })
  }
}
