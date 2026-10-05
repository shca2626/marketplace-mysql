'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FX CONSOLE (Phase 7.2 — multi-currency substrate) — Currencies & FX tab.
//
// Server surface (all live):
//   GET    /api/admin/fx                     → { currencies, current, history }
//   POST   /api/admin/fx/rates               → 201 { rate }            (pricing.manage)
//   POST   /api/admin/fx/currencies          → 201 { currency }         (pricing.manage)
//   PATCH  /api/admin/fx/currencies          → { currency }             (pricing.manage)
//
// One rate per (base, quote, validFrom) instant — admin-managed history.
// Money rows snapshot the rate at conversion time, so editing a rate here
// never rewrites past records (H1 discipline).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import {
  ArrowRight,
  Coins,
  History,
  Loader2,
  Plus,
  RefreshCw,
  SearchX,
  ShieldAlert,
  Wallet,
  X,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { formatDate, timeAgo } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { AdminEmptyState, apiRequest, toastApiError } from './shared'

// ── Types (contracts of /api/admin/fx) ────────────────────────────────────────

interface CurrencyDTO {
  code: string
  name: string
  symbol: string | null
  decimals: number
  isActive: boolean
}

interface ExchangeRateDTO {
  id: string
  baseCode: string
  quoteCode: string
  rate: number
  source: string
  validFrom: string
}

interface FxResponse {
  currencies: CurrencyDTO[]
  current: ExchangeRateDTO[]
  history: ExchangeRateDTO[]
}

// ── Palette ──────────────────────────────────────────────────────────────────

const SOURCE_STYLE: Record<string, string> = {
  ADMIN: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  SEED: 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400',
  IMPORT: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
}

/** Rate formatting — up to 8 decimals, trailing zeros trimmed for display. */
function formatRate(rate: number): string {
  return rate.toLocaleString('en-US', { maximumFractionDigits: 8 })
}

// ── FX tab ───────────────────────────────────────────────────────────────────

