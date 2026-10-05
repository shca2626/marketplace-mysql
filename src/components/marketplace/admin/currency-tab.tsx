'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN · CURRENCY & RATES (Phase 8 — everything dynamic, nothing hardcoded)
// Live exchange-rate management: refresh from open feeds, manual overrides,
// per-currency display config, auto-refresh window. The storefront switcher
// and every formatted price read from this table.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import {
  BadgeCheck,
  Coins,
  Gauge,
  HandCoins,
  Loader2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Zap,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { rateLabel, syncAgeLabel } from '@/lib/currency'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { AdminEmptyState, apiRequest, toastApiError } from './shared'

interface CurrencyRow {
  id: string
  code: string
  name: string
  symbol: string
  rateToUsd: number
  displayDecimals: number
  source: string
  isManual: boolean
  isActive: boolean
  sortOrder: number
  lastSyncedAt: string | null
}

interface SettingsShape {
  base: string
  autoRefreshMinutes: number
}

interface RefreshResultShape {
  updated: string[]
  skippedManual: string[]
  source: string | null
  failed: boolean
  message: string
}

function SourceBadge({ row }: { row: CurrencyRow }) {
  if (row.code === 'USD')
    return (
      <Badge className="bg-bh-navy text-[10px] font-bold uppercase tracking-wide text-bh-gold hover:bg-bh-navy">
        base
      </Badge>
    )
  if (row.isManual)
    return (
      <Badge className="bg-amber-100 text-[10px] font-bold uppercase tracking-wide text-amber-800 hover:bg-amber-100">
        manual
      </Badge>
    )
  if (row.source.startsWith('live'))
    return (
      <Badge className="bg-emerald-100 text-[10px] font-bold uppercase tracking-wide text-emerald-700 hover:bg-emerald-100">
        live
      </Badge>
    )
  return (
    <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wide text-bh-muted">
      seed
    </Badge>
  )
}

