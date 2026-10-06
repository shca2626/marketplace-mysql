'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FINANCING · SERVICES DIRECTORY (W-DIRECTORY) — the public catalog of ACTIVE
// FINANCING + ACCREDITATION services. Phase 12-c adds the directory facet bar:
// kind chips, city select (coverage ∪ branch cities, server-provided), amount
// bracket chips (intersection semantics), rate-cap select and sort — plus the
// directory header counts ("N services from M institutions"). Financier cards
// keep the range/tenor/rate badges, coverage, attributes, requirements preview,
// and the Apply CTA that launches the 3-step wizard.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  BadgeCheck,
  Banknote,
  Clock3,
  Eye,
  Landmark,
  ListFilter,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  Wallet,
} from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { useDebounced } from '@/components/marketplace/financing/financing-shared'
import type {
  FinancierServiceDTO,
  PublicServiceDetailDTO,
  ServiceDirectoryFacetsDTO,
} from '@/lib/types'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  ACCREDITATION_CATEGORY_LABELS,
  apiRequest,
  ConditionTypeBadge,
  EmptyState,
  FINANCING_CATEGORY_LABELS,
  formatMoney,
  RATE_TYPE_LABELS,
  timeAgo,
} from '@/components/marketplace/financing/financing-shared'

interface ServicesDirectoryResponse {
  services: FinancierServiceDTO[]
  total: number
  institutionCount: number
  facets: ServiceDirectoryFacetsDTO
}

/** Amount brackets (YER-scale presets — every listing shares the currency).
 *  The API intersects the bracket with each service's own range, so a service
 *  qualifies when any part of its range falls inside the bracket. */
const AMOUNT_BRACKETS = [
  { value: 'ANY', label: 'Any amount' },
  { value: 'U500K', label: 'Under 500K', max: 500_000 },
  { value: '500K_2M', label: '500K – 2M', min: 500_000, max: 2_000_000 },
  { value: '2M_10M', label: '2M – 10M', min: 2_000_000, max: 10_000_000 },
  { value: 'O10M', label: '10M +', min: 10_000_000 },
] as const

const RATE_OPTIONS = [
  { value: 'ANY', label: 'Any rate' },
  { value: '15', label: 'Rate ≤ 15%/yr' },
  { value: '20', label: 'Rate ≤ 20%/yr' },
  { value: '25', label: 'Rate ≤ 25%/yr' },
  { value: '30', label: 'Rate ≤ 30%/yr' },
] as const

const DIRECTORY_SORTS = [
  { value: 'popular', label: 'Most viewed' },
  { value: 'newest', label: 'Newest' },
  { value: 'rate_asc', label: 'Lowest rate' },
  { value: 'amount_desc', label: 'Largest amount' },
] as const

