import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin } from '@/lib/http'
import {
  SubscriptionServiceError,
  attemptRenewal,
  cancelSubscription,
  forceDowngrade,
  subscribeOrg,
} from '@/server/modules/subscriptions/service'

// POST /api/admin/subscriptions/[orgId] — the admin state machine for one
// seller-org subscription (Phase 11.2). Action-based:
//   subscribe       {planKey, trialDays?}  → subscribe (writes invoice + ledger fee)
//   renew           {}                     → simulated successful renewal (PAID invoice)
//   fail-renewal    {}                     → simulated failed renewal (GRACE + FAILED invoice)
//   cancel          {reason}               → CANCELLED (reason required)
//   force-downgrade {}                     → DOWNGRADED now (paid modules OFF, limits re-clamp)
//   comp            {planKey}              → complimentary grant (no invoice, no fee)
// Guard: payouts.manage (every mutation through the monetization console family).
const actionSchema = z
  .object({
    action: z.enum(['subscribe', 'renew', 'fail-renewal', 'cancel', 'force-downgrade', 'comp']),
    planKey: z.string().min(1).max(40).optional(),
    reason: z.string().trim().max(1000).optional(),
    trialDays: z.number().int().min(1).max(90).optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.action === 'subscribe' || v.action === 'comp') && !v.planKey) {
      ctx.addIssue({ code: 'custom', message: 'planKey is required for subscribe/comp' })
    }
    if (v.action === 'cancel' && !v.reason?.trim()) {
      ctx.addIssue({ code: 'custom', message: 'A cancellation reason is required' })
    }
  })

export async function POST(req: NextRequest, ctx: { params: Promise<{ orgId: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdmin('payouts.manage')
  if (error) return error
  try {
    const { orgId } = await ctx.params
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 })
    }
    const parsed = actionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const { action, planKey, reason, trialDays } = parsed.data

    let subscription
    switch (action) {
      case 'subscribe':
        subscription = await subscribeOrg(orgId, planKey!, { trialDays, actorId: user!.id })
        break
      case 'renew':
        subscription = await attemptRenewal(orgId, true, user!.id)
        break
      case 'fail-renewal':
        subscription = await attemptRenewal(orgId, false, user!.id)
        break
      case 'cancel':
        subscription = await cancelSubscription(orgId, reason!.trim(), user!.id)
        break
      case 'force-downgrade':
        subscription = await forceDowngrade(orgId, user!.id)
        break
      case 'comp':
        subscription = await subscribeOrg(orgId, planKey!, { complimentary: true, actorId: user!.id })
        break
    }
    return NextResponse.json({ subscription })
  } catch (err) {
    if (err instanceof SubscriptionServiceError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    }
    console.error('admin subscription action error', err)
    return NextResponse.json({ error: 'Subscription action failed' }, { status: 500 })
  }
}
