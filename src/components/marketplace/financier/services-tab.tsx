'use client'

// ─────────────────────────────────────────────────────────────────────────────
// SERVICES — the financier's own catalog (FIN-5 §2/§3).
// Card grid of FINANCING services + ACCREDITATION programs with requirement
// counts, traits and coverage. "+ New service" opens a two-mode dialog
// (FINANCING vs ACCREDITATION — the kind switcher reshapes the form).
// Each card opens the requirements composer (see requirements-composer.tsx).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import {
  Award,
  Banknote,
  CalendarClock,
  Globe2,
  Landmark,
  ListChecks,
  Loader2,
  Pencil,
  Plus,
  SearchX,
  ShieldAlert,
  Timer,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { apiRequest, toastApiError } from '../admin/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { RequirementsComposer } from './requirements-composer'
import {
  FinancingStatusBadge,
  SERVICE_STATUS_MAP,
  categoryLabel,
  formatMoney,
  frequencyLabel,
  rateTypeLabel,
  type FinancierServiceDTO,
} from './financing-status-badge'

const FINANCING_CATEGORIES = [
  'WORKING_CAPITAL',
  'INVOICE_FINANCING',
  'PO_FINANCING',
  'EQUIPMENT',
  'VEHICLE',
  'HOME',
  'EDUCATION',
  'AGRICULTURE',
  'MICROENTERPRISE',
  'SME',
  'OTHER',
] as const

const ACCREDITATION_CATEGORIES = ['SUPPLIER_QUALIFICATION', 'VENDOR_APPROVAL'] as const

const CURRENCIES = ['YER', 'USD', 'SAR'] as const

type AttrDraft = { kind: 'FEATURE' | 'ELIGIBILITY_CONDITION'; text: string }

