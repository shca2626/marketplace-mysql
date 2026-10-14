import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { financingError } from '@/server/modules/financing/catalog'
import { adminMarkFee } from '@/server/modules/financing/agreements'

// PATCH /api/admin/financing/fees/[id] — { action: 'invoice' | 'mark-paid' |
// 'waive' } (the platform's money is collected externally — this only tracks).

const actionSchema = z.object({
  action: z.enum(['invoice', 'mark-paid', 'waive']),
})

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin('financing.fees.manage')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:financing', { limit: 60, windowMs: 60_000 }, user!.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const parsed = actionSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
    const actionMap = { invoice: 'MARK_INVOICED', 'mark-paid': 'MARK_PAID', waive: 'WAIVE' } as const
    const result = await adminMarkFee(user!.id, id, actionMap[parsed.data.action])
    return NextResponse.json(result)
  } catch (err) {
    const svc = financingError(err)
    if (svc) return NextResponse.json({ error: svc.message }, { status: svc.status })
    console.error('admin fee PATCH error', err)
    return NextResponse.json({ error: 'Failed to update fee' }, { status: 500 })
  }
}
