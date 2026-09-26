import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { financierDeclineRequest } from '@/server/modules/financing/requests'
import { FinancingError } from '@/server/modules/financing/shared'

// POST /api/financier/requests/[id]/decline — the financier declines the
// application with a note (notes ride AuditLog + notification — DP-15).
const schema = z.object({ note: z.string().trim().min(3).max(1000) })

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:decline', { limit: 30, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'A decline note is required' }, { status: 400 })
    }
    const request = await financierDeclineRequest(user.id, id, parsed.data.note)
    return NextResponse.json({ request })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier decline error', err)
    return NextResponse.json({ error: 'Failed to decline the request' }, { status: 500 })
  }
}
