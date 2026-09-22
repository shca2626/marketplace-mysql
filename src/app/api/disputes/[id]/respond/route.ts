import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { respondToDispute, DisputeServiceError } from '@/server/modules/rfq/disputes'

// POST /api/disputes/[id]/respond — the disputed seller posts their response.

const respondSchema = z.object({
  response: z.string().trim().min(10, 'Write a proper response (at least 10 characters)').max(4000),
})

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'disputes:respond', { limit: 20, windowMs: 60_000 })
  if (rl) return rl

  try {
    const parsed = respondSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid response' },
        { status: 400 }
      )
    }
    const { id } = await ctx.params
    const dispute = await respondToDispute(id, { id: user!.id, role: user!.role }, parsed.data.response)
    return NextResponse.json({ dispute })
  } catch (err) {
    if (err instanceof DisputeServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('dispute respond error', err)
    return NextResponse.json({ error: 'Failed to respond' }, { status: 500 })
  }
}
