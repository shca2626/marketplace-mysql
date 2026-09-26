'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FINANCING · 3-STEP APPLICATION WIZARD (W-WIZ-1/2/3 — the core FIN-6 surface).
// Step 1: profile + vault review (read-only by reference, R-2) + what's missing
// Step 2: activity + underwriting + THE ASK + guarantee + THE REQUIREMENTS
//         CHECKLIST (typed per condition kind) + multi-financier selection
// Step 3: review + consent → POST create+submit → the platform gate (not the
//         financier — R-4).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  ChevronLeft,
  FileCheck2,
  Loader2,
  MapPin,
  Send,
  ShieldCheck,
  Sparkles,
  User as UserIcon,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import type {
  AccountDocumentDTO,
  ApplicantProfileDTO,
  FinancierServiceDTO,
  OrganizationDTO,
  PublicServiceDetailDTO,
  ServiceRequirementDTO,
  SessionUser,
} from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  ACTIVITY_CATEGORY_LABELS,
  ACTIVITY_STATUS_LABELS,
  apiRequest,
  ConditionTypeBadge,
  DOC_STATUS_MAP,
  DOCUMENT_TYPE_LABELS,
  EmptyState,
  FINANCING_CATEGORY_LABELS,
  formatMoney,
  GUARANTEE_STATUS_LABELS,
  GUARANTEE_TYPE_LABELS,
  LabeledValue,
  LOCATION_TYPE_LABELS,
  PROFILE_FIELD_LABELS,
  RATE_TYPE_LABELS,
  readProfileField,
  ScopeBadge,
  StatusBadge,
  toastApiError,
} from '@/components/marketplace/financing/financing-shared'
import { UploadDocDialog, VaultDocPicker } from '@/components/marketplace/financing/documents-section'

// ── Wizard answer model (typed per condition kind; keyed by template id so a
//    shared template answers every sibling's checklist in multi mode) ─────────

interface AnswerDraft {
  valueText?: string
  valueNumber?: number
  valueDate?: string
  accountDocumentId?: string
  confirmed?: boolean
  multi?: string[]
}

function answerIsSet(a: AnswerDraft | undefined, kind: string): boolean {
  if (!a) return false
  switch (kind) {
    case 'DOCUMENT':
      return !!a.accountDocumentId
    case 'DECLARATION':
      return !!a.confirmed
    case 'TEXT':
      return !!a.valueText?.trim()
    case 'NUMBER':
      return a.valueNumber != null && !Number.isNaN(a.valueNumber)
    case 'DATE':
      return !!a.valueDate
    case 'SELECT':
      return !!a.valueText
    case 'MULTI_SELECT':
      return (a.multi ?? []).length > 0
    default:
      return false
  }
}

// ── Wizard ───────────────────────────────────────────────────────────────────

