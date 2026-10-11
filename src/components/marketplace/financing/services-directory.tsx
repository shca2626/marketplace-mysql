'use client'

// ─────────────────────────────────────────────────────────────────────────────
// SERVICES DIRECTORY — the public storefront view for financing services
// (FIN-6 surface A). Renders inside the storefront chrome (Header/Footer).
// Public: browse + filter + detail sheet. "Apply now" is auth-gated like every
// other storefront CTA — signed-out visitors get the auth modal, signed-in
// applicants get the 3-step financing wizard.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import {
  BadgeCheck,
  Banknote,
  Building2,
  CalendarClock,
  Coins,
  FileCheck2,
  Filter,
  Globe2,
  Loader2,
  MapPin,
  Percent,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  X,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'
import { useApi } from '@/hooks/use-api'
import { apiRequest } from '@/components/marketplace/admin/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { PublicServiceDTO, enumLabel, formatMoney } from './shared'
import { SERVICE_KIND_MAP, StatusBadge } from './shared'
import { FinancingWizard } from './financing-wizard'

const CATEGORIES = [
  { value: '', label: 'All categories' },
  { value: 'WORKING_CAPITAL', label: 'Working capital' },
  { value: 'INVOICE_FINANCING', label: 'Invoice financing' },
  { value: 'PO_FINANCING', label: 'PO financing' },
  { value: 'MICROENTERPRISE', label: 'Microenterprise' },
  { value: 'SUPPLIER_QUALIFICATION', label: 'Supplier qualification' },
  { value: 'VENDOR_APPROVAL', label: 'Vendor approval' },
]

