'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FINANCIER · SERVICES — offering CRUD (DP-22): FINANCING + ACCREDITATION
// service cards with terms editing, feature/eligibility bullet editors and
// coverage region editor. Status toggle DRAFT↔ACTIVE; DELETE = soft archive.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import {
  Archive,
  BadgeCheck,
  Banknote,
  Check,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Sparkles,
  Star,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import type { FinancierServiceDTO } from '@/lib/types'
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  apiRequest,
  EmptyState,
  FINANCING_CATEGORY_LABELS,
  ACCREDITATION_CATEGORY_LABELS,
  RATE_TYPE_LABELS,
  FREQUENCY_LABELS,
  formatMoney,
  SERVICE_KIND_MAP,
  SERVICE_STATUS_MAP,
  StatusBadge,
  toastApiError,
} from '@/components/marketplace/financing/financing-shared'

// ── Service form state (all strings; converted on submit) ──────────────────

interface ServiceForm {
  serviceKind: 'FINANCING' | 'ACCREDITATION'
  category: string
  name: string
  summary: string
  description: string
  targetSegment: string
  currency: string
  amountMin: string
  amountMax: string
  rateType: string
  rateMax: string
  feeFlat: string
  tenorMinMonths: string
  tenorMaxMonths: string
  repaymentFrequency: string
  gracePeriodDays: string
  processingDays: string
  accreditationValidMonths: string
  accreditationFeeAmount: string
  shariaCompliant: boolean
}

const EMPTY_FORM: ServiceForm = {
  serviceKind: 'FINANCING',
  category: 'WORKING_CAPITAL',
  name: '',
  summary: '',
  description: '',
  targetSegment: 'BOTH',
  currency: 'YER',
  amountMin: '',
  amountMax: '',
  rateType: '',
  rateMax: '',
  feeFlat: '',
  tenorMinMonths: '',
  tenorMaxMonths: '',
  repaymentFrequency: '',
  gracePeriodDays: '',
  processingDays: '',
  accreditationValidMonths: '',
  accreditationFeeAmount: '',
  shariaCompliant: false,
}

function formFromService(svc: FinancierServiceDTO): ServiceForm {
  return {
    serviceKind: (svc.serviceKind as 'FINANCING' | 'ACCREDITATION') ?? 'FINANCING',
    category: svc.category,
    name: svc.name,
    summary: svc.summary ?? '',
    description: svc.description ?? '',
    targetSegment: svc.targetSegment ?? 'BOTH',
    currency: svc.currency,
    amountMin: svc.amountMin != null ? String(svc.amountMin) : '',
    amountMax: svc.amountMax != null ? String(svc.amountMax) : '',
    rateType: svc.rateType ?? '',
    rateMax: svc.rateMax != null ? String(svc.rateMax) : '',
    feeFlat: svc.feeFlat != null ? String(svc.feeFlat) : '',
    tenorMinMonths: svc.tenorMinMonths != null ? String(svc.tenorMinMonths) : '',
    tenorMaxMonths: svc.tenorMaxMonths != null ? String(svc.tenorMaxMonths) : '',
    repaymentFrequency: svc.repaymentFrequency ?? '',
    gracePeriodDays: svc.gracePeriodDays != null ? String(svc.gracePeriodDays) : '',
    processingDays: svc.processingDays != null ? String(svc.processingDays) : '',
    accreditationValidMonths: svc.accreditationValidMonths != null ? String(svc.accreditationValidMonths) : '',
    accreditationFeeAmount: svc.accreditationFeeAmount != null ? String(svc.accreditationFeeAmount) : '',
    shariaCompliant: svc.shariaCompliant,
  }
}

const num = (v: string): number | null => (v.trim() === '' ? null : Number(v))
const str = (v: string): string | null => (v.trim() === '' ? null : v.trim())

// ── Section component ───────────────────────────────────────────────────────