export function CurrencyTab() {
  const { data, loading, error, refetch } = useApi<{ currencies: CurrencyRow[]; settings: SettingsShape }>(
    '/api/admin/currency'
  )
  const rows = data?.currencies ?? []
  const settings = data?.settings
  const [refreshing, setRefreshing] = useState(false)
  const [busyCode, setBusyCode] = useState<string | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualRow, setManualRow] = useState<CurrencyRow | null>(null)
  const [manualValue, setManualValue] = useState('')
  // Sync the input with the loaded settings without an effect-driven setState:
  // derive the displayed value until the admin starts editing locally.
  const [refreshMinutesDraft, setRefreshMinutesDraft] = useState<string | null>(null)
  const refreshMinutes = refreshMinutesDraft ?? (settings ? String(settings.autoRefreshMinutes) : '')
  const [savingSettings, setSavingSettings] = useState(false)

  const refreshLive = async () => {
    setRefreshing(true)
    const res = await apiRequest<{ result: RefreshResultShape }>('/api/admin/currency', {
      method: 'POST',
      body: JSON.stringify({ action: 'refresh' }),
    })
    setRefreshing(false)
    if (!res.ok || !res.data) {
      toastApiError(res)
      return
    }
    if (res.data.result.failed) {
      toast({ title: 'Live feeds unreachable', description: res.data.result.message, variant: 'destructive' })
    } else {
      toast({ title: 'Rates refreshed', description: res.data.result.message })
    }
    void refetch()
  }

  const saveManual = async () => {
    if (!manualRow) return
    const rate = Number(manualValue)
    if (!Number.isFinite(rate) || rate <= 0) {
      toast({ title: 'Invalid rate', description: 'Enter a positive number, e.g. 535.5', variant: 'destructive' })
      return
    }
    setBusyCode(manualRow.code)
    const res = await apiRequest('/api/admin/currency', {
      method: 'POST',
      body: JSON.stringify({ action: 'manual-rate', code: manualRow.code, rateToUsd: rate }),
    })
    setBusyCode(null)
    if (!res.ok) {
      toastApiError(res)
      return
    }
    toast({ title: `${manualRow.code} rate pinned`, description: `1 USD = ${rate} ${manualRow.code} (manual override)` })
    setManualOpen(false)
    void refetch()
  }

  const resetToLive = async (code: string) => {
    setBusyCode(code)
    const res = await apiRequest('/api/admin/currency', {
      method: 'POST',
      body: JSON.stringify({ action: 'reset-live', code }),
    })
    setBusyCode(null)
    if (!res.ok) {
      toastApiError(res)
      return
    }
    toast({ title: `${code} back on live rates`, description: 'Manual override removed — feed rate restored.' })
    void refetch()
  }

  const toggleActive = async (row: CurrencyRow, next: boolean) => {
    setBusyCode(row.code)
    const res = await apiRequest('/api/admin/currency', {
      method: 'PATCH',
      body: JSON.stringify({ meta: { code: row.code, isActive: next } }),
    })
    setBusyCode(null)
    if (!res.ok) {
      toastApiError(res)
      return
    }
    void refetch()
  }

  const changeDecimals = async (row: CurrencyRow, next: number) => {
    setBusyCode(row.code)
    const res = await apiRequest('/api/admin/currency', {
      method: 'PATCH',
      body: JSON.stringify({ meta: { code: row.code, displayDecimals: next } }),
    })
    setBusyCode(null)
    if (!res.ok) toastApiError(res)
    else void refetch()
  }

  const saveSettings = async () => {
    const minutes = Number(refreshMinutes)
    if (!Number.isFinite(minutes) || minutes < 5 || minutes > 10080) {
      toast({ title: 'Invalid window', description: 'Auto-refresh must be between 5 minutes and 7 days.', variant: 'destructive' })
      return
    }
    setSavingSettings(true)
    const res = await apiRequest('/api/admin/currency', {
      method: 'PATCH',
      body: JSON.stringify({ settings: { autoRefreshMinutes: minutes } }),
    })
    setSavingSettings(false)
    if (!res.ok) {
      toastApiError(res)
      return
    }
    toast({ title: 'Auto-refresh window saved', description: `Stale rates refresh themselves after ${minutes} minutes.` })
  }

  const liveCount = rows.filter((r) => r.source.startsWith('live') && !r.isManual && r.code !== 'USD').length
  const manualCount = rows.filter((r) => r.isManual).length
  const activeCount = rows.filter((r) => r.isActive).length
  const newestSync = rows.reduce<string | null>((acc, r) => {
    if (!r.lastSyncedAt) return acc
    return !acc || r.lastSyncedAt > acc ? r.lastSyncedAt : acc
  }, null)

  return (
    <div className="space-y-6">
      {/* ── KPI strip ─────────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bh-bg-gold">
              <Coins size={18} className="text-bh-gold-dark" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-bh-muted">Base currency</p>
              <p className="truncate text-lg font-bold text-bh-navy">{settings?.base ?? 'USD'}</p>
              <p className="text-[11px] text-bh-muted">All catalog prices stored in this currency</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
              <Zap size={18} className="text-emerald-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-bh-muted">Live-tracked</p>
              <p className="truncate text-lg font-bold text-bh-navy">{liveCount} currencies</p>
              <p className="text-[11px] text-bh-muted">{newestSync ? syncAgeLabel(newestSync) : 'not synced yet'}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50">
              <HandCoins size={18} className="text-amber-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-bh-muted">Manual overrides</p>
              <p className="truncate text-lg font-bold text-bh-navy">{manualCount}</p>
              <p className="text-[11px] text-bh-muted">Pinned rates that live refresh skips</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bh-bg-soft">
              <Gauge size={18} className="text-bh-navy" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-bh-muted">Shown in switcher</p>
              <p className="truncate text-lg font-bold text-bh-navy">{activeCount} of {rows.length}</p>
              <p className="text-[11px] text-bh-muted">Visible to storefront visitors</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Live refresh + settings ───────────────────────────────────────── */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-bh-navy">Live exchange rates</h3>
            <p className="max-w-xl text-sm text-bh-muted">
              Rates are fetched from open exchange feeds (ExchangeRate-API → jsDelivr currency-api fallback) and stored
              in the database — the storefront converts every price through them. Nothing is hardcoded: when
              1 USD → YER moves from 535.5 to a new market rate, refresh and everything follows.
            </p>
          </div>
          <div className="flex shrink-0 items-end gap-2">
            <div className="w-40">
              <Label htmlFor="refresh-minutes" className="text-xs text-bh-muted">
                Auto-refresh window (min)
              </Label>
              <Input
                id="refresh-minutes"
                value={refreshMinutes}
                onChange={(e) => setRefreshMinutesDraft(e.target.value)}
                inputMode="numeric"
                className="mt-1 h-9"
              />
            </div>
            <Button variant="outline" className="h-9" onClick={saveSettings} disabled={savingSettings}>
              {savingSettings ? <Loader2 size={14} className="animate-spin" /> : <BadgeCheck size={14} />}
              Save
            </Button>
            <Button className="h-9 bg-bh-gold text-bh-navy-deep hover:bg-bh-gold-dark" onClick={refreshLive} disabled={refreshing}>
              {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Refresh live rates
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Rates table ───────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="p-6">
              <AdminEmptyState
                icon={Coins}
                title="Failed to load currencies"
                description={error}
                action={
                  <Button variant="outline" size="sm" onClick={() => void refetch()}>
                    <RefreshCw size={14} /> Retry
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Currency</TableHead>
                    <TableHead>Rate (1 USD =)</TableHead>
                    <TableHead>Inverse (1 = USD)</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Synced</TableHead>
                    <TableHead className="text-center">Decimals</TableHead>
                    <TableHead className="text-center">In switcher</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id} className={cn(!row.isActive && 'opacity-50')}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-bh-navy">{row.code}</span>
                          <span className="text-xs text-bh-muted">{row.symbol}</span>
                          <span className="hidden text-xs text-bh-muted sm:inline">{row.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm font-semibold text-bh-navy">
                          {row.code === 'USD' ? '1 (definition)' : row.rateToUsd.toLocaleString('en-US', { maximumFractionDigits: 4 })}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-bh-muted">
                          {row.code === 'USD' ? '—' : `$${(1 / row.rateToUsd).toLocaleString('en-US', { maximumFractionDigits: 4 })}`}
                        </span>
                      </TableCell>
                      <TableCell>
                        <SourceBadge row={row} />
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-bh-muted">{syncAgeLabel(row.lastSyncedAt)}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="inline-flex overflow-hidden rounded-md border">
                          {[0, 2, 3].map((d) => (
                            <button
                              key={d}
                              onClick={() => changeDecimals(row, d)}
                              disabled={busyCode === row.code || row.displayDecimals === d}
                              className={cn(
                                'px-2 py-1 text-xs font-semibold transition',
                                row.displayDecimals === d
                                  ? 'bg-bh-navy text-bh-gold'
                                  : 'bg-background text-bh-muted hover:bg-muted'
                              )}
                              aria-label={`Show ${d} decimals for ${row.code}`}
                            >
                              {d}
                            </button>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={row.isActive}
                          onCheckedChange={(next) => toggleActive(row, next)}
                          disabled={busyCode === row.code || row.code === 'USD'}
                          aria-label={`Show ${row.code} in the storefront switcher`}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={row.code === 'USD' || busyCode === row.code}
                            onClick={() => {
                              setManualRow(row)
                              setManualValue(String(row.rateToUsd))
                              setManualOpen(true)
                            }}
                            aria-label={`Set manual rate for ${row.code}`}
                          >
                            <Pencil size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={!row.isManual || busyCode === row.code}
                            onClick={() => resetToLive(row.code)}
                            aria-label={`Reset ${row.code} to live rate`}
                            title="Reset to live rate"
                          >
                            <RotateCcw size={14} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Manual override dialog ─────────────────────────────────────────── */}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Manual rate — {manualRow?.code} {manualRow ? `(${manualRow.name})` : ''}
            </DialogTitle>
            <DialogDescription>
              Pin an exact exchange rate (e.g. {manualRow ? rateLabel({ ...manualRow, rateToUsd: 535.5 }) : ''}).
              Live refresh will skip this currency until you reset it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="manual-rate">1 USD equals how many {manualRow?.code}?</Label>
            <Input
              id="manual-rate"
              value={manualValue}
              onChange={(e) => setManualValue(e.target.value)}
              inputMode="decimal"
              placeholder="535.5"
              autoFocus
            />
            <p className="text-xs text-bh-muted">
              Used when you negotiate special settlement rates or the feed is temporarily wrong for your market.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualOpen(false)}>
              Cancel
            </Button>
            <Button className="bg-bh-gold text-bh-navy-deep hover:bg-bh-gold-dark" onClick={saveManual} disabled={busyCode === manualRow?.code}>
              {busyCode === manualRow?.code ? <Loader2 size={14} className="animate-spin" /> : <HandCoins size={14} />}
              Pin rate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
