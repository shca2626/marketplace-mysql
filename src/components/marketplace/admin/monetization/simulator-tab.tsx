'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN · MONETIZATION → SIMULATOR (Phase 11.1, task 11-a).
//
// Server surface (live, read-only):
//   POST /api/admin/fees/simulate → { simulation, recentMatches } (payouts.view)
//
// "What WOULD be charged": event + actor context + base amount → the resolved
// rule with the FULL scope-chain trace (ORG → ORG_TYPE → PLATFORM, hit/miss
// per step) and the computed amount — no writes. recentMatches shows what was
// ACTUALLY applied for the same event + org, so simulator-vs-ledger parity is
// one glance (the acceptance gate).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDown,
  Building2,
  Calculator,
  Check,
  CircleDashed,
  Globe,
  Loader2,
  Network,
  Play,
  ShieldAlert,
  X,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { formatDate, timeAgo } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { AdminEmptyState, apiRequest, toastApiError } from '../shared'

// ── Types (contracts of /api/admin/fees/simulate) ───────────────────────────

interface FeeScopeChainStep {
  scopeType: 'ORG' | 'ORG_TYPE' | 'PLATFORM'
  scopeId: string
  ruleId: string | null
  version: number | null
  value: number | null
  hit: boolean
}

interface FeeSimulation {
  event: string
  baseAmount: number
  currency: string
  resolution: {
    rule: {
      id: string
      version: number
      dimension: string
      value: number
      currency: string | null
      scopeType: string
      scopeId: string
      precedence: number
    } | null
    chain: FeeScopeChainStep[]
    resolvedFrom: 'ORG' | 'ORG_TYPE' | 'PLATFORM' | 'NONE'
  }
  computation: { amount: number; percentApplied: number | null; dimension: string; value: number } | null
  amount: number | null
  notes: string[]
}

interface FeeAssessmentLite {
  id: string
  event: string
  ruleId: string | null
  ruleVersion: number | null
  amount: number
  currency: string
  status: string
  refType: string | null
  refId: string | null
  assessedAt: string
}

interface OrgLite {
  id: string
  name: string
  orgType: string
}

const FEE_EVENTS = [
  { value: 'ORDER_COMMISSION', label: 'Order commission' },
  { value: 'FINANCING_SUCCESS', label: 'Financing success' },
  { value: 'SUBSCRIPTION_RENEWAL', label: 'Subscription renewal' },
  { value: 'ACCREDITATION', label: 'Accreditation' },
  { value: 'SPONSORSHIP', label: 'Sponsorship / featuring' },
  { value: 'FINANCING_REFERRAL', label: 'Financing referral / service' },
]

const FEE_ORG_TYPES = ['COMPANY', 'BANK', 'MFI', 'EWALLET'] as const

const SCOPE_LABELS: Record<string, string> = {
  ORG: 'This organization',
  ORG_TYPE: 'Organization type',
  PLATFORM: 'Platform (everyone)',
}

// ── Scope-chain stepper ──────────────────────────────────────────────────────

