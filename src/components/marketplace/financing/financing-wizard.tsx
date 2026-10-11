'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FINANCING WIZARD — the applicant's owner flow (FINANCIER_PLAN §4 flow 5).
//
//   Step "service" (only when opened without a service) — pick the service;
//   the "apply to multiple financiers" toggle turns selection into the DP-25
//   multi-select (one service per financier).
//   Step "profile" — Profile & consent: the applicant's DP-14 profile scalars
//   render READ-ONLY (jump-outs to edit), org selector, data-transfer consent.
//   Step "activity" — Activity & ask: the typed FinancingRequest form +
//   client-side amount/tenor bounds vs the selected service(s).
//   Step "checklist" — Checklist & review: the service's composed requirements
//   as supply forms per condition kind, the free attachments zone, the review
//   summary and the create → submit → supply flow. On success the assigned
//   FR-YYYY-###### number is shown with the platform-gate promise.
//
// The ACCREDITATION variant is the simpler form (companies only): profile +
// consent → scopeNotes + checklist → submit (ACC- number).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  FileUp,
  Landmark,
  Loader2,
  Lock,
  PartyPopper,
  ShieldCheck,
  Store,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'
import { apiRequest } from '@/components/marketplace/admin/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { OrganizationDTO } from '@/lib/types'
import {
  ACTIVITY_CATEGORY_OPTIONS,
  ACTIVITY_STATUS_OPTIONS,
  ApplicantProfileDTO,
  ATTACHMENT_KIND_OPTIONS,
  ATTACHMENT_KIND_TO_DOC_TYPE,
  ChecklistAnswer,
  DOCUMENT_STATUS_MAP,
  GUARANTEE_STATUS_OPTIONS,
  GUARANTEE_TYPE_OPTIONS,
  LOCATION_TYPE_OPTIONS,
  PublicServiceDTO,
  VaultDocumentDTO,
  WizardAttachment,
  documentTypeLabel,
  enumLabel,
  formatMoney,
  uploadFinancingImage,
} from './shared'
import {
  ConditionTypeBadge,
  FinServiceRequirement,
  SERVICE_KIND_MAP,
  StatusBadge,
} from './shared'

export interface FinancingWizardProps {
  open: boolean
  onClose: () => void
  /** Preselected services (storefront "Apply now" / "Apply to multiple"). [] → picker step. */
  initialServiceIds?: string[]
  /** QUOTE / ORDER / RFQ_LINE context — v1 default WORKING_CAPITAL when absent. */
  target?: { targetType: string; targetId?: string }
}

interface ActivityForm {
  activityStatus: 'NEW' | 'EXISTING'
  activityName: string
  activityDescription: string
  activityStartDate: string
  activityCity: string
  activityDistrict: string
  activityAddress: string
  activityLocationType: string
  activityCategory: string
  activityCategoryOther: string
  capitalAmount: string
  ownContributionAmount: string
  monthlyInstallmentCapacity: string
  previousFinancing: boolean
  otherIncomeSources: string
  amountRequested: string
  purpose: string
  tenorRequestedMonths: string
  guaranteeType: string
  guaranteeTypeOther: string
  guaranteeStatus: string
  guaranteeStatusOther: string
  applicantNotes: string
}

const EMPTY_FORM: ActivityForm = {
  activityStatus: 'NEW',
  activityName: '',
  activityDescription: '',
  activityStartDate: '',
  activityCity: '',
  activityDistrict: '',
  activityAddress: '',
  activityLocationType: 'RENTED',
  activityCategory: 'WORKING_CAPITAL',
  activityCategoryOther: '',
  capitalAmount: '',
  ownContributionAmount: '',
  monthlyInstallmentCapacity: '',
  previousFinancing: false,
  otherIncomeSources: '',
  amountRequested: '',
  purpose: '',
  tenorRequestedMonths: '',
  guaranteeType: 'PERSONAL_GUARANTEE',
  guaranteeTypeOther: '',
  guaranteeStatus: 'AVAILABLE',
  guaranteeStatusOther: '',
  applicantNotes: '',
}

type StepKey = 'service' | 'profile' | 'activity' | 'checklist'
const STEP_LABELS: Record<StepKey, string> = {
  service: 'Service',
  profile: 'Profile & consent',
  activity: 'Activity & ask',
  checklist: 'Checklist & review',
}