export function FinancingWizard({
  serviceId,
  me,
  onExit,
  onSubmitted,
}: {
  serviceId: string
  me: { user: SessionUser; applicant: ApplicantProfileDTO | null }
  onExit: () => void
  onSubmitted: (firstRequestId: string) => void
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [submitBusy, setSubmitBusy] = useState(false)

  // service + candidates + selected siblings
  const { data: serviceData, loading: serviceLoading, error: serviceError } = useApi<{
    service: PublicServiceDetailDTO
  }>(`/api/financing/services/${serviceId}`)
  const service = serviceData?.service

  const { data: orgsData } = useApi<{ organizations: OrganizationDTO[] }>('/api/organizations')
  const orgs = orgsData?.organizations ?? []

  const { data: siblingsData } = useApi<{ services: FinancierServiceDTO[] }>(
    service ? `/api/financing/services?kind=FINANCING&category=${service.category}&limit=60` : null
  )
  const siblingCandidates = useMemo(
    () => (siblingsData?.services ?? []).filter((s) => s.id !== service?.id),
    [siblingsData, service]
  )
  const [selectedSiblingIds, setSelectedSiblingIds] = useState<string[]>([])
  const [siblingDetails, setSiblingDetails] = useState<Record<string, PublicServiceDetailDTO>>({})

  // load each newly selected sibling's typed requirements
  useEffect(() => {
    for (const id of selectedSiblingIds) {
      if (siblingDetails[id]) continue
      void apiRequest<{ service: PublicServiceDetailDTO }>(`/api/financing/services/${id}`).then((res) => {
        if (res.ok && res.data) setSiblingDetails((prev) => ({ ...prev, [id]: res.data!.service }))
      })
    }
  }, [selectedSiblingIds, siblingDetails])

  // company context + vault
  const [orgId, setOrgId] = useState('')
  const [docsVersion, setDocsVersion] = useState(0)
  const personalVault = useApi<{ documents: AccountDocumentDTO[] }>('/api/documents')
  const orgVault = useApi<{ documents: AccountDocumentDTO[] }>(
    orgId ? `/api/documents?organizationId=${orgId}` : null
  )
  useEffect(() => {
    if (docsVersion > 0) {
      void personalVault.refetch()
      if (orgId) void orgVault.refetch()
    }
  }, [docsVersion, personalVault, orgVault, orgId])
  const vaultDocs = useMemo(() => {
    const map = new Map<string, AccountDocumentDTO>()
    for (const d of personalVault.data?.documents ?? []) map.set(d.id, d)
    for (const d of orgVault.data?.documents ?? []) map.set(d.id, d)
    return [...map.values()].filter((d) => d.isActive)
  }, [personalVault.data, orgVault.data])

  const activeOrg = orgs.find((o) => o.id === orgId) ?? null

  // ── form state (wizard step 2 — the 22-control activity form) ──
  const [activityStatus, setActivityStatus] = useState('')
  const [activityCategory, setActivityCategory] = useState('')
  const [activityCategoryOther, setActivityCategoryOther] = useState('')
  const [activityName, setActivityName] = useState('')
  const [activityDescription, setActivityDescription] = useState('')
  const [activityStartDate, setActivityStartDate] = useState('')
  const [activityAddress, setActivityAddress] = useState('')
  const [activityCity, setActivityCity] = useState('')
  const [activityDistrict, setActivityDistrict] = useState('')
  const [activityLocationType, setActivityLocationType] = useState('')
  const [capitalAmount, setCapitalAmount] = useState('')
  const [ownContribution, setOwnContribution] = useState('')
  const [installmentCapacity, setInstallmentCapacity] = useState('')
  const [previousFinancing, setPreviousFinancing] = useState('')
  const [otherIncome, setOtherIncome] = useState('')
  const [amountRequested, setAmountRequested] = useState('')
  const [purpose, setPurpose] = useState('')
  const [tenorMonths, setTenorMonths] = useState('')
  const [guaranteeType, setGuaranteeType] = useState('')
  const [guaranteeTypeOther, setGuaranteeTypeOther] = useState('')
  const [guaranteeStatus, setGuaranteeStatus] = useState('')
  const [guaranteeStatusOther, setGuaranteeStatusOther] = useState('')
  const [applicantNotes, setApplicantNotes] = useState('')
  const [consent, setConsent] = useState(false)
  const [answers, setAnswers] = useState<Record<string, AnswerDraft>>({})

  const setAnswer = (templateId: string, patch: AnswerDraft) =>
    setAnswers((prev) => ({ ...prev, [templateId]: { ...prev[templateId], ...patch } }))

  // ── derived ──
  // (null-safe: `service` is undefined while loading — the leading entry must
  // not crash the memos below before the serviceLoading guard renders)
  const selectedServices = useMemo(
    () =>
      [service, ...selectedSiblingIds.map((id) => siblingDetails[id])].filter(
        (s): s is PublicServiceDetailDTO => !!s,
      ),
    [service, selectedSiblingIds, siblingDetails]
  )

  /** Union of requirements across selected services, keyed by template id (shared
   *  templates collapse into ONE answer — applyAnswers matches by templateId). */
  const unionRequirements = useMemo(() => {
    const map = new Map<string, { req: ServiceRequirementDTO; services: string[] }>()
    for (const svc of selectedServices) {
      for (const req of svc.requirements ?? []) {
        if (!req.isActive) continue
        const key = req.conditionTemplateId
        const existing = map.get(key)
        if (existing) existing.services.push(svc.name)
        else map.set(key, { req, services: [svc.name] })
      }
    }
    return [...map.values()].sort((a, b) => a.req.displayOrder - b.req.displayOrder)
  }, [selectedServices])

  const amountNum = Number(amountRequested.replace(/[, ]/g, ''))
  const amountValid =
    !!amountRequested &&
    Number.isFinite(amountNum) &&
    amountNum > 0 &&
    (!service?.amountMin || amountNum >= service.amountMin) &&
    (!service?.amountMax || amountNum <= service.amountMax)
  const tenorNum = Number(tenorMonths)
  const tenorValid =
    !!tenorMonths &&
    Number.isFinite(tenorNum) &&
    tenorNum >= 1 &&
    (!service?.tenorMinMonths || tenorNum >= service.tenorMinMonths) &&
    (!service?.tenorMaxMonths || tenorNum <= service.tenorMaxMonths)
  const cityCovered =
    !service?.coverage?.length || !activityCity.trim()
      ? true
      : service.coverage.some((c) => c.regionName.toLowerCase() === activityCity.trim().toLowerCase())

  const missingRequiredAnswers = unionRequirements.filter(
    ({ req }) =>
      req.isRequired &&
      req.template.conditionType !== 'PROFILE_FIELD' &&
      !answerIsSet(answers[req.conditionTemplateId], req.template.conditionType)
  )

  // step 1 missing profile evidence
  const missingProfile = useMemo(() => {
    if (!service) return []
    const out: string[] = []
    for (const req of service.requirements ?? []) {
      if (req.template.conditionType === 'PROFILE_FIELD') {
        const value = readProfileField(req.template.profileFieldKey ?? '', me.applicant, activeOrg)
        if (!value) out.push(req.template.title)
      }
    }
    return out
  }, [service, me.applicant, activeOrg])

  const missingDocs = useMemo(() => {
    if (!service) return []
    const out: string[] = []
    for (const req of service.requirements ?? []) {
      if (req.template.conditionType !== 'DOCUMENT' || !req.isRequired) continue
      const type = req.template.documentType
      const has = vaultDocs.some((d) => d.documentType === type && d.status !== 'REJECTED')
      if (!has) out.push(req.template.title)
    }
    return out
  }, [service, vaultDocs])

  const [uploadFor, setUploadFor] = useState<ServiceRequirementDTO | null>(null)

  // ── guards ──
  if (serviceLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-11 w-11 rounded-xl" onClick={onExit}>
            <ChevronLeft size={18} />
          </Button>
          <Skeleton className="h-8 w-64 rounded-xl" />
        </div>
        <Skeleton className="h-10 rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-96 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </div>
    )
  }
  if (serviceError || !service) {
    return (
      <EmptyState icon={AlertTriangle} title="Service unavailable" description={serviceError ?? 'This service is not accepting applications.'}>
        <Button variant="outline" className="rounded-xl" onClick={onExit}>
          <ArrowLeft size={14} className="mr-1.5" /> Back to services
        </Button>
      </EmptyState>
    )
  }

  // ── submit ──
  const submitApplication = async () => {
    setSubmitBusy(true)
    const payload: Record<string, unknown> = {
      organizationId: orgId || null,
      activityStatus: activityStatus || null,
      activityName: activityName || null,
      activityDescription: activityDescription || null,
      activityStartDate: activityStartDate || null,
      activityCity: activityCity || null,
      activityDistrict: activityDistrict || null,
      activityAddress: activityAddress || null,
      activityLocationType: activityLocationType || null,
      activityCategory: activityCategory || null,
      activityCategoryOther: activityCategory === 'OTHER' ? activityCategoryOther || null : null,
      capitalAmount: capitalAmount ? Number(capitalAmount) : null,
      ownContributionAmount: ownContribution ? Number(ownContribution) : null,
      monthlyInstallmentCapacity: installmentCapacity ? Number(installmentCapacity) : null,
      previousFinancing: previousFinancing === '' ? null : previousFinancing === 'yes',
      otherIncomeSources: otherIncome || null,
      amountRequested: amountNum,
      currency: service.currency,
      purpose: purpose || null,
      tenorRequestedMonths: tenorMonths ? tenorNum : null,
      guaranteeType: guaranteeType || null,
      guaranteeTypeOther: guaranteeType === 'OTHER' ? guaranteeTypeOther || null : null,
      guaranteeStatus: guaranteeStatus || null,
      guaranteeStatusOther: guaranteeStatus === 'OTHER' ? guaranteeStatusOther || null : null,
      applicantNotes: applicantNotes || null,
      submit: true,
      consent: true,
    }
    if (selectedSiblingIds.length > 0) {
      payload.serviceIds = [service.id, ...selectedSiblingIds]
    } else {
      payload.serviceId = service.id
    }
    payload.answers = unionRequirements
      .filter(({ req }) => req.template.conditionType !== 'PROFILE_FIELD')
      .map(({ req }) => {
        const a = answers[req.conditionTemplateId]
        const kind = req.template.conditionType
        if (kind === 'MULTI_SELECT') return { conditionTemplateId: req.conditionTemplateId, valueText: (a?.multi ?? []).join(', ') }
        if (kind === 'DECLARATION') return { conditionTemplateId: req.conditionTemplateId, confirmed: !!a?.confirmed }
        if (kind === 'NUMBER') return { conditionTemplateId: req.conditionTemplateId, valueNumber: a?.valueNumber ?? null }
        if (kind === 'DATE') return { conditionTemplateId: req.conditionTemplateId, valueDate: a?.valueDate ?? null }
        if (kind === 'DOCUMENT') return { conditionTemplateId: req.conditionTemplateId, accountDocumentId: a?.accountDocumentId ?? null }
        return { conditionTemplateId: req.conditionTemplateId, valueText: a?.valueText ?? null }
      })

    const res = await apiRequest<{ requests: { id: string; number: string }[]; submitted: unknown[] }>(
      '/api/financing/requests',
      { method: 'POST', body: JSON.stringify(payload) }
    )
    setSubmitBusy(false)
    if (!res.ok || !res.data) return toastApiError(res.error, 'Could not submit the application')
    const created = res.data.requests ?? []
    toast({
      title: `Application ${created.length > 1 ? `${created.length} sibling requests` : 'request'} submitted`,
      description: `${created.map((r) => r.number).join(', ')} entered the platform verification gate. Financiers only see it after the gate forwards it.`,
    })
    onSubmitted(created[0].id)
  }

  // ── validation gates per step ──
  const step1Valid = consent // the data-transfer consent checkbox is the only hard gate
  const step2Valid =
    amountValid &&
    missingRequiredAnswers.length === 0 &&
    (!guaranteeType || guaranteeType !== 'OTHER' || guaranteeTypeOther.trim().length > 0) &&
    (!guaranteeStatus || guaranteeStatus !== 'OTHER' || guaranteeStatusOther.trim().length > 0)

  const stepTitles = [
    { n: 1, label: 'Profile & consent' },
    { n: 2, label: 'Activity & checklist' },
    { n: 3, label: 'Review & submit' },
  ]

  return (
    <div className="space-y-4">
      {/* header + steps */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" className="h-11 w-11 rounded-xl" onClick={onExit} aria-label="Leave the wizard">
            <ChevronLeft size={18} />
          </Button>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold">Apply for financing</h2>
            <p className="truncate text-xs text-muted-foreground">
              {service.financierOrgName} · {service.name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {stepTitles.map((s) => (
            <span
              key={s.n}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold',
                step === s.n
                  ? 'bg-primary text-primary-foreground'
                  : step > s.n
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-muted text-muted-foreground'
              )}
            >
              {step > s.n ? '✓' : s.n} {s.label}
            </span>
          ))}
        </div>
      </div>

      {/* service terms recap */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card px-4 py-3 text-xs">
        <Badge className="rounded-full border-0 bg-primary/15 text-primary font-semibold">
          {FINANCING_CATEGORY_LABELS[service.category] ?? service.category}
        </Badge>
        {(service.amountMin != null || service.amountMax != null) && (
          <span className="font-semibold">{formatMoney(service.amountMin, service.currency)} – {formatMoney(service.amountMax, service.currency)}</span>
        )}
        {service.rateMax != null && (
          <span className="rounded-full bg-muted px-2 py-0.5 font-medium">
            ≤ {service.rateMax}% {service.rateType ? RATE_TYPE_LABELS[service.rateType] ?? service.rateType : ''}
          </span>
        )}
        {service.tenorMinMonths != null && (
          <span className="rounded-full bg-muted px-2 py-0.5 font-medium">
            {service.tenorMinMonths}–{service.tenorMaxMonths ?? '∞'} months
          </span>
        )}
        {service.shariaCompliant && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">Sharia-compliant</span>
        )}
        {service.coverage.length > 0 && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <MapPin size={11} /> {service.coverage.map((c) => c.regionName).join(' · ')}
          </span>
        )}
      </div>

      {/* ── STEP 1 — profile & vault review ── */}
      {step === 1 && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-4 p-4 sm:p-6">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-bold">
                  <UserIcon size={15} className="text-primary" /> Your profile
                </h3>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground">
                  Read-only — referenced, never copied
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <LabeledValue label="Name">{me.user.name}</LabeledValue>
                <LabeledValue label="Email">{me.user.email}</LabeledValue>
                <LabeledValue label="Phone">{me.applicant?.phone ?? '—'}</LabeledValue>
                <LabeledValue label="WhatsApp">{me.applicant?.whatsappNumber ?? '—'}</LabeledValue>
                <LabeledValue label="Date of birth">
                  {me.applicant?.dateOfBirth ? new Date(me.applicant.dateOfBirth).toLocaleDateString() : '—'}
                </LabeledValue>
                <LabeledValue label="Nationality">{me.applicant?.nationality ?? '—'}</LabeledValue>
                <LabeledValue label="Identity">
                  {me.applicant?.identityNumber ? `${me.applicant.identityNumber}${me.applicant.identityType ? ` (${me.applicant.identityType.replaceAll('_', ' ').toLowerCase()})` : ''}` : '—'}
                </LabeledValue>
                <LabeledValue label="Residence">
                  {me.applicant?.residenceCity
                    ? [me.applicant.residenceStreet, me.applicant.residenceDistrict, me.applicant.residenceCity].filter(Boolean).join(', ')
                    : '—'}
                </LabeledValue>
              </div>
              {orgs.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-1.5">
                    <Label htmlFor="wiz-org">Applying as</Label>
                    <Select value={orgId} onValueChange={setOrgId}>
                      <SelectTrigger id="wiz-org" className="w-full">
                        <SelectValue placeholder="Myself (individual)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="individual">Myself (individual)</SelectItem>
                        {orgs.map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            <span className="inline-flex items-center gap-1.5">
                              <Building2 size={12} /> {o.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {activeOrg && (
                      <p className="text-[11px] text-muted-foreground">
                        Company facts: tax ID {activeOrg.taxId ?? '—'} · registration {activeOrg.registrationNumber ?? '—'} · industry{' '}
                        {activeOrg.industry ?? '—'}
                      </p>
                    )}
                  </div>
                </>
              )}

              {(missingProfile.length > 0 || missingDocs.length > 0) && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/50">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300">
                    <AlertTriangle size={13} /> What&apos;s missing vs this service&apos;s requirements
                  </p>
                  <ul className="mt-1.5 space-y-0.5 text-xs text-amber-800/90 dark:text-amber-300/90">
                    {missingProfile.map((t) => (
                      <li key={t}>• {t} — fill your profile fields first</li>
                    ))}
                    {missingDocs.map((t) => (
                      <li key={t}>• {t} — no matching vault document yet</li>
                    ))}
                  </ul>
                </div>
              )}
              {missingProfile.length === 0 && missingDocs.length === 0 && (
                <p className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                  <BadgeCheck size={14} /> Your profile and vault already cover this service&apos;s profile + document expectations.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4 sm:p-6">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-bold">
                  <FileCheck2 size={15} className="text-primary" /> Document vault
                </h3>
                <span className="text-[11px] text-muted-foreground">{vaultDocs.length} document{vaultDocs.length === 1 ? '' : 's'}</span>
              </div>
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {vaultDocs.length === 0 ? (
                  <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                    Your vault is empty — upload an ID or bank statement once and reuse it everywhere.
                  </p>
                ) : (
                  vaultDocs.map((d) => (
                    <div key={d.id} className="flex items-center gap-2.5 rounded-xl border px-3 py-2 text-xs">
                      <span className="min-w-0 flex-1 truncate font-semibold">
                        {DOCUMENT_TYPE_LABELS[d.documentType] ?? d.documentType}
                        {d.title ? ` — ${d.title}` : ''}
                      </span>
                      <StatusBadge status={d.status} map={DOC_STATUS_MAP} />
                    </div>
                  ))
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Verified documents pre-satisfy checklist items — upload once, reuse for every application.
              </p>
            </CardContent>
          </Card>

          <div className="lg:col-span-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border bg-card p-4 text-sm">
              <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
              <span>
                I approve the transfer of my personal data and vault documents to{' '}
                <span className="font-semibold">{service.financierOrgName}</span> for reviewing this application, and to
                platform verification before any forwarding. Stamped at submit.
              </span>
            </label>
          </div>

          <div className="lg:col-span-2 flex justify-end">
            <Button className="min-h-11 rounded-xl" disabled={!step1Valid} onClick={() => setStep(2)}>
              Continue <ArrowRight size={15} className="ml-1.5" />
            </Button>
          </div>
        </motion.div>
      )}

      {/* ── STEP 2 — activity + ask + checklist ── */}
      {step === 2 && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          {/* left — activity + ask */}
          <Card>
            <CardContent className="space-y-5 p-4 sm:p-6">
              <h3 className="text-sm font-bold">Activity & underwriting</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Activity status</Label>
                  <Select value={activityStatus} onValueChange={setActivityStatus}>
                    <SelectTrigger className="h-11 w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(ACTIVITY_STATUS_LABELS).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Activity type</Label>
                  <Select value={activityCategory} onValueChange={setActivityCategory}>
                    <SelectTrigger className="h-11 w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {Object.entries(ACTIVITY_CATEGORY_LABELS).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {activityCategory === 'OTHER' && (
                  <div className="col-span-2 space-y-1.5">
                    <Label htmlFor="wiz-act-other">Activity type — other</Label>
                    <Input id="wiz-act-other" className="h-11" value={activityCategoryOther} onChange={(e) => setActivityCategoryOther(e.target.value)} placeholder="Describe your activity type" />
                  </div>
                )}
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="wiz-act-name">Activity name</Label>
                  <Input id="wiz-act-name" className="h-11" value={activityName} onChange={(e) => setActivityName(e.target.value)} placeholder='e.g. "Grocery store"' />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="wiz-act-desc">Activity description</Label>
                  <Textarea id="wiz-act-desc" rows={3} value={activityDescription} onChange={(e) => setActivityDescription(e.target.value)} placeholder="What the business does, customers, products…" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wiz-act-start">Start date</Label>
                  <Input id="wiz-act-start" type="date" className="h-11" value={activityStartDate} onChange={(e) => setActivityStartDate(e.target.value)} />
                  <p className="text-[10.5px] text-muted-foreground">Leave empty if not started</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Location type</Label>
                  <Select value={activityLocationType} onValueChange={setActivityLocationType}>
                    <SelectTrigger className="h-11 w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(LOCATION_TYPE_LABELS).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wiz-city">City (governorate)</Label>
                  <Input id="wiz-city" className="h-11" value={activityCity} onChange={(e) => setActivityCity(e.target.value)} placeholder="e.g. Sana'a" />
                  {!cityCovered && (
                    <p className="flex items-center gap-1 text-[10.5px] font-medium text-amber-700 dark:text-amber-400">
                      <AlertTriangle size={11} /> Outside this service&apos;s coverage ({service.coverage.map((c) => c.regionName).join(', ')})
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wiz-district">District</Label>
                  <Input id="wiz-district" className="h-11" value={activityDistrict} onChange={(e) => setActivityDistrict(e.target.value)} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="wiz-address">Street address</Label>
                  <Input id="wiz-address" className="h-11" value={activityAddress} onChange={(e) => setActivityAddress(e.target.value)} />
                </div>

                <Separator className="col-span-2" />
                <h3 className="col-span-2 text-sm font-bold">Underwriting</h3>
                <div className="space-y-1.5">
                  <Label htmlFor="wiz-capital">Capital ({service.currency})</Label>
                  <Input id="wiz-capital" type="number" min={0} className="h-11" value={capitalAmount} onChange={(e) => setCapitalAmount(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wiz-own">Own contribution</Label>
                  <Input id="wiz-own" type="number" min={0} className="h-11" value={ownContribution} onChange={(e) => setOwnContribution(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wiz-capacity">Installment capacity / month</Label>
                  <Input id="wiz-capacity" type="number" min={0} className="h-11" value={installmentCapacity} onChange={(e) => setInstallmentCapacity(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Previous financing?</Label>
                  <Select value={previousFinancing} onValueChange={setPreviousFinancing}>
                    <SelectTrigger className="h-11 w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no">No</SelectItem>
                      <SelectItem value="yes">Yes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="wiz-income">Other income sources</Label>
                  <Input id="wiz-income" className="h-11" value={otherIncome} onChange={(e) => setOtherIncome(e.target.value)} placeholder="e.g. remittances, salary, rent" />
                </div>

                <Separator className="col-span-2" />
                <h3 className="col-span-2 text-sm font-bold">The ask</h3>
                <div className="space-y-1.5">
                  <Label htmlFor="wiz-amount">Amount ({service.currency})</Label>
                  <Input
                    id="wiz-amount"
                    type="number"
                    min={0}
                    className={cn('h-11', amountRequested && !amountValid && 'border-destructive focus-visible:ring-destructive')}
                    value={amountRequested}
                    onChange={(e) => setAmountRequested(e.target.value)}
                  />
                  <p className={cn('text-[10.5px]', amountRequested && !amountValid ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
                    Service range: {formatMoney(service.amountMin, service.currency)} – {formatMoney(service.amountMax, service.currency)}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wiz-tenor">Tenor (months)</Label>
                  <Input
                    id="wiz-tenor"
                    type="number"
                    min={1}
                    className={cn('h-11', tenorMonths && !tenorValid && 'border-destructive focus-visible:ring-destructive')}
                    value={tenorMonths}
                    onChange={(e) => setTenorMonths(e.target.value)}
                  />
                  <p className="text-[10.5px] text-muted-foreground">
                    {service.tenorMinMonths ?? 1}–{service.tenorMaxMonths ?? '∞'} months
                  </p>
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="wiz-purpose">Purpose</Label>
                  <Textarea id="wiz-purpose" rows={2} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="What the financing will be used for" />
                </div>

                <Separator className="col-span-2" />
                <h3 className="col-span-2 text-sm font-bold">Guarantee</h3>
                <div className="space-y-1.5">
                  <Label>Guarantee type</Label>
                  <Select value={guaranteeType} onValueChange={setGuaranteeType}>
                    <SelectTrigger className="h-11 w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {Object.entries(GUARANTEE_TYPE_LABELS).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {guaranteeType === 'OTHER' && (
                    <Input className="mt-1.5 h-11" value={guaranteeTypeOther} onChange={(e) => setGuaranteeTypeOther(e.target.value)} placeholder="Describe the guarantee" />
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Guarantee status</Label>
                  <Select value={guaranteeStatus} onValueChange={setGuaranteeStatus}>
                    <SelectTrigger className="h-11 w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(GUARANTEE_STATUS_LABELS).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {guaranteeStatus === 'OTHER' && (
                    <Input className="mt-1.5 h-11" value={guaranteeStatusOther} onChange={(e) => setGuaranteeStatusOther(e.target.value)} placeholder="Describe the status" />
                  )}
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="wiz-notes">Notes (optional)</Label>
                  <Textarea id="wiz-notes" rows={2} value={applicantNotes} onChange={(e) => setApplicantNotes(e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* right — requirements checklist + multi-financier */}
          <div className="space-y-4">
            <Card>
              <CardContent className="space-y-3 p-4 sm:p-6">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold">Requirements checklist</h3>
                  <span className="text-[11px] text-muted-foreground">
                    {unionRequirements.length} item{unionRequirements.length === 1 ? '' : 's'} ·{' '}
                    {unionRequirements.filter((u) => u.req.isRequired).length} required
                  </span>
                </div>
                {missingRequiredAnswers.length > 0 && (
                  <p className="flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                    <AlertTriangle size={13} /> {missingRequiredAnswers.length} required item
                    {missingRequiredAnswers.length === 1 ? '' : 's'} still need{missingRequiredAnswers.length === 1 ? 's' : ''} an answer
                  </p>
                )}
                <div className="max-h-[560px] space-y-3 overflow-y-auto pr-1">
                  {unionRequirements.map(({ req, services: from }) => (
                    <ChecklistRow
                      key={req.conditionTemplateId}
                      req={req}
                      from={from}
                      answer={answers[req.conditionTemplateId]}
                      setAnswer={(patch) => setAnswer(req.conditionTemplateId, patch)}
                      vaultDocs={vaultDocs}
                      applicant={me.applicant}
                      org={activeOrg}
                      onUpload={() => setUploadFor(req)}
                    />
                  ))}
                  {unionRequirements.length === 0 && (
                    <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                      This service has no composed requirements — your profile and documents are enough.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3 p-4 sm:p-6">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-bold">
                    <Sparkles size={15} className="text-primary" /> Apply to multiple financiers
                  </h3>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground">optional</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Sibling requests share one group — each financier keeps its own checklist and offers stay comparable
                  side-by-side.
                </p>
                <div className="space-y-2">
                  {siblingCandidates.length === 0 && (
                    <p className="rounded-lg border border-dashed px-3 py-3 text-center text-xs text-muted-foreground">
                      No other financier currently offers a {FINANCING_CATEGORY_LABELS[service.category]?.toLowerCase() ?? service.category} service.
                    </p>
                  )}
                  {siblingCandidates.map((s) => {
                    const checked = selectedSiblingIds.includes(s.id)
                    return (
                      <label
                        key={s.id}
                        className={cn(
                          'flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-xs transition-colors',
                          checked ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'hover:bg-muted/60'
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) =>
                            setSelectedSiblingIds((prev) => (v ? [...prev, s.id] : prev.filter((id) => id !== s.id)))
                          }
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-bold">{s.name}</span>
                          <span className="block truncate text-muted-foreground">
                            {s.financierOrgName} · {formatMoney(s.amountMin, s.currency)}–{formatMoney(s.amountMax, s.currency)}
                          </span>
                        </span>
                        {siblingDetails[s.id] ? (
                          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            {siblingDetails[s.id].requirements?.length ?? 0} req
                          </span>
                        ) : checked ? (
                          <Loader2 size={13} className="animate-spin text-muted-foreground" />
                        ) : null}
                      </label>
                    )
                  })}
                </div>
                {selectedSiblingIds.length > 0 && (
                  <p className="rounded-xl bg-primary/5 px-3 py-2 text-[11px] font-medium text-foreground/80">
                    {selectedSiblingIds.length + 1} sibling requests will be created — one per financier.
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="flex items-center justify-between gap-3">
              <Button variant="outline" className="min-h-11 rounded-xl" onClick={() => setStep(1)}>
                <ArrowLeft size={14} className="mr-1.5" /> Back
              </Button>
              <Button className="min-h-11 rounded-xl" disabled={!step2Valid} onClick={() => setStep(3)}>
                Review <ArrowRight size={15} className="ml-1.5" />
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── STEP 3 — review & submit ── */}
      {step === 3 && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <Card>
            <CardContent className="space-y-4 p-4 sm:p-6">
              <h3 className="text-sm font-bold">Review your application</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <ReviewBlock title="Personal">
                  <ReviewRow label="Name" value={me.user.name} />
                  <ReviewRow label="Phone" value={me.applicant?.phone ?? '—'} />
                  <ReviewRow label="Identity" value={me.applicant?.identityNumber ?? '—'} />
                  <ReviewRow label="Applying as" value={activeOrg ? activeOrg.name : 'Individual'} />
                </ReviewBlock>
                <ReviewBlock title="Activity">
                  <ReviewRow label="Status" value={ACTIVITY_STATUS_LABELS[activityStatus] ?? '—'} />
                  <ReviewRow label="Name" value={activityName || '—'} />
                  <ReviewRow label="City" value={activityCity || '—'} />
                  <ReviewRow label="Location" value={LOCATION_TYPE_LABELS[activityLocationType] ?? '—'} />
                  <ReviewRow label="Capital" value={capitalAmount ? formatMoney(Number(capitalAmount), service.currency) : '—'} />
                  <ReviewRow label="Capacity / mo" value={installmentCapacity ? formatMoney(Number(installmentCapacity), service.currency) : '—'} />
                </ReviewBlock>
                <ReviewBlock title="The ask & guarantee">
                  <ReviewRow label="Amount" value={formatMoney(amountNum, service.currency)} />
                  <ReviewRow label="Tenor" value={tenorMonths ? `${tenorMonths} months` : '—'} />
                  <ReviewRow label="Purpose" value={purpose || '—'} />
                  <ReviewRow label="Guarantee" value={GUARANTEE_TYPE_LABELS[guaranteeType] ?? '—'} />
                  <ReviewRow label="Guarantee status" value={GUARANTEE_STATUS_LABELS[guaranteeStatus] ?? '—'} />
                </ReviewBlock>
              </div>

              <Separator />

              <div>
                <h4 className="text-sm font-bold">Checklist answers</h4>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {unionRequirements.map(({ req }) => {
                    const kind = req.template.conditionType
                    const a = answers[req.conditionTemplateId]
                    let display = '—'
                    if (kind === 'PROFILE_FIELD') {
                      display = 'Auto-evaluated at submit'
                    } else if (kind === 'DOCUMENT') {
                      const doc = vaultDocs.find((d) => d.id === a?.accountDocumentId)
                      display = doc ? `${DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType}${doc.title ? ` — ${doc.title}` : ''}` : '—'
                    } else if (kind === 'DECLARATION') {
                      display = a?.confirmed ? 'Confirmed' : '—'
                    } else if (kind === 'MULTI_SELECT') {
                      display = (a?.multi ?? []).join(', ') || '—'
                    } else if (kind === 'NUMBER') {
                      display = a?.valueNumber != null ? String(a.valueNumber) : '—'
                    } else if (kind === 'DATE') {
                      display = a?.valueDate || '—'
                    } else {
                      display = a?.valueText || '—'
                    }
                    return (
                      <div key={req.conditionTemplateId} className="flex items-start justify-between gap-3 rounded-xl border px-3 py-2 text-xs">
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{req.template.title}</span>
                          <span className="block truncate text-muted-foreground">{display}</span>
                        </span>
                        {req.isRequired && <span className="shrink-0 font-bold text-primary">✱</span>}
                      </div>
                    )
                  })}
                </div>
              </div>

              {selectedSiblingIds.length > 0 && (
                <p className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5 text-xs font-medium">
                  Multi-financier: {selectedSiblingIds.length + 1} sibling requests will be created —{' '}
                  {[service.name, ...selectedSiblingIds.map((id) => siblingDetails[id]?.name).filter(Boolean)].join(' · ')}.
                </p>
              )}

              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm">
                <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
                <span>
                  I confirm the information and documents provided are true and complete, and I agree to the platform
                  terms and privacy policy. Submitting sends this application to the <span className="font-semibold">platform
                  verification gate</span> — financiers receive it only after verification passes.
                </span>
              </label>

              <div className="flex items-center justify-between gap-3">
                <Button variant="outline" className="min-h-11 rounded-xl" onClick={() => setStep(2)}>
                  <ArrowLeft size={14} className="mr-1.5" /> Back
                </Button>
                <Button className="min-h-11 rounded-xl" disabled={!consent || submitBusy} onClick={submitApplication}>
                  {submitBusy ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : <Send size={15} className="mr-1.5" />}
                  Submit application
                </Button>
              </div>
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <ShieldCheck size={12} className="text-primary" />
                The platform verifies every item before anything reaches {service.financierOrgName}.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <UploadDocDialog
        open={!!uploadFor}
        onOpenChange={(open) => !open && setUploadFor(null)}
        defaultType={uploadFor?.template.documentType ?? undefined}
        lockType
        organizationId={orgId || null}
        onUploaded={() => setDocsVersion((v) => v + 1)}
      />
    </div>
  )
}

// ── Checklist row (typed per condition kind — the heart of step 2) ───────────

function ChecklistRow({
  req,
  from,
  answer,
  setAnswer,
  vaultDocs,
  applicant,
  org,
  onUpload,
}: {
  req: ServiceRequirementDTO
  from: string[]
  answer: AnswerDraft | undefined
  setAnswer: (patch: AnswerDraft) => void
  vaultDocs: AccountDocumentDTO[]
  applicant: ApplicantProfileDTO | null
  org: OrganizationDTO | null
  onUpload: () => void
}) {
  const t = req.template
  const kind = t.conditionType
  const satisfied = answerIsSet(answer, kind)

  return (
    <div className={cn('rounded-xl border p-3.5', satisfied ? 'border-emerald-300/70 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/20' : 'bg-card')}>
      <div className="flex flex-wrap items-center gap-2">
        <ConditionTypeBadge type={kind} />
        <ScopeBadge scope={t.scope} />
        {req.isRequired && <span className="text-[11px] font-bold text-primary" title="Required">✱ required</span>}
        {req.autoPassAccredited && (
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-800 dark:bg-violet-950 dark:text-violet-300">
            auto-pass w/ accreditation
          </span>
        )}
        {from.length > 1 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground" title={from.join(' · ')}>
            {from.length} financiers
          </span>
        )}
        {satisfied && <CheckCircle2 size={14} className="ml-auto shrink-0 text-emerald-600" />}
      </div>
      <p className="mt-1.5 text-sm font-semibold">{t.title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{req.instructions ?? t.description ?? ''}</p>

      <div className="mt-2.5">
        {kind === 'PROFILE_FIELD' && <ProfileFieldNotice req={req} applicant={applicant} org={org} />}
        {kind === 'DOCUMENT' && (
          <VaultDocPicker
            docs={vaultDocs}
            selectedId={answer?.accountDocumentId ?? null}
            onSelect={(id) => setAnswer({ accountDocumentId: id ?? undefined })}
            onUpload={onUpload}
            documentType={t.documentType}
          />
        )}
        {kind === 'DECLARATION' && (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border bg-background px-3 py-2.5 text-xs">
            <Checkbox checked={!!answer?.confirmed} onCheckedChange={(v) => setAnswer({ confirmed: v === true })} />
            <span>{t.description ?? 'I confirm this declaration.'}</span>
          </label>
        )}
        {kind === 'TEXT' && (
          <Textarea
            rows={2}
            className="text-xs"
            value={answer?.valueText ?? ''}
            onChange={(e) => setAnswer({ valueText: e.target.value })}
            placeholder="Your answer (max 500 characters)"
          />
        )}
        {kind === 'NUMBER' && (
          <div className="space-y-1">
            <Input
              type="number"
              className="h-10"
              value={answer?.valueNumber ?? ''}
              onChange={(e) => setAnswer({ valueNumber: e.target.value === '' ? undefined : Number(e.target.value) })}
              placeholder={t.validationMin != null ? `between ${t.validationMin} and ${t.validationMax ?? '∞'}` : 'Number'}
            />
            {(t.validationMin != null || t.validationMax != null) && (
              <p className="text-[10.5px] text-muted-foreground">
                Bounds: {t.validationMin ?? '−∞'} … {t.validationMax ?? '∞'}
              </p>
            )}
          </div>
        )}
        {kind === 'DATE' && (
          <Input
            type="date"
            className="h-10"
            value={answer?.valueDate ?? ''}
            onChange={(e) => setAnswer({ valueDate: e.target.value })}
          />
        )}
        {kind === 'SELECT' && (
          <Select value={answer?.valueText ?? ''} onValueChange={(v) => setAnswer({ valueText: v })}>
            <SelectTrigger className="h-10 w-full text-xs">
              <SelectValue placeholder="Choose…" />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {t.options.map((o) => (
                <SelectItem key={o.id} value={o.value}>
                  {o.value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {kind === 'MULTI_SELECT' && (
          <div className="grid gap-1.5 rounded-lg border bg-background px-3 py-2.5 sm:grid-cols-2">
            {t.options.map((o) => {
              const checked = (answer?.multi ?? []).includes(o.value)
              return (
                <label key={o.id} className="flex cursor-pointer items-center gap-2 text-xs">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) =>
                      setAnswer({
                        multi: v
                          ? [...(answer?.multi ?? []), o.value]
                          : (answer?.multi ?? []).filter((x) => x !== o.value),
                      })
                    }
                  />
                  {o.value}
                </label>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function ProfileFieldNotice({
  req,
  applicant,
  org,
}: {
  req: ServiceRequirementDTO
  applicant: ApplicantProfileDTO | null
  org: OrganizationDTO | null
}) {
  const value = readProfileField(req.template.profileFieldKey ?? '', applicant, org)
  const label = PROFILE_FIELD_LABELS[req.template.profileFieldKey ?? ''] ?? req.template.profileFieldKey
  return (
    <p
      className={cn(
        'flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium',
        value
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
          : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
      )}
    >
      {value ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
      {label}: {value ? `${value} — auto-verified at submit` : 'missing — fill your profile first (auto-evaluated from your account)'}
    </p>
  )
}

// ── Review atoms ──────────────────────────────────────────────────────────────

function ReviewBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-muted/20 p-4">
      <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</h4>
      <div className="mt-2 space-y-1.5">{children}</div>
    </div>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-semibold" title={value}>
        {value}
      </span>
    </div>
  )
}
