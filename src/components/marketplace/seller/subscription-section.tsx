'use client'

// ─────────────────────────────────────────────────────────────────────────────
// SELLER · SUBSCRIPTION SECTION (Phase 11.2) — the seller's own subscription
// home: current plan + entitlement map (the ceiling), limits usage bars,
// renewal/grace state, plan switching and cancellation.
//
// Server surface:
//   GET  /api/seller/subscription          → subscription + gatedModules +
//                                             limits + usage + availablePlans
//   POST /api/seller/subscription/action   → {action:'change-plan', planKey} |
//                                             {action:'cancel', reason}
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import {
  AlertTriangle,
  Ban,
  Boxes,
  Check,
  CircleDollarSign,
  CreditCard,
  Crown,
  Infinity as InfinityIcon,
  Loader2,
  Lock,
  LockOpen,
  Package,
  Users,
  X,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { formatDate } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

interface EffectiveSubscription {
  id: string
  status: 'TRIALING' | 'ACTIVE' | 'GRACE' | 'DOWNGRADED' | 'CANCELLED'
  planKey: string
  planName: string
  priceMonthly: number
  currency: string
  currentPeriodEnd: string
  graceEndsAt: string | null
  cancelledAt: string | null
  cancelReason: string | null
}

interface SellerSubscriptionResponse {
  organizationId: string
  organizationName: string
  subscription: EffectiveSubscription | null
  effectivePlanKey: string
  effectivePlanName: string
  limits: Record<string, number | null>
  gatedModules: { key: string; entitled: boolean }[]
  usage: { products: number; members: number; activeOffers: number }
  availablePlans: {
    key: string
    name: string
    description: string | null
    priceMonthly: number
    currency: string
    modules: string[]
    limits: Record<string, number | null>
  }[]
}

const MODULE_LABELS: Record<string, string> = {
  'financing-hub': 'Financing Hub',
  rfq: 'RFQ Pipeline',
  'b2b-orgs': 'B2B Org Accounts',
  'financier-console': 'Financier Console',
  compare: 'Product Compare',
  reviews: 'Buyer Reviews',
  insights: 'Seller Insights',
  solutions: 'Solutions Spotlights',
}

const STATUS_STYLE: Record<string, { label: string; badge: string }> = {
  ACTIVE: {
    label: 'Active',
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  },
  TRIALING: {
    label: 'Trialing',
    badge: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300',
  },
  GRACE: {
    label: 'Grace period',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  },
  DOWNGRADED: {
    label: 'Downgraded',
    badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  },
  CANCELLED: {
    label: 'Cancelled',
    badge: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
  },
}

const TIER_STYLE: Record<string, string> = {
  free: 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400',
  starter: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  growth: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  pro: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
}

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

function daysLeft(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000))
}

