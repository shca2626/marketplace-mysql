import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { requireFinancierContext, FinancingError } from '@/server/modules/financing/shared'
import { listLimits, setLimit } from '@/server/modules/financing/limits'

// GET /api/financier/limits — the underwriting limit matrix (all scopes).
export async function GET() {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const limits = await listLimits(user.id)
    return NextResponse.json({ limits })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier limits GET error', err)
    return NextResponse.json({ error: 'Failed to load the underwriting limits' }, { status: 500 })
  }
}

const putSchema = z.object({
  scope: z.enum(['ORG', 'BRANCH', 'USER']),
  branchId: z.string().nullable().optional(),
  userId: z.string().nullable().optional(),
  maxAmount: z.number().positive().max(1_000_000_000),
  currency: z.string().length(3).optional(),
})

// PUT /api/financier/limits — upsert one limit row (deterministic scopeKey).
// Institution OWNER/ADMIN only; audited. Removing a limit is not supported
// yet (schema note in the worklog) — raise it to unblock underwriters.
export async function PUT(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:limits', { limit: 40, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl

  try {
    await requireFinancierContext(user.id)
    const parsed = putSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid limit payload', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const limits = await setLimit(user.id, parsed.data)
    return NextResponse.json({ limits })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier limits PUT error', err)
    return NextResponse.json({ error: 'Failed to set the underwriting limit' }, { status: 500 })
  }
}
