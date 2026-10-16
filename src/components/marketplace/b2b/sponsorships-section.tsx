'use client'

// ── SPONSOR-1: Selling → Sponsorships ────────────────────────────────────────
// Paid pinned listings: pick one of the org's APPROVED catalog products, choose
// a 7/14/30-day window, see the engine-resolved price (fee rule → platform
// setting fallback), purchase (simulated CARD/WALLET capture), then track the
// placement (days left, cancel). Revenue lands on the immutable fee ledger
// (event SPONSORSHIP) and reconciles in Monetization → Revenue.

import { useMemo, useState } from 'react'
import {
  BadgeCent,
  CalendarDays,
  CircleDollarSign,
  Loader2,
  Megaphone,
  Sparkles,
  XCircle,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { formatUSD } from '@/lib/format'
import { apiRequest, EmptyState, StatusBadge } from './b2b-shared'
import type { BadgeMap } from './b2b-shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// ── API row contracts ─────────────────────────────────────────────────────────

interface PlacementRow {
  id: string
  productId: string
  productTitle: string
  productSlug: string | null
  organizationName: string
  days: number
  amount: number
  currency: string
  status: string
  paymentMethod: string
  paymentStatus: string
  startsAt: string
  endsAt: string
  createdAt: string
  daysLeft: number
}

interface PricingInfo {
  perDay: number
  currency: string
  source: 'RULE' | 'PLATFORM_SETTING' | 'DEFAULT'
  ruleId: string | null
}

interface SponsorResponse {
  placements: PlacementRow[]
  pricing?: PricingInfo
  packages?: number[]
}

interface QuoteResponse {
  quote: {
    productId: string
    productTitle: string
    days: number
    perDay: number
    amount: number
    currency: string
    source: PricingInfo['source']
    eligible: boolean
    reason?: string
  }
}

interface OrgProductRow {
  id: string
  title: string
  price: number
  status: string
  images: string[]
}

// BadgeMap contract from b2b-shared (label + badge className)
const STATUS_MAP: Record<string, { label: string; badge: string }> = {
  ACTIVE: { label: 'Active', badge: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  EXPIRED: { label: 'Expired', badge: 'bg-muted text-muted-foreground' },
  CANCELLED: { label: 'Cancelled', badge: 'bg-red-500/10 text-red-600 dark:text-red-400' },
}

const SOURCE_LABEL: Record<PricingInfo['source'], string> = {
  RULE: 'fee rule',
  PLATFORM_SETTING: 'platform settings',
  DEFAULT: 'default rate',
}

// ── Section ────────────────────────────────────────────────────────────────────

export function SponsorshipsSub({ organizationId }: { organizationId: string }) {
  const { data, loading, error, refetch } = useApi<SponsorResponse>(
    `/api/sponsor?organizationId=${organizationId}&pricing=1`
  )
  const placements = useMemo(() => data?.placements ?? [], [data])
  const pricing = data?.pricing
  const packages = data?.packages ?? [7, 14, 30]

  const [open, setOpen] = useState(false)
  const [products, setProducts] = useState<OrgProductRow[]>([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [productId, setProductId] = useState('')
  const [days, setDays] = useState('7')
  const [quote, setQuote] = useState<QuoteResponse['quote'] | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [buying, setBuying] = useState(false)

  const activeCount = placements.filter((p) => p.status === 'ACTIVE').length
  const spent = placements
    .filter((p) => p.status !== 'CANCELLED')
    .reduce((sum, p) => sum + p.amount, 0)

  // Live quote — explicit (event-driven, no setState-in-effect): every product
  // or window change re-quotes through the API.
  const refreshQuote = async (nextProductId: string, nextDays: string) => {
    if (!nextProductId) {
      setQuote(null)
      return
    }
    setQuoting(true)
    const res = await apiRequest<QuoteResponse>('/api/sponsor', {
      method: 'POST',
      body: JSON.stringify({ productId: nextProductId, days: Number(nextDays), mode: 'quote' }),
    })
    setQuoting(false)
    if (res.ok && res.data) setQuote(res.data.quote)
    else setQuote(null)
  }

  const pickProduct = (id: string) => {
    setProductId(id)
    void refreshQuote(id, days)
  }

  const pickDays = (d: string) => {
    setDays(d)
    void refreshQuote(productId, d)
  }

  // Open the purchase dialog + lazy-load the org's own products (explicit
  // action, not an effect — avoids cascading setState on mount).
  const openDialog = () => {
    setOpen(true)
    if (products.length > 0 || productsLoading) return
    setProductsLoading(true)
    void (async () => {
      const res = await apiRequest<{ items: OrgProductRow[] }>(
        `/api/products?organizationId=${organizationId}&limit=48`
      )
      setProductsLoading(false)
      if (res.ok && res.data) {
        setProducts(res.data.items.filter((p) => p.status === 'ACTIVE'))
      }
    })()
  }

  const buy = async () => {
    if (!productId) return
    setBuying(true)
    const res = await apiRequest<{ placement: PlacementRow }>('/api/sponsor', {
      method: 'POST',
      body: JSON.stringify({ productId, days: Number(days), mode: 'buy' }),
    })
    setBuying(false)
    if (!res.ok || !res.data) {
      toast({ title: 'Purchase failed', description: res.error ?? 'Please try again.', variant: 'destructive' })
      return
    }
    const p = res.data.placement
    toast({
      title: 'Sponsorship live! 🎉',
      description: `"${p.productTitle}" is pinned for ${p.days} days (${formatUSD(p.amount)}).`,
    })
    setOpen(false)
    setProductId('')
    setQuote(null)
    void refetch()
  }

  const cancel = async (placement: PlacementRow) => {
    const res = await apiRequest(`/api/sponsor/${placement.id}`, { method: 'PATCH' })
    if (!res.ok) {
      toast({ title: 'Cancel failed', description: res.error ?? 'Please try again.', variant: 'destructive' })
      return
    }
    toast({ title: 'Sponsorship cancelled', description: `"${placement.productTitle}" is no longer pinned.` })
    void refetch()
  }

  const selectedProduct = products.find((p) => p.id === productId)

  return (
    <div className="space-y-4">
      {/* Stats + new placement */}
      <div className="flex flex-wrap items-stretch justify-between gap-3">
        <div className="flex flex-wrap items-stretch gap-2.5">
          <MiniStat icon={Megaphone} label="Placements" value={String(placements.length)} />
          <MiniStat icon={Sparkles} label="Active pins" value={String(activeCount)} />
          <MiniStat icon={CircleDollarSign} label="Spent" value={formatUSD(spent)} />
          {pricing && (
            <MiniStat
              icon={BadgeCent}
              label="Per day"
              value={formatUSD(pricing.perDay)}
              hint={`via ${SOURCE_LABEL[pricing.source]}`}
            />
          )}
        </div>
        <Button className="rounded-xl" onClick={openDialog}>
          <Megaphone size={15} className="mr-1.5" /> Sponsor a product
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState icon={XCircle} title="Couldn't load sponsorships" description={error}>
          <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
            Try again
          </Button>
        </EmptyState>
      ) : placements.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No sponsorships yet"
          description="Pin one of your approved catalog products to the top of the marketplace — a paid placement with a Sponsored badge, priced per day."
        >
          <Button className="rounded-xl" onClick={openDialog}>
            <Sparkles size={15} className="mr-1.5" /> Sponsor your first product
          </Button>
        </EmptyState>
      ) : (
        <div className="space-y-2.5">
          {placements.map((p) => (
            <Card key={p.id} className="rounded-2xl py-0 transition-shadow hover:shadow-sm">
              <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2.5 px-4 py-3.5 sm:flex-nowrap">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Megaphone size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{p.productTitle}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {p.days} days · {formatUSD(p.amount)} {p.currency} · {p.paymentMethod}
                    {p.status === 'ACTIVE' && (
                      <> · <CalendarDays size={11} className="inline" /> {p.daysLeft} day{p.daysLeft === 1 ? '' : 's'} left</>
                    )}
                  </p>
                </div>
                <StatusBadge status={p.status} map={STATUS_MAP as BadgeMap} />
                {p.status === 'ACTIVE' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg text-xs"
                    onClick={() => void cancel(p)}
                  >
                    Cancel
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Purchase dialog ── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone size={18} className="text-amber-500" /> Sponsor a product
            </DialogTitle>
            <DialogDescription>
              Pin an approved catalog product to the top of the marketplace default view with a
              Sponsored badge. Priced {pricing ? `${formatUSD(pricing.perDay)}/day (via ${SOURCE_LABEL[pricing.source]})` : 'per day'}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Product</Label>
              {productsLoading ? (
                <Skeleton className="h-10 w-full rounded-xl" />
              ) : products.length === 0 ? (
                <p className="rounded-xl border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
                  No live approved products in your shared catalog yet — a product must be live
                  (platform-approved) before it can be sponsored.
                </p>
              ) : (
                <Select value={productId} onValueChange={pickProduct}>
                  <SelectTrigger className="w-full rounded-xl">
                    <SelectValue placeholder="Choose a product to pin" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Window</Label>
              <div className="grid grid-cols-3 gap-2">
                {packages.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => pickDays(String(d))}
                    className={cn(
                      'rounded-xl border-2 p-3 text-center transition-colors',
                      String(d) === days
                        ? 'border-amber-500 bg-amber-500/10'
                        : 'border-transparent bg-muted/50 hover:bg-muted'
                    )}
                  >
                    <span className="block text-sm font-bold">{d} days</span>
                    {pricing && (
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        {formatUSD(Math.round(pricing.perDay * d * 100) / 100)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {quoting ? (
              <div className="flex items-center justify-center gap-2 rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
                <Loader2 size={14} className="animate-spin" /> Checking eligibility…
              </div>
            ) : quote ? (
              quote.eligible ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5">
                  <p className="text-sm font-semibold">
                    {formatUSD(quote.amount)} for {quote.days} days
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      ({formatUSD(quote.perDay)}/day)
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Your product is pinned to the top of the marketplace default view and carries a
                    Sponsored badge for the full window. The charge is captured immediately (simulated
                    payment) and lands on the platform fee ledger.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3.5 text-xs text-red-600 dark:text-red-400">
                  {quote.reason ?? 'This product is not eligible for sponsorship.'}
                </div>
              )
            ) : selectedProduct ? (
              <p className="text-xs text-muted-foreground">Choose a window to see the price.</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button
              className="rounded-xl"
              disabled={!quote?.eligible || buying}
              onClick={() => void buy()}
            >
              {buying && <Loader2 size={15} className="mr-1.5 animate-spin" />}
              {quote?.eligible ? `Pay ${formatUSD(quote.amount)} & pin` : 'Sponsor product'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function MiniStat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="flex min-w-32 items-center gap-2.5 rounded-xl border bg-muted/30 px-3 py-2">
      <Icon size={15} className="shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-bold leading-tight">{value}</p>
        {hint && <p className="truncate text-[10px] text-muted-foreground">{hint}</p>}
      </div>
    </div>
  )
}
