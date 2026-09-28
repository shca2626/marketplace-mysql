import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { getPublicServiceDetail } from '@/server/modules/financing/services'
import { FinancingError } from '@/server/modules/financing/shared'

// GET /api/financing/services/[id] — public service detail: terms + text
// attributes + coverage. The composed requirements are a LABELS-ONLY preview
// and only for signed-in users (the real checklist is generated per request).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await getSessionUser()
    const service = await getPublicServiceDetail(id, user ? { userId: user.id } : null)
    return NextResponse.json({ service })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financing service detail GET error', err)
    return NextResponse.json({ error: 'Failed to load the service' }, { status: 500 })
  }
}