/** Two-mode create / edit dialog — serviceKind drives the field set. */
function ServiceFormDialog({
  service,
  onClose,
  onSaved,
}: {
  service: FinancierServiceDTO | null
  onClose: () => void
  onSaved: () => void
}) {
  const editing = !!service
  const [saving, setSaving] = useState(false)
  const [kind, setKind] = useState<'FINANCING' | 'ACCREDITATION'>(service?.serviceKind as 'FINANCING' | 'ACCREDITATION' ?? 'FINANCING')
  const [form, setForm] = useState({
    name: service?.name ?? '',
    summary: service?.summary ?? '',
    description: service?.description ?? '',
    targetSegment: service?.targetSegment ?? 'BOTH',
    status: service?.status ?? 'DRAFT',
    currency: service?.currency ?? 'YER',
    category: service?.category ?? 'WORKING_CAPITAL',
    amountMin: service?.amountMin?.toString() ?? '',
    amountMax: service?.amountMax?.toString() ?? '',
    rateType: service?.rateType ?? 'MURABAHA_ANNUAL',
    rateMax: service?.rateMax?.toString() ?? '',
    feeFlat: service?.feeFlat?.toString() ?? '',
    tenorMinMonths: service?.tenorMinMonths?.toString() ?? '',
    tenorMaxMonths: service?.tenorMaxMonths?.toString() ?? '',
    repaymentFrequency: service?.repaymentFrequency ?? 'MONTHLY',
    gracePeriodDays: service?.gracePeriodDays?.toString() ?? '',
    shariaCompliant: service?.shariaCompliant ?? false,
    processingDays: service?.processingDays?.toString() ?? '',
    accreditationValidMonths: service?.accreditationValidMonths?.toString() ?? '',
    accreditationFeeAmount: service?.accreditationFeeAmount?.toString() ?? '',
  })
  const [attributes, setAttributes] = useState<AttrDraft[]>(
    service ? [...service.attributes].sort((a, b) => a.position - b.position).map((a) => ({ kind: a.kind as AttrDraft['kind'], text: a.text })) : []
  )
  const [coverage, setCoverage] = useState<string[]>(service ? service.coverage.map((c) => c.regionName) : [])
  const [coverageDraft, setCoverageDraft] = useState('')

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const num = (v: string): number | null => (v.trim() === '' ? null : Number(v))
  const int = (v: string): number | null => {
    const n = num(v)
    return n == null ? null : Math.round(n)
  }

  const submit = async () => {
    if (form.name.trim().length < 2) {
      toast({ title: 'Service name is required', variant: 'destructive' })
      return
    }
    if (kind === 'ACCREDITATION' && !ACCREDITATION_CATEGORIES.includes(form.category as never)) {
      toast({ title: 'Pick an accreditation category', description: 'Supplier qualification or vendor approval.', variant: 'destructive' })
      return
    }
    setSaving(true)

    const base: Record<string, unknown> = {
      serviceKind: kind,
      category: kind === 'ACCREDITATION' ? form.category : form.category,
      name: form.name.trim(),
      summary: form.summary.trim() || null,
      description: form.description.trim() || null,
      targetSegment: form.targetSegment,
      status: form.status,
      currency: form.currency,
      processingDays: int(form.processingDays),
      attributes: attributes.filter((a) => a.text.trim()).map((a) => ({ kind: a.kind, text: a.text.trim() })),
      coverage,
    }
    if (kind === 'FINANCING') {
      Object.assign(base, {
        amountMin: num(form.amountMin),
        amountMax: num(form.amountMax),
        rateType: form.rateType,
        rateMax: num(form.rateMax),
        feeFlat: num(form.feeFlat),
        tenorMinMonths: int(form.tenorMinMonths),
        tenorMaxMonths: int(form.tenorMaxMonths),
        repaymentFrequency: form.repaymentFrequency,
        gracePeriodDays: int(form.gracePeriodDays),
        shariaCompliant: form.shariaCompliant,
      })
    } else {
      Object.assign(base, {
        accreditationValidMonths: int(form.accreditationValidMonths),
        accreditationFeeAmount: num(form.accreditationFeeAmount),
      })
    }

    const res = editing
      ? await apiRequest<{ service: FinancierServiceDTO }>(`/api/financier/services/${service!.id}`, {
          method: 'PATCH',
          body: JSON.stringify(base),
        })
      : await apiRequest<{ service: FinancierServiceDTO }>('/api/financier/services', {
          method: 'POST',
          body: JSON.stringify(base),
        })
    setSaving(false)
    if (!res.ok) return toastApiError(res.error, editing ? 'Update failed' : 'Service not created')
    toast({
      title: editing ? 'Service updated' : 'Service created',
      description: editing
        ? `“${form.name.trim()}” saved.`
        : `“${form.name.trim()}” is ${form.status === 'ACTIVE' ? 'live in the directory' : 'a draft'} — compose its requirements next.`,
    })
    onSaved()
    onClose()
  }

  const categories = kind === 'ACCREDITATION' ? ACCREDITATION_CATEGORIES : FINANCING_CATEGORIES

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark size={17} className="text-primary" />
            {editing ? `Edit — ${service!.name}` : 'New service'}
          </DialogTitle>
          <DialogDescription>
            {kind === 'FINANCING'
              ? 'A financing service applicants apply to (working capital, invoices, equipment…).'
              : 'An accreditation program — granted accreditation unlocks RFQ participation with your institution.'}
          </DialogDescription>
        </DialogHeader>

        {/* Kind switcher */}
        <div className="grid grid-cols-2 gap-2 rounded-xl border bg-muted/40 p-1" role="tablist" aria-label="Service kind">
          {(['FINANCING', 'ACCREDITATION'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              disabled={editing}
              onClick={() => {
                setKind(k)
                setForm((f) => ({
                  ...f,
                  category: (k === 'ACCREDITATION' ? ACCREDITATION_CATEGORIES : FINANCING_CATEGORIES)[0],
                }))
              }}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors duration-150',
                kind === k ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
                editing && 'cursor-not-allowed opacity-60',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              )}
            >
              {k === 'FINANCING' ? <Banknote size={15} /> : <Award size={15} />}
              {k === 'FINANCING' ? 'Financing' : 'Accreditation'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="svc-name">Service name</Label>
            <Input
              id="svc-name"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder={kind === 'FINANCING' ? 'e.g. E-Loan — Working Capital' : 'e.g. Supplier Qualification Program'}
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={form.category} onValueChange={(v) => set('category', v)}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {categoryLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Audience</Label>
            <Select value={form.targetSegment ?? 'BOTH'} onValueChange={(v) => set('targetSegment', v)}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BUSINESS">Businesses</SelectItem>
                <SelectItem value="INDIVIDUAL">Individuals</SelectItem>
                <SelectItem value="BOTH">Both</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="svc-summary">Summary (directory card)</Label>
            <Input
              id="svc-summary"
              value={form.summary}
              onChange={(e) => set('summary', e.target.value)}
              placeholder="One line applicants see in the directory"
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="svc-desc">Full description</Label>
            <Textarea
              id="svc-desc"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={3}
              className="rounded-xl"
            />
          </div>

          {/* FINANCING terms */}
          {kind === 'FINANCING' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="svc-amount-min">Amount from</Label>
                <Input
                  id="svc-amount-min"
                  type="number"
                  value={form.amountMin}
                  onChange={(e) => set('amountMin', e.target.value)}
                  placeholder="100,000"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="svc-amount-max">Amount up to</Label>
                <Input
                  id="svc-amount-max"
                  type="number"
                  value={form.amountMax}
                  onChange={(e) => set('amountMax', e.target.value)}
                  placeholder="50,000,000"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Rate type</Label>
                <Select value={form.rateType ?? 'MURABAHA_ANNUAL'} onValueChange={(v) => set('rateType', v)}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MURABAHA_ANNUAL">Murabaha (annual)</SelectItem>
                    <SelectItem value="FIXED_ANNUAL">Fixed (annual)</SelectItem>
                    <SelectItem value="FLAT_FEE">Flat fee</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="svc-rate">Rate cap (%)</Label>
                <Input
                  id="svc-rate"
                  type="number"
                  value={form.rateMax}
                  onChange={(e) => set('rateMax', e.target.value)}
                  placeholder="e.g. 30"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tenor from (months)</Label>
                <Input
                  type="number"
                  value={form.tenorMinMonths}
                  onChange={(e) => set('tenorMinMonths', e.target.value)}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tenor up to (months)</Label>
                <Input
                  type="number"
                  value={form.tenorMaxMonths}
                  onChange={(e) => set('tenorMaxMonths', e.target.value)}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Repayment</Label>
                <Select value={form.repaymentFrequency ?? 'MONTHLY'} onValueChange={(v) => set('repaymentFrequency', v)}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                    <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                    <SelectItem value="LUMP_SUM">Lump sum</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="svc-grace">Grace period (days)</Label>
                <Input
                  id="svc-grace"
                  type="number"
                  value={form.gracePeriodDays}
                  onChange={(e) => set('gracePeriodDays', e.target.value)}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="svc-fee">Flat fee (optional)</Label>
                <Input
                  id="svc-fee"
                  type="number"
                  value={form.feeFlat}
                  onChange={(e) => set('feeFlat', e.target.value)}
                  className="rounded-xl"
                />
              </div>
              <div className="flex items-end gap-2 pb-1">
                <Switch id="svc-sharia" checked={form.shariaCompliant} onCheckedChange={(v) => set('shariaCompliant', v)} />
                <Label htmlFor="svc-sharia" className="font-normal text-muted-foreground">
                  Sharia-compliant
                </Label>
              </div>
            </>
          )}

          {/* ACCREDITATION terms */}
          {kind === 'ACCREDITATION' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="svc-valid">Validity (months)</Label>
                <Input
                  id="svc-valid"
                  type="number"
                  value={form.accreditationValidMonths}
                  onChange={(e) => set('accreditationValidMonths', e.target.value)}
                  placeholder="e.g. 12"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="svc-acc-fee">Accreditation fee</Label>
                <Input
                  id="svc-acc-fee"
                  type="number"
                  value={form.accreditationFeeAmount}
                  onChange={(e) => set('accreditationFeeAmount', e.target.value)}
                  placeholder="e.g. 25,000"
                  className="rounded-xl"
                />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="svc-processing">Processing days</Label>
            <Input
              id="svc-processing"
              type="number"
              value={form.processingDays}
              onChange={(e) => set('processingDays', e.target.value)}
              placeholder="e.g. 5"
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Currency</Label>
            <Select value={form.currency} onValueChange={(v) => set('currency', v)}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => set('status', v)}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DRAFT">Draft (hidden from the directory)</SelectItem>
                <SelectItem value="ACTIVE">Active (published)</SelectItem>
                <SelectItem value="ARCHIVED">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Attributes editor */}
        <div className="space-y-2">
          <Label>Highlights &amp; eligibility</Label>
          {attributes.map((attr, i) => (
            <div key={i} className="flex items-center gap-2">
              <Select
                value={attr.kind}
                onValueChange={(v) =>
                  setAttributes((list) =>
                    list.map((a, j) => (j === i ? { ...a, kind: v as AttrDraft['kind'] } : a))
                  )
                }
              >
                <SelectTrigger className="h-9 w-36 shrink-0 rounded-lg text-xs" aria-label="Attribute kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FEATURE">Feature</SelectItem>
                  <SelectItem value="ELIGIBILITY_CONDITION">Eligibility</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={attr.text}
                onChange={(e) =>
                  setAttributes((list) => list.map((a, j) => (j === i ? { ...a, text: e.target.value } : a)))
                }
                placeholder={attr.kind === 'FEATURE' ? 'e.g. Decisions within 48 hours' : 'e.g. 2+ years in operation'}
                className="rounded-xl"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove line"
                onClick={() => setAttributes((list) => list.filter((_, j) => j !== i))}
              >
                <span className="text-muted-foreground">✕</span>
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-lg"
            onClick={() => setAttributes((list) => [...list, { kind: 'FEATURE', text: '' }])}
          >
            <Plus size={14} className="mr-1" /> Add line
          </Button>
        </div>

        {/* Coverage editor */}
        <div className="space-y-2">
          <Label>Coverage regions</Label>
          {coverage.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {coverage.map((region, i) => (
                <span
                  key={`${region}-${i}`}
                  className="inline-flex items-center gap-1 rounded-full border bg-muted px-2.5 py-1 text-xs"
                >
                  {region}
                  <button
                    type="button"
                    aria-label={`Remove ${region}`}
                    onClick={() => setCoverage((list) => list.filter((_, j) => j !== i))}
                    className="rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              value={coverageDraft}
              onChange={(e) => setCoverageDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && coverageDraft.trim()) {
                  e.preventDefault()
                  setCoverage((list) => [...list, coverageDraft.trim()])
                  setCoverageDraft('')
                }
              }}
              placeholder="e.g. Sana'a — press Enter to add"
              className="rounded-xl"
              aria-label="Add coverage region"
            />
            <Button
              type="button"
              variant="outline"
              className="shrink-0 rounded-xl"
              onClick={() => {
                if (!coverageDraft.trim()) return
                setCoverage((list) => [...list, coverageDraft.trim()])
                setCoverageDraft('')
              }}
            >
              Add
            </Button>
          </div>
        </div>

        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" className="rounded-xl" onClick={submit} disabled={saving}>
            {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
            {editing ? 'Save changes' : 'Create service'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Service card ─────────────────────────────────────────────────────────────

function ServiceCard({
  service,
  onEdit,
  onCompose,
}: {
  service: FinancierServiceDTO
  onEdit: () => void
  onCompose: () => void
}) {
  const isAccreditation = service.serviceKind === 'ACCREDITATION'
  const features = service.attributes.filter((a) => a.kind === 'FEATURE')
  return (
    <Card className="group flex flex-col shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
      <CardContent className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset transition-colors duration-200',
                isAccreditation
                  ? 'bg-orange-100 text-orange-700 ring-orange-200/60 group-hover:bg-orange-200/70 dark:bg-orange-950 dark:text-orange-300 dark:ring-orange-900/50'
                  : 'bg-primary/10 text-primary ring-primary/15 group-hover:bg-primary/15'
              )}
            >
              {isAccreditation ? <Award size={19} /> : <Banknote size={19} />}
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold leading-tight" title={service.name}>
                {service.name}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {categoryLabel(service.category)} · {isAccreditation ? 'Accreditation program' : 'Financing service'}
              </p>
            </div>
          </div>
          <FinancingStatusBadge status={service.status} map={SERVICE_STATUS_MAP} />
        </div>

        {service.summary && <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{service.summary}</p>}

        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          {isAccreditation ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock size={13} /> Valid <span className="font-semibold tabular-nums text-foreground">{service.accreditationValidMonths ?? '—'}</span> mo
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Banknote size={13} /> Fee{' '}
                <span className="font-semibold tabular-nums text-foreground">{formatMoney(service.accreditationFeeAmount, service.currency)}</span>
              </span>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5">
                <Banknote size={13} />{' '}
                <span className="font-semibold tabular-nums text-foreground">{formatMoney(service.amountMin, service.currency)} – {formatMoney(service.amountMax, service.currency)}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Timer size={13} /> {rateTypeLabel(service.rateType) ?? '—'}
                {service.rateMax != null ? <span className="font-semibold tabular-nums text-foreground"> ≤ {service.rateMax}%</span> : ''}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Timer size={13} /> <span className="font-semibold tabular-nums text-foreground">{service.tenorMinMonths ?? '—'}–{service.tenorMaxMonths ?? '—'}</span> mo
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Timer size={13} /> {frequencyLabel(service.repaymentFrequency) ?? '—'}
              </span>
            </>
          )}
        </div>

        {features.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {features.slice(0, 3).map((f) => (
              <span key={f.id} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                {f.text}
              </span>
            ))}
            {features.length > 3 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                +{features.length - 3} more
              </span>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
            <ListChecks size={13} /> <span className="tabular-nums">{service.requirementCount}</span> requirements
          </span>
          <span className="tabular-nums">{service.requestCount} requests</span>
          <span className="inline-flex items-center gap-1">
            <Globe2 size={12} /> <span className="tabular-nums">{service.coverage.length}</span> regions
          </span>
          {service.shariaCompliant && (
            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
              <ShieldAlert size={12} /> Sharia-compliant
            </span>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" size="sm" className="rounded-xl" onClick={onCompose}>
            <ListChecks size={14} className="mr-1.5" /> Requirements ({service.requirementCount})
          </Button>
          <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={onEdit}>
            <Pencil size={13} className="mr-1.5" /> Edit
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ── The tab ──────────────────────────────────────────────────────────────────

export function ServicesTab({ onChanged }: { onChanged: () => void }) {
  const { data, loading, error, refetch } = useApi<{ services: FinancierServiceDTO[] }>(
    '/api/financier/services'
  )
  const services = data?.services ?? []

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<FinancierServiceDTO | null>(null)
  const [formSeq, setFormSeq] = useState(0)
  const [composerFor, setComposerFor] = useState<FinancierServiceDTO | null>(null)

  const openCreate = () => {
    setEditing(null)
    setFormSeq((s) => s + 1)
    setFormOpen(true)
  }
  const openEdit = (service: FinancierServiceDTO) => {
    setEditing(service)
    setFormSeq((s) => s + 1)
    setFormOpen(true)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {services.length} {services.length === 1 ? 'service' : 'services'} — financing offers and accreditation
          programs, each with its own requirements checklist.
        </p>
        <Button className="shrink-0 rounded-xl" onClick={openCreate}>
          <Plus size={15} className="mr-1.5" /> New service
        </Button>
      </div>

      {loading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="skeleton-shimmer h-64 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-12 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <SearchX size={24} />
          </span>
          <p className="mt-4 text-sm font-semibold">Couldn&apos;t load your services</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">{error}</p>
          <Button variant="outline" className="mt-4 rounded-xl" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}

      {!loading && !error && services.length === 0 && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-14 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Landmark size={26} />
          </span>
          <p className="mt-4 text-sm font-semibold">No services yet</p>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">
            Publish your first financing service or accreditation program — then compose the
            requirements every application must satisfy.
          </p>
          <Button className="mt-5 rounded-xl" onClick={openCreate}>
            <Plus size={15} className="mr-1.5" /> New service
          </Button>
        </div>
      )}

      {!loading && !error && services.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {services.map((service) => (
            <ServiceCard
              key={service.id}
              service={service}
              onEdit={() => openEdit(service)}
              onCompose={() => setComposerFor(service)}
            />
          ))}
        </div>
      )}

      {formOpen && (
        <ServiceFormDialog
          key={`svc-form-${formSeq}`}
          service={editing}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            void refetch()
            onChanged()
          }}
        />
      )}

      <RequirementsComposer
        service={composerFor}
        onClose={() => setComposerFor(null)}
        onChanged={() => {
          void refetch()
          onChanged()
        }}
      />
    </div>
  )
}