export function ServicesDirectory() {
  const user = useMarketplace((s) => s.user)
  const openAuth = useMarketplace((s) => s.openAuth)
  const navigate = useMarketplace((s) => s.navigate)

  const [kindFilter, setKindFilter] = useState<'' | 'FINANCING' | 'ACCREDITATION'>('')
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')

  // debounce the search box
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 350)
    return () => clearTimeout(t)
  }, [search])

  const url = useMemo(() => {
    const sp = new URLSearchParams({ page: '1' })
    if (kindFilter) sp.set('serviceKind', kindFilter)
    if (category) sp.set('category', category)
    if (query) sp.set('q', query)
    return `/api/financing/services?${sp.toString()}`
  }, [kindFilter, category, query])

  const { data, loading } = useApi<{ services: PublicServiceDTO[]; total: number }>(url)

  const [detail, setDetail] = useState<PublicServiceDTO | null>(null)
  const [wizardServices, setWizardServices] = useState<string[] | null>(null)

  const services = data?.services ?? []

  const startApply = (ids: string[]) => {
    if (!user) {
      openAuth('login', { view: 'financing' })
      return
    }
    setWizardServices(ids)
  }

  return (
    <div className="bg-muted/30">
      {/* ── Directory hero ── */}
      <section className="border-b bg-background">
        <div className="mx-auto max-w-7xl px-4 pb-8 pt-10 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
            <ShieldCheck size={14} aria-hidden /> Platform-verified financiers
          </div>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Financing & Accreditation</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Browse working capital, invoice and PO financing services plus supplier accreditation programs from banks,
            microfinance institutions and e-wallets. Every application passes the Vendora verification gate before it
            reaches a financier.
          </p>
        </div>
      </section>

      {/* ── Filters ── */}
      <section aria-label="Filters" className="border-b bg-background">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2.5 px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex gap-2" role="tablist" aria-label="Filter services by kind">
            {[
              { value: '', label: 'All', icon: Sparkles },
              { value: 'FINANCING', label: 'Financing', icon: Banknote },
              { value: 'ACCREDITATION', label: 'Accreditation', icon: BadgeCheck },
            ].map((f) => {
              const active = kindFilter === f.value
              return (
                <button
                  key={f.value || 'all'}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setKindFilter(f.value as '' | 'FINANCING' | 'ACCREDITATION')}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors',
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
                  )}
                >
                  <f.icon size={12} aria-hidden /> {f.label}
                </button>
              )
            })}
          </div>
          <div className="ml-auto flex flex-1 flex-wrap items-center justify-end gap-2.5">
            <div className="relative min-w-0 flex-1 sm:max-w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search services…"
                className="h-9 rounded-full pl-8 text-sm"
                aria-label="Search services"
              />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-9 w-40 rounded-full text-xs sm:w-48" aria-label="Filter by category">
                <Filter size={12} className="mr-1" aria-hidden />
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value || 'all'} value={c.value || 'all'}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* ── Grid ── */}
      <section aria-label="Services" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* apply-to-multiple launcher */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Coins size={18} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Shopping for the best terms?</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Apply to multiple financiers at once — one shared application, sibling requests you can compare side by
                side.
              </p>
            </div>
          </div>
          <Button className="rounded-xl" onClick={() => startApply([])}>
            Apply to multiple financiers
          </Button>
        </div>

        {loading && services.length === 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-52 rounded-2xl" />
            ))}
          </div>
        ) : services.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed bg-card px-6 py-16 text-center">
            <Building2 size={34} className="text-muted-foreground/40" />
            <p className="mt-3 text-sm font-semibold">No services match your filters</p>
            <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
              Try clearing the search or category filter — new financier services are published as institutions are
              onboarded and verified.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s) => (
              <ServiceCard key={s.id} service={s} onOpen={() => setDetail(s)} onApply={() => startApply([s.id])} />
            ))}
          </div>
        )}

        {/* signed-out explainer */}
        {!user && (
          <p className="mt-8 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
            <ShieldCheck size={13} className="text-primary" aria-hidden />
            Sign in to apply — your profile and document vault are reused automatically.
          </p>
        )}
      </section>

      {/* ── Detail sheet ── */}
      {detail && (
        <ServiceDetailSheet
          id={detail.id}
          onClose={() => setDetail(null)}
          onApply={(id) => {
            setDetail(null)
            startApply([id])
          }}
          onManageDocuments={() => {
            setDetail(null)
            if (user) navigate('myfinancing', { myfinancingTab: 'documents' })
            else openAuth('login', { view: 'financing' })
          }}
        />
      )}

      {/* ── Wizard ── */}
      {wizardServices !== null && (
        <FinancingWizard
          open
          onClose={() => setWizardServices(null)}
          initialServiceIds={wizardServices}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Service card
// ═══════════════════════════════════════════════════════════════════════════

function ServiceCard({
  service: s,
  onOpen,
  onApply,
}: {
  service: PublicServiceDTO
  onOpen: () => void
  onApply: () => void
}) {
  return (
    <Card className="group flex flex-col transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
      <CardContent className="flex flex-1 flex-col p-5">
        {/* financier */}
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Building2 size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight">{s.financier.name}</p>
            <p className="text-[11px] text-muted-foreground">{s.financier.orgType}</p>
          </div>
          <StatusBadge status={s.serviceKind} map={SERVICE_KIND_MAP} />
        </div>

        {/* service */}
        <button type="button" onClick={onOpen} className="mt-3.5 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
          <h3 className="line-clamp-1 text-[15px] font-bold group-hover:text-primary">{s.name}</h3>
          {s.summary && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{s.summary}</p>}
        </button>

        {/* meta */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <Badge variant="secondary" className="rounded-full text-[10px] font-semibold">
            {enumLabel(s.category)}
          </Badge>
          {s.shariaCompliant && (
            <Badge className="rounded-full border-0 bg-emerald-100 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              Sharia compliant
            </Badge>
          )}
          {s.coverage.length > 0 && (
            <span className="flex items-center gap-1">
              <MapPin size={11} aria-hidden /> {s.coverage.length} region{s.coverage.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {/* amounts */}
        <div className="mt-3 rounded-xl bg-muted/60 px-3.5 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {s.serviceKind === 'ACCREDITATION' ? 'Program' : 'Amount range'}
          </p>
          <p className="mt-0.5 text-sm font-bold tabular-nums">
            {s.serviceKind === 'ACCREDITATION' ? (
              s.accreditationValidMonths ? `${s.accreditationValidMonths}-month approved-vendor status` : 'Grant on decision'
            ) : (
              <>
                {s.amountMin !== null ? formatMoney(s.amountMin, s.currency) : 'Open'}
                <span className="mx-1 font-normal text-muted-foreground">→</span>
                {s.amountMax !== null ? formatMoney(s.amountMax, s.currency) : 'Open'}
              </>
            )}
          </p>
        </div>

        {/* actions */}
        <div className="mt-4 flex gap-2">
          <Button size="sm" className="h-9 flex-1 rounded-xl text-xs" onClick={onApply}>
            {s.serviceKind === 'ACCREDITATION' ? 'Apply for accreditation' : 'Apply now'}
          </Button>
          <Button size="sm" variant="outline" className="h-9 rounded-xl text-xs" onClick={onOpen}>
            Details
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Detail sheet — full service detail (attributes, coverage, rates, tenor)
// ═══════════════════════════════════════════════════════════════════════════

function ServiceDetailSheet({
  id,
  onClose,
  onApply,
  onManageDocuments,
}: {
  id: string
  onClose: () => void
  onApply: (id: string) => void
  onManageDocuments: () => void
}) {
  const [service, setService] = useState<PublicServiceDTO | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await apiRequest<{ service: PublicServiceDTO }>(`/api/financing/services/${id}`)
      if (!cancelled) {
        if (res.ok && res.data) setService(res.data.service)
        else toast({ title: 'Could not load the service', description: res.error, variant: 'destructive' })
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  const features = service?.attributes.filter((a) => a.kind === 'FEATURE') ?? []
  const eligibility = service?.attributes.filter((a) => a.kind === 'ELIGIBILITY_CONDITION') ?? []

  return (
    <div
      className="fixed inset-0 z-[60] flex justify-end bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Service details"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex h-full w-full max-w-xl flex-col bg-background shadow-2xl">
        {/* header */}
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4 sm:px-6">
          <div className="min-w-0">
            {service && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <Building2 size={13} aria-hidden /> {service.financier.name}
                    <Badge variant="secondary" className="rounded-full text-[10px]">
                      {service.financier.orgType}
                    </Badge>
                  </span>
                </div>
                <h2 className="mt-1 text-lg font-bold tracking-tight">{service.name}</h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={service.serviceKind} map={SERVICE_KIND_MAP} />
                  <Badge variant="secondary" className="rounded-full text-[11px]">
                    {enumLabel(service.category)}
                  </Badge>
                  {service.shariaCompliant && (
                    <Badge className="rounded-full border-0 bg-emerald-100 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      Sharia compliant
                    </Badge>
                  )}
                </div>
              </>
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose} aria-label="Close details">
            <X size={15} />
          </Button>
        </div>

        {/* body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {loading || !service ? (
            <div className="space-y-4">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-20 rounded-xl" />
              <Skeleton className="h-32 rounded-xl" />
            </div>
          ) : (
            <div className="space-y-5">
              {service.summary && <p className="text-sm leading-relaxed text-muted-foreground">{service.summary}</p>}
              {service.description && (
                <p className="text-sm leading-relaxed text-foreground/90">{service.description}</p>
              )}

              {/* terms grid */}
              <div className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3">
                {service.serviceKind === 'FINANCING' ? (
                  <>
                    <DetailStat icon={Banknote} label="Amount range">
                      {service.amountMin !== null ? formatMoney(service.amountMin, service.currency) : 'Open'} –{' '}
                      {service.amountMax !== null ? formatMoney(service.amountMax, service.currency) : 'Open'}
                    </DetailStat>
                    <DetailStat icon={CalendarClock} label="Tenor">
                      {service.tenorMinMonths ?? service.tenorMaxMonths
                        ? `${service.tenorMinMonths ?? '—'}–${service.tenorMaxMonths ?? '—'} months`
                        : '—'}
                    </DetailStat>
                    <DetailStat icon={Percent} label="Rate">
                      {service.rateType
                        ? `${enumLabel(service.rateType)}${service.rateMax !== null ? ` ≤ ${service.rateMax}%` : ''}`
                        : 'On assessment'}
                    </DetailStat>
                    <DetailStat icon={FileCheck2} label="Processing">
                      {service.processingDays ? `≈ ${service.processingDays} days` : '—'}
                    </DetailStat>
                    <DetailStat icon={Coins} label="Flat fee">
                      {service.feeFlat !== null ? formatMoney(service.feeFlat, service.currency) : '—'}
                    </DetailStat>
                    <DetailStat icon={Store} label="Segment">
                      {service.targetSegment ? enumLabel(service.targetSegment) : '—'}
                    </DetailStat>
                  </>
                ) : (
                  <>
                    <DetailStat icon={CalendarClock} label="Grant validity">
                      {service.accreditationValidMonths ? `${service.accreditationValidMonths} months` : 'On decision'}
                    </DetailStat>
                    <DetailStat icon={FileCheck2} label="Processing">
                      {service.processingDays ? `≈ ${service.processingDays} days` : '—'}
                    </DetailStat>
                    <DetailStat icon={Store} label="Segment">
                      {service.targetSegment ? enumLabel(service.targetSegment) : '—'}
                    </DetailStat>
                  </>
                )}
              </div>

              {/* features */}
              {features.length > 0 && (
                <section aria-label="Features">
                  <h3 className="mb-2 text-sm font-semibold">Features</h3>
                  <ul className="space-y-1.5">
                    {features.map((f) => (
                      <li key={f.id} className="flex items-start gap-2 text-sm">
                        <BadgeCheck size={14} className="mt-0.5 shrink-0 text-primary" aria-hidden />
                        {f.text}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* eligibility */}
              {eligibility.length > 0 && (
                <section aria-label="Eligibility conditions">
                  <h3 className="mb-2 text-sm font-semibold">Eligibility</h3>
                  <ul className="space-y-1.5">
                    {eligibility.map((f) => (
                      <li key={f.id} className="flex items-start gap-2 text-sm">
                        <FileCheck2 size={14} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
                        {f.text}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* coverage */}
              {service.coverage.length > 0 && (
                <section aria-label="Coverage regions">
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                    <Globe2 size={14} className="text-primary" aria-hidden /> Coverage
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {service.coverage.map((r) => (
                      <Badge key={r} variant="secondary" className="rounded-full text-xs">
                        <MapPin size={10} className="mr-1" aria-hidden /> {r}
                      </Badge>
                    ))}
                  </div>
                </section>
              )}

              <Separator />

              {/* gate explainer */}
              <p className="flex items-start gap-2 rounded-xl bg-primary/[0.06] px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
                <ShieldCheck size={15} className="mt-0.5 shrink-0 text-primary" aria-hidden />
                Every application passes the Vendora verification gate first — the platform verifies your conditions and
                documents, and forwards only complete, correct requests to {service.financier.name}. Your verified
                document vault is reused, so nothing is uploaded twice.
              </p>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-4 sm:px-6">
          <Button variant="ghost" size="sm" className="rounded-xl text-xs text-muted-foreground" onClick={onManageDocuments}>
            <FileCheck2 size={13} className="mr-1.5" /> Manage my documents
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-xl" onClick={onClose}>
              Close
            </Button>
            <Button className="rounded-xl" disabled={loading || !service} onClick={() => onApply(id)}>
              {loading ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : null}
              {service?.serviceKind === 'ACCREDITATION' ? 'Apply for accreditation' : 'Apply now'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function DetailStat({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon size={11} aria-hidden /> {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-semibold tabular-nums">{children}</p>
    </div>
  )
}
