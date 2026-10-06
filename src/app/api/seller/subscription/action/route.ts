import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import {
  SubscriptionServiceError,
  cancelSubscription,
  subscribeOrg,
} from '@/server/modules/subscriptions/service'

// POST /api/seller/subscription/action — the seller's self-service actions
// (Phase 11.2):
//   change-plan {planKey} → subscribe to another active plan (a paid switch
//                          writes a PAID invoice + SUBSCRIPTION_RENEWAL ledger fee)
//   cancel      {reason}  → stop the subscription; entitlements drop to the
//                          free tier at the effective resolution.
// The org is always the CALLER's SellerProfile org — never a parameter.

const actionSchema = z
  .object({
    action: z.enum(['change-plan', 'cancel']),
    planKey: z.string().min(1).max(40).optional(),
    reason: z.string().trim().max(1000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.action === 'change-plan' && !v.planKey) {
      ctx.addIssue({ code: 'custom', message: 'planKey is required to change plan' })
    }
    if (v.action === 'cancel' && !v.reason?.trim()) {
      ctx.addIssue({ code: 'custom', message: 'Please tell us why you are cancelling' })
    }
  })

export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Please sign in first' }, { status: 401 })
    if (user.role !== 'SELLER')
      return NextResponse.json({ error: 'Seller account required' }, { status: 403 })

    const rl = enforceRateLimit(req, 'sellerSubscriptionAction', { limit: 20, windowMs: 10 * 60_000 }, user.id)
    if (rl) return rl

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

    const profile = await db.sellerProfile.findFirst({
      where: { ownerUserId: user.id },
      select: { organizationId: true },
    })
    if (!profile) {
      return NextResponse.json(
        { error: 'Your seller account has no organization yet — the free tier applies.', code: 'NO_SELLER_ORG' },
        { status: 404 }
      )
    }

    const { action, planKey, reason } = parsed.data
    const subscription =
      action === 'change-plan'
        ? await subscribeOrg(profile.organizationId, planKey!, { actorId: user.id })
        : await cancelSubscription(profile.organizationId, reason!.trim(), user.id)

    return NextResponse.json({ subscription })
  } catch (err) {
    if (err instanceof SubscriptionServiceError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    }
    console.error('seller subscription action error', err)
    return NextResponse.json({ error: 'Subscription action failed' }, { status: 500 })
  }
}
