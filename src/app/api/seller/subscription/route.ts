import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import {
  getEffectiveSubscription,
  getOrgLimits,
  listPlans,
  subscriptionCeilingForOrg,
} from '@/server/modules/subscriptions/service'

// GET /api/seller/subscription — the signed-in seller's own subscription home
// (Phase 11.2): current plan, the ceiling-entitlement map, effective limits and
// live usage counts, plus the active plans available to switch to.
//
// The caller's org is resolved from their SellerProfile — a seller can never
// read another org's subscription through this route.

export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Please sign in first' }, { status: 401 })
    if (user.role !== 'SELLER')
      return NextResponse.json({ error: 'Seller account required' }, { status: 403 })

    const profile = await db.sellerProfile.findFirst({
      where: { ownerUserId: user.id },
      select: { organizationId: true, organization: { select: { name: true } } },
    })
    if (!profile) {
      return NextResponse.json(
        { error: 'Your seller account has no organization yet — the free tier applies.', code: 'NO_SELLER_ORG' },
        { status: 404 }
      )
    }
    const orgId = profile.organizationId

    const [subscription, limits, ceiling, memberCount, activeOffers, plans] = await Promise.all([
      getEffectiveSubscription(orgId),
      getOrgLimits(orgId),
      subscriptionCeilingForOrg(orgId),
      db.organizationMember.count({ where: { organizationId: orgId } }),
      db.productOffer.count({ where: { sellerOrgId: orgId, status: 'ACTIVE' } }),
      listPlans(),
    ])

    // The org's non-archived products: any listing owned by a member of this org.
    const productCount = await db.product.count({
      where: {
        status: { not: 'ARCHIVED' },
        seller: { memberships: { some: { organizationId: orgId } } },
      },
    })

    // Entitlement map against the gated universe (modules claimed by ANY
    // active plan): exactly what the resolver clamps against.
    const gatedModules = (ceiling?.gated ?? [])
      .slice()
      .sort()
      .map((key) => ({ key, entitled: ceiling?.entitled.has(key) ?? true }))

    const availablePlans = plans
      .filter((p) => p.isActive)
      .map((p) => ({
        key: p.key,
        name: p.name,
        description: p.description,
        priceMonthly: p.priceMonthly,
        currency: p.currency,
        modules: p.modules,
        limits: p.limits,
      }))

    // The effective tier: the sub's plan when entitled, else free.
    const entitled = subscription && ['TRIALING', 'ACTIVE', 'GRACE'].includes(subscription.status)
    const effectivePlanKey = entitled ? subscription!.planKey : 'free'
    const effectivePlanName = entitled ? subscription!.planName : plans.find((p) => p.key === 'free')?.name ?? 'Free'

    return NextResponse.json({
      organizationId: orgId,
      organizationName: profile.organization.name,
      subscription,
      effectivePlanKey,
      effectivePlanName,
      limits,
      gatedModules,
      usage: { products: productCount, members: memberCount, activeOffers },
      availablePlans,
    })
  } catch (err) {
    console.error('seller subscription GET error', err)
    return NextResponse.json({ error: 'Failed to load your subscription' }, { status: 500 })
  }
}
