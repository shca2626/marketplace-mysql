import { db } from '@/lib/db'
import { assessFee } from '@/server/modules/fees/service'
import { recordAudit } from '@/server/modules/audit/service'
import { nextNumber } from '@/server/modules/sequences/service'

/** Audit helper — seller-subscription events are non-sensitive telemetry. */
async function audit(
  action: string,
  entityId: string,
  metadata: Record<string, unknown>,
  actorId?: string
) {
  try {
    await recordAudit({
      actorId: actorId ?? null,
      actorType: 'ADMIN',
      action,
      entityType: 'SellerSubscription',
      entityId,
      metadata,
    })
  } catch (e) {
    console.error('[subscriptions] audit write failed', e)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SELLER SUBSCRIPTIONS — Phase 11.2 (lastplan v5 §11): ceiling semantics on the
// 7.0 seller-org tenant.
//
// The subscription attaches to the SELLER ORGANIZATION (the org that has a
// SellerProfile). It is a CEILING, never a floor:
//
//   entitlement = subscriptionAllows(module) AND (ORG override OR ORG_TYPE
//                 default OR PLATFORM default)
//
// An organization module flip can turn a paid module OFF; it can NEVER turn
// it ON beyond what the subscription entitles. Modules not claimed by any
// plan bundle are never subscription-gated (financier modules, buyer modules
// outside plan bundles, core modules).
//
// Status machine:
//   TRIALING / ACTIVE ──renewal fails──▶ GRACE (still entitled, warnings)
//   GRACE ──graceEndsAt passes──▶ DOWNGRADED (paid modules OFF, limits
//   re-clamped to the free tier, data preserved). CANCELLED = explicit stop.
//   getEffectiveSubscription() self-heals an expired GRACE → DOWNGRADED with
//   one audited transition on read.
//
// Renewal math writes a SubscriptionInvoice + a SUBSCRIPTION_RENEWAL
// FeeAssessment on the immutable 11.1 ledger (PAID) or a FAILED invoice (GRACE).
// ─────────────────────────────────────────────────────────────────────────────

export const SUBSCRIPTION_STATUSES = ['TRIALING', 'ACTIVE', 'GRACE', 'DOWNGRADED', 'CANCELLED'] as const
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]

export const ENTITLED_STATUSES: SubscriptionStatus[] = ['TRIALING', 'ACTIVE', 'GRACE']
export const DEFAULT_GRACE_DAYS = 7

export class SubscriptionServiceError extends Error {
  status: number
  code?: string
  constructor(message: string, status = 400, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

type PrismaTx = Parameters<Parameters<typeof db.$transaction>[0]>[0]
type DbLike = PrismaTx | typeof db

// ── plan cache (module ceiling resolution is on the hot path) ────────────────

const PLAN_TTL_MS = 30_000

interface PlanCacheEntry {
  plans: { key: string; priceMonthly: number; currency: string; modules: string[]; limits: Record<string, number | null>; isActive: boolean }[]
  expiresAt: number
}

const globalForSubs = globalThis as unknown as {
  __vendoraPlanCache?: PlanCacheEntry
}

async function loadPlansCached() {
  const cached = globalForSubs.__vendoraPlanCache
  if (cached && cached.expiresAt > Date.now()) return cached
  const rows = await db.subscriptionPlan.findMany()
  const plans = rows.map((p) => ({
    key: p.key,
    priceMonthly: p.priceMonthly,
    currency: p.currency,
    modules: safeParseArray(p.modules),
    limits: safeParseRecord(p.limits),
    isActive: p.isActive,
  }))
  const entry: PlanCacheEntry = { plans, expiresAt: Date.now() + PLAN_TTL_MS }
  globalForSubs.__vendoraPlanCache = entry
  return entry
}

function safeParseArray(s: string): string[] {
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}

function safeParseRecord(s: string): Record<string, number | null> {
  try {
    const v = JSON.parse(s) as Record<string, unknown>
    const out: Record<string, number | null> = {}
    for (const [k, val] of Object.entries(v)) {
      out[k] = val === null || val === undefined ? null : Number(val)
    }
    return out
  } catch {
    return {}
  }
}

export function invalidatePlanCache() {
  globalForSubs.__vendoraPlanCache = undefined
}

// ── the ceiling: subscriptionAllows ─────────────────────────────────────────

/**
 * Does the subscription allow module `moduleKey` for seller org `orgId`?
 *
 *  • module not claimed by ANY active plan → true (not subscription-gated)
 *  • org is not a seller tenant (no SellerProfile) → true (ceiling only
 *    attaches to seller organizations — financier/buyer orgs are unaffected)
 *  • effective subscription entitled (TRIALING/ACTIVE/GRACE) → module ∈ plan
 *  • otherwise (DOWNGRADED, CANCELLED, no subscription) → free tier: module
 *    ∈ the free plan's bundle
 */
export async function subscriptionAllows(moduleKey: string, orgId: string | null | undefined): Promise<boolean> {
  if (!orgId) return true
  const ceiling = await subscriptionCeilingForOrg(orgId)
  if (!ceiling) return true
  return ceiling.entitled.has(moduleKey)
}

/**
 * One-shot ceiling resolution for a whole module map (used by
 * modules/service.ts resolveModuleState — the clamp must not cost one query
 * per module):
 *   gated    — every module key claimed by ANY active plan (the gated universe)
 *   entitled — the module keys the org's effective tier entitles
 * Returns null when the ceiling does not apply (org-less context, unknown
 * org, or no plan claims any module).
 */
export async function subscriptionCeilingForOrg(
  orgId: string | null | undefined
): Promise<{ gated: string[]; entitled: Set<string> } | null> {
  if (!orgId) return null
  const { plans } = await loadPlansCached()
  const activePlans = plans.filter((p) => p.isActive)
  if (activePlans.length === 0) return null
  const gated = [...new Set(activePlans.flatMap((p) => p.modules))]
  if (gated.length === 0) return null

  // The ceiling attaches ONLY to seller organizations (the 7.0 tenant).
  const sellerOrg = await db.sellerProfile.findUnique({
    where: { organizationId: orgId },
    select: { organizationId: true },
  })
  if (!sellerOrg) return null

  const sub = await getEffectiveSubscription(orgId)
  const planKey =
    sub && ENTITLED_STATUSES.includes(sub.status as SubscriptionStatus) ? sub.planKey : 'free'
  const plan = activePlans.find((p) => p.key === planKey) ?? activePlans.find((p) => p.key === 'free')
  return { gated, entitled: new Set(plan?.modules ?? []) }
}

// ── effective subscription (self-healing GRACE → DOWNGRADED) ────────────────

export interface EffectiveSubscriptionDTO {
  id: string
  organizationId: string
  organizationName: string
  status: SubscriptionStatus
  planKey: string
  planName: string
  priceMonthly: number
  currency: string
  modules: string[]
  limits: Record<string, number | null>
  currentPeriodStart: string
  currentPeriodEnd: string
  graceEndsAt: string | null
  cancelledAt: string | null
  cancelReason: string | null
  updatedAt: string
}

export async function getEffectiveSubscription(orgId: string): Promise<EffectiveSubscriptionDTO | null> {
  let sub = await db.sellerSubscription.findUnique({
    where: { organizationId: orgId },
    include: { plan: true, organization: { select: { name: true } } },
  })
  if (!sub) return null

  // Self-heal: GRACE past graceEndsAt → DOWNGRADED (one audited transition)
  if (sub.status === 'GRACE' && sub.graceEndsAt && sub.graceEndsAt.getTime() <= Date.now()) {
    sub = await db.sellerSubscription.update({
      where: { id: sub.id },
      data: { status: 'DOWNGRADED', changedById: sub.changedById },
      include: { plan: true, organization: { select: { name: true } } },
    })
    try {
      await recordAudit({
        actorType: 'SYSTEM',
        action: 'SUBSCRIPTION_DOWNGRADED_AUTO',
        entityType: 'SellerSubscription',
        entityId: sub.id,
        metadata: {
          organizationId: orgId,
          organizationName: sub.organization.name,
          planKey: sub.plan.key,
          graceEndsAt: sub.graceEndsAt?.toISOString(),
          reason: 'Grace period expired without successful renewal',
        },
      })
    } catch (e) {
      console.error('[subscriptions] audit write failed on auto-downgrade', e)
    }
  }

  return {
    id: sub.id,
    organizationId: sub.organizationId,
    organizationName: sub.organization.name,
    status: sub.status as SubscriptionStatus,
    planKey: sub.plan.key,
    planName: sub.plan.name,
    priceMonthly: sub.plan.priceMonthly,
    currency: sub.plan.currency,
    modules: safeParseArray(sub.plan.modules),
    limits: safeParseRecord(sub.plan.limits),
    currentPeriodStart: sub.currentPeriodStart.toISOString(),
    currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
    graceEndsAt: sub.graceEndsAt?.toISOString() ?? null,
    cancelledAt: sub.cancelledAt?.toISOString() ?? null,
    cancelReason: sub.cancelReason,
    updatedAt: sub.updatedAt.toISOString(),
  }
}

// ── limits ──────────────────────────────────────────────────────────────────

export const KNOWN_LIMITS = ['maxProducts', 'maxActiveOffers', 'maxUsers'] as const
export type LimitKey = (typeof KNOWN_LIMITS)[number]

/** The effective limits for an org: its plan's, or the free tier's. */
export async function getOrgLimits(orgId: string): Promise<Record<string, number | null>> {
  const { plans } = await loadPlansCached()
  const activePlans = plans.filter((p) => p.isActive)
  const sub = await getEffectiveSubscription(orgId)
  const planKey =
    sub && ENTITLED_STATUSES.includes(sub.status as SubscriptionStatus) ? sub.planKey : 'free'
  const plan = activePlans.find((p) => p.key === planKey) ?? activePlans.find((p) => p.key === 'free')
  return plan?.limits ?? {}
}

/**
 * Fail-closed limit check: throws SUBSCRIPTION_LIMIT_REACHED when a plan
 * limit exists (non-null) and currentCount already sits at it.
 */
export async function assertOrgLimit(orgId: string, limitKey: LimitKey, currentCount: number): Promise<void> {
  const limits = await getOrgLimits(orgId)
  const cap = limits[limitKey]
  if (cap === null || cap === undefined) return // uncapped
  if (currentCount >= cap) {
    const sub = await getEffectiveSubscription(orgId)
    throw new SubscriptionServiceError(
      `Your ${sub?.planName ?? 'current'} plan caps ${limitKey} at ${cap}. Upgrade your subscription to raise this limit.`,
      402,
      'SUBSCRIPTION_LIMIT_REACHED'
    )
  }
}

// ── lifecycle actions ───────────────────────────────────────────────────────

export interface SubscribeOptions {
  trialDays?: number
  actorId?: string
  /** Skip billing (admin grant / migration) — no invoice, no fee. */
  complimentary?: boolean
}

/** Subscribe (or change plan). Paid plans write an invoice + ledger fee. */
export async function subscribeOrg(orgId: string, planKey: string, opts: SubscribeOptions = {}): Promise<EffectiveSubscriptionDTO> {
  const plan = await db.subscriptionPlan.findUnique({ where: { key: planKey } })
  if (!plan || !plan.isActive) throw new SubscriptionServiceError('Plan not found', 404, 'PLAN_NOT_FOUND')

  const sellerOrg = await db.sellerProfile.findUnique({ where: { organizationId: orgId } })
  if (!sellerOrg) throw new SubscriptionServiceError('Only seller organizations can subscribe', 400, 'NOT_A_SELLER_ORG')

  const now = new Date()
  const isTrial = Boolean(opts.trialDays && opts.trialDays > 0 && plan.priceMonthly > 0)
  const periodEnd = isTrial
    ? new Date(now.getTime() + (opts.trialDays ?? 0) * 24 * 3600 * 1000)
    : plan.priceMonthly > 0
      ? new Date(now.getTime() + 30 * 24 * 3600 * 1000)
      : new Date(now.getTime() + 365 * 24 * 3600 * 1000) // free tier: annual tick

  const existing = await db.sellerSubscription.findUnique({ where: { organizationId: orgId } })
  const sub = existing
    ? await db.sellerSubscription.update({
        where: { id: existing.id },
        data: {
          planId: plan.id,
          status: isTrial ? 'TRIALING' : 'ACTIVE',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          graceEndsAt: null,
          cancelledAt: null,
          cancelReason: null,
          changedById: opts.actorId ?? null,
        },
        include: { plan: true, organization: { select: { name: true } } },
      })
    : await db.sellerSubscription.create({
        data: {
          organizationId: orgId,
          planId: plan.id,
          status: isTrial ? 'TRIALING' : 'ACTIVE',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          changedById: opts.actorId ?? null,
        },
        include: { plan: true, organization: { select: { name: true } } },
      })

  // Billing: paid plans that are NOT complimentary/trial write a PAID invoice
  // + a SUBSCRIPTION_RENEWAL FeeAssessment on the immutable ledger.
  if (plan.priceMonthly > 0 && !opts.complimentary && !isTrial) {
    await writeRenewalInvoice(sub.id, orgId, plan.key, plan.name, plan.priceMonthly, plan.currency, now, periodEnd, 'PAID', opts.actorId)
  }

  if (opts.actorId) {
    await audit(existing ? 'SUBSCRIPTION_PLAN_CHANGED' : 'SUBSCRIPTION_CREATED', sub.id, {
      organizationId: orgId,
      planKey: plan.key,
      status: sub.status,
      trial: isTrial,
      complimentary: Boolean(opts.complimentary),
    }, opts.actorId)
  }

  invalidatePlanCache()
  return (await getEffectiveSubscription(orgId))!
}

async function writeRenewalInvoice(
  subscriptionId: string,
  orgId: string,
  planKey: string,
  planName: string,
  amount: number,
  currency: string,
  periodStart: Date,
  periodEnd: Date,
  outcome: 'PAID' | 'FAILED',
  actorId?: string
) {
  const number = await nextNumber('SUB')
  const invoice = await db.subscriptionInvoice.create({
    data: {
      number,
      subscriptionId,
      planKey,
      planName,
      amount,
      currency,
      status: outcome,
      periodStart,
      periodEnd,
      paidAt: outcome === 'PAID' ? new Date() : null,
      failedAt: outcome === 'FAILED' ? new Date() : null,
    },
  })
  if (outcome === 'PAID') {
    // The subscription revenue lands on the immutable fee ledger. No rule
    // resolves for SUBSCRIPTION_RENEWAL by default — the invoice amount IS
    // the revenue, passed as the legacy amount (zero-change semantics).
    await assessFee(
      {
        event: 'SUBSCRIPTION_RENEWAL',
        actorType: 'SELLER',
        actorOrgId: orgId,
        ctx: { orgId },
        baseAmount: amount,
        currency,
        calcInputs: { invoiceNumber: number, planKey, planName, legacyAmount: amount },
        idempotencyKey: `SUBSCRIPTION_RENEWAL:invoice:${invoice.id}`,
        refType: 'SUBSCRIPTION_INVOICE',
        refId: invoice.id,
      },
      undefined,
      null
    )
  }
  return invoice
}

/**
 * Renewal attempt. `succeed` = the charge clears: period extends 30 days, a
 * PAID invoice + ledger fee land. `succeed=false`: a FAILED invoice is
 * appended and the subscription moves to GRACE (graceEndsAt = now + graceDays).
 */
export async function attemptRenewal(orgId: string, succeed: boolean, actorId?: string): Promise<EffectiveSubscriptionDTO> {
  const sub = await db.sellerSubscription.findUnique({
    where: { organizationId: orgId },
    include: { plan: true },
  })
  if (!sub) throw new SubscriptionServiceError('No subscription for this organization', 404, 'NO_SUBSCRIPTION')

  const now = new Date()
  if (succeed) {
    const periodEnd = new Date(now.getTime() + 30 * 24 * 3600 * 1000)
    await db.sellerSubscription.update({
      where: { id: sub.id },
      data: {
        status: 'ACTIVE',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        graceEndsAt: null,
        changedById: actorId ?? null,
      },
    })
    if (sub.plan.priceMonthly > 0) {
      await writeRenewalInvoice(sub.id, orgId, sub.plan.key, sub.plan.name, sub.plan.priceMonthly, sub.plan.currency, now, periodEnd, 'PAID', actorId)
    }
  } else {
    const graceEndsAt = new Date(now.getTime() + (sub.graceDays || DEFAULT_GRACE_DAYS) * 24 * 3600 * 1000)
    await db.sellerSubscription.update({
      where: { id: sub.id },
      data: { status: 'GRACE', graceEndsAt, changedById: actorId ?? null },
    })
    if (sub.plan.priceMonthly > 0) {
      await writeRenewalInvoice(sub.id, orgId, sub.plan.key, sub.plan.name, sub.plan.priceMonthly, sub.plan.currency, now, sub.currentPeriodEnd, 'FAILED', actorId)
    }
  }

  if (actorId) {
    await audit(succeed ? 'SUBSCRIPTION_RENEWED' : 'SUBSCRIPTION_RENEWAL_FAILED', sub.id, {
      organizationId: orgId,
      planKey: sub.plan.key,
    }, actorId)
  }

  return (await getEffectiveSubscription(orgId))!
}

/** Explicit cancellation. Data is preserved; entitlements drop to free tier. */
export async function cancelSubscription(orgId: string, reason: string, actorId?: string): Promise<EffectiveSubscriptionDTO> {
  const sub = await db.sellerSubscription.findUnique({ where: { organizationId: orgId } })
  if (!sub) throw new SubscriptionServiceError('No subscription for this organization', 404, 'NO_SUBSCRIPTION')
  if (!reason.trim()) throw new SubscriptionServiceError('A cancellation reason is required', 400, 'REASON_REQUIRED')

  await db.sellerSubscription.update({
    where: { id: sub.id },
    data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason, changedById: actorId ?? null },
  })
  if (actorId) {
    await audit('SUBSCRIPTION_CANCELLED', sub.id, { organizationId: orgId, reason }, actorId)
  }
  return (await getEffectiveSubscription(orgId))!
}

/** Force the GRACE → DOWNGRADED transition now (admin/test affordance). */
export async function forceDowngrade(orgId: string, actorId?: string): Promise<EffectiveSubscriptionDTO> {
  const sub = await db.sellerSubscription.findUnique({ where: { organizationId: orgId } })
  if (!sub) throw new SubscriptionServiceError('No subscription for this organization', 404, 'NO_SUBSCRIPTION')
  await db.sellerSubscription.update({
    where: { id: sub.id },
    data: { status: 'DOWNGRADED', changedById: actorId ?? null },
  })
  if (actorId) {
    await audit('SUBSCRIPTION_DOWNGRADED_FORCED', sub.id, { organizationId: orgId, planIdBefore: sub.planId }, actorId)
  }
  return (await getEffectiveSubscription(orgId))!
}

// ── admin listing ───────────────────────────────────────────────────────────

export interface SubscriptionListRow extends EffectiveSubscriptionDTO {
  invoiceCount: number
  lastInvoiceAt: string | null
}

export async function listSubscriptions(filter?: { status?: string; q?: string }): Promise<SubscriptionListRow[]> {
  const subs = await db.sellerSubscription.findMany({
    where: {
      ...(filter?.status ? { status: filter.status } : {}),
      ...(filter?.q
        ? { organization: { name: { contains: filter.q } } }
        : {}),
    },
    include: {
      plan: true,
      organization: { select: { name: true } },
      invoices: { orderBy: { createdAt: 'desc' }, take: 20, select: { createdAt: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })
  return subs.map((s) => ({
    id: s.id,
    organizationId: s.organizationId,
    organizationName: s.organization.name,
    status: s.status as SubscriptionStatus,
    planKey: s.plan.key,
    planName: s.plan.name,
    priceMonthly: s.plan.priceMonthly,
    currency: s.plan.currency,
    modules: safeParseArray(s.plan.modules),
    limits: safeParseRecord(s.plan.limits),
    currentPeriodStart: s.currentPeriodStart.toISOString(),
    currentPeriodEnd: s.currentPeriodEnd.toISOString(),
    graceEndsAt: s.graceEndsAt?.toISOString() ?? null,
    cancelledAt: s.cancelledAt?.toISOString() ?? null,
    cancelReason: s.cancelReason,
    updatedAt: s.updatedAt.toISOString(),
    invoiceCount: s.invoices.length,
    lastInvoiceAt: s.invoices[0]?.createdAt.toISOString() ?? null,
  }))
}

// ── plans admin ─────────────────────────────────────────────────────────────

export interface SubscriptionPlanDTO {
  id: string
  key: string
  name: string
  description: string | null
  priceMonthly: number
  currency: string
  modules: string[]
  limits: Record<string, number | null>
  isActive: boolean
  sortOrder: number
  subscriberCount: number
}

export async function listPlans(): Promise<SubscriptionPlanDTO[]> {
  const plans = await db.subscriptionPlan.findMany({
    include: { _count: { select: { subscriptions: true } } },
    orderBy: { sortOrder: 'asc' },
  })
  return plans.map((p) => ({
    id: p.id,
    key: p.key,
    name: p.name,
    description: p.description,
    priceMonthly: p.priceMonthly,
    currency: p.currency,
    modules: safeParseArray(p.modules),
    limits: safeParseRecord(p.limits),
    isActive: p.isActive,
    sortOrder: p.sortOrder,
    subscriberCount: p._count.subscriptions,
  }))
}

export interface PlanInput {
  key: string
  name: string
  description?: string | null
  priceMonthly: number
  currency?: string
  modules: string[]
  limits: Record<string, number | null>
  isActive?: boolean
  sortOrder?: number
}

export async function upsertPlan(input: PlanInput, actorId?: string): Promise<SubscriptionPlanDTO> {
  if (!/^[a-z0-9-]+$/.test(input.key)) throw new SubscriptionServiceError('Plan key must be lowercase/hyphen', 400, 'BAD_KEY')
  if (input.priceMonthly < 0) throw new SubscriptionServiceError('Price cannot be negative', 400, 'BAD_PRICE')
  const data = {
    key: input.key,
    name: input.name,
    description: input.description ?? null,
    priceMonthly: input.priceMonthly,
    currency: input.currency ?? 'USD',
    modules: JSON.stringify(input.modules),
    limits: JSON.stringify(input.limits),
    isActive: input.isActive ?? true,
    sortOrder: input.sortOrder ?? 99,
    changedById: actorId ?? null,
  }
  const plan = await db.subscriptionPlan.upsert({ where: { key: input.key }, update: data, create: data })
  invalidatePlanCache()
  if (actorId) {
    try {
      await recordAudit({
        actorType: 'ADMIN',
        actorId,
        action: 'SUBSCRIPTION_PLAN_UPSERTED',
        entityType: 'SubscriptionPlan',
        entityId: plan.id,
        metadata: { key: plan.key, priceMonthly: plan.priceMonthly },
      })
    } catch (e) {
      console.error('[subscriptions] audit write failed', e)
    }
  }
  const count = await db.sellerSubscription.count({ where: { planId: plan.id } })
  return {
    id: plan.id,
    key: plan.key,
    name: plan.name,
    description: plan.description,
    priceMonthly: plan.priceMonthly,
    currency: plan.currency,
    modules: safeParseArray(plan.modules),
    limits: safeParseRecord(plan.limits),
    isActive: plan.isActive,
    sortOrder: plan.sortOrder,
    subscriberCount: count,
  }
}