export function FxTab() {
  // Selected pair drives the history section (click a row to filter).
  const [selectedPair, setSelectedPair] = useState<{ base: string; quote: string } | null>(null)

  // Main console payload — history is filtered server-side by the pair.
  const historyQuery = new URLSearchParams()
  if (selectedPair) {
    historyQuery.set('base', selectedPair.base)
    historyQuery.set('quote', selectedPair.quote)
  }
  const {
    data,
    loading,
    error,
    refetch,
  } = useApi<FxResponse>(`/api/admin/fx?${historyQuery.toString()}`)

  const currencies = data?.currencies ?? []
  const current = data?.current ?? []
  const history = data?.history ?? []

  // Dialogs
  const [updateFor, setUpdateFor] = useState<ExchangeRateDTO | null>(null)
  const [addRateOpen, setAddRateOpen] = useState(false)
  const [addCurrencyOpen, setAddCurrencyOpen] = useState(false)
  const [togglingCode, setTogglingCode] = useState<string | null>(null)

  const latestUpdate = current.reduce<string | null>(
    (acc, r) => (!acc || r.validFrom > acc ? r.validFrom : acc),
    null
  )

  const toggleCurrency = async (currency: CurrencyDTO, next: boolean) => {
    setTogglingCode(currency.code)
    const res = await apiRequest<{ currency: CurrencyDTO }>('/api/admin/fx/currencies', {
      method: 'PATCH',
      body: JSON.stringify({ code: currency.code, isActive: next }),
    })
    setTogglingCode(null)
    if (!res.ok) {
      toastApiError(res.error, `Couldn’t ${next ? 'activate' : 'deactivate'} ${currency.code}`)
      return
    }
    toast({
      title: `${currency.code} ${next ? 'activated' : 'deactivated'}`,
      description: next
        ? 'The currency is available for rates and storefront display.'
        : 'Existing money rows keep their snapshots — only new rate entries are affected.',
    })
    void refetch()
  }

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Currencies</p>
            <Coins size={15} className="shrink-0 text-primary" />
          </div>
          <p className="mt-1.5 text-2xl font-extrabold tabular-nums">
            {loading && !data ? '—' : currencies.length}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">active in the console</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Pairs</p>
            <ArrowRight size={15} className="shrink-0 text-primary" />
          </div>
          <p className="mt-1.5 text-2xl font-extrabold tabular-nums">
            {loading && !data ? '—' : current.length}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">with a current rate</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Latest update</p>
            <History size={15} className="shrink-0 text-primary" />
          </div>
          <p className="mt-1.5 text-2xl font-extrabold tabular-nums">
            {loading && !data ? '—' : latestUpdate ? timeAgo(latestUpdate) : '—'}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {latestUpdate ? formatDate(latestUpdate) : 'no rates recorded yet'}
          </p>
        </div>
      </div>

      {/* Current rates */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Wallet size={16} className="text-primary" /> Current rates
            <span className="ml-auto flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-lg"
                onClick={() => void refetch()}
                disabled={loading}
                aria-label="Refresh FX data"
              >
                {loading ? (
                  <Loader2 size={13} className="mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw size={13} className="mr-1.5" />
                )}
                Refresh
              </Button>
              <Button
                size="sm"
                className="h-8 rounded-lg"
                onClick={() => setAddRateOpen(true)}
                disabled={currencies.length < 2}
                aria-label="Add an exchange rate"
              >
                <Plus size={13} className="mr-1.5" /> Add rate
              </Button>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && !data ? (
            <div className="space-y-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-xl" />
              ))}
            </div>
          ) : error ? (
            <AdminEmptyState icon={ShieldAlert} title="Couldn't load FX data" description={error}>
              <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
                Try again
              </Button>
            </AdminEmptyState>
          ) : current.length === 0 ? (
            <AdminEmptyState
              icon={SearchX}
              title="No rates yet"
              description={
                currencies.length < 2
                  ? 'Add at least two currencies first, then record a rate between them.'
                  : 'Add your first exchange rate — e.g. USD → YER — to enable multi-currency display.'
              }
            />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto rounded-2xl border md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th scope="col" className="px-4 py-3 font-medium">Pair</th>
                      <th scope="col" className="px-4 py-3 font-medium">Rate</th>
                      <th scope="col" className="px-4 py-3 font-medium">Source</th>
                      <th scope="col" className="px-4 py-3 font-medium">Valid from</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.map((rate) => {
                      const selected = selectedPair?.base === rate.baseCode && selectedPair?.quote === rate.quoteCode
                      return (
                        <tr
                          key={rate.id}
                          className={cn(
                            'cursor-pointer border-b transition-colors last:border-0 hover:bg-accent/50',
                            selected && 'bg-accent/50'
                          )}
                          onClick={() => setSelectedPair(selected ? null : { base: rate.baseCode, quote: rate.quoteCode })}
                        >
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold tracking-tight">
                              {rate.baseCode}
                              <ArrowRight size={12} className="text-muted-foreground" />
                              {rate.quoteCode}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-semibold tabular-nums">{formatRate(rate.rate)}</td>
                          <td className="px-4 py-3">
                            <SourceChip source={rate.source} />
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground" title={formatDate(rate.validFrom)}>
                            {timeAgo(rate.validFrom)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-lg"
                              onClick={(e) => {
                                e.stopPropagation()
                                setUpdateFor(rate)
                              }}
                              aria-label={`Update rate ${rate.baseCode} to ${rate.quoteCode}`}
                            >
                              Update
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile + tablet stacked cards */}
              <div className="space-y-2.5 md:hidden">
                {current.map((rate) => {
                  const selected = selectedPair?.base === rate.baseCode && selectedPair?.quote === rate.quoteCode
                  return (
                    <div
                      key={rate.id}
                      className={cn(
                        'rounded-2xl border p-3.5 transition-colors',
                        selected && 'border-primary/60 ring-1 ring-primary/30'
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="inline-flex items-center gap-1.5 font-mono text-xs font-bold">
                            {rate.baseCode}
                            <ArrowRight size={12} className="text-muted-foreground" />
                            {rate.quoteCode}
                          </p>
                          <p className="mt-0.5 text-sm font-semibold tabular-nums">{formatRate(rate.rate)}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <SourceChip source={rate.source} />
                            <span className="text-[11px] text-muted-foreground" title={formatDate(rate.validFrom)}>
                              {timeAgo(rate.validFrom)}
                            </span>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-lg"
                            onClick={() => setUpdateFor(rate)}
                            aria-label={`Update rate ${rate.baseCode} to ${rate.quoteCode}`}
                          >
                            Update
                          </Button>
                          <button
                            type="button"
                            onClick={() => setSelectedPair(selected ? null : { base: rate.baseCode, quote: rate.quoteCode })}
                            className="text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
                          >
                            {selected ? 'Hide history' : 'History'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Click a pair to show its rate history below — the rate is how many quote units one base unit buys.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* History (collapsible, filtered by the selected pair) */}
      <Collapsible open={!!selectedPair}>
        <CollapsibleContent>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <History size={16} className="text-primary" />
                History{selectedPair ? ` — ${selectedPair.base} → ${selectedPair.quote}` : ''}
                <button
                  type="button"
                  onClick={() => setSelectedPair(null)}
                  className="ml-auto rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Clear pair filter"
                >
                  <X size={15} />
                </button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2.5">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full rounded-xl" />
                  ))}
                </div>
              ) : history.length === 0 ? (
                <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                  No history for this pair yet.
                </p>
              ) : (
                <div className="max-h-96 overflow-y-auto scrollbar-thin rounded-2xl border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th scope="col" className="px-4 py-2.5 font-medium">Rate</th>
                        <th scope="col" className="px-4 py-2.5 font-medium">Source</th>
                        <th scope="col" className="px-4 py-2.5 font-medium">Valid from</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history
                        .filter((r) =>
                          selectedPair ? r.baseCode === selectedPair.base && r.quoteCode === selectedPair.quote : true
                        )
                        .map((r) => (
                          <tr key={r.id} className="border-b transition-colors last:border-0 hover:bg-accent/50">
                            <td className="px-4 py-2.5 font-semibold tabular-nums">{formatRate(r.rate)}</td>
                            <td className="px-4 py-2.5">
                              <SourceChip source={r.source} />
                            </td>
                            <td className="px-4 py-2.5 text-xs text-muted-foreground" title={formatDate(r.validFrom)}>
                              {timeAgo(r.validFrom)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Currencies */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Coins size={16} className="text-primary" /> Currencies
            <Button
              size="sm"
              className="ml-auto h-8 rounded-lg"
              onClick={() => setAddCurrencyOpen(true)}
              aria-label="Add a currency"
            >
              <Plus size={13} className="mr-1.5" /> Add currency
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            ISO-4217 codes. Deactivating a currency stops new rate entries against it — existing money rows keep
            their recorded currency and FX snapshot.
          </p>
          {loading && !data ? (
            <div className="space-y-2.5">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-xl" />
              ))}
            </div>
          ) : currencies.length === 0 ? (
            <AdminEmptyState
              icon={Coins}
              title="No currencies"
              description="Add the currencies you trade in — e.g. USD, YER, SAR — to start managing exchange rates."
            />
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {currencies.map((currency) => (
                <div
                  key={currency.code}
                  className="flex items-center justify-between gap-3 rounded-xl border p-3.5"
                >
                  <div className="min-w-0">
                    <p className="flex items-baseline gap-2">
                      <span className="font-mono text-sm font-bold">{currency.code}</span>
                      {currency.symbol && (
                        <span className="truncate text-xs text-muted-foreground">{currency.symbol}</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground" title={currency.name}>
                      {currency.name} · {currency.decimals} dp
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {togglingCode === currency.code && <Loader2 size={13} className="animate-spin text-muted-foreground" />}
                    <Switch
                      checked={currency.isActive}
                      onCheckedChange={(next) => void toggleCurrency(currency, next)}
                      disabled={togglingCode === currency.code}
                      aria-label={`${currency.isActive ? 'Deactivate' : 'Activate'} ${currency.code}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Update rate dialog (inline per-row) */}
      <UpdateRateDialog
        rate={updateFor}
        onClose={() => setUpdateFor(null)}
        onSaved={(saved) => {
          setUpdateFor(null)
          toast({
            title: `${saved.baseCode} → ${saved.quoteCode} rate updated`,
            description: `New rate ${formatRate(saved.rate)} — effective now. Existing records keep their own snapshot.`,
          })
          void refetch()
        }}
      />

      {/* Add rate dialog */}
      <AddRateDialog
        open={addRateOpen}
        currencies={currencies}
        onClose={() => setAddRateOpen(false)}
        onSaved={(saved) => {
          setAddRateOpen(false)
          toast({
            title: `Rate ${saved.baseCode} → ${saved.quoteCode} added`,
            description: `${formatRate(saved.rate)} — effective now.`,
          })
          void refetch()
        }}
      />

      {/* Add currency dialog */}
      <AddCurrencyDialog
        open={addCurrencyOpen}
        onClose={() => setAddCurrencyOpen(false)}
        onSaved={(saved) => {
          setAddCurrencyOpen(false)
          toast({
            title: `Currency ${saved.code} added`,
            description: `${saved.name} is active and ready for rate entries.`,
          })
          void refetch()
        }}
      />
    </div>
  )
}

// ── Shared pieces ─────────────────────────────────────────────────────────────

function SourceChip({ source }: { source: string }) {
  return (
    <Badge
      className={cn(
        'shrink-0 rounded-full border-0 text-[11px] font-semibold',
        SOURCE_STYLE[source] ?? 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400'
      )}
    >
      {source}
    </Badge>
  )
}

/** Inline error box for open dialogs. */
function DialogError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive"
    >
      {message}
    </p>
  )
}

// ── Update rate dialog ───────────────────────────────────────────────────────

function UpdateRateDialog({
  rate,
  onClose,
  onSaved,
}: {
  rate: ExchangeRateDTO | null
  onClose: () => void
  onSaved: (rate: ExchangeRateDTO) => void
}) {
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [initializedFor, setInitializedFor] = useState<ExchangeRateDTO | null>(null)

  // Re-seed on open (render-time keyed sync, the commission dialog pattern)
  if (rate && initializedFor !== rate) {
    setInitializedFor(rate)
    setInput('')
    setError(null)
  }
  if (!rate && initializedFor !== null) setInitializedFor(null)

  const value = Number(input)
  const valid = input.trim() !== '' && Number.isFinite(value) && value > 0 && value <= 1_000_000

  const save = async () => {
    if (!rate || !valid) return
    setSaving(true)
    setError(null)
    const res = await apiRequest<{ rate: ExchangeRateDTO }>('/api/admin/fx/rates', {
      method: 'POST',
      body: JSON.stringify({ baseCode: rate.baseCode, quoteCode: rate.quoteCode, rate: value }),
    })
    setSaving(false)
    if (!res.ok || !res.data) {
      setError(res.error ?? 'Failed to save the rate')
      return
    }
    onSaved(res.data.rate)
  }

  return (
    <Dialog open={!!rate} onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet size={16} className="text-primary" /> Update {rate ? `${rate.baseCode} → ${rate.quoteCode}` : 'rate'}
          </DialogTitle>
          <DialogDescription>
            {rate ? (
              <>
                Current rate <span className="font-semibold tabular-nums">{formatRate(rate.rate)}</span> (set{' '}
                {timeAgo(rate.validFrom)}). Saving appends a new entry to the history — past records keep their own
                snapshot.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="fx-update-rate" className="text-xs text-muted-foreground">
              New rate — 1 {rate?.baseCode} = ? {rate?.quoteCode} (up to 8 decimals)
            </Label>
            <Input
              id="fx-update-rate"
              type="number"
              min={0}
              step="0.00000001"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. 530"
              className="h-10 rounded-xl"
              aria-describedby="fx-update-rate-hint"
            />
            <p id="fx-update-rate-hint" className="text-xs text-muted-foreground">
              How many {rate?.quoteCode} one {rate?.baseCode} buys.
            </p>
          </div>
          <DialogError message={error} />
        </div>
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" className="rounded-xl" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button className="rounded-xl" disabled={!valid || saving} onClick={() => void save()}>
            {saving ? <Loader2 size={15} className="mr-2 animate-spin" /> : null}
            Save rate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Add rate dialog ──────────────────────────────────────────────────────────

function AddRateDialog({
  open,
  currencies,
  onClose,
  onSaved,
}: {
  open: boolean
  currencies: CurrencyDTO[]
  onClose: () => void
  onSaved: (rate: ExchangeRateDTO) => void
}) {
  const [base, setBase] = useState('')
  const [quote, setQuote] = useState('')
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Reset the form every time the dialog opens
  if (!open && (base || quote || input || error)) {
    setBase('')
    setQuote('')
    setInput('')
    setError(null)
  }

  const value = Number(input)
  const valid =
    base && quote && base !== quote && input.trim() !== '' && Number.isFinite(value) && value > 0 && value <= 1_000_000

  const save = async () => {
    if (!valid) return
    setSaving(true)
    setError(null)
    const res = await apiRequest<{ rate: ExchangeRateDTO }>('/api/admin/fx/rates', {
      method: 'POST',
      body: JSON.stringify({ baseCode: base, quoteCode: quote, rate: value }),
    })
    setSaving(false)
    if (!res.ok || !res.data) {
      setError(res.error ?? 'Failed to save the rate')
      return
    }
    onSaved(res.data.rate)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus size={16} className="text-primary" /> Add exchange rate
          </DialogTitle>
          <DialogDescription>
            Record the current rate for a pair. Both currencies must already exist — add missing ones below first.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fx-add-base" className="text-xs text-muted-foreground">
                Base currency
              </Label>
              <Select value={base || 'none-base'} onValueChange={(v) => setBase(v === 'none-base' ? '' : v)}>
                <SelectTrigger id="fx-add-base" className="h-10 w-full rounded-xl" aria-label="Base currency">
                  <SelectValue placeholder="Base" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none-base" disabled>
                    Choose base…
                  </SelectItem>
                  {currencies.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code} — {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fx-add-quote" className="text-xs text-muted-foreground">
                Quote currency
              </Label>
              <Select value={quote || 'none-quote'} onValueChange={(v) => setQuote(v === 'none-quote' ? '' : v)}>
                <SelectTrigger id="fx-add-quote" className="h-10 w-full rounded-xl" aria-label="Quote currency">
                  <SelectValue placeholder="Quote" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none-quote" disabled>
                    Choose quote…
                  </SelectItem>
                  {currencies.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code} — {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fx-add-rate" className="text-xs text-muted-foreground">
              Rate — 1 {base || 'BASE'} = ? {quote || 'QUOTE'} (up to 8 decimals)
            </Label>
            <Input
              id="fx-add-rate"
              type="number"
              min={0}
              step="0.00000001"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. 530"
              className="h-10 rounded-xl"
            />
            {base && quote && base === quote && (
              <p className="text-xs font-semibold text-destructive">Base and quote must differ.</p>
            )}
          </div>
          <DialogError message={error} />
        </div>
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" className="rounded-xl" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button className="rounded-xl" disabled={!valid || saving} onClick={() => void save()}>
            {saving ? <Loader2 size={15} className="mr-2 animate-spin" /> : null}
            Add rate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Add currency dialog ──────────────────────────────────────────────────────

function AddCurrencyDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved: (currency: CurrencyDTO) => void
}) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [decimals, setDecimals] = useState('2')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Reset the form every time the dialog opens
  if (!open && (code || name || symbol || error)) {
    setCode('')
    setName('')
    setSymbol('')
    setDecimals('2')
    setError(null)
  }

  const upperCode = code.trim().toUpperCase()
  const dp = Number(decimals)
  const valid =
    /^[A-Z]{3}$/.test(upperCode) && name.trim().length >= 2 && decimals.trim() !== '' && Number.isInteger(dp) && dp >= 0 && dp <= 4

  const save = async () => {
    if (!valid) return
    setSaving(true)
    setError(null)
    const res = await apiRequest<{ currency: CurrencyDTO }>('/api/admin/fx/currencies', {
      method: 'POST',
      body: JSON.stringify({
        code: upperCode,
        name: name.trim(),
        symbol: symbol.trim() || undefined,
        decimals: dp,
      }),
    })
    setSaving(false)
    if (!res.ok || !res.data) {
      setError(res.error ?? 'Failed to create the currency')
      return
    }
    onSaved(res.data.currency)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins size={16} className="text-primary" /> Add currency
          </DialogTitle>
          <DialogDescription>
            ISO-4217 three-letter code — e.g. AED, SAR, YER. New currencies start active.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fx-cur-code" className="text-xs text-muted-foreground">
                Code (3 letters)
              </Label>
              <Input
                id="fx-cur-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 3))}
                placeholder="AED"
                className="h-10 rounded-xl font-mono uppercase"
                maxLength={3}
                aria-describedby="fx-cur-code-hint"
              />
              <p id="fx-cur-code-hint" className="text-xs text-muted-foreground">
                Uppercase ISO-4217.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fx-cur-symbol" className="text-xs text-muted-foreground">
                Symbol (optional)
              </Label>
              <Input
                id="fx-cur-symbol"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.slice(0, 8))}
                placeholder="د.إ"
                className="h-10 rounded-xl"
                maxLength={8}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fx-cur-name" className="text-xs text-muted-foreground">
              Name
            </Label>
            <Input
              id="fx-cur-name"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 60))}
              placeholder="UAE Dirham"
              className="h-10 rounded-xl"
              maxLength={60}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fx-cur-decimals" className="text-xs text-muted-foreground">
              Display decimals (0–4)
            </Label>
            <Input
              id="fx-cur-decimals"
              type="number"
              min={0}
              max={4}
              step={1}
              value={decimals}
              onChange={(e) => setDecimals(e.target.value)}
              className="h-10 rounded-xl"
            />
          </div>
          <DialogError message={error} />
        </div>
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" className="rounded-xl" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button className="rounded-xl" disabled={!valid || saving} onClick={() => void save()}>
            {saving ? <Loader2 size={15} className="mr-2 animate-spin" /> : null}
            Add currency
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
