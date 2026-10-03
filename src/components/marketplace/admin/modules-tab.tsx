'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN MODULES TAB — Phase 5.3 (module activation system).
//
// The activation matrix: modules × scopes (Platform / org types / individual
// orgs). Each cell writes a ModuleActivation override; the effective state
// resolves through ORG > ORG_TYPE > PLATFORM > default (mirrored in the
// modules service and enforced across nav + APIs). Core modules (the retail
// marketplace) are locked on. This is the substrate the mergedplan describes
// for future subscription tiers — a tier = a bundle of activations + limits.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import {
  Building2,
  Layers,
  Lock,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { apiRequest, toastApiError } from './shared'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

interface ModuleRow {
  id: string
  key: string
  name: string
  description: string | null
  domain: string
  core: boolean
  defaultOn: boolean
  activations: {
    id: string
    scopeType: string
    scopeId: string
    enabled: boolean
    note: string | null
    updatedAt: string
  }[]
}

interface EffectiveResponse {
  orgTypes: Record<string, Record<string, boolean>>
  orgs: { id: string; name: string; orgType: string; state: Record<string, boolean> }[]
}

interface ModulesResponse {
  modules: ModuleRow[]
  effective: EffectiveResponse
}

const ORG_TYPE_COLUMNS = ['COMPANY', 'BANK', 'MFI', 'EWALLET'] as const
const ORG_TYPE_LABELS: Record<string, string> = {
  COMPANY: 'Companies',
  BANK: 'Banks',
  MFI: 'MFIs',
  EWALLET: 'E-wallets',
}

const DOMAIN_LABELS: Record<string, string> = {
  STOREFRONT: 'Storefront',
  BUYER: 'Buyer console',
  SELLER: 'Seller console',
  FINANCIER: 'Financier console',
  PLATFORM: 'Platform',
}

