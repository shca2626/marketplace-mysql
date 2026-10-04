'use client'

// ─────────────────────────────────────────────────────────────────────────────
// SERVICES DIRECTORY — the public tab of the applicant financing surface.
// GET /api/financing/services (?kind=&category=&search=&page= — 24/page).
// Cards → detail dialog (full description + features/eligibility + coverage +
// the composed requirements preview, labels only) → the 3-step wizard.
// Auth-gated CTA: signed-out visitors get the auth modal with a redirect back.
// Multi-financier mode (DP-25): pick 2+ FINANCING services of the same
// category → sibling applications sharing a multiGroupId.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  BadgeCheck,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Coins,
  HandCoins,
  Layers,
  Loader2,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  Wallet,
  X,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'
import { useApi } from '@/hooks/use-api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { apiRequest } from '@/components/marketplace/b2b/b2b-shared'
import { useDebounced } from '@/components/marketplace/b2b/b2b-shared'
import {
  categoryLabel,
  formatMoney,
  rateTypeLabel,
} from '@/components/marketplace/financier/financing-status-badge'
import { RequirementChecklist, rowsFromRequirements } from './checklist'
import { ApplicationWizard } from './wizard'
import {
  clearFinancingTarget,
  readFinancingTarget,
  type FinancingTargetPrefill,
  type PublicServiceCardDTO,
  type PublicServiceDetailDTO,
  type ServicesDirectoryResponse,
} from './shared'

const CATEGORIES = [
  'WORKING_CAPITAL', 'INVOICE_FINANCING', 'PO_FINANCING', 'EQUIPMENT', 'VEHICLE',
  'HOME', 'EDUCATION', 'AGRICULTURE', 'MICROENTERPRISE', 'SME', 'OTHER',
  'SUPPLIER_QUALIFICATION', 'VENDOR_APPROVAL',
] as const