export function FinancingWizard({ open, onClose, initialServiceIds = [], target }: FinancingWizardProps) {
  const user = useMarketplace((s) => s.user)
  const authChecked = useMarketplace((s) => s.authChecked)
  const navigate = useMarketplace((s) => s.navigate)

  // ── wizard state ──
  const [stepKey, setStepKey] = useState<StepKey>(initialServiceIds.length > 0 ? 'profile' : 'service')
  const [services, setServices] = useState<PublicServiceDTO[] | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [multiMode, setMultiMode] = useState(false)
  const [requirements, setRequirements] = useState<FinServiceRequirement[] | null>(null)
  const [consent, setConsent] = useState(false)
  const [applyAs, setApplyAs] = useState<string>('individual')
  const [form, setForm] = useState<ActivityForm>(EMPTY_FORM)
  const [answers, setAnswers] = useState<Record<string, ChecklistAnswer>>({})
  const [attachments, setAttachments] = useState<WizardAttachment[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<
    | { kind: 'financing'; multiGroupId: string | null; numbers: string[]; warnings: string[] }
    | { kind: 'accreditation'; numbers: string[]; warnings: string[] }
    | null
  >(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const setField = <K extends keyof ActivityForm>(key: K, v: ActivityForm[K]) =>
    setForm((f) => ({ ...f, [key]: v }))

  // ── data loads (only while open + signed in) ──
  useEffect(() => {
    if (!open || !user) return
    let cancelled = false
    void (async () => {
      const res = await apiRequest<{ services: PublicServiceDTO[] }>('/api/financing/services?page=1')
      if (!cancelled) setServices(res.ok && res.data ? res.data.services : [])
    })()
    return () => {
      cancelled = true
    }
  }, [open, user])

  // Seed selection when the wizard opens with preselected services.
  useEffect(() => {
    if (!open) return
    setSelectedIds(initialServiceIds)
    setMultiMode(initialServiceIds.length > 1)
    setStepKey(initialServiceIds.length > 0 ? 'profile' : 'service')
  }, [open, initialServiceIds])

  // ── derived selection ──
  const selected = useMemo(
    () => (services ?? []).filter((s) => selectedIds.includes(s.id)),
    [services, selectedIds]
  )

  const primaryService = selected[0] ?? null
  const isAccreditation = selected.length === 1 && selected[0].serviceKind === 'ACCREDITATION'

  // Bounds across every selected service (multi: intersection).
  const bounds = useMemo(() => {
    if (selected.length === 0) {
      return { min: null as number | null, max: null as number | null, tenorMin: null as number | null, tenorMax: null as number | null }
    }
    const mins = selected.map((s) => s.amountMin).filter((v): v is number => v !== null)
    const maxes = selected.map((s) => s.amountMax).filter((v): v is number => v !== null)
    const tMin = selected.map((s) => s.tenorMinMonths).filter((v): v is number => v !== null)
    const tMax = selected.map((s) => s.tenorMaxMonths).filter((v): v is number => v !== null)
    return {
      min: mins.length ? Math.max(...mins) : null,
      max: maxes.length ? Math.min(...maxes) : null,
      tenorMin: tMin.length ? Math.max(...tMin) : null,
      tenorMax: tMax.length ? Math.min(...tMax) : null,
    }
  }, [selected])

  // Steps actually rendered for this run.
  const steps: StepKey[] = useMemo(() => {
    const out: StepKey[] = []
    if (initialServiceIds.length === 0) out.push('service')
    out.push('profile')
    if (!isAccreditation) out.push('activity')
    out.push('checklist')
    return out
  }, [initialServiceIds, isAccreditation])

  // Requirements of the selected services (union by template for multi).
  useEffect(() => {
    if (!open || !user || selected.length === 0) {
      setRequirements(null)
      return
    }
    let cancelled = false
    setRequirements(null)
    void (async () => {
      const lists = await Promise.all(
        selected.map((s) =>
          apiRequest<{ requirements: FinServiceRequirement[] }>(`/api/financing/services/${s.id}/requirements`)
        )
      )
      if (cancelled) return
      const byTemplate = new Map<string, FinServiceRequirement>()
      for (const res of lists) {
        if (!res.ok || !res.data) continue
        for (const r of res.data.requirements) {
          if (!r.template) continue
          const existing = byTemplate.get(r.template.id)
          // keep the required variant when any sibling marks the template required
          if (!existing || (r.isRequired && !existing.isRequired)) byTemplate.set(r.template.id, r)
        }
      }
      setRequirements([...byTemplate.values()].sort((a, b) => a.displayOrder - b.displayOrder))
    })()
    return () => {
      cancelled = true
    }
  }, [open, user, selected])

  // ── validation per step ──
  const businessOnly = primaryService?.targetSegment === 'BUSINESS' || isAccreditation
  const step1Valid = consent && (!businessOnly || applyAs !== 'individual')
  const amountNum = Number(form.amountRequested)
  const step2Valid =
    form.activityName.trim().length > 0 &&
    form.activityCity.trim().length > 0 &&
    Number.isFinite(amountNum) &&
    amountNum > 0 &&
    (bounds.min === null || amountNum >= bounds.min) &&
    (bounds.max === null || amountNum <= bounds.max) &&
    (form.activityCategory !== 'OTHER' || form.activityCategoryOther.trim().length > 0) &&
    (form.guaranteeType !== 'OTHER' || form.guaranteeTypeOther.trim().length > 0) &&
    (form.guaranteeStatus !== 'OTHER' || form.guaranteeStatusOther.trim().length > 0)

  const requiredItems = (requirements ?? []).filter(
    (r) => r.isRequired && r.template && r.template.conditionType !== 'PROFILE_FIELD'
  )
  const missingRequired = requiredItems.filter((r) => {
    const a = answers[r.template!.id]
    if (!a) return true
    if (a.accountDocumentId) return false
    if (a.valueNumber !== undefined && a.valueNumber !== null) return false
    if (a.valueDate) return false
    return !a.valueText?.trim()
  })

  const canContinue =
    stepKey === 'service' ? selectedIds.length > 0 : stepKey === 'profile' ? step1Valid : isAccreditation || step2Valid

  if (!open) return null

  const goNext = () => {
    if (stepKey === 'profile' && !step1Valid) {
      toast({
        title: businessOnly && applyAs === 'individual' ? 'Organization required' : 'Consent required',
        description:
          businessOnly && applyAs === 'individual'
            ? 'This program qualifies organizations — choose the company applying.'
            : 'Please accept the data-transfer consent to continue.',
        variant: 'destructive',
      })
      return
    }
    if (stepKey === 'activity' && !step2Valid) {
      toast({
        title: 'Complete the activity & ask',
        description:
          'Fill the activity name, city and the requested amount' +
          (bounds.min !== null || bounds.max !== null
            ? ` (this service accepts ${formatMoney(bounds.min, primaryService?.currency)} – ${formatMoney(bounds.max, primaryService?.currency)})`
            : ''),
        variant: 'destructive',
      })
      return
    }
    const i = steps.indexOf(stepKey)
    setStepKey(steps[Math.min(i + 1, steps.length - 1)] ?? 'checklist')
  }

  const goBack = () => {
    const i = steps.indexOf(stepKey)
    setStepKey(steps[Math.max(i - 1, 0)] ?? 'service')
  }

  // ── the create → submit → supply → attach flow ──
  const submit = async () => {
    if (missingRequired.length > 0) {
      toast({
        title: 'Checklist incomplete',
        description: `${missingRequired.length} required item${missingRequired.length === 1 ? '' : 's'} still need${missingRequired.length === 1 ? 's' : ''} an answer — you can also supply them later from your requests page.`,
        variant: 'destructive',
      })
      return
    }
    setSubmitting(true)
    const warnings: string[] = []
    try {
      if (isAccreditation) {
        // ── accreditation variant: create → submit → supply ──
        const createRes = await apiRequest<{ request: { id: string } }>('/api/financing/accreditation', {
          method: 'POST',
          body: JSON.stringify({
            serviceId: primaryService!.id,
            organizationId: applyAs,
            scopeNotes: form.purpose.trim() || null,
          }),
        })
        if (!createRes.ok || !createRes.data) throw new Error(createRes.error ?? 'Could not create the request')
        const id = createRes.data.request.id
        const submitRes = await apiRequest<{ request: { number: string } }>(
          `/api/financing/accreditation/${id}/submit`,
          { method: 'POST' }
        )
        if (!submitRes.ok || !submitRes.data) throw new Error(submitRes.error ?? 'Could not submit the request')
        const detailRes = await apiRequest<{
          request: { checklist: { id: string; requirement: { template: { id: string } } }[] }
        }>(`/api/financing/accreditation/${id}`)
        if (detailRes.ok && detailRes.data) await supplyAnswers(detailRes.data.request.checklist, warnings)
        await attachAll('ACCREDITATION_REQUEST', id, warnings)
        setResult({ kind: 'accreditation', numbers: [submitRes.data.request.number], warnings })
      } else {
        const payload: Record<string, unknown> = {
          organizationId: applyAs === 'individual' ? null : applyAs,
          targetType: target?.targetType ?? 'WORKING_CAPITAL',
          targetId: target?.targetId ?? null,
          activityStatus: form.activityStatus,
          activityName: form.activityName.trim() || null,
          activityDescription: form.activityDescription.trim() || null,
          activityStartDate: form.activityStartDate || null,
          activityCity: form.activityCity.trim() || null,
          activityDistrict: form.activityDistrict.trim() || null,
          activityAddress: form.activityAddress.trim() || null,
          activityLocationType: form.activityLocationType,
          activityCategory: form.activityCategory,
          activityCategoryOther: form.activityCategory === 'OTHER' ? form.activityCategoryOther.trim() || null : null,
          capitalAmount: form.capitalAmount ? Number(form.capitalAmount) : null,
          ownContributionAmount: form.ownContributionAmount ? Number(form.ownContributionAmount) : null,
          monthlyInstallmentCapacity: form.monthlyInstallmentCapacity ? Number(form.monthlyInstallmentCapacity) : null,
          previousFinancing: form.previousFinancing,
          otherIncomeSources: form.otherIncomeSources.trim() || null,
          amountRequested: amountNum,
          currency: primaryService?.currency,
          purpose: form.purpose.trim() || null,
          tenorRequestedMonths: form.tenorRequestedMonths ? Number(form.tenorRequestedMonths) : null,
          guaranteeType: form.guaranteeType,
          guaranteeTypeOther: form.guaranteeType === 'OTHER' ? form.guaranteeTypeOther.trim() || null : null,
          guaranteeStatus: form.guaranteeStatus,
          guaranteeStatusOther: form.guaranteeStatus === 'OTHER' ? form.guaranteeStatusOther.trim() || null : null,
          applicantNotes: form.applicantNotes.trim() || null,
        }

        let createdIds: { id: string }[] = []
        let multiGroupId: string | null = null
        if (selectedIds.length === 1) {
          const res = await apiRequest<{ request: { id: string } }>('/api/financing/requests', {
            method: 'POST',
            body: JSON.stringify({ ...payload, serviceId: selectedIds[0] }),
          })
          if (!res.ok || !res.data) throw new Error(res.error ?? 'Could not create the request')
          createdIds = [res.data.request]
        } else {
          const res = await apiRequest<{ multiGroupId: string; requests: { id: string }[] }>(
            '/api/financing/requests/multi',
            { method: 'POST', body: JSON.stringify({ ...payload, serviceIds: selectedIds }) }
          )
          if (!res.ok || !res.data) throw new Error(res.error ?? 'Could not create the requests')
          createdIds = res.data.requests
          multiGroupId = res.data.multiGroupId
        }

        const numbers: string[] = []
        for (const req of createdIds) {
          const submitRes = await apiRequest<{ request: { number: string } }>(
            `/api/financing/requests/${req.id}/submit`,
            { method: 'POST' }
          )
          if (!submitRes.ok || !submitRes.data) {
            warnings.push(submitRes.error ?? 'One request could not be submitted')
            continue
          }
          numbers.push(submitRes.data.request.number)
          const detailRes = await apiRequest<{
            request: { checklist: { id: string; requirement: { template: { id: string } } }[] }
          }>(`/api/financing/requests/${req.id}`)
          if (detailRes.ok && detailRes.data) await supplyAnswers(detailRes.data.request.checklist, warnings)
          await attachAll('FINANCING_REQUEST', req.id, warnings)
        }
        if (numbers.length === 0) throw new Error(warnings[0] ?? 'The request could not be submitted')
        setResult({ kind: 'financing', multiGroupId, numbers, warnings })
      }
    } catch (err) {
      toast({
        title: 'Submission failed',
        description: err instanceof Error ? err.message : 'Unexpected error',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  /** POST supply for every checklist row whose template has a wizard answer. */
  const supplyAnswers = async (
    checklist: { id: string; requirement: { template: { id: string } } }[],
    warnings: string[]
  ) => {
    for (const item of checklist) {
      const answer = answers[item.requirement.template.id]
      if (!answer) continue
      const body: Record<string, unknown> = {}
      if (answer.accountDocumentId) body.accountDocumentId = answer.accountDocumentId
      if (answer.valueNumber !== undefined && answer.valueNumber !== null) body.valueNumber = answer.valueNumber
      if (answer.valueDate) body.valueDate = answer.valueDate
      if (answer.valueText) body.valueText = answer.valueText
      const res = await apiRequest(`/api/financing/submissions/${item.id}/supply`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      if (!res.ok) warnings.push(res.error ?? 'One checklist item could not be supplied')
    }
  }

  /** Attach every free-upload document to the fresh request. */
  const attachAll = async (
    parentType: 'FINANCING_REQUEST' | 'ACCREDITATION_REQUEST',
    parentId: string,
    warnings: string[]
  ) => {
    for (const att of attachments) {
      const res = await apiRequest('/api/financing/attachments', {
        method: 'POST',
        body: JSON.stringify({ parentType, parentId, accountDocumentId: att.documentId, kind: att.kind }),
      })
      if (!res.ok) warnings.push(res.error ?? 'One attachment could not be linked')
    }
  }

  const resetAndClose = () => {
    onClose()
    setResult(null)
    setStepKey(initialServiceIds.length > 0 ? 'profile' : 'service')
    setConsent(false)
    setAnswers({})
    setAttachments([])
    setForm(EMPTY_FORM)
  }

  // ── auth guard inside the dialog ──
  if (authChecked && !user) {
    return (
      <DialogShell onClose={resetAndClose} steps={null} activeKey="service" title="Financing application">
        <div className="flex flex-col items-center px-6 py-14 text-center">
          <Lock size={32} className="text-muted-foreground/50" />
          <p className="mt-3 text-sm font-semibold">Sign in to apply</p>
          <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
            Financing applications reuse your account profile and document vault — sign in to continue.
          </p>
          <Button className="mt-5 rounded-xl" onClick={resetAndClose}>
            Close
          </Button>
        </div>
      </DialogShell>
    )
  }

  // ── success screen (the gate promise) ──
  if (result) {
    return (
      <DialogShell onClose={resetAndClose} steps={null} activeKey="checklist" title="Application submitted">
        <div className="space-y-5 px-6 py-8 text-center sm:px-8">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <PartyPopper size={26} />
          </span>
          <div>
            <h3 className="text-lg font-bold">Submitted for platform verification</h3>
            {result.numbers.map((n) => (
              <p key={n} className="mt-1 font-mono text-base font-bold text-primary">
                {n}
              </p>
            ))}
            {result.kind === 'financing' && result.multiGroupId && result.numbers.length > 1 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Multi-financier group — one sibling request per financier, compare their offers side-by-side.
              </p>
            )}
          </div>
          <p className="mx-auto flex max-w-md items-start gap-2 rounded-xl bg-muted/60 px-4 py-3 text-left text-xs leading-relaxed text-muted-foreground">
            <ShieldCheck size={15} className="mt-0.5 shrink-0 text-primary" aria-hidden />
            The platform will verify your conditions before forwarding the request to the financier — incomplete or
            incorrect items are returned to you with notes, so nothing unverified ever reaches a financier.
          </p>
          {result.warnings.length > 0 && (
            <div className="mx-auto max-w-md rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-left text-xs leading-relaxed text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
              <p className="font-semibold">Some items need attention:</p>
              <ul className="mt-1 list-disc pl-4">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <Button
              className="rounded-xl"
              onClick={() => {
                resetAndClose()
                navigate('myfinancing')
              }}
            >
              View my requests
            </Button>
            <Button variant="outline" className="rounded-xl" onClick={resetAndClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogShell>
    )
  }

  const isFinal = stepKey === 'checklist'

  return (
    <DialogShell
      onClose={resetAndClose}
      steps={steps}
      activeKey={stepKey}
      title={isAccreditation ? 'Accreditation application' : 'Financing application'}
      footer={
        <div className="flex items-center justify-between gap-3 border-t px-5 py-3.5 sm:px-6">
          <Button variant="ghost" className="rounded-xl" onClick={stepKey === 'service' ? resetAndClose : goBack}>
            {stepKey === 'service' ? 'Cancel' : (
              <>
                <ArrowLeft size={14} className="mr-1.5" /> Back
              </>
            )}
          </Button>
          {isFinal ? (
            <Button className="rounded-xl" disabled={submitting} onClick={() => void submit()}>
              {submitting ? (
                <>
                  <Loader2 size={14} className="mr-1.5 animate-spin" /> Submitting…
                </>
              ) : (
                <>
                  <ShieldCheck size={14} className="mr-1.5" /> Submit application
                </>
              )}
            </Button>
          ) : (
            <Button className="rounded-xl" disabled={!canContinue} onClick={goNext}>
              Continue <ArrowRight size={14} className="ml-1.5" />
            </Button>
          )}
        </div>
      }
    >
      {stepKey === 'service' && (
        <ServicePicker
          services={services}
          selectedIds={selectedIds}
          multiMode={multiMode}
          onMultiModeChange={setMultiMode}
          onChange={setSelectedIds}
        />
      )}

      {stepKey === 'profile' && (
        <ProfileConsentStep
          isAccreditation={isAccreditation}
          businessOnly={businessOnly}
          applyAs={applyAs}
          onApplyAs={setApplyAs}
          consent={consent}
          onConsent={setConsent}
          service={primaryService}
        />
      )}

      {stepKey === 'activity' && (
        <ActivityStep
          form={form}
          setField={setField}
          currency={primaryService?.currency ?? 'YER'}
          bounds={bounds}
          target={target}
          multi={selected.length > 1}
        />
      )}

      {isFinal && (
        <ChecklistReviewStep
          services={selected}
          isAccreditation={isAccreditation}
          requirements={requirements}
          answers={answers}
          onAnswer={(templateId, answer) => setAnswers((a) => ({ ...a, [templateId]: answer }))}
          attachments={attachments}
          onAttachmentsChange={setAttachments}
          form={form}
          onFormChange={setField}
          applyAs={applyAs}
          currency={primaryService?.currency ?? 'YER'}
          fileInputRef={fileInputRef}
          missingCount={missingRequired.length}
        />
      )}
    </DialogShell>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Dialog shell + stepper
// ═══════════════════════════════════════════════════════════════════════════

function DialogShell({
  onClose,
  steps,
  activeKey,
  title,
  footer,
  children,
}: {
  onClose: () => void
  steps: StepKey[] | null
  activeKey: StepKey
  title: string
  footer?: React.ReactNode
  children: React.ReactNode
}) {
  const activeIndex = steps?.indexOf(activeKey) ?? -1
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[95vh] w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-2xl sm:max-h-[92vh] sm:max-w-3xl sm:rounded-2xl lg:max-w-4xl">
        {/* header + stepper */}
        <div className="border-b px-5 pb-4 pt-4 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Landmark size={17} />
              </span>
              <h2 className="text-base font-bold tracking-tight">{title}</h2>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close">
              <X size={15} />
            </Button>
          </div>
          {steps && (
            <div className="mt-4 flex items-center gap-1.5 sm:gap-2">
              {steps.map((s, i) => {
                const done = i < activeIndex
                const active = i === activeIndex
                return (
                  <div key={s} className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
                    <span
                      className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold transition-colors',
                        done
                          ? 'border-primary bg-primary text-primary-foreground'
                          : active
                            ? 'border-primary text-primary'
                            : 'border-border text-muted-foreground'
                      )}
                    >
                      {done ? <CheckCircle2 size={13} /> : i + 1}
                    </span>
                    <span
                      className={cn(
                        'truncate text-[11px] font-semibold sm:text-xs',
                        active ? 'text-foreground' : 'text-muted-foreground'
                      )}
                    >
                      {STEP_LABELS[s]}
                    </span>
                    {i < steps.length - 1 && (
                      <span className={cn('h-px flex-1', i < activeIndex ? 'bg-primary/60' : 'bg-border')} />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
        {/* body */}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Step "service" — service picker (single + DP-25 multi-financier mode)
// ═══════════════════════════════════════════════════════════════════════════

function ServicePicker({
  services,
  selectedIds,
  multiMode,
  onMultiModeChange,
  onChange,
}: {
  services: PublicServiceDTO[] | null
  selectedIds: string[]
  multiMode: boolean
  onMultiModeChange: (v: boolean) => void
  onChange: (ids: string[]) => void
}) {
  const [kindFilter, setKindFilter] = useState<'' | 'FINANCING' | 'ACCREDITATION'>('')
  const filtered = useMemo(
    () => (services ?? []).filter((s) => (kindFilter ? s.serviceKind === kindFilter : true)),
    [services, kindFilter]
  )
  const grouped = useMemo(() => {
    const map = new Map<string, { org: string; orgType: string; services: PublicServiceDTO[] }>()
    for (const s of filtered) {
      const key = s.financier.organizationId
      if (!map.has(key)) map.set(key, { org: s.financier.name, orgType: s.financier.orgType, services: [] })
      map.get(key)!.services.push(s)
    }
    return [...map.values()]
  }, [filtered])

  const toggle = (id: string) => {
    if (!multiMode) {
      onChange([id])
      return
    }
    const service = (services ?? []).find((s) => s.id === id)
    if (service?.serviceKind === 'ACCREDITATION') {
      toast({
        title: 'Accreditation is a single request',
        description: 'Accreditation programs use their own application — deselect multi mode to apply for one.',
        variant: 'destructive',
      })
      return
    }
    const alreadySameFinancier = selectedIds.some((sid) => {
      const other = (services ?? []).find((s) => s.id === sid)
      return other?.financier.organizationId === service?.financier.organizationId
    })
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id))
    } else if (alreadySameFinancier) {
      toast({
        title: 'One service per financier',
        description:
          'A multi-financier group holds one service per financier — send revisions to the same financier instead.',
        variant: 'destructive',
      })
    } else {
      onChange([...selectedIds, id])
    }
  }

  return (
    <div className="space-y-4 px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Choose a service</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Browse the verified financier services published on the marketplace.
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 rounded-xl border bg-card px-3 py-2">
          <Switch checked={multiMode} onCheckedChange={onMultiModeChange} aria-label="Apply to multiple financiers" />
          <span className="text-xs font-semibold">Apply to multiple financiers</span>
        </label>
      </div>

      {/* kind filter chips */}
      <div className="flex gap-2" role="tablist" aria-label="Filter services by kind">
        {[
          { value: '', label: 'All services' },
          { value: 'FINANCING', label: 'Financing' },
          { value: 'ACCREDITATION', label: 'Accreditation' },
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
                'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
              )}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {services === null ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : services.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          No financing services are currently published.
        </p>
      ) : (
        <div className="space-y-4">
          {grouped.map((g) => (
            <div key={g.org}>
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Building2 size={12} aria-hidden /> {g.org}
                <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-bold normal-case">
                  {g.orgType}
                </span>
              </p>
              <div className="space-y-2">
                {g.services.map((s) => {
                  const checked = selectedIds.includes(s.id)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggle(s.id)}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-all',
                        checked
                          ? 'border-primary bg-primary/[0.06] shadow-sm'
                          : 'border-border bg-card hover:border-primary/40'
                      )}
                      aria-pressed={checked}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                          checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
                        )}
                      >
                        {checked && <CheckCircle2 size={12} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">{s.name}</span>
                          <StatusBadge status={s.serviceKind} map={SERVICE_KIND_MAP} />
                          {s.shariaCompliant && (
                            <span className="rounded-full bg-emerald-100 px-2 py-px text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              Sharia compliant
                            </span>
                          )}
                        </span>
                        {s.summary && (
                          <span className="mt-0.5 block line-clamp-1 text-xs text-muted-foreground">{s.summary}</span>
                        )}
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {s.amountMin !== null || s.amountMax !== null
                            ? `${formatMoney(s.amountMin, s.currency)} – ${formatMoney(s.amountMax, s.currency)}`
                            : 'Amount on request'}{' '}
                          · {s.tenorMinMonths ?? '—'}–{s.tenorMaxMonths ?? '—'} months
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      {multiMode && (
        <p className="text-xs text-muted-foreground">
          {selectedIds.length} service{selectedIds.length === 1 ? '' : 's'} selected — one sibling request per
          financier, sharing this single application.
        </p>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Step "profile" — profile & consent (read-only profile + org + consent)
// ═══════════════════════════════════════════════════════════════════════════

function ProfileConsentStep({
  isAccreditation,
  businessOnly,
  applyAs,
  onApplyAs,
  consent,
  onConsent,
  service,
}: {
  isAccreditation: boolean
  businessOnly: boolean
  applyAs: string
  onApplyAs: (v: string) => void
  consent: boolean
  onConsent: (v: boolean) => void
  service: PublicServiceDTO | null
}) {
  const navigate = useMarketplace((s) => s.navigate)
  const { data, loading } = useProfile()
  const { data: orgsData, loading: orgsLoading } = useMyOrgs()
  const orgs = orgsData ?? []
  const p = data

  // business-only services: preselect the organization as soon as it loads
  useEffect(() => {
    if (businessOnly && applyAs === 'individual' && orgs.length > 0) onApplyAs(orgs[0].id)
  }, [businessOnly, applyAs, orgs, onApplyAs])

  return (
    <div className="space-y-5 px-5 py-5 sm:px-6">
      <section aria-label="Applicant profile">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <UserRound size={14} className="text-primary" /> Your profile
          </h3>
          <button
            type="button"
            className="text-xs font-semibold text-primary hover:underline"
            onClick={() => navigate('account')}
          >
            Edit profile
          </button>
        </div>
        {loading ? (
          <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        ) : (
          <div className="grid gap-x-6 gap-y-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
            <ProfileField label="Full name" value={p?.name} />
            <ProfileField label="Email" value={p?.email} />
            <ProfileField label="Phone" value={p?.phone} />
            <ProfileField label="WhatsApp" value={p?.whatsappNumber} />
            <ProfileField label="Date of birth" value={p?.dateOfBirth?.slice(0, 10)} />
            <ProfileField label="Nationality" value={p?.nationality} />
            <ProfileField
              label="Identity"
              value={[enumLabel(p?.identityType ?? null), p?.identityNumber].filter(Boolean).join(' · ')}
            />
            <ProfileField
              label="Residence"
              value={[p?.residenceStreet, p?.residenceDistrict, p?.residenceCity].filter(Boolean).join(', ')}
            />
            <ProfileField label="Residence type" value={enumLabel(p?.residenceType ?? null)} />
          </div>
        )}
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Your profile is reused automatically — financing data lives on your account once (single-entry rule).
        </p>
      </section>

      {/* org selector */}
      {(orgs.length > 0 || businessOnly) && (
        <section aria-label="Applicant organization">
          <h3 className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold">
            <Building2 size={14} className="text-primary" /> Applying as
          </h3>
          {orgsLoading ? (
            <Skeleton className="h-16 rounded-xl" />
          ) : orgs.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-4 text-xs leading-relaxed text-muted-foreground">
              {businessOnly
                ? 'This program qualifies organizations. Register a business account first, then apply through it.'
                : 'You have no organization memberships — the application will be filed as an individual.'}
            </p>
          ) : (
            <RadioGroup
              value={applyAs}
              onValueChange={onApplyAs}
              className="grid gap-2 sm:grid-cols-2"
            >
              {!businessOnly && (
                <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border bg-card p-3 text-sm has-[button[data-state=checked]]:border-primary">
                  <RadioGroupItem value="individual" />
                  <span>
                    <span className="block font-medium">Individual</span>
                    <span className="text-xs text-muted-foreground">Personal application</span>
                  </span>
                </label>
              )}
              {orgs.map((o) => (
                <label
                  key={o.id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-xl border bg-card p-3 text-sm has-[button[data-state=checked]]:border-primary"
                >
                  <RadioGroupItem value={o.id} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{o.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {o.myRole ? enumLabel(o.myRole) : 'member'} · {o.memberCount ?? 0} members
                    </span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          )}
        </section>
      )}

      {/* consent */}
      <section aria-label="Data transfer consent">
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-primary/30 bg-primary/[0.04] p-4">
          <Checkbox
            checked={consent}
            onCheckedChange={(v) => onConsent(v === true)}
            aria-label="Data transfer consent"
          />
          <span className="text-xs leading-relaxed">
            I consent to Vendora verifying my application data and documents, and transferring them to{' '}
            <span className="font-semibold">
              {service ? service.financier.name : 'the financier'}
            </span>{' '}
            only after the platform verification gate approves my request{isAccreditation ? ' for accreditation' : ''}. I
            confirm the information I provide is true and complete.
          </span>
        </label>
      </section>
    </div>
  )
}

function ProfileField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm" title={value ?? undefined}>
        {value?.trim() ? value : <span className="text-muted-foreground/60">—</span>}
      </p>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Step "activity" — activity & ask
// ═══════════════════════════════════════════════════════════════════════════

function ActivityStep({
  form,
  setField,
  currency,
  bounds,
  target,
  multi,
}: {
  form: ActivityForm
  setField: <K extends keyof ActivityForm>(key: K, v: ActivityForm[K]) => void
  currency: string
  bounds: { min: number | null; max: number | null; tenorMin: number | null; tenorMax: number | null }
  target?: { targetType: string; targetId?: string }
  multi: boolean
}) {
  const amount = Number(form.amountRequested)
  const amountInvalid =
    form.amountRequested !== '' &&
    Number.isFinite(amount) &&
    ((bounds.min !== null && amount < bounds.min) || (bounds.max !== null && amount > bounds.max))

  return (
    <div className="space-y-5 px-5 py-5 sm:px-6">
      {target && target.targetType !== 'WORKING_CAPITAL' && (
        <div className="flex items-center gap-2 rounded-xl bg-muted/60 px-3.5 py-2.5 text-xs">
          <Store size={13} className="text-primary" aria-hidden />
          <span>
            Financing requested for <span className="font-semibold">{enumLabel(target.targetType)}</span>
            {target.targetId && <span className="ml-1 font-mono text-muted-foreground">#{target.targetId.slice(-8)}</span>}{' '}
            — the target is attached read-only.
          </span>
        </div>
      )}

      {/* Activity */}
      <section aria-label="Activity details">
        <h3 className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold">
          <Store size={14} className="text-primary" /> Activity
        </h3>
        <div className="grid gap-x-4 gap-y-3.5 rounded-xl border bg-card p-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Activity status</Label>
            <RadioGroup value={form.activityStatus} onValueChange={(v) => setField('activityStatus', v as 'NEW' | 'EXISTING')} className="flex gap-2">
              {ACTIVITY_STATUS_OPTIONS.map((o) => (
                <label
                  key={o.value}
                  className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-xs has-[button[data-state=checked]]:border-primary"
                >
                  <RadioGroupItem value={o.value} /> {o.label}
                </label>
              ))}
            </RadioGroup>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="w-name">Activity name *</Label>
            <Input
              id="w-name"
              className="rounded-xl"
              value={form.activityName}
              onChange={(e) => setField('activityName', e.target.value)}
              placeholder="e.g. Saeed Textiles Trading"
              maxLength={160}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="w-desc">Activity description</Label>
            <Textarea
              id="w-desc"
              className="min-h-16 rounded-xl"
              value={form.activityDescription}
              onChange={(e) => setField('activityDescription', e.target.value)}
              placeholder="What does the business do?"
              maxLength={2000}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="w-start">Start date</Label>
            <Input
              id="w-start"
              type="date"
              className="rounded-xl"
              value={form.activityStartDate}
              onChange={(e) => setField('activityStartDate', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="w-city">City *</Label>
            <Input
              id="w-city"
              className="rounded-xl"
              value={form.activityCity}
              onChange={(e) => setField('activityCity', e.target.value)}
              placeholder="Sana'a"
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="w-district">District</Label>
            <Input
              id="w-district"
              className="rounded-xl"
              value={form.activityDistrict}
              onChange={(e) => setField('activityDistrict', e.target.value)}
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="w-address">Address</Label>
            <Input
              id="w-address"
              className="rounded-xl"
              value={form.activityAddress}
              onChange={(e) => setField('activityAddress', e.target.value)}
              placeholder="Street, shop no."
              maxLength={255}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Location type</Label>
            <Select value={form.activityLocationType} onValueChange={(v) => setField('activityLocationType', v)}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCATION_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Activity category</Label>
            <Select value={form.activityCategory} onValueChange={(v) => setField('activityCategory', v)}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIVITY_CATEGORY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {form.activityCategory === 'OTHER' && (
            <div className="space-y-1.5">
              <Label htmlFor="w-cat-other">Category (other) *</Label>
              <Input
                id="w-cat-other"
                className="rounded-xl"
                value={form.activityCategoryOther}
                onChange={(e) => setField('activityCategoryOther', e.target.value)}
                placeholder="Describe the activity type"
                maxLength={160}
              />
            </div>
          )}
        </div>
      </section>

      {/* Underwriting inputs */}
      <section aria-label="Underwriting inputs">
        <h3 className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold">
          <CircleDollarSign size={14} className="text-primary" /> Underwriting inputs
        </h3>
        <div className="grid gap-x-4 gap-y-3.5 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="w-capital">Capital ({currency})</Label>
            <Input
              id="w-capital"
              type="number"
              min="0"
              className="rounded-xl"
              value={form.capitalAmount}
              onChange={(e) => setField('capitalAmount', e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="w-own">Own contribution ({currency})</Label>
            <Input
              id="w-own"
              type="number"
              min="0"
              className="rounded-xl"
              value={form.ownContributionAmount}
              onChange={(e) => setField('ownContributionAmount', e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="w-capacity">Monthly capacity ({currency})</Label>
            <Input
              id="w-capacity"
              type="number"
              min="0"
              className="rounded-xl"
              value={form.monthlyInstallmentCapacity}
              onChange={(e) => setField('monthlyInstallmentCapacity', e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="w-prev">Previous financing</Label>
            <div className="flex h-9 items-center gap-2 rounded-xl border bg-card px-3">
              <Switch id="w-prev" checked={form.previousFinancing} onCheckedChange={(v) => setField('previousFinancing', v)} />
              <span className="text-xs text-muted-foreground">{form.previousFinancing ? 'Yes, before' : 'No'}</span>
            </div>
          </div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
            <Label htmlFor="w-income">Other income sources</Label>
            <Input
              id="w-income"
              className="rounded-xl"
              value={form.otherIncomeSources}
              onChange={(e) => setField('otherIncomeSources', e.target.value)}
              placeholder="e.g. family farm income"
              maxLength={500}
            />
          </div>
        </div>
      </section>

      {/* The ask */}
      <section aria-label="The ask">
        <h3 className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold">
          <CircleDollarSign size={14} className="text-primary" /> The ask
        </h3>
        <div className="grid gap-x-4 gap-y-3.5 rounded-xl border bg-card p-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="w-amount">Amount requested ({currency}) *</Label>
            <Input
              id="w-amount"
              type="number"
              min={bounds.min ?? undefined}
              max={bounds.max ?? undefined}
              className={cn('rounded-xl', amountInvalid && 'border-destructive focus-visible:ring-destructive')}
              value={form.amountRequested}
              onChange={(e) => setField('amountRequested', e.target.value)}
              placeholder={bounds.min !== null ? String(bounds.min) : '0'}
              aria-invalid={amountInvalid}
            />
            {(bounds.min !== null || bounds.max !== null) && (
              <p className={cn('text-[11px]', amountInvalid ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
                {multi ? 'Every selected service accepts' : 'This service accepts'} {formatMoney(bounds.min, currency)} –{' '}
                {formatMoney(bounds.max, currency)}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="w-tenor">Tenor requested (months)</Label>
            <Input
              id="w-tenor"
              type="number"
              min="1"
              max="360"
              className="rounded-xl"
              value={form.tenorRequestedMonths}
              onChange={(e) => setField('tenorRequestedMonths', e.target.value)}
              placeholder={bounds.tenorMin ? String(bounds.tenorMin) : '1'}
            />
            {(bounds.tenorMin !== null || bounds.tenorMax !== null) && (
              <p className="text-[11px] text-muted-foreground">
                Typical tenor {bounds.tenorMin ?? '—'}–{bounds.tenorMax ?? '—'} months
              </p>
            )}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="w-purpose">Purpose</Label>
            <Textarea
              id="w-purpose"
              className="min-h-14 rounded-xl"
              value={form.purpose}
              onChange={(e) => setField('purpose', e.target.value)}
              placeholder="What will the financing be used for?"
              maxLength={2000}
            />
          </div>
        </div>
      </section>

      {/* Guarantee */}
      <section aria-label="Guarantee">
        <h3 className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold">
          <ShieldCheck size={14} className="text-primary" /> Guarantee
        </h3>
        <div className="grid gap-x-4 gap-y-3.5 rounded-xl border bg-card p-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Guarantee type</Label>
            <Select value={form.guaranteeType} onValueChange={(v) => setField('guaranteeType', v)}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GUARANTEE_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {form.guaranteeType === 'OTHER' && (
            <div className="space-y-1.5">
              <Label htmlFor="w-g-other">Type (other) *</Label>
              <Input
                id="w-g-other"
                className="rounded-xl"
                value={form.guaranteeTypeOther}
                onChange={(e) => setField('guaranteeTypeOther', e.target.value)}
                maxLength={160}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Guarantee status</Label>
            <Select value={form.guaranteeStatus} onValueChange={(v) => setField('guaranteeStatus', v)}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GUARANTEE_STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {form.guaranteeStatus === 'OTHER' && (
            <div className="space-y-1.5">
              <Label htmlFor="w-gs-other">Status (other) *</Label>
              <Input
                id="w-gs-other"
                className="rounded-xl"
                value={form.guaranteeStatusOther}
                onChange={(e) => setField('guaranteeStatusOther', e.target.value)}
                maxLength={160}
              />
            </div>
          )}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="w-notes">Notes to the financier</Label>
            <Textarea
              id="w-notes"
              className="min-h-14 rounded-xl"
              value={form.applicantNotes}
              onChange={(e) => setField('applicantNotes', e.target.value)}
              placeholder="Anything the financier should know"
              maxLength={2000}
            />
          </div>
        </div>
      </section>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Step "checklist" — THE CHECKLIST (per-kind supply forms) + attachments + review
// ═══════════════════════════════════════════════════════════════════════════

function ChecklistReviewStep({
  services,
  isAccreditation,
  requirements,
  answers,
  onAnswer,
  attachments,
  onAttachmentsChange,
  form,
  onFormChange,
  applyAs,
  currency,
  fileInputRef,
  missingCount,
}: {
  services: PublicServiceDTO[]
  isAccreditation: boolean
  requirements: FinServiceRequirement[] | null
  answers: Record<string, ChecklistAnswer>
  onAnswer: (templateId: string, answer: ChecklistAnswer) => void
  attachments: WizardAttachment[]
  onAttachmentsChange: (next: WizardAttachment[]) => void
  form: ActivityForm
  onFormChange: <K extends keyof ActivityForm>(key: K, v: ActivityForm[K]) => void
  applyAs: string
  currency: string
  fileInputRef: React.RefObject<HTMLInputElement | null>
  missingCount: number
}) {
  const [uploading, setUploading] = useState(false)
  const [newAttachmentKind, setNewAttachmentKind] = useState('OTHER')
  const { data: vault, refetch: refetchVault } = useVault()

  const requiredTotal = (requirements ?? []).filter((r) => r.isRequired).length

  const handleAttachmentFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const asset = await uploadFinancingImage(file)
        if (!asset) continue
        const res = await apiRequest<{ document: VaultDocumentDTO }>('/api/financing/documents', {
          method: 'POST',
          body: JSON.stringify({
            mediaId: asset.id,
            documentType: ATTACHMENT_KIND_TO_DOC_TYPE[newAttachmentKind] ?? 'OTHER',
            title: file.name,
          }),
        })
        if (!res.ok || !res.data) {
          toast({ title: 'Could not file the document', description: res.error, variant: 'destructive' })
          continue
        }
        onAttachmentsChange([
          ...attachments,
          {
            id: asset.id,
            documentId: res.data.document.id,
            kind: newAttachmentKind,
            title: file.name,
            documentType: res.data.document.documentType,
          },
        ])
      }
      void refetchVault()
    } catch (err) {
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Unexpected error',
        variant: 'destructive',
      })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-5 px-5 py-5 sm:px-6">
      {/* gate explainer */}
      <p className="flex items-start gap-2 rounded-xl bg-primary/[0.06] px-3.5 py-2.5 text-xs leading-relaxed">
        <ShieldCheck size={14} className="mt-0.5 shrink-0 text-primary" aria-hidden />
        The platform verification gate checks every item below before your request is forwarded to{' '}
        {services.map((s) => s.financier.name).join(', ')} — answer what is required now; anything missing can also be
        supplied later from your requests page.
      </p>

      {isAccreditation && (
        <section aria-label="Accreditation scope">
          <h3 className="mb-2.5 text-sm font-semibold">Scope notes</h3>
          <div className="rounded-xl border bg-card p-4">
            <Textarea
              className="min-h-16 rounded-xl"
              value={form.purpose}
              onChange={(e) => onFormChange('purpose', e.target.value)}
              placeholder="What does your organization supply or do? (scope notes for the financier)"
              maxLength={500}
              aria-label="Scope notes"
            />
          </div>
        </section>
      )}

      {/* THE CHECKLIST */}
      <section aria-label="Requirements checklist">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <ClipboardCheck size={14} className="text-primary" /> Requirements checklist
            <span className="rounded-full bg-muted px-2 py-px text-[10px] font-bold text-muted-foreground">
              {requiredTotal} required
            </span>
          </h3>
          {missingCount > 0 && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
              <AlertTriangle size={12} aria-hidden /> {missingCount} required unanswered
            </span>
          )}
        </div>

        {requirements === null ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : requirements.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-6 text-center text-xs text-muted-foreground">
            This service has no composed requirements — the platform will review your profile and documents directly.
          </p>
        ) : (
          <div className="space-y-2">
            {requirements.map((r) => {
              const t = r.template
              if (!t) return null
              return (
                <ChecklistItemForm
                  key={r.id}
                  requirement={r}
                  answer={answers[t.id]}
                  onAnswer={onAnswer}
                  vault={vault ?? []}
                  onVaultUploaded={() => void refetchVault()}
                />
              )
            })}
          </div>
        )}
      </section>

      {/* attachments zone */}
      <section aria-label="Additional attachments">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <FileUp size={14} className="text-primary" /> Additional attachments
            <span className="text-[11px] font-normal text-muted-foreground">optional</span>
          </h3>
          <Select value={newAttachmentKind} onValueChange={setNewAttachmentKind}>
            <SelectTrigger className="h-8 w-44 rounded-lg text-xs" aria-label="Attachment kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ATTACHMENT_KIND_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => void handleAttachmentFiles(e.target.files)}
          aria-label="Upload attachment files"
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center transition-colors hover:border-primary/50 hover:bg-primary/[0.03] disabled:opacity-60"
        >
          {uploading ? (
            <Loader2 size={20} className="animate-spin text-primary" />
          ) : (
            <FileUp size={20} className="text-muted-foreground/60" />
          )}
          <span className="text-xs font-semibold">
            {uploading ? 'Uploading…' : 'Upload guarantee docs, studies or project files'}
          </span>
          <span className="text-[11px] text-muted-foreground">
            Images up to 8 MB — filed into your vault once, reused everywhere
          </span>
        </button>
        {attachments.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {attachments.map((a) => (
              <li key={a.id} className="flex items-center gap-2.5 rounded-xl border bg-card px-3.5 py-2.5 text-xs">
                <BadgeCheck size={14} className="shrink-0 text-primary" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{a.title}</span>
                  <span className="text-muted-foreground">
                    {ATTACHMENT_KIND_OPTIONS.find((o) => o.value === a.kind)?.label ?? a.kind} ·{' '}
                    {documentTypeLabel(a.documentType)}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => onAttachmentsChange(attachments.filter((x) => x.id !== a.id))}
                  aria-label={`Remove ${a.title}`}
                >
                  <Trash2 size={13} />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* review summary */}
      <section aria-label="Review">
        <h3 className="mb-2.5 text-sm font-semibold">Review</h3>
        <Card>
          <CardContent className="space-y-3 p-4 text-sm">
            <ReviewRow label="Service" value={services.map((s) => `${s.name} — ${s.financier.name}`).join(' · ')} />
            {!isAccreditation && (
              <>
                <ReviewRow label="Amount requested" value={formatMoney(Number(form.amountRequested) || 0, currency)} />
                <ReviewRow label="Activity" value={[form.activityName, form.activityCity].filter(Boolean).join(' · ')} />
                <ReviewRow label="Tenor" value={form.tenorRequestedMonths ? `${form.tenorRequestedMonths} months` : '—'} />
                <ReviewRow label="Guarantee" value={enumLabel(form.guaranteeType)} />
              </>
            )}
            {isAccreditation && <ReviewRow label="Applying as" value={applyAs === 'individual' ? '—' : 'Organization'} />}
            <ReviewRow
              label="Checklist answers"
              value={`${Object.keys(answers).length} of ${(requirements ?? []).length} items answered${
                missingCount > 0 ? ` — ${missingCount} required missing` : ''
              }`}
            />
            <ReviewRow label="Attachments" value={String(attachments.length)} />
            {missingCount > 0 && (
              <Progress
                value={(Object.keys(answers).length / Math.max(1, (requirements ?? []).length)) * 100}
                className="h-1.5"
              />
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b pb-2.5 last:border-0 last:pb-0">
      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right text-sm">{value}</span>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// One checklist item — the supply form rendered per condition kind
// ═══════════════════════════════════════════════════════════════════════════

function ChecklistItemForm({
  requirement,
  answer,
  onAnswer,
  vault,
  onVaultUploaded,
}: {
  requirement: FinServiceRequirement
  answer: ChecklistAnswer | undefined
  onAnswer: (templateId: string, answer: ChecklistAnswer) => void
  vault: VaultDocumentDTO[]
  onVaultUploaded: () => void
}) {
  const t = requirement.template!
  const kind = t.conditionType
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // vault documents usable for a DOCUMENT condition: matching type + active
  const usableDocs = vault.filter((d) => d.isActive && (!t.documentType || d.documentType === t.documentType))
  const expired = (d: VaultDocumentDTO) => {
    if (d.expiresAt && new Date(d.expiresAt).getTime() < Date.now()) return true
    if (!d.issuedAt || !t.validityMonths) return false
    return Date.now() - new Date(d.issuedAt).getTime() > t.validityMonths * 31 * 86_400_000
  }

  const uploadNew = async (file: File) => {
    setUploading(true)
    try {
      const asset = await uploadFinancingImage(file)
      if (!asset) return
      const res = await apiRequest<{ document: VaultDocumentDTO }>('/api/financing/documents', {
        method: 'POST',
        body: JSON.stringify({
          mediaId: asset.id,
          documentType: t.documentType ?? 'OTHER',
          title: file.name,
        }),
      })
      if (!res.ok || !res.data) {
        toast({ title: 'Could not file the document', description: res.error, variant: 'destructive' })
        return
      }
      onAnswer(t.id, { accountDocumentId: res.data.document.id })
      onVaultUploaded()
      toast({ title: 'Document filed', description: 'It enters the vault as PENDING and is attached to this item.' })
    } catch (err) {
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Unexpected error',
        variant: 'destructive',
      })
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className={cn('rounded-xl border bg-card p-3.5', requirement.isRequired ? '' : 'border-dashed')}>
      <div className="flex flex-wrap items-start gap-2">
        <ConditionTypeBadge type={kind} />
        <span className="min-w-0 flex-1 text-sm font-medium">{t.title}</span>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-px text-[10px] font-bold uppercase tracking-wide',
            requirement.isRequired ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
          )}
        >
          {requirement.isRequired ? 'Required' : 'Optional'}
        </span>
      </div>
      {t.description && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t.description}</p>}
      {requirement.instructions && (
        <p className="mt-1 rounded-lg bg-muted/60 px-2.5 py-1.5 text-[11px] leading-relaxed">
          {requirement.instructions}
        </p>
      )}

      <div className="mt-2.5">
        {kind === 'PROFILE_FIELD' && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <BadgeCheck size={13} className="text-primary" aria-hidden />
            Checked automatically against your profile{t.profileFieldKey ? ` (${t.profileFieldKey})` : ''} when you submit.
          </p>
        )}

        {kind === 'DECLARATION' && (
          <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed">
            <Checkbox
              checked={answer?.valueText === 'ACCEPTED'}
              onCheckedChange={(v) => onAnswer(t.id, v === true ? { valueText: 'ACCEPTED' } : {})}
              aria-label={t.title}
            />
            <span>I confirm this declaration.</span>
          </label>
        )}

        {kind === 'TEXT' && (
          <Textarea
            className="min-h-14 rounded-xl text-sm"
            value={answer?.valueText ?? ''}
            onChange={(e) => onAnswer(t.id, { valueText: e.target.value })}
            placeholder="Your answer"
            maxLength={500}
            aria-label={t.title}
          />
        )}

        {kind === 'NUMBER' && (
          <Input
            type="number"
            className="rounded-xl sm:max-w-56"
            min={t.validationMin ?? undefined}
            max={t.validationMax ?? undefined}
            value={answer?.valueNumber ?? ''}
            onChange={(e) => onAnswer(t.id, e.target.value === '' ? {} : { valueNumber: Number(e.target.value) })}
            placeholder={
              t.validationMin !== null || t.validationMax !== null ? `${t.validationMin ?? '—'} – ${t.validationMax ?? '—'}` : 'Number'
            }
            aria-label={t.title}
          />
        )}

        {kind === 'DATE' && (
          <Input
            type="date"
            className="rounded-xl sm:max-w-56"
            value={answer?.valueDate?.slice(0, 10) ?? ''}
            onChange={(e) => onAnswer(t.id, e.target.value ? { valueDate: e.target.value } : {})}
            aria-label={t.title}
          />
        )}

        {kind === 'SELECT' && (
          <RadioGroup
            value={answer?.valueText ?? ''}
            onValueChange={(v) => onAnswer(t.id, { valueText: v })}
            className="mt-1 grid gap-1.5 sm:grid-cols-2"
          >
            {t.options.map((o) => (
              <label
                key={o.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs has-[button[data-state=checked]]:border-primary"
              >
                <RadioGroupItem value={o.value} /> {o.value}
              </label>
            ))}
          </RadioGroup>
        )}

        {kind === 'MULTI_SELECT' && (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {t.options.map((o) => {
              const parts = (answer?.valueText ?? '').split(';').filter(Boolean)
              const checked = parts.includes(o.value)
              return (
                <label
                  key={o.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs has-[button[data-state=checked]]:border-primary"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => {
                      const next = v === true ? [...parts, o.value] : parts.filter((p) => p !== o.value)
                      onAnswer(t.id, next.length === 0 ? {} : { valueText: next.join(';') })
                    }}
                    aria-label={o.value}
                  />
                  {o.value}
                </label>
              )
            })}
          </div>
        )}

        {kind === 'DOCUMENT' && (
          <div className="space-y-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void uploadNew(f)
              }}
              aria-label={`Upload ${t.title}`}
            />
            {usableDocs.length > 0 ? (
              <div className="space-y-1.5">
                {usableDocs.map((d) => {
                  const selectedDoc = answer?.accountDocumentId === d.id
                  const stale = expired(d)
                  return (
                    <label
                      key={d.id}
                      className={cn(
                        'flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-xs transition-colors',
                        selectedDoc ? 'border-primary bg-primary/[0.06]' : 'hover:border-primary/40',
                        stale && 'opacity-60'
                      )}
                    >
                      <input
                        type="radio"
                        name={`doc-${requirement.id}`}
                        className="accent-primary"
                        checked={selectedDoc}
                        onChange={() => onAnswer(t.id, { accountDocumentId: d.id })}
                        disabled={stale}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{d.title ?? d.media.originalName}</span>
                        <span className="text-muted-foreground">
                          {documentTypeLabel(d.documentType)}
                          {d.issuedAt ? ` · issued ${d.issuedAt.slice(0, 10)}` : ''}
                          {stale ? ' · too old for this condition' : ''}
                        </span>
                      </span>
                      <StatusBadge status={d.status} map={DOCUMENT_STATUS_MAP} />
                    </label>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No {t.documentType ? documentTypeLabel(t.documentType).toLowerCase() : ''} document in your vault yet —
                upload one now.
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-lg text-xs"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? <Loader2 size={12} className="mr-1 animate-spin" /> : <FileUp size={12} className="mr-1" />}
              Upload new
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Small data hooks local to the wizard surfaces
// ═══════════════════════════════════════════════════════════════════════════

function useProfile() {
  const [data, setData] = useState<ApplicantProfileDTO | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await apiRequest<{ profile: ApplicantProfileDTO }>('/api/financing/profile')
      if (!cancelled) {
        if (res.ok && res.data) setData(res.data.profile)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])
  return { data, loading }
}

function useMyOrgs() {
  const [data, setData] = useState<Pick<OrganizationDTO, 'id' | 'name' | 'myRole' | 'memberCount'>[] | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await apiRequest<{
        organizations: Pick<OrganizationDTO, 'id' | 'name' | 'myRole' | 'memberCount'>[]
      }>('/api/organizations')
      if (!cancelled) {
        if (res.ok && res.data) setData(res.data.organizations)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])
  return { data, loading }
}

function useVault() {
  const [data, setData] = useState<VaultDocumentDTO[] | null>(null)
  const [loading, setLoading] = useState(true)
  const refetch = useCallback(async () => {
    const res = await apiRequest<{ documents: VaultDocumentDTO[] }>('/api/financing/documents')
    if (res.ok && res.data) setData(res.data.documents)
    setLoading(false)
  }, [])
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await apiRequest<{ documents: VaultDocumentDTO[] }>('/api/financing/documents')
      if (cancelled) return
      if (res.ok && res.data) setData(res.data.documents)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])
  return { data, loading, refetch }
}