export function ModulesTab() {
  const { data, loading, refetch } = useApi<ModulesResponse>('/api/admin/modules')
  const [busy, setBusy] = useState<string | null>(null)
  const [orgDialogOpen, setOrgDialogOpen] = useState(false)
  const [orgQuery, setOrgQuery] = useState('')

  const modules = useMemo(() => data?.modules ?? [], [data])
  const effective = data?.effective

  const orgOverrides = useMemo(
    () =>
      modules
        .flatMap((m) =>
          m.activations
            .filter((a) => a.scopeType === 'ORG')
            .map((a) => ({ module: m, activation: a }))
        ),
    [modules]
  )
  const overriddenOrgs = useMemo(() => {
    const map = new Map<string, { name: string; orgType: string; keys: string[] }>()
    for (const o of effective?.orgs ?? []) {
      map.set(o.id, { name: o.name, orgType: o.orgType, keys: Object.keys(o.state).filter((k) => o.state[k]) })
    }
    return map
  }, [effective])

  const findActivation = (moduleKey: string, scopeType: string, scopeId: string) =>
    modules.find((m) => m.key === moduleKey)?.activations.find(
      (a) => a.scopeType === scopeType && a.scopeId === scopeId
    )

  /** Toggle one cell — writes (or removes) the override at that scope. */
  const toggle = async (moduleKey: string, scopeType: string, scopeId: string, next: boolean) => {
    setBusy(`${moduleKey}|${scopeType}|${scopeId}`)
    const res = await apiRequest<ModulesResponse>('/api/admin/modules', {
      method: 'POST',
      body: JSON.stringify({ moduleKey, scopeType, scopeId, enabled: next }),
    })
    setBusy(null)
    if (!res.ok || !res.data) {
      toastApiError(res.error, 'Activation change failed')
      return
    }
    // refresh list + matrix
    void refetch()
    toast({
      title: next ? 'Module enabled' : 'Module disabled',
      description: `${moduleKey} at ${scopeType}${scopeId ? `:${scopeId}` : ''} — effective immediately.`,
    })
  }

  const clearOverride = async (moduleKey: string, scopeType: string, scopeId: string) => {
    setBusy(`${moduleKey}|${scopeType}|${scopeId}|clear`)
    const res = await apiRequest<ModulesResponse>('/api/admin/modules', {
      method: 'POST',
      body: JSON.stringify({ moduleKey, scopeType, scopeId, enabled: false, remove: true }),
    })
    setBusy(null)
    if (!res.ok || !res.data) {
      toastApiError(res.error, 'Override removal failed')
      return
    }
    void refetch()
    toast({ title: 'Override removed', description: 'Falls through to the next scope in the chain.' })
  }

  const filteredOrgs = useMemo(() => {
    const q = orgQuery.trim().toLowerCase()
    const list = [...overriddenOrgs.entries()].map(([id, o]) => ({ id, ...o }))
    if (!q) return list
    return list.filter((o) => o.name.toLowerCase().includes(q) || o.orgType.toLowerCase().includes(q))
  }, [overriddenOrgs, orgQuery])

  return (
    <div className="space-y-6">
      {/* Explainer */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-start gap-3 p-4">
          <SlidersHorizontal size={16} className="mt-0.5 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">Module activation</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Switch platform capabilities on/off per scope. Resolution chain:{' '}
              <span className="font-semibold">organization → organization type → platform → default</span> — the most
              specific override wins. Changes hit navigation, storefront sections and the guarded APIs within
              seconds; every flip is audit-logged.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* The matrix */}
      <Card>
        <CardContent className="p-0">
          <div className="border-b px-5 py-4">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <Layers size={15} className="text-primary" /> Activation matrix
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Columns write overrides at that scope — leave a cell untouched to inherit from the chain.
            </p>
          </div>
          {loading ? (
            <div className="space-y-3 p-5">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left">
                    <th className="px-5 py-3 font-semibold">Module</th>
                    <th className="px-3 py-3 text-center font-semibold">Platform</th>
                    {ORG_TYPE_COLUMNS.map((t) => (
                      <th key={t} className="px-3 py-3 text-center font-semibold">
                        {ORG_TYPE_LABELS[t]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {modules.map((m) => (
                    <tr key={m.key} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="max-w-[280px] px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">{m.name}</p>
                          {m.core && (
                            <Badge variant="outline" className="gap-1 rounded-full px-1.5 text-[10px]">
                              <Lock size={9} /> Core
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{m.description}</p>
                        <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                          {DOMAIN_LABELS[m.domain] ?? m.domain} · {m.key}
                        </p>
                      </td>
                      {/* Platform column */}
                      <td className="px-3 py-3.5 text-center">
                        <MatrixCell
                          moduleKey={m.key}
                          scopeType="PLATFORM"
                          scopeId=""
                          locked={m.core}
                          override={findActivation(m.key, 'PLATFORM', '')}
                          effectiveValue={m.defaultOn}
                          busyKey={busy}
                          onToggle={toggle}
                          onClear={clearOverride}
                        />
                      </td>
                      {/* Org type columns */}
                      {ORG_TYPE_COLUMNS.map((t) => (
                        <td key={t} className="px-3 py-3.5 text-center">
                          <MatrixCell
                            moduleKey={m.key}
                            scopeType="ORG_TYPE"
                            scopeId={t}
                            locked={m.core}
                            override={findActivation(m.key, 'ORG_TYPE', t)}
                            effectiveValue={effective?.orgTypes[t]?.[m.key] ?? m.defaultOn}
                            busyKey={busy}
                            onToggle={toggle}
                            onClear={clearOverride}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Org overrides */}
      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-bold">
                <Building2 size={15} className="text-primary" /> Individual organization overrides
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                The most specific scope — wins over org-type and platform for that organization only.
              </p>
            </div>
            <Button variant="outline" className="rounded-xl" onClick={() => setOrgDialogOpen(true)}>
              <Plus size={14} className="mr-1.5" /> Manage by organization
            </Button>
          </div>
          {orgOverrides.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm font-medium text-muted-foreground">No organization overrides yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Everything currently resolves through org types and the platform scope.
              </p>
            </div>
          ) : (
            <ul className="max-h-96 divide-y overflow-y-auto">
              {orgOverrides.map(({ module: m, activation: a }) => {
                const org = overriddenOrgs.get(a.scopeId)
                return (
                  <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {org?.name ?? a.scopeId}
                        <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {org?.orgType ?? 'ORG'}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {m.name} · {a.enabled ? 'enabled' : 'disabled'} here · updated{' '}
                        {new Date(a.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={a.enabled}
                        disabled={busy === `${m.key}|ORG|${a.scopeId}`}
                        onCheckedChange={(v) => void toggle(m.key, 'ORG', a.scopeId, v)}
                        aria-label={`${m.name} for ${org?.name ?? a.scopeId}`}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive"
                        onClick={() => void clearOverride(m.key, 'ORG', a.scopeId)}
                        aria-label="Remove override"
                      >
                        <X size={14} />
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Org picker dialog */}
      <Dialog open={orgDialogOpen} onOpenChange={setOrgDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Organizations with overrides</DialogTitle>
            <DialogDescription>
              These organizations currently resolve outside the default chain — open one in the Organizations console
              to manage its full context.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={orgQuery}
              onChange={(e) => setOrgQuery(e.target.value)}
              placeholder="Search by name or type…"
              className="h-9 rounded-lg pl-8"
            />
          </div>
          <div className="max-h-72 space-y-1.5 overflow-y-auto">
            {filteredOrgs.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No matching organizations.</p>
            ) : (
              filteredOrgs.map((o) => (
                <div
                  key={o.id}
                  className="flex items-center justify-between gap-3 rounded-xl border bg-muted/30 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{o.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {ORG_TYPE_LABELS[o.orgType] ?? o.orgType} ·{' '}
                      {o.keys.length} of {modules.filter((m) => !m.core).length} modules on
                    </p>
                  </div>
                  <Badge variant="outline" className="rounded-full text-[10px]">
                    {o.orgType}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** One matrix cell: an override switch + the inherited effective state. */
function MatrixCell({
  moduleKey,
  scopeType,
  scopeId,
  locked,
  override,
  effectiveValue,
  busyKey,
  onToggle,
  onClear,
}: {
  moduleKey: string
  scopeType: string
  scopeId: string
  locked: boolean
  override?: { id: string; enabled: boolean }
  effectiveValue: boolean
  busyKey: string | null
  onToggle: (moduleKey: string, scopeType: string, scopeId: string, next: boolean) => Promise<void>
  onClear: (moduleKey: string, scopeType: string, scopeId: string) => Promise<void>
}) {
  const cellKey = `${moduleKey}|${scopeType}|${scopeId}`
  const busy = busyKey === cellKey || busyKey === `${cellKey}|clear`

  if (locked) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/60" title="Core module — always on">
        <Lock size={12} /> on
      </span>
    )
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1.5">
        <Switch
          checked={override ? override.enabled : effectiveValue}
          disabled={busy}
          onCheckedChange={(v) => void onToggle(moduleKey, scopeType, scopeId, v)}
          aria-label={`${moduleKey} at ${scopeType}${scopeId ? ` ${scopeId}` : ''}`}
        />
        {override && (
          <button
            type="button"
            onClick={() => void onClear(moduleKey, scopeType, scopeId)}
            className="rounded-md p-0.5 text-muted-foreground/60 transition-colors hover:text-foreground"
            title="Remove this override — inherit from the chain"
            aria-label="Remove override"
          >
            <RotateCcw size={11} />
          </button>
        )}
      </div>
      <span
        className={cn(
          'text-[9px] font-bold uppercase tracking-wider',
          effectiveValue ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground/50'
        )}
      >
        {override ? (override.enabled ? 'on' : 'off') : effectiveValue ? 'inherited' : 'inherited off'}
      </span>
    </div>
  )
}