export function DirectoryTab({
  onManageDocuments,
  onApplied,
}: {
  onManageDocuments: () => void
  onApplied: () => void
}) {
  const user = useMarketplace((s) => s.user)
  const openAuth = useMarketplace((s) => s.openAuth)

  const [kind, setKind] = useState<'ALL' | 'FINANCING' | 'ACCREDITATION'>('ALL')
  const [category, setCategory] = useState<string>('ALL')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 350)
  const [page, setPage] = useState(1)

  // Quote/order handoff (sessionStorage) — context chip + wizard prefill.
  // Lazy SSR-safe initializer: this tab only mounts on real client navigations
  // (consoles are never server-rendered — see MarketplaceApp), so reading
  // sessionStorage here cannot cause a hydration mismatch (bell pattern).
  const [target, setTarget] = useState<FinancingTargetPrefill | null>(() => readFinancingTarget())
  const prefillToastRef = useRef(false)

  useEffect(() => {
    if (target && !prefillToastRef.current) {
      prefillToastRef.current = true
      toast({
        title: `Select a financing service for your ${target.label}`,
        description: 'The application will be linked to it automatically.',
      })
    }
  }, [target])

  const query = useMemo(() => {
    const sp = new URLSearchParams()
    if (kind !== 'ALL') sp.set('kind', kind)
    if (category !== 'ALL') sp.set('category', category)
    if (debouncedSearch.trim()) sp.set('search', debouncedSearch.trim())
    if (page > 1) sp.set('page', String(page))
    return `/api/financing/services${sp.size ? `?${sp}` : ''}`
  }, [kind, category, debouncedSearch, page])

  const { data, loading } = useApi<ServicesDirectoryResponse>(query)
  const services = data?.services ?? []

  const changeKind = (k: 'ALL' | 'FINANCING' | 'ACCREDITATION') => {
    setKind(k)
    setPage(1)
  }
  const changeCategory = (c: string) => {
    setCategory(c)
    setPage(1)
  }
  const changeSearch = (v: string) => {
    setSearch(v)
    setPage(1)
  }

  // ── Detail dialog + wizard ──
  const [detail, setDetail] = useState<PublicServiceDetailDTO | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [wizardServices, setWizardServices] = useState<PublicServiceDetailDTO[] | null>(null)

  // ── Multi-apply mode ──
  const [multiMode, setMultiMode] = useState(false)
  const [picked, setPicked] = useState<string[]>([])

  const openDetail = async (id: string) => {
    setDetailLoading(true)
    const res = await apiRequest<{ service: PublicServiceDetailDTO }>(`/api/financing/services/${id}`)
    setDetailLoading(false)
    if (!res.ok || !res.data) {
      toast({ title: 'Could not load the service', description: res.error ?? 'Please try again', variant: 'destructive' })
      return
    }
    setDetail(res.data.service)
  }

  const loadServicesForWizard = async (ids: string[]): Promise<PublicServiceDetailDTO[] | null> => {
    const results = await Promise.all(
      ids.map((id) => apiRequest<{ service: PublicServiceDetailDTO }>(`/api/financing/services/${id}`))
    )
    const loaded = results.filter((r) => r.ok && r.data).map((r) => r.data!.service)
    if (loaded.length !== ids.length) {
      toast({ title: 'Could not load one of the services', description: 'Please try again', variant: 'destructive' })
      return null
    }
    return loaded
  }

  const startApplication = async (id: string) => {
    if (!user) {
      openAuth('login', { view: 'financing', params: { financingTab: 'directory' } })
      return
    }
    const loaded = await loadServicesForWizard([id])
    if (loaded) {
      setDetail(null)
      setWizardServices(loaded)
    }
  }

  const startMultiApplication = async () => {
    if (!user) {
      openAuth('login', { view: 'financing', params: { financingTab: 'directory' } })
      return
    }
    if (picked.length < 2) {
      toast({ title: 'Pick at least two services', description: 'Multi-financier applications compare offers from 2+ financiers.' })
      return
    }
    const loaded = await loadServicesForWizard(picked)
    if (loaded) {
      const cats = new Set(loaded.map((s) => s.category))
      if (cats.size > 1) {
        toast({ title: 'Same category only', description: 'Pick services from one category so the applications stay comparable.', variant: 'destructive' })
        return
      }
      setMultiMode(false)
      setPicked([])
      setWizardServices(loaded)
    }
  }

  const togglePick = (id: string) => {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }

  const pickedCategory = useMemo(() => {
    const pickedServices = services.filter((s) => picked.includes(s.id))
    return pickedServices.length > 0 ? pickedServices[0].category : null
  }, [services, picked])

  const financingServices = services.filter((s) => s.serviceKind === 'FINANCING')

  return (
    <div className="space-y-5">
      {/* Context chip — quote/order handoff */}
      {target && (
        <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm">
          <Store size={15} className="text-primary" />
          <span className="font-medium">
            Applying to finance <span className="font-bold text-primary">{target.label}</span>
          </span>
          <span className="text-xs text-muted-foreground">The application will be linked to it.</span>
          <button
            type="button"
            className="ml-auto rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Clear linked quote/order"
            onClick={() => {
              clearFinancingTarget()
              setTarget(null)
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex rounded-xl border bg-card p-0.5" role="tablist" aria-label="Service kind">
          {(['ALL', 'FINANCING', 'ACCREDITATION'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              onClick={() => changeKind(k)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                kind === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {k === 'ALL' ? 'All services' : k === 'FINANCING' ? 'Financing' : 'Accreditation'}
            </button>
          ))}
        </div>
        <Select value={category} onValueChange={changeCategory}>
          <SelectTrigger className="h-9 w-44 rounded-xl text-sm" aria-label="Filter by category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{categoryLabel(c)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => changeSearch(e.target.value)}
            placeholder="Search services…"
            className="h-9 rounded-xl pl-10 text-sm"
            aria-label="Search services"
          />
        </div>
        <Button
          variant={multiMode ? 'default' : 'outline'}
          className="h-9 rounded-xl text-xs"
          onClick={() => {
            setMultiMode((m) => !m)
            setPicked([])
          }}
        >
          <Layers size={14} className="mr-1.5" />
          {multiMode ? 'Exit multi-apply' : 'Apply to multiple financiers'}
        </Button>
      </div>

      {/* Multi-apply tray */}
      {multiMode && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
          <p className="text-sm">
            <span className="font-bold">{picked.length}</span> picked
            {pickedCategory ? ` · ${categoryLabel(pickedCategory)}` : ' · pick 2+ services of one category'}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" className="h-8 rounded-xl text-xs" onClick={() => setPicked([])} disabled={picked.length === 0}>
              Clear
            </Button>
            <Button className="h-8 rounded-xl text-xs" onClick={() => void startMultiApplication()} disabled={picked.length < 2}>
              Apply to {picked.length} financiers
            </Button>
          </div>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full rounded-2xl" />
          ))}
        </div>
      ) : services.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-14 text-center">
          <Wallet size={34} className="text-muted-foreground/40" />
          <p className="mt-3 text-sm font-semibold">No services match your filters</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            Try clearing the search or switching the category — new financier services appear here as institutions
            join the platform.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {services.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(i * 0.05, 0.25) }}
              className="group relative"
            >
              <div className="flex h-full flex-col rounded-2xl border bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      {s.serviceKind === 'ACCREDITATION' ? <BadgeCheck size={19} /> : <HandCoins size={19} />}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold leading-tight">{s.financier.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {s.financier.regulator ?? 'Financier institution'}
                      </p>
                    </div>
                  </div>
                  {multiMode && s.serviceKind === 'FINANCING' && (
                    <Checkbox
                      checked={picked.includes(s.id)}
                      onCheckedChange={() => togglePick(s.id)}
                      aria-label={`Select ${s.name} for multi-financier application`}
                      disabled={!!pickedCategory && pickedCategory !== s.category && picked.length > 0}
                    />
                  )}
                </div>

                <p className="mt-3.5 text-base font-bold leading-snug">{s.name}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Badge className="rounded-full border-0 bg-primary/10 text-[10px] font-bold uppercase tracking-wide text-primary">
                    {s.serviceKind === 'ACCREDITATION' ? 'Accreditation' : 'Financing'}
                  </Badge>
                  <Badge className="rounded-full border-0 bg-muted text-[10px] font-semibold text-muted-foreground">
                    {categoryLabel(s.category)}
                  </Badge>
                  {s.shariaCompliant && (
                    <Badge className="rounded-full border-0 bg-emerald-100 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      <ShieldCheck size={10} className="mr-0.5" /> Sharia
                    </Badge>
                  )}
                </div>
                {s.summary && <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{s.summary}</p>}

                <div className="mt-3.5 grid grid-cols-2 gap-2 text-xs">
                  {s.serviceKind === 'FINANCING' ? (
                    <>
                      <div className="rounded-lg bg-muted/50 px-2.5 py-1.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Amount</p>
                        <p className="mt-0.5 truncate font-bold tabular-nums">
                          {s.amountMin != null || s.amountMax != null
                            ? `${formatMoney(s.amountMin ?? 0, s.currency)}${s.amountMax != null ? ` – ${formatMoney(s.amountMax, s.currency)}` : '+'}`
                            : 'Flexible'}
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted/50 px-2.5 py-1.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {s.rateType === 'FLAT_FEE' ? 'Flat fee' : 'Rate cap'}
                        </p>
                        <p className="mt-0.5 truncate font-bold tabular-nums">
                          {s.rateMax != null ? (s.rateType === 'FLAT_FEE' ? formatMoney(s.rateMax, s.currency) : `${s.rateMax}% max`) : '—'}
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted/50 px-2.5 py-1.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Tenor</p>
                        <p className="mt-0.5 truncate font-bold tabular-nums">
                          {s.tenorMinMonths != null || s.tenorMaxMonths != null
                            ? `${s.tenorMinMonths ?? '?'}–${s.tenorMaxMonths ?? '?'} mo`
                            : '—'}
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted/50 px-2.5 py-1.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Regions</p>
                        <p className="mt-0.5 flex items-center gap-1 truncate font-bold tabular-nums">
                          <MapPin size={11} /> {s.coverageCount || 'Nationwide'}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="rounded-lg bg-muted/50 px-2.5 py-1.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Validity</p>
                        <p className="mt-0.5 truncate font-bold tabular-nums">
                          {s.accreditationValidMonths ? `${s.accreditationValidMonths} months` : '—'}
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted/50 px-2.5 py-1.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Program fee</p>
                        <p className="mt-0.5 truncate font-bold tabular-nums">
                          {s.accreditationFeeAmount != null ? formatMoney(s.accreditationFeeAmount, s.currency) : 'Free'}
                        </p>
                      </div>
                      <div className="col-span-2 rounded-lg bg-muted/50 px-2.5 py-1.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Processing</p>
                        <p className="mt-0.5 flex items-center gap-1 truncate font-bold tabular-nums">
                          <CalendarClock size={11} /> {s.processingDays ? `~${s.processingDays} days` : '—'}
                        </p>
                      </div>
                    </>
                  )}
                </div>

                <div className="mt-auto pt-4">
                  <Button
                    className="w-full rounded-xl text-sm"
                    variant={multiMode ? 'outline' : 'default'}
                    onClick={() => (multiMode ? togglePick(s.id) : void openDetail(s.id))}
                  >
                    {multiMode
                      ? picked.includes(s.id)
                        ? 'Picked ✓'
                        : 'Pick this service'
                      : s.serviceKind === 'ACCREDITATION'
                        ? 'View program & apply'
                        : 'View details & apply'}
                  </Button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {(data?.pageCount ?? 1) > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" className="rounded-xl" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            <ChevronLeft size={14} /> Previous
          </Button>
          <p className="text-xs font-medium text-muted-foreground">
            Page {data?.page ?? 1} of {data?.pageCount ?? 1} · {data?.total ?? 0} services
          </p>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl"
            disabled={page >= (data?.pageCount ?? 1)}
            onClick={() => setPage((p) => p + 1)}
          >
            Next <ChevronRight size={14} />
          </Button>
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          {detailLoading || !detail ? (
            <div className="space-y-4 p-6">
              <Skeleton className="h-8 w-2/3 rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-40 w-full rounded-xl" />
            </div>
          ) : (
            <>
              <DialogHeader className="border-b px-5 py-4 sm:px-6">
                <DialogTitle className="flex flex-wrap items-center gap-2 pr-6 text-lg leading-snug">
                  {detail.name}
                  <Badge className="rounded-full border-0 bg-primary/10 text-[10px] font-bold uppercase tracking-wide text-primary">
                    {detail.serviceKind === 'ACCREDITATION' ? 'Accreditation' : 'Financing'}
                  </Badge>
                  {detail.shariaCompliant && (
                    <Badge className="rounded-full border-0 bg-emerald-100 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      <ShieldCheck size={10} className="mr-0.5" /> Sharia compliant
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <span className="font-semibold text-foreground/80">{detail.financier.name}</span>
                  {detail.financier.regulator && <span>· regulated by {detail.financier.regulator}</span>}
                  <span>· {categoryLabel(detail.category)}</span>
                </DialogDescription>
                {detail.rateType && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Coins size={12} />
                    {rateTypeLabel(detail.rateType)}
                    {detail.rateMax != null && ` · up to ${detail.rateMax}%`}
                    {detail.feeFlat != null && ` · ${formatMoney(detail.feeFlat, detail.currency)} flat fee`}
                  </p>
                )}
              </DialogHeader>
              <ScrollArea className="flex-1">
                <div className="space-y-5 px-5 py-5 sm:px-6">
                  {detail.description && (
                    <p className="text-sm leading-relaxed text-muted-foreground">{detail.description}</p>
                  )}

                  {(detail.features.length > 0 || detail.eligibility.length > 0) && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {detail.features.length > 0 && (
                        <div className="rounded-xl border p-4">
                          <p className="flex items-center gap-1.5 text-sm font-semibold">
                            <Sparkles size={14} className="text-primary" /> Features
                          </p>
                          <ul className="mt-2 space-y-1.5">
                            {detail.features.map((f) => (
                              <li key={f} className="flex items-start gap-1.5 text-xs leading-relaxed">
                                <BadgeCheck size={12} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                {f}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {detail.eligibility.length > 0 && (
                        <div className="rounded-xl border p-4">
                          <p className="flex items-center gap-1.5 text-sm font-semibold">
                            <ShieldCheck size={14} className="text-primary" /> Eligibility
                          </p>
                          <ul className="mt-2 space-y-1.5">
                            {detail.eligibility.map((f) => (
                              <li key={f} className="flex items-start gap-1.5 text-xs leading-relaxed">
                                <ShieldCheck size={12} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                                {f}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {detail.coverage.length > 0 && (
                    <div>
                      <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                        <MapPin size={14} className="text-primary" /> Coverage
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {detail.coverage.map((c) => (
                          <span key={c} className="rounded-full border bg-card px-2.5 py-0.5 text-xs font-medium">
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="mb-1 text-sm font-semibold">Requirements preview</p>
                    <p className="mb-3 text-xs text-muted-foreground">
                      What the platform gate verifies before your file is forwarded to {detail.financier.name}.
                    </p>
                    <RequirementChecklist rows={rowsFromRequirements(detail.requirements)} showControls={false} />
                  </div>
                </div>
              </ScrollArea>
              <div className="border-t bg-muted/30 px-5 py-3.5 sm:px-6">
                <Button className="w-full rounded-xl sm:w-auto" onClick={() => void startApplication(detail.id)}>
                  {detail.serviceKind === 'ACCREDITATION' ? (
                    <>
                      <BadgeCheck size={15} className="mr-1.5" /> Start accreditation application
                    </>
                  ) : (
                    <>
                      <HandCoins size={15} className="mr-1.5" /> Start application
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* The 3-step wizard */}
      {wizardServices && (
        <ApplicationWizard
          services={wizardServices}
          initialTarget={target}
          onClose={() => setWizardServices(null)}
          onSubmitted={() => {
            clearFinancingTarget()
            setTarget(null)
            onApplied()
          }}
          onManageDocuments={onManageDocuments}
        />
      )}

      {/* hint text under the grid while multi mode is on */}
      {multiMode && financingServices.length > 0 && (
        <p className="text-center text-[11px] text-muted-foreground">
          Multi-financier mode creates sibling applications sharing one group — each financier composes its own
          offer and accepting one auto-declines the others.
        </p>
      )}
    </div>
  )
}