export function ServicesSection({ onApply }: { onApply: (serviceId: string) => void }) {
  const [kind, setKind] = useState<'ALL' | 'FINANCING' | 'ACCREDITATION'>('ALL')
  const [category, setCategory] = useState('ALL')
  const [search, setSearch] = useState('')
  const [city, setCity] = useState('ALL')
  const [amount, setAmount] = useState<string>((AMOUNT_BRACKETS[0] as { value: string }).value)
  const [rateMax, setRateMax] = useState<string>((RATE_OPTIONS[0] as { value: string }).value)
  const [sort, setSort] = useState<string>(DIRECTORY_SORTS[0].value)
  const debounced = useDebounced(search)
  const [detail, setDetail] = useState<PublicServiceDetailDTO | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const query = useMemo(() => {
    const sp = new URLSearchParams({ limit: '60' })
    if (kind !== 'ALL') sp.set('kind', kind)
    if (category !== 'ALL') sp.set('category', category)
    if (debounced.trim()) sp.set('q', debounced.trim())
    if (city !== 'ALL') sp.set('city', city)
    const bracket = AMOUNT_BRACKETS.find((b) => b.value === amount)
    if (bracket && 'min' in bracket && bracket.min != null) sp.set('amountMin', String(bracket.min))
    if (bracket && 'max' in bracket && bracket.max != null) sp.set('amountMax', String(bracket.max))
    if (rateMax !== 'ANY') sp.set('rateMax', rateMax)
    if (sort !== 'popular') sp.set('sort', sort)
    return `/api/financing/services?${sp.toString()}`
  }, [kind, category, debounced, city, amount, rateMax, sort])

  const { data, loading, error, refetch } = useApi<ServicesDirectoryResponse>(query)

  const openDetail = async (id: string) => {
    const res = await apiRequest<{ service: PublicServiceDetailDTO }>(`/api/financing/services/${id}`)
    if (res.ok && res.data) {
      setDetail(res.data.service)
      setDetailOpen(true)
    }
  }

  const financingCategories = Object.entries(FINANCING_CATEGORY_LABELS)
  const accreditationCategories = Object.entries(ACCREDITATION_CATEGORY_LABELS)
  const categoryList = kind === 'ACCREDITATION' ? accreditationCategories : financingCategories

  const filtersActive =
    kind !== 'ALL' || category !== 'ALL' || debounced.trim() !== '' || city !== 'ALL' || amount !== 'ANY' || rateMax !== 'ANY'

  const clearFilters = () => {
    setKind('ALL')
    setCategory('ALL')
    setSearch('')
    setCity('ALL')
    setAmount('ANY')
    setRateMax('ANY')
  }

  return (
    <div className="space-y-4">
      {/* directory header — live counts over the filtered set */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <ListFilter size={17} className="text-primary" aria-hidden /> Services directory
          </h2>
          {loading && !data ? (
            <Skeleton className="mt-1.5 h-4 w-56" />
          ) : (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {data ? (
                <>
                  <span className="font-semibold text-foreground">{data.total}</span>{' '}
                  {data.total === 1 ? 'service' : 'services'} from{' '}
                  <span className="font-semibold text-foreground">{data.institutionCount}</span>{' '}
                  {data.institutionCount === 1 ? 'institution' : 'institutions'}
                </>
              ) : (
                'Financing programs and accreditation services from active institutions'
              )}
              {filtersActive && <span className="ml-1">· matching your filters</span>}
            </p>
          )}
        </div>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="h-10 w-full rounded-xl text-sm sm:w-44" aria-label="Sort services">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DIRECTORY_SORTS.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* facet bar */}
      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search services or institutions…"
              className="h-11 rounded-xl pl-9"
            />
          </div>
          <div className="flex flex-1 gap-2 sm:flex-none">
            <Select value={city} onValueChange={setCity}>
              <SelectTrigger className="h-11 w-full rounded-xl text-sm sm:w-44" aria-label="Filter by city">
                <MapPin size={14} className="mr-1 shrink-0 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="ALL">All cities</SelectItem>
                {(data?.facets.cities ?? []).map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={rateMax} onValueChange={setRateMax}>
              <SelectTrigger className="h-11 w-full rounded-xl text-sm sm:w-40" aria-label="Filter by maximum rate">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RATE_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* kind chips */}
          <div className="flex rounded-xl border bg-muted/40 p-1">
            {(['ALL', 'FINANCING', 'ACCREDITATION'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setKind(k)
                  setCategory('ALL')
                }}
                className={cn(
                  'min-h-11 flex-1 rounded-lg px-4 text-xs font-semibold transition-colors sm:flex-none',
                  kind === k ? 'bg-background shadow-sm' : 'text-muted-foreground'
                )}
              >
                {k === 'ALL' ? 'All services' : k === 'FINANCING' ? 'Financing' : 'Accreditation'}
              </button>
            ))}
          </div>

          {/* amount bracket chips — the service's own range must intersect */}
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Amount bracket">
            {AMOUNT_BRACKETS.map((b) => (
              <button
                key={b.value}
                type="button"
                onClick={() => setAmount(b.value)}
                aria-pressed={amount === b.value}
                className={cn(
                  'min-h-11 rounded-full border px-3.5 text-xs font-semibold transition-colors',
                  amount === b.value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-card text-muted-foreground hover:bg-muted/60'
                )}
              >
                {b.label}
              </button>
            ))}
          </div>

          {filtersActive && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-9 rounded-xl px-3 text-xs text-muted-foreground"
              onClick={clearFilters}
            >
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {/* category chips */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setCategory('ALL')}
          className={cn(
            'min-h-11 rounded-full border px-3.5 text-xs font-semibold transition-colors',
            category === 'ALL' ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted/60'
          )}
        >
          All categories
        </button>
        {categoryList.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setCategory(value)}
            className={cn(
              'min-h-11 rounded-full border px-3.5 text-xs font-semibold transition-colors',
              category === value ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted/60'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState icon={Banknote} title="Could not load services" description={error}>
          <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
            Retry
          </Button>
        </EmptyState>
      ) : (data?.services ?? []).length === 0 ? (
        <EmptyState
          icon={Banknote}
          title="No services match"
          description="Try clearing the filters — new financier offerings appear here as institutions publish them."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data!.services.map((s) => (
            <motion.div key={s.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
              <ServiceCard service={s} onApply={() => onApply(s.id)} onOpen={() => void openDetail(s.id)} />
            </motion.div>
          ))}
        </div>
      )}

      {/* service detail dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          {detail && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <DialogTitle className="text-lg">{detail.name}</DialogTitle>
                  <Badge className="rounded-full border-0 bg-orange-100 text-[10.5px] font-semibold text-orange-800 dark:bg-orange-950 dark:text-orange-300">
                    {detail.serviceKind === 'ACCREDITATION'
                      ? ACCREDITATION_CATEGORY_LABELS[detail.category] ?? detail.category
                      : FINANCING_CATEGORY_LABELS[detail.category] ?? detail.category}
                  </Badge>
                  {detail.shariaCompliant && (
                    <Badge className="rounded-full border-0 bg-emerald-100 text-[10.5px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      Sharia-compliant
                    </Badge>
                  )}
                </div>
                <DialogDescription className="flex items-center gap-1.5">
                  <Landmark size={13} /> {detail.financierOrgName}
                  {detail.processingDays != null && (
                    <span className="ml-2 inline-flex items-center gap-1">
                      <Clock3 size={12} /> ~{detail.processingDays} working days
                    </span>
                  )}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                {detail.summary && <p className="font-medium text-foreground/90">{detail.summary}</p>}
                {detail.description && <p className="text-muted-foreground">{detail.description}</p>}

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {detail.serviceKind === 'FINANCING' ? (
                    <>
                      <DetailStat label="Range" value={`${formatMoney(detail.amountMin, detail.currency)}–${formatMoney(detail.amountMax, detail.currency)}`} />
                      <DetailStat label="Rate cap" value={detail.rateMax != null ? `${detail.rateMax}% ${detail.rateType ? (RATE_TYPE_LABELS[detail.rateType] ?? '') : ''}` : '—'} />
                      <DetailStat label="Tenor" value={detail.tenorMinMonths != null ? `${detail.tenorMinMonths}–${detail.tenorMaxMonths ?? '∞'} mo` : '—'} />
                      <DetailStat label="Repayment" value={detail.repaymentFrequency ?? '—'} />
                    </>
                  ) : (
                    <>
                      <DetailStat label="Validity" value={detail.accreditationValidMonths != null ? `${detail.accreditationValidMonths} months` : '—'} />
                      <DetailStat label="Program fee" value={detail.accreditationFeeAmount != null ? formatMoney(detail.accreditationFeeAmount, detail.currency) : '—'} />
                      <DetailStat label="Segment" value={detail.targetSegment ?? '—'} />
                      <DetailStat label="Processing" value={detail.processingDays != null ? `~${detail.processingDays} days` : '—'} />
                    </>
                  )}
                </div>

                {detail.coverage.length > 0 && (
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin size={13} className="shrink-0" />
                    {detail.coverage.map((c) => (
                      <span key={c.id} className="rounded-full bg-muted px-2 py-0.5">{c.regionName}</span>
                    ))}
                  </p>
                )}

                {detail.attributes.filter((a) => a.kind === 'FEATURE').length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Features</h4>
                    <ul className="mt-1.5 space-y-1 text-xs">
                      {detail.attributes.filter((a) => a.kind === 'FEATURE').map((a) => (
                        <li key={a.id} className="flex items-start gap-1.5">
                          <Sparkles size={12} className="mt-0.5 shrink-0 text-primary" /> {a.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {detail.attributes.filter((a) => a.kind === 'ELIGIBILITY_CONDITION').length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Eligibility</h4>
                    <ul className="mt-1.5 space-y-1 text-xs">
                      {detail.attributes.filter((a) => a.kind === 'ELIGIBILITY_CONDITION').map((a) => (
                        <li key={a.id} className="flex items-start gap-1.5">
                          <ShieldCheck size={12} className="mt-0.5 shrink-0 text-primary" /> {a.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {detail.requirementsPreview.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Requirements you will answer
                    </h4>
                    <ul className="mt-1.5 space-y-1.5">
                      {detail.requirementsPreview.map((r) => (
                        <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-xs">
                          <ConditionTypeBadge type={r.conditionType} />
                          <span className="min-w-0 flex-1 truncate font-semibold">{r.title}</span>
                          {r.isRequired && <span className="font-bold text-primary">✱</span>}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      ✱ required · the platform verifies every answer before the financier sees your file.
                    </p>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" className="rounded-xl" onClick={() => setDetailOpen(false)}>
                  Close
                </Button>
                <Button
                  className="rounded-xl"
                  onClick={() => {
                    setDetailOpen(false)
                    onApply(detail.id)
                  }}
                >
                  {detail.serviceKind === 'ACCREDITATION' ? <BadgeCheck size={15} className="mr-1.5" /> : <Wallet size={15} className="mr-1.5" />}
                  {detail.serviceKind === 'ACCREDITATION' ? 'Apply for accreditation' : 'Apply for financing'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-muted/20 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-xs font-semibold" title={value}>
        {value}
      </p>
    </div>
  )
}

// ── Card ─────────────────────────────────────────────────────────────────────

export function ServiceCard({
  service: s,
  onApply,
  onOpen,
}: {
  service: FinancierServiceDTO
  onApply: () => void
  onOpen: () => void
}) {
  const isAccreditation = s.serviceKind === 'ACCREDITATION'
  return (
    <Card className="flex h-full flex-col transition-shadow hover:shadow-md">
      <CardContent className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-primary/10 text-primary">
              {isAccreditation ? <BadgeCheck size={18} /> : <Banknote size={18} />}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold leading-tight">{s.name}</p>
              <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                <Landmark size={11} /> {s.financierOrgName}
              </p>
            </div>
          </div>
          <Badge
            className={cn(
              'shrink-0 rounded-full border-0 text-[10.5px] font-semibold',
              isAccreditation
                ? 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300'
                : 'bg-primary/15 text-primary'
            )}
          >
            {isAccreditation
              ? ACCREDITATION_CATEGORY_LABELS[s.category] ?? s.category
              : FINANCING_CATEGORY_LABELS[s.category] ?? s.category}
          </Badge>
        </div>

        {s.summary && <p className="line-clamp-2 text-xs text-muted-foreground">{s.summary}</p>}

        <div className="flex flex-wrap gap-1.5 text-[10.5px] font-semibold">
          {/* kind badge — visible especially when browsing All kinds */}
          <span className="rounded-full border border-border bg-card px-2 py-0.5 text-muted-foreground">
            {isAccreditation ? 'Accreditation' : 'Financing'}
          </span>
          {isAccreditation ? (
            <>
              {s.accreditationValidMonths != null && (
                <span className="rounded-full bg-muted px-2 py-0.5">Valid {s.accreditationValidMonths} months</span>
              )}
              {s.accreditationFeeAmount != null && (
                <span className="rounded-full bg-muted px-2 py-0.5">Fee {formatMoney(s.accreditationFeeAmount, s.currency)}</span>
              )}
            </>
          ) : (
            <>
              {s.amountMin != null && (
                <span className="rounded-full bg-muted px-2 py-0.5">
                  {formatMoney(s.amountMin, s.currency)} – {formatMoney(s.amountMax, s.currency)}
                </span>
              )}
              {s.rateMax != null && (
                <span className="rounded-full bg-muted px-2 py-0.5">
                  ≤ {s.rateMax}% {s.rateType ? (RATE_TYPE_LABELS[s.rateType] ?? '') : ''}
                </span>
              )}
              {s.tenorMinMonths != null && (
                <span className="rounded-full bg-muted px-2 py-0.5">
                  {s.tenorMinMonths}–{s.tenorMaxMonths ?? '∞'} mo
                </span>
              )}
              {s.shariaCompliant && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  Sharia
                </span>
              )}
            </>
          )}
          <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
            <Eye size={10} className="mr-0.5 inline" />
            {s.viewCount}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {s.coverage.length > 0 && (
            <span className="inline-flex items-center gap-1 truncate">
              <MapPin size={11} /> {s.coverage.slice(0, 3).map((c) => c.regionName).join(' · ')}
              {s.coverage.length > 3 && ` +${s.coverage.length - 3}`}
            </span>
          )}
          {(s.requirementCount ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1">
              <ShieldCheck size={11} /> {s.requirementCount} requirements
            </span>
          )}
        </div>

        <div className="mt-auto flex items-center gap-2 pt-1">
          <Button size="sm" className="h-11 flex-1 rounded-xl" onClick={onApply}>
            {isAccreditation ? 'Apply for accreditation' : 'Apply for financing'}
          </Button>
          <Button variant="outline" size="sm" className="h-11 rounded-xl" onClick={onOpen}>
            Details
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">Listed {timeAgo(s.createdAt)}</p>
      </CardContent>
    </Card>
  )
}