export function ServicesSection() {
  const { data, loading, error, refetch } = useApi<{ services: FinancierServiceDTO[] }>('/api/financier/services')
  const services = data?.services ?? []

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<FinancierServiceDTO | null>(null)
  const [attrsFor, setAttrsFor] = useState<FinancierServiceDTO | null>(null)
  const [coverageFor, setCoverageFor] = useState<FinancierServiceDTO | null>(null)
  const [archiving, setArchiving] = useState<FinancierServiceDTO | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const toggleStatus = async (svc: FinancierServiceDTO) => {
    const next = svc.status === 'ACTIVE' ? 'DRAFT' : 'ACTIVE'
    setTogglingId(svc.id)
    const res = await apiRequest<{ service: FinancierServiceDTO }>(`/api/financier/services/${svc.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: next }),
    })
    setTogglingId(null)
    if (!res.ok) return toastApiError(res.error)
    toast({
      title: next === 'ACTIVE' ? 'Service published' : 'Service unpublished',
      description: `${svc.name} is now ${next === 'ACTIVE' ? 'visible in the public directory' : 'hidden from applicants'}.`,
    })
    void refetch()
  }

  const confirmArchive = async () => {
    if (!archiving) return
    const svc = archiving
    setArchiving(null)
    const res = await apiRequest<{ service: FinancierServiceDTO }>(`/api/financier/services/${svc.id}`, {
      method: 'DELETE',
    })
    if (!res.ok) return toastApiError(res.error)
    toast({ title: 'Service archived', description: `${svc.name} was archived — existing requests keep their references.` })
    void refetch()
  }

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-64 rounded-2xl" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <EmptyState icon={Banknote} title="Could not load your services" description={error}>
        <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
          Retry
        </Button>
      </EmptyState>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {services.length} service{services.length === 1 ? '' : 's'} · financing offerings and accreditation programs.
        </p>
        <Button
          className="rounded-xl"
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          <Plus size={15} className="mr-1.5" /> New service
        </Button>
      </div>

      {services.length === 0 ? (
        <EmptyState
          icon={Banknote}
          title="No services yet"
          description="Publish your first financing offering or accreditation program — applicants apply against it through the platform gate."
        >
          <Button
            className="rounded-xl"
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus size={15} className="mr-1.5" /> Create a service
          </Button>
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {services.map((svc) => {
            const categoryLabels =
              svc.serviceKind === 'ACCREDITATION' ? ACCREDITATION_CATEGORY_LABELS : FINANCING_CATEGORY_LABELS
            return (
              <Card key={svc.id} className="flex flex-col overflow-hidden">
                <CardContent className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={svc.serviceKind} map={SERVICE_KIND_MAP} />
                      <StatusBadge status={svc.status} map={SERVICE_STATUS_MAP} />
                      {svc.shariaCompliant && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          <BadgeCheck size={10} /> Sharia
                        </span>
                      )}
                    </div>
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Star size={11} /> {svc.viewCount}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold leading-snug">{svc.name}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {categoryLabels[svc.category] ?? svc.category} · {svc.currency}
                    </p>
                  </div>

                  {svc.serviceKind === 'FINANCING' ? (
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                      <div>
                        <p className="text-muted-foreground">Amount range</p>
                        <p className="font-semibold">
                          {svc.amountMin != null || svc.amountMax != null
                            ? `${svc.amountMin != null ? svc.amountMin.toLocaleString('en-US') : '—'} – ${
                                svc.amountMax != null ? svc.amountMax.toLocaleString('en-US') : '—'
                              }`
                            : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Rate cap</p>
                        <p className="font-semibold">
                          {/* FIN-010: show the cap value even when the type
                              combobox was left unset — never hide a stored number. */}
                          {svc.rateType
                            ? `${RATE_TYPE_LABELS[svc.rateType] ?? svc.rateType}${svc.rateMax != null ? ` · ${svc.rateMax}%` : ''}`
                            : svc.rateMax != null
                              ? `${svc.rateMax}% cap`
                              : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Tenor</p>
                        <p className="font-semibold">
                          {svc.tenorMinMonths || svc.tenorMaxMonths
                            ? `${svc.tenorMinMonths ?? '—'}–${svc.tenorMaxMonths ?? '—'} mo`
                            : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Repayment</p>
                        <p className="font-semibold">
                          {svc.repaymentFrequency ? FREQUENCY_LABELS[svc.repaymentFrequency] ?? svc.repaymentFrequency : '—'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                      <div>
                        <p className="text-muted-foreground">Validity</p>
                        <p className="font-semibold">{svc.accreditationValidMonths ? `${svc.accreditationValidMonths} months` : '—'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Program fee</p>
                        <p className="font-semibold">
                          {svc.accreditationFeeAmount != null ? formatMoney(svc.accreditationFeeAmount, svc.currency) : '—'}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t pt-3 text-[11px] text-muted-foreground">
                    <span className="rounded-full bg-muted px-2 py-0.5 font-medium">{svc.requirementCount ?? 0} requirements</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 font-medium">{svc.coverage.length} regions</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 font-medium">{svc.attributes.length} bullets</span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-lg text-xs"
                      onClick={() => {
                        setEditing(svc)
                        setFormOpen(true)
                      }}
                    >
                      <Pencil size={12} className="mr-1" /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-lg text-xs"
                      onClick={() => setAttrsFor(svc)}
                    >
                      <Sparkles size={12} className="mr-1" /> Features
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-lg text-xs"
                      onClick={() => setCoverageFor(svc)}
                    >
                      <MapPin size={12} className="mr-1" /> Coverage
                    </Button>
                    <Button
                      size="sm"
                      variant={svc.status === 'ACTIVE' ? 'outline' : 'default'}
                      className="h-8 rounded-lg text-xs"
                      disabled={togglingId === svc.id}
                      onClick={() => void toggleStatus(svc)}
                    >
                      {togglingId === svc.id ? (
                        <Loader2 size={12} className="mr-1 animate-spin" />
                      ) : (
                        <Check size={12} className="mr-1" />
                      )}
                      {svc.status === 'ACTIVE' ? 'Unpublish' : 'Publish'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 rounded-lg text-xs text-destructive hover:text-destructive"
                      disabled={svc.status === 'ARCHIVED'}
                      onClick={() => setArchiving(svc)}
                    >
                      <Archive size={12} className="mr-1" /> Archive
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <ServiceFormDialog
        open={formOpen}
        editing={editing}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setEditing(null)
        }}
        onSaved={() => void refetch()}
      />
      <AttributesDialog service={attrsFor} onOpenChange={(o) => !o && setAttrsFor(null)} onSaved={() => void refetch()} />
      <CoverageDialog service={coverageFor} onOpenChange={(o) => !o && setCoverageFor(null)} onSaved={() => void refetch()} />

      <AlertDialog open={!!archiving} onOpenChange={(o) => !o && setArchiving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive “{archiving?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The service is soft-archived — hidden from the directory and blocked for new applications, while existing
              requests and offers keep their references. You can reactivate it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Keep it</AlertDialogCancel>
            <AlertDialogAction className="rounded-xl" onClick={confirmArchive}>
              Archive service
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ── Create / edit dialog ─────────────────────────────────────────────────────

export function ServiceFormDialog({
  open,
  editing,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  editing: FinancierServiceDTO | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<ServiceForm>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [initializedFor, setInitializedFor] = useState<string | null>(null)

  // Reset the form when the dialog opens for a different service (render-time
  // adjustment — avoids an effect cascade on every keystroke).
  const dialogKey = editing?.id ?? 'new'
  if (open && initializedFor !== dialogKey) {
    setInitializedFor(dialogKey)
    setForm(editing ? formFromService(editing) : EMPTY_FORM)
  }
  if (!open && initializedFor !== null) setInitializedFor(null)

  const set = <K extends keyof ServiceForm>(key: K, value: ServiceForm[K]) => setForm((f) => ({ ...f, [key]: value }))
  const isAccreditation = form.serviceKind === 'ACCREDITATION'
  const categories = isAccreditation ? ACCREDITATION_CATEGORY_LABELS : FINANCING_CATEGORY_LABELS

  const submit = async () => {
    if (form.name.trim().length < 3) {
      toast({ title: 'Name too short', description: 'Give the service a name of at least 3 characters.', variant: 'destructive' })
      return
    }
    // FIN-010: a rate cap without a rate type renders "—" on public cards —
    // require the pair together (or clear both).
    if (!isAccreditation && form.rateMax.trim() !== '' && !form.rateType) {
      toast({
        title: 'Pick a rate type',
        description: 'A rate cap without a rate type will not display on your public service card. Choose a type (or clear the cap).',
        variant: 'destructive',
      })
      return
    }
    const base = {
      serviceKind: form.serviceKind,
      category: form.category,
      name: form.name.trim(),
      summary: str(form.summary),
      description: str(form.description),
      targetSegment: str(form.targetSegment),
      currency: form.currency.trim().toUpperCase() || 'YER',
      amountMin: num(form.amountMin),
      amountMax: num(form.amountMax),
      rateType: isAccreditation ? null : str(form.rateType),
      rateMax: num(form.rateMax),
      feeFlat: num(form.feeFlat),
      tenorMinMonths: num(form.tenorMinMonths),
      tenorMaxMonths: num(form.tenorMaxMonths),
      repaymentFrequency: isAccreditation ? null : str(form.repaymentFrequency),
      gracePeriodDays: num(form.gracePeriodDays),
      shariaCompliant: form.shariaCompliant,
      processingDays: num(form.processingDays),
      accreditationValidMonths: isAccreditation ? num(form.accreditationValidMonths) : null,
      accreditationFeeAmount: isAccreditation ? num(form.accreditationFeeAmount) : null,
    }
    setSubmitting(true)
    const res = editing
      ? await apiRequest<{ service: FinancierServiceDTO }>(`/api/financier/services/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(base),
        })
      : await apiRequest<{ service: FinancierServiceDTO }>('/api/financier/services', {
          method: 'POST',
          body: JSON.stringify({ ...base, status: 'DRAFT' }),
        })
    setSubmitting(false)
    if (!res.ok) return toastApiError(res.error)
    toast({
      title: editing ? 'Service updated' : 'Service created',
      description: `${res.data?.service.name} saved as a draft — publish it when the terms are ready.`,
    })
    onOpenChange(false)
    onSaved()
  }

  const field = (
    label: string,
    key: keyof ServiceForm,
    props: { type?: string; placeholder?: string; step?: string; min?: string } = {}
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={`svc-${key}`} className="text-xs">
        {label}
      </Label>
      <Input
        id={`svc-${key}`}
        className="h-9 rounded-lg"
        value={String(form[key] ?? '')}
        type={props.type ?? 'text'}
        placeholder={props.placeholder}
        step={props.step}
        min={props.min}
        onChange={(e) => set(key, (e.target.value ?? '') as never)}
      />
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit — ${editing.name}` : 'Create a service'}</DialogTitle>
          <DialogDescription>
            Financing offerings and accreditation programs are the two service kinds (DP-22). Everything is validated
            before it reaches applicants.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Service kind</Label>
            <Select
              value={form.serviceKind}
              disabled={!!editing}
              onValueChange={(v) => {
                set('serviceKind', v as ServiceForm['serviceKind'])
                set('category', v === 'ACCREDITATION' ? 'SUPPLIER_QUALIFICATION' : 'WORKING_CAPITAL')
              }}
            >
              <SelectTrigger className="h-9 rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FINANCING">Financing offering</SelectItem>
                <SelectItem value="ACCREDITATION">Accreditation program</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Category</Label>
            <Select value={form.category} onValueChange={(v) => set('category', v)}>
              <SelectTrigger className="h-9 rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(categories).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">{field('Service name', 'name', { placeholder: 'e.g. Working Capital Advance' })}</div>
          <div className="sm:col-span-2">{field('Summary (directory line)', 'summary', { placeholder: 'One-line pitch shown on the card' })}</div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="svc-description" className="text-xs">
              Full description
            </Label>
            <Textarea
              id="svc-description"
              className="min-h-[72px] rounded-lg"
              value={form.description}
              placeholder="Terms narrative, eligibility story, anything applicants should know"
              onChange={(e) => set('description', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Target segment</Label>
            <Select value={form.targetSegment} onValueChange={(v) => set('targetSegment', v)}>
              <SelectTrigger className="h-9 rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BOTH">Both</SelectItem>
                <SelectItem value="BUSINESS">Business</SelectItem>
                <SelectItem value="INDIVIDUAL">Individual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {field('Currency', 'currency', { placeholder: 'YER' })}
          {field('Amount min', 'amountMin', { type: 'number', min: '0', step: '1', placeholder: isAccreditation ? '—' : 'e.g. 100000' })}
          {field('Amount max', 'amountMax', { type: 'number', min: '0', step: '1', placeholder: isAccreditation ? '—' : 'e.g. 50000000' })}

          {isAccreditation ? (
            <>
              {field('Accreditation validity (months)', 'accreditationValidMonths', { type: 'number', min: '1', step: '1', placeholder: '12' })}
              {field('Program fee', 'accreditationFeeAmount', { type: 'number', min: '0', step: '1', placeholder: 'e.g. 25000' })}
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Rate type</Label>
                <Select value={form.rateType} onValueChange={(v) => set('rateType', v)}>
                  <SelectTrigger className="h-9 rounded-lg">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(RATE_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {field('Rate cap (%/yr)', 'rateMax', { type: 'number', min: '0', step: '0.01', placeholder: 'e.g. 30' })}
              {field('Tenor min (months)', 'tenorMinMonths', { type: 'number', min: '1', step: '1', placeholder: '6' })}
              {field('Tenor max (months)', 'tenorMaxMonths', { type: 'number', min: '1', step: '1', placeholder: '36' })}
              <div className="space-y-1.5">
                <Label className="text-xs">Repayment frequency</Label>
                <Select value={form.repaymentFrequency} onValueChange={(v) => set('repaymentFrequency', v)}>
                  <SelectTrigger className="h-9 rounded-lg">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {field('Flat fee', 'feeFlat', { type: 'number', min: '0', step: '1', placeholder: 'e.g. 5000' })}
              {field('Grace period (days)', 'gracePeriodDays', { type: 'number', min: '0', step: '1', placeholder: '0' })}
              {field('Processing days', 'processingDays', { type: 'number', min: '1', step: '1', placeholder: '3' })}
            </>
          )}

          <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-3.5 py-2.5 sm:col-span-2">
            <div>
              <p className="text-xs font-semibold">Sharia-compliant</p>
              <p className="text-[11px] text-muted-foreground">Shows the Sharia badge on the directory card.</p>
            </div>
            <Switch checked={form.shariaCompliant} onCheckedChange={(v) => set('shariaCompliant', v)} aria-label="Sharia compliant" />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button className="rounded-xl" onClick={() => void submit()} disabled={submitting}>
            {submitting && <Loader2 size={14} className="mr-1.5 animate-spin" />}
            {editing ? 'Save changes' : 'Create service'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Attributes (features / eligibility bullets) dialog ──────────────────────

function AttributesDialog({
  service,
  onOpenChange,
  onSaved,
}: {
  service: FinancierServiceDTO | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [features, setFeatures] = useState('')
  const [eligibility, setEligibility] = useState('')
  const [saving, setSaving] = useState(false)
  const [initializedFor, setInitializedFor] = useState<string | null>(null)

  const key = service?.id ?? null
  if (service && initializedFor !== key) {
    setInitializedFor(key)
    setFeatures(
      service.attributes
        .filter((a) => a.kind === 'FEATURE')
        .map((a) => a.text)
        .join('\n')
    )
    setEligibility(
      service.attributes
        .filter((a) => a.kind === 'ELIGIBILITY_CONDITION')
        .map((a) => a.text)
        .join('\n')
    )
  }
  if (!service && initializedFor !== null) setInitializedFor(null)

  const save = async () => {
    if (!service) return
    setSaving(true)
    const split = (raw: string) =>
      raw
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
    let ok = true
    const featureRes = await apiRequest(`/api/financier/services/${service.id}/attributes`, {
      method: 'POST',
      body: JSON.stringify({ kind: 'FEATURE', texts: split(features) }),
    })
    if (!featureRes.ok) {
      ok = false
      toastApiError(featureRes.error)
    }
    const eligRes = await apiRequest(`/api/financier/services/${service.id}/attributes`, {
      method: 'POST',
      body: JSON.stringify({ kind: 'ELIGIBILITY_CONDITION', texts: split(eligibility) }),
    })
    if (!eligRes.ok) {
      ok = false
      toastApiError(eligRes.error)
    }
    setSaving(false)
    if (!ok) return
    toast({ title: 'Bullets saved', description: `${service.name} now shows the updated feature and eligibility lists.` })
    onOpenChange(false)
    onSaved()
  }

  return (
    <Dialog open={!!service} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Features & eligibility — {service?.name}</DialogTitle>
          <DialogDescription>One bullet per line. Each list replaces the previous set (position = order).</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="svc-features" className="text-xs">
              Features
            </Label>
            <Textarea
              id="svc-features"
              className="min-h-[120px] rounded-lg"
              value={features}
              onChange={(e) => setFeatures(e.target.value)}
              placeholder={'Fast approval\nDedicated relationship manager'}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="svc-eligibility" className="text-xs">
              Eligibility conditions
            </Label>
            <Textarea
              id="svc-eligibility"
              className="min-h-[120px] rounded-lg"
              value={eligibility}
              onChange={(e) => setEligibility(e.target.value)}
              placeholder={'2+ years in operation\nAudited financials'}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button className="rounded-xl" onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />} Save bullets
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Coverage dialog ──────────────────────────────────────────────────────────

const KNOWN_REGIONS = ['Sana\'a', 'Aden', 'Taiz', 'Hodeidah', 'Ibb', 'Mukalla', 'Dhamar', 'Hajjah']

function CoverageDialog({
  service,
  onOpenChange,
  onSaved,
}: {
  service: FinancierServiceDTO | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [initializedFor, setInitializedFor] = useState<string | null>(null)

  const key = service?.id ?? null
  if (service && initializedFor !== key) {
    setInitializedFor(key)
    setText(service.coverage.map((c) => c.regionName).join('\n'))
  }
  if (!service && initializedFor !== null) setInitializedFor(null)

  const addRegion = (region: string) =>
    setText((t) => {
      const lines = t
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      if (lines.some((l) => l.toLowerCase() === region.toLowerCase())) return t
      return [...lines, region].join('\n')
    })

  const regions = useMemo(
    () =>
      text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
    [text]
  )

  const save = async () => {
    if (!service) return
    setSaving(true)
    const res = await apiRequest(`/api/financier/services/${service.id}/coverage`, {
      method: 'POST',
      body: JSON.stringify({ regions }),
    })
    setSaving(false)
    if (!res.ok) return toastApiError(res.error)
    toast({ title: 'Coverage saved', description: `${service.name} now covers ${regions.length} region${regions.length === 1 ? '' : 's'}.` })
    onOpenChange(false)
    onSaved()
  }

  return (
    <Dialog open={!!service} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Coverage — {service?.name}</DialogTitle>
          <DialogDescription>One region per line (free text, normalized — DP-16). Applicants filter by these.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Textarea
            className="min-h-[120px] rounded-lg"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Sana'a\nAden\nTaiz"}
            aria-label="Coverage regions, one per line"
          />
          <div className="flex flex-wrap gap-1.5">
            {KNOWN_REGIONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => addRegion(r)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                  regions.some((x) => x.toLowerCase() === r.toLowerCase())
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                )}
              >
                + {r}
              </button>
            ))}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button className="rounded-xl" onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />} Save coverage
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