function ChainStep({
  step,
  orgName,
  isResolved,
}: {
  step: FeeScopeChainStep
  orgName: string | null
  isResolved: boolean
}) {
  const icon =
    step.scopeType === 'ORG' ? Building2 : step.scopeType === 'ORG_TYPE' ? Network : Globe
  const Icon = icon
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      {/* connector */}
      <span
        aria-hidden
        className="absolute left-[13px] top-7 h-[calc(100%-28px)] w-px bg-border"
      />
      <span
        className={cn(
          'z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border',
          step.hit
            ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300'
            : 'border-border bg-muted text-muted-foreground'
        )}
      >
        {step.hit ? <Check size={14} /> : <X size={13} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {step.scopeType}
          </span>
          {isResolved && (
            <Badge className="rounded-full bg-emerald-100 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              resolved here
            </Badge>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {step.scopeType === 'ORG'
            ? orgName ?? (step.scopeId || 'no organization selected')
            : step.scopeType === 'ORG_TYPE'
              ? step.scopeId || 'no org type selected'
              : 'every organization'}
        </p>
        <p className="mt-0.5 text-sm font-semibold tabular-nums">
          {step.hit ? (
            step.value !== null ? `${step.value}${step.ruleId ? ` · v${step.version}` : ''}` : '—'
          ) : (
            <span className="text-xs font-normal text-muted-foreground">no active rule</span>
          )}
        </p>
      </div>
    </li>
  )
}

// ── Simulator tab ────────────────────────────────────────────────────────────

export function SimulatorTab() {
  // Form state
  const [event, setEvent] = useState('ORDER_COMMISSION')
  const [orgId, setOrgId] = useState('')
  const [orgType, setOrgType] = useState('')
  const [baseAmount, setBaseAmount] = useState('1000')
  const [currency, setCurrency] = useState('USD')

  // Result state
  const [simulation, setSimulation] = useState<FeeSimulation | null>(null)
  const [recentMatches, setRecentMatches] = useState<FeeAssessmentLite[]>([])
  const [running, setRunning] = useState(false)
  const [resultError, setResultError] = useState<string | null>(null)

  // Org directory for the picker (optional actor context)
  const [orgs, setOrgs] = useState<OrgLite[]>([])
  useEffect(() => {
    let alive = true
    void apiRequest<{ organizations: OrgLite[] }>('/api/admin/organizations').then((res) => {
      if (alive && res.ok && res.data) setOrgs(res.data.organizations)
    })
    return () => {
      alive = false
    }
  }, [])

  const selectedOrg = useMemo(() => orgs.find((o) => o.id === orgId) ?? null, [orgs, orgId])

  const runSimulation = async () => {
    const amount = Number(baseAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ title: 'Enter a positive base amount to simulate against', variant: 'destructive' })
      return
    }
    setRunning(true)
    setResultError(null)
    const res = await apiRequest<{ simulation: FeeSimulation; recentMatches: FeeAssessmentLite[] }>(
      '/api/admin/fees/simulate',
      {
        method: 'POST',
        body: JSON.stringify({
          event,
          orgId: orgId || null,
          orgType: orgType || null,
          baseAmount: amount,
          currency: currency.trim().toUpperCase() || 'USD',
        }),
      }
    )
    setRunning(false)
    if (!res.ok) {
      setResultError(res.error ?? 'Simulation failed')
      toastApiError(res.error, 'Simulation failed')
      return
    }
    setSimulation(res.data!.simulation)
    setRecentMatches(res.data!.recentMatches ?? [])
  }

  const rule = simulation?.resolution.rule ?? null
  const parity =
    simulation && recentMatches.length > 0 && simulation.amount !== null
      ? recentMatches.some((m) => Math.abs(m.amount - simulation.amount!) < 0.005)
      : null

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        {/* ── The ask: event + actor + amount ─────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calculator size={16} className="text-primary" /> What would be charged?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="sim-event">Event</Label>
              <Select value={event} onValueChange={setEvent}>
                <SelectTrigger id="sim-event" className="rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEE_EVENTS.map((e) => (
                    <SelectItem key={e.value} value={e.value}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sim-org">Actor organization (optional)</Label>
              <Select value={orgId || 'none'} onValueChange={(v) => setOrgId(v === 'none' ? '' : v)}>
                <SelectTrigger id="sim-org" className="rounded-lg">
                  <SelectValue placeholder="No specific organization" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="none">No specific organization</SelectItem>
                  {orgs.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name} · {o.orgType}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                The chain starts at the org (ORG scope), then falls through.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sim-org-type">Organization type (optional)</Label>
              <Select value={orgType || 'none'} onValueChange={(v) => setOrgType(v === 'none' ? '' : v)}>
                <SelectTrigger id="sim-org-type" className="rounded-lg">
                  <SelectValue placeholder="Any org type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Any org type</SelectItem>
                  {FEE_ORG_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_90px] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sim-amount">Base amount</Label>
                <Input
                  id="sim-amount"
                  type="number"
                  min={0}
                  step={0.01}
                  className="rounded-lg tabular-nums"
                  placeholder="1000"
                  value={baseAmount}
                  onChange={(e) => setBaseAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sim-currency">Currency</Label>
                <Input
                  id="sim-currency"
                  className="rounded-lg uppercase"
                  maxLength={3}
                  placeholder="USD"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                />
              </div>
            </div>

            <Button className="w-full rounded-xl" onClick={() => void runSimulation()} disabled={running}>
              {running ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Play size={14} className="mr-1.5" />}
              Simulate
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Read-only — nothing is written. Recent applied fees for the same event + org appear
              next to the result for a parity check.
            </p>
          </CardContent>
        </Card>

        {/* ── The answer ─────────────────────────────────────────────────── */}
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                Resolution
                {simulation && (
                  <Badge
                    className={cn(
                      'ml-1 rounded-full font-medium',
                      simulation.resolution.resolvedFrom === 'NONE'
                        ? 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400'
                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    )}
                  >
                    {simulation.resolution.resolvedFrom === 'NONE'
                      ? 'no rule — legacy fallback'
                      : `resolved from ${simulation.resolution.resolvedFrom}`}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!simulation ? (
                <AdminEmptyState
                  icon={CircleDashed}
                  title="Nothing simulated yet"
                  description="Pick an event and a base amount — the resolver traces every scope and computes the fee the next charge would use."
                />
              ) : resultError ? (
                <AdminEmptyState icon={ShieldAlert} title="Simulation failed" description={resultError} />
              ) : (
                <>
                  {/* Big number */}
                  <div className="rounded-2xl border bg-muted/30 p-4">
                    <div className="flex flex-wrap items-end justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Fee on {simulation.baseAmount.toLocaleString()} {simulation.currency}
                        </p>
                        <p className="mt-1 text-4xl font-extrabold tabular-nums">
                          {simulation.amount === null ? '—' : simulation.amount.toLocaleString()}
                          <span className="ml-1.5 text-base font-semibold text-muted-foreground">
                            {simulation.currency}
                          </span>
                        </p>
                      </div>
                      {rule && (
                        <div className="text-right text-xs text-muted-foreground">
                          <p>
                            {rule.dimension === 'PERCENT' ? `${rule.value}% of base` : `${rule.value} ${rule.currency ?? ''} flat`}
                          </p>
                          <p className="font-mono text-[10px]">
                            rule v{rule.version} · prec {rule.precedence}
                          </p>
                        </div>
                      )}
                    </div>
                    {parity !== null && (
                      <p
                        className={cn(
                          'mt-3 flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium',
                          parity
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        )}
                      >
                        {parity ? <Check size={13} /> : <ArrowDown size={13} />}
                        {parity
                          ? 'Matches the most recent fee actually applied for this event + org.'
                          : 'Differs from the most recent applied fee below — a rule may have changed since.'}
                      </p>
                    )}
                  </div>

                  {/* Scope-chain stepper */}
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Scope chain — first hit wins
                    </p>
                    <ul>
                      {simulation.resolution.chain.map((step) => (
                        <ChainStep
                          key={`${step.scopeType}:${step.scopeId}`}
                          step={step}
                          orgName={selectedOrg && step.scopeType === 'ORG' ? selectedOrg.name : null}
                          isResolved={Boolean(rule) && simulation.resolution.resolvedFrom === step.scopeType}
                        />
                      ))}
                    </ul>
                  </div>

                  {/* Notes */}
                  {(simulation.notes.length > 0 || !rule) && (
                    <ul className="space-y-1 rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
                      {!rule && (
                        <li className="flex items-center gap-1.5">
                          <CircleDashed size={12} /> No rule at any scope — the legacy fallback
                          (platform settings) applies today.
                        </li>
                      )}
                      {simulation.notes.map((n) => (
                        <li key={n} className="flex items-center gap-1.5">
                          <CircleDashed size={12} /> {n}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Recent applied fees (the parity evidence) ──────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Network size={16} className="text-primary" /> Recent fees actually applied
            <span className="text-xs font-normal text-muted-foreground">
              {simulation
                ? `${simulation.event}${selectedOrg ? ` · ${selectedOrg.name}` : ''} — from the immutable ledger`
                : 'run a simulation with an organization selected'}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentMatches.length === 0 ? (
            <AdminEmptyState
              icon={CircleDashed}
              title="No applied fees for this event + org yet"
              description="When a real charge lands (a payout, an accepted financing offer, a renewal), its assessment appears here — the simulator must match those numbers."
            />
          ) : (
            <div className="overflow-x-auto rounded-2xl border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="px-4 py-3 font-medium">Fee</th>
                    <th scope="col" className="px-4 py-3 font-medium">Rule</th>
                    <th scope="col" className="px-4 py-3 font-medium">Ref</th>
                    <th scope="col" className="px-4 py-3 font-medium">Assessed</th>
                  </tr>
                </thead>
                <tbody>
                  {recentMatches.map((m) => (
                    <tr key={m.id} className="border-b transition-colors last:border-0 hover:bg-accent/50">
                      <td className="px-4 py-3 font-semibold tabular-nums">
                        {m.amount.toLocaleString()} {m.currency}
                        {m.status === 'REVERSAL' && (
                          <Badge className="ml-2 rounded-full bg-rose-100 text-[10px] text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                            reversal
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {m.ruleId ? (
                          <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] font-bold">
                            v{m.ruleVersion ?? '—'}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">legacy</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {m.refType ? `${m.refType.toLowerCase()} · ${m.refId?.slice(-8)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground" title={formatDate(m.assessedAt)}>
                        {timeAgo(m.assessedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