/** Usage bar: used/cap with warm threshold colors; "Unlimited" when uncapped. */
function UsageBar({
  label,
  icon: Icon,
  used,
  cap,
}: {
  label: string
  icon: typeof Package
  used: number
  cap: number | null | undefined
}) {
  const ratio = cap ? Math.min(1, used / cap) : 0
  const barColor =
    cap === null || cap === undefined
      ? 'bg-emerald-500/70'
      : ratio >= 1
        ? 'bg-rose-500'
        : ratio >= 0.8
          ? 'bg-amber-500'
          : 'bg-emerald-500'
  return (
    <div className="rounded-xl border bg-muted/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Icon size={13} /> {label}
        </p>
        <p className="text-xs tabular-nums">
          {cap === null || cap === undefined ? (
            <span className="inline-flex items-center gap-1 font-semibold">
              <InfinityIcon size={13} /> Unlimited
            </span>
          ) : (
            <>
              <span className="font-bold">{used}</span>
              <span className="text-muted-foreground"> of {cap}</span>
            </>
          )}
        </p>
      </div>
      <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={label}>
        <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${Math.max(3, ratio * 100)}%` }} />
      </div>
    </div>
  )
}

export function SubscriptionSection() {
  const { data, loading, error, refetch } = useApi<SellerSubscriptionResponse>('/api/seller/subscription')

  const [switching, setSwitching] = useState<string | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)

  // No SellerProfile org — the pre-7.0 legacy seller: free tier by definition.
  if (error && error.includes('no organization')) {
    return (
      <Card className="flex flex-col items-center border-dashed py-16 text-center">
        <CircleDollarSign size={40} className="text-muted-foreground/40" />
        <h2 className="mt-4 text-lg font-semibold">You are on the free tier</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Your seller account has no organization yet, so the free plan applies — sell, list and
          get paid. Contact the platform team to set up a subscribed organization.
        </p>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="flex flex-col items-center border-dashed py-16 text-center">
        <AlertTriangle size={40} className="text-muted-foreground/40" />
        <h2 className="mt-4 text-lg font-semibold">Couldn&apos;t load your subscription</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" className="mt-5 rounded-full" onClick={() => void refetch()}>
          Try again
        </Button>
      </Card>
    )
  }

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48 rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }

  const { subscription, limits, gatedModules, usage, availablePlans } = data
  const statusInfo = subscription ? STATUS_STYLE[subscription.status] : null
  const entitled = subscription ? ['TRIALING', 'ACTIVE', 'GRACE'].includes(subscription.status) : false
  const currentPlanKey = entitled ? subscription!.planKey : 'free'

  const changePlan = async (planKey: string) => {
    setSwitching(planKey)
    const res = await fetch('/api/seller/subscription/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'change-plan', planKey }),
    })
    const json = (await res.json().catch(() => ({}))) as { error?: string }
    setSwitching(null)
    if (!res.ok) {
      toast({ title: 'Plan change failed', description: json.error ?? 'Please try again', variant: 'destructive' })
      return
    }
    toast({
      title: `You are now on the ${availablePlans.find((p) => p.key === planKey)?.name ?? planKey} plan`,
      description: 'Your entitlements and limits re-clamped immediately.',
    })
    void refetch()
  }

  const cancel = async () => {
    setCancelling(true)
    const res = await fetch('/api/seller/subscription/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel', reason: cancelReason.trim() }),
    })
    const json = (await res.json().catch(() => ({}))) as { error?: string }
    setCancelling(false)
    if (!res.ok) {
      toast({ title: 'Cancellation failed', description: json.error ?? 'Please try again', variant: 'destructive' })
      return
    }
    toast({
      title: 'Subscription cancelled',
      description: 'Your data is safe — you drop to the free tier until you resubscribe.',
    })
    setCancelOpen(false)
    setCancelReason('')
    void refetch()
  }

  return (
    <div className="space-y-6">
      {/* ── Current plan hero ── */}
      <Card
        className={cn(
          'overflow-hidden',
          subscription?.status === 'GRACE' && 'border-amber-400/60',
          subscription?.status === 'DOWNGRADED' && 'border-rose-400/60'
        )}
      >
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex flex-wrap items-center gap-2.5 text-lg">
                <Crown size={18} className="text-primary" />
                {data.effectivePlanName}
                <Badge
                  className={cn(
                    'shrink-0 rounded-full border-0 text-[11px] font-semibold',
                    TIER_STYLE[data.effectivePlanKey] ?? 'bg-muted text-muted-foreground'
                  )}
                >
                  {data.effectivePlanKey}
                </Badge>
                {subscription && statusInfo && (
                  <Badge className={cn('shrink-0 rounded-full border-0 text-[11px] font-semibold', statusInfo.badge)}>
                    {statusInfo.label}
                  </Badge>
                )}
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {data.organizationName} · subscription is a ceiling — activations can only stay within it
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-extrabold tabular-nums">
                {formatMoney(
                  entitled && subscription ? subscription.priceMonthly : 0,
                  subscription?.currency ?? 'USD'
                )}
                <span className="ml-1 text-xs font-medium text-muted-foreground">/mo</span>
              </p>
              {subscription ? (
                subscription.status === 'GRACE' && subscription.graceEndsAt ? (
                  <p className="mt-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                    Grace ends {formatDate(subscription.graceEndsAt)} ({daysLeft(subscription.graceEndsAt)}d left)
                  </p>
                ) : subscription.status === 'CANCELLED' ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Cancelled {subscription.cancelledAt ? formatDate(subscription.cancelledAt) : ''}
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Renews {formatDate(subscription.currentPeriodEnd)}
                  </p>
                )
              ) : (
                <p className="mt-0.5 text-xs text-muted-foreground">no subscription — free tier</p>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Entitlement map — checked against the gated universe */}
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Modules {entitled ? 'in your plan' : 'on the free tier'}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {gatedModules.length === 0 ? (
              <p className="text-xs text-muted-foreground">No subscription-gated modules are configured.</p>
            ) : (
              gatedModules.map(({ key, entitled: on }) => (
                <span
                  key={key}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold',
                    on
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-muted text-muted-foreground/70'
                  )}
                  title={on ? 'Included in your current tier' : 'Upgrade to unlock'}
                >
                  {on ? <LockOpen size={11} /> : <Lock size={11} />}
                  {MODULE_LABELS[key] ?? key}
                </span>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Grace warning (renewal failure) ── */}
      {subscription?.status === 'GRACE' && (
        <Card className="border-amber-400/60 bg-amber-50/70 dark:bg-amber-950/30">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  Your last renewal failed
                </p>
                <p className="mt-0.5 text-xs text-amber-800/90 dark:text-amber-300/90">
                  You keep your entitlements during grace, but modules turn off and limits
                  re-clamp to the free tier when the grace period ends
                  {subscription.graceEndsAt ? ` on ${formatDate(subscription.graceEndsAt)}` : ''}.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="shrink-0 rounded-xl border-amber-400/70 text-amber-900 hover:bg-amber-100 dark:text-amber-200"
              onClick={() =>
                toast({
                  title: 'Payment method',
                  description: 'Billing runs on the platform side in this release — contact the Vendora team to update your payment details.',
                })
              }
            >
              <CreditCard size={14} className="mr-1.5" /> Update payment method
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Limits usage ── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <UsageBar label="Products" icon={Package} used={usage.products} cap={limits.maxProducts} />
        <UsageBar label="Team seats" icon={Users} used={usage.members} cap={limits.maxUsers} />
        <UsageBar label="Active offers" icon={Boxes} used={usage.activeOffers} cap={limits.maxActiveOffers} />
      </div>

      {/* ── Plan switching ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CircleDollarSign size={16} className="text-primary" /> Available plans
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Switching writes a new subscription period instantly (demo billing — a PAID invoice
            lands on the platform ledger for paid tiers).
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {availablePlans.map((plan) => {
              const isCurrent = plan.key === currentPlanKey
              return (
                <div
                  key={plan.key}
                  className={cn(
                    'flex flex-col rounded-2xl border p-4 transition-colors',
                    isCurrent ? 'border-primary/60 ring-1 ring-primary/30' : 'hover:border-primary/30'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold">{plan.name}</p>
                    <Badge
                      className={cn(
                        'shrink-0 rounded-full border-0 text-[11px] font-semibold',
                        TIER_STYLE[plan.key] ?? 'bg-muted text-muted-foreground'
                      )}
                    >
                      {plan.key}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xl font-extrabold tabular-nums">
                    {formatMoney(plan.priceMonthly, plan.currency)}
                    <span className="ml-1 text-xs font-medium text-muted-foreground">/mo</span>
                  </p>
                  <p className="mt-1 line-clamp-2 min-h-[2rem] text-xs text-muted-foreground">
                    {plan.description ?? '—'}
                  </p>
                  <p className="mt-2 text-[11px] text-muted-foreground tabular-nums">
                    {plan.limits.maxProducts == null ? 'Unlimited' : plan.limits.maxProducts} products ·{' '}
                    {plan.limits.maxUsers == null ? 'Unlimited' : plan.limits.maxUsers} users
                  </p>
                  <Button
                    className={cn('mt-3 h-9 w-full rounded-xl', isCurrent && 'opacity-90')}
                    variant={isCurrent ? 'secondary' : 'default'}
                    disabled={isCurrent || switching !== null}
                    onClick={() => void changePlan(plan.key)}
                  >
                    {switching === plan.key ? (
                      <Loader2 size={14} className="mr-1.5 animate-spin" />
                    ) : isCurrent ? (
                      <Check size={14} className="mr-1.5" />
                    ) : null}
                    {isCurrent ? 'Current plan' : `Switch to ${plan.name}`}
                  </Button>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Danger zone ── */}
      {entitled && (
        <Card className="border-rose-300/60">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Ban size={18} className="mt-0.5 shrink-0 text-rose-500" />
              <div>
                <p className="text-sm font-semibold">Cancel subscription</p>
                <p className="mt-0.5 max-w-lg text-xs text-muted-foreground">
                  Your listings, orders and history are preserved — entitlements and limits drop
                  to the free tier immediately.
                </p>
              </div>
            </div>
            <Button variant="destructive" className="shrink-0 rounded-xl" onClick={() => setCancelOpen(true)}>
              <X size={14} className="mr-1.5" /> Cancel subscription
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Cancel reason dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel your subscription</DialogTitle>
            <DialogDescription>
              Tell us why — the reason is recorded with the cancellation (required).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="sub-cancel-reason">Reason</Label>
            <Textarea
              id="sub-cancel-reason"
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. pausing the store for the season"
              maxLength={1000}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setCancelOpen(false)} disabled={cancelling}>
              Keep my subscription
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl"
              onClick={() => void cancel()}
              disabled={cancelling || !cancelReason.trim()}
            >
              {cancelling && <Loader2 size={14} className="mr-1.5 animate-spin" />} Confirm cancellation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
