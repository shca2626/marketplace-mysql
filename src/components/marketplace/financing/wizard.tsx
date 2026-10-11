'use client'

// ─────────────────────────────────────────────────────────────────────────────
// THE 3-STEP APPLICATION WIZARD (FIN-6 centerpiece — plan §5 flow 5)
//
//   Step 1 — Profile & consent   : read-only applicant profile + org summary +
//                                  document-vault quick strip + consent checkbox
//                                  (consentAt is stamped by the server on submit)
//   Step 2 — Ask & checklist     : the typed activity form (FINANCIER_SCHEMA §1.5)
//                                  + per-service requirements checklist
//   Step 3 — Review & submit     : grouped review, checklist completeness gate,
//                                  then the create → answer → submit sequence
//
// Submission sequence per service (FINANCING):
//   POST /api/financing/requests → DRAFT (checklist seeded server-side)
//   GET  /api/financing/requests/[id] → submissions (map serviceRequirementId)
//   PATCH …/submissions/[sid] × answered items
//   PATCH /api/financing/requests/[id] {action:'submit'}
// ACCREDITATION mirrors it via /api/accreditation/requests (single PATCH carries
// the answers — see route). Multi-financier mode loops POSTs over the picked
// services with a shared client-generated multiGroupId (DP-25 siblings).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  Check,
  ChevronLeft,
  FileCheck2,
  Loader2,
  Paperclip,
  Send,
  ShieldCheck,
  Wallet,
  X,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { apiRequest } from '@/components/marketplace/b2b/b2b-shared'
import {
  formatMoney,
  categoryLabel,
  collateralLabel,
} from '@/components/marketplace/financier/financing-status-badge'
import {
  missingRequired,
  RequirementChecklist,
  rowsFromRequirements,
  DocStatusBadge,
} from './checklist'
import type {
  AccountDocumentDTO,
  ApplicantProfileDTO,
  ChecklistAnswer,
  FinancingTargetPrefill,
  OrgLiteDTO,
  PublicServiceDetailDTO,
  SubmissionDTO,
  WizardAnswers,
} from './shared'

// ── Wizard form state (FINANCIER_SCHEMA §1.5 typed columns) ─────────────────

interface WizardForm {
  activityStatus: '' | 'NEW' | 'EXISTING'
  activityName: string
  activityDescription: string
  activityStartDate: string
  activityCity: string
  activityDistrict: string
  activityAddress: string
  activityLocationType: '' | 'OWNED' | 'RENTED'
  activityCategory: '' | 'INVESTMENT' | 'RURAL' | 'ENERGY' | 'HOUSING' | 'FISHERIES' | 'OTHER'
  activityCategoryOther: string
  capitalAmount: string
  ownContributionAmount: string
  monthlyInstallmentCapacity: string
  previousFinancing: '' | 'yes' | 'no'
  otherIncomeSources: string
  amountRequested: string
  tenorRequestedMonths: string
  purpose: string
  guaranteeType: string
  guaranteeTypeOther: string
  guaranteeStatus: string
  guaranteeStatusOther: string
  applicantNotes: string
  scopeNotes: string
}

const EMPTY_FORM: WizardForm = {
  activityStatus: '',
  activityName: '',
  activityDescription: '',
  activityStartDate: '',
  activityCity: '',
  activityDistrict: '',
  activityAddress: '',
  activityLocationType: '',
  activityCategory: '',
  activityCategoryOther: '',
  capitalAmount: '',
  ownContributionAmount: '',
  monthlyInstallmentCapacity: '',
  previousFinancing: '',
  otherIncomeSources: '',
  amountRequested: '',
  tenorRequestedMonths: '',
  purpose: '',
  guaranteeType: '',
  guaranteeTypeOther: '',
  guaranteeStatus: '',
  guaranteeStatusOther: '',
  applicantNotes: '',
  scopeNotes: '',
}

const ACTIVITY_CATEGORIES = ['INVESTMENT', 'RURAL', 'ENERGY', 'HOUSING', 'FISHERIES', 'OTHER'] as const
const GUARANTEE_TYPES = [
  'PERSONAL_GUARANTEE', 'BANK_GUARANTEE', 'GOLD', 'COMMERCIAL', 'MORTGAGE',
  'CONVERTIBLE_SECURITIES', 'SELF_GUARANTEE', 'OTHER',
] as const
const GUARANTEE_STATUSES = ['AVAILABLE', 'PARTIALLY_AVAILABLE', 'UNAVAILABLE', 'OTHER'] as const
const ATTACHMENT_KINDS = ['GUARANTEE_DOC', 'STUDY', 'PROJECT_FILE', 'OTHER'] as const

const num = (v: string): number | null => {
  if (!v.trim()) return null
  const n = Number(v.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {hint && <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>}
    </div>
  )
}

function ReviewRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (value == null || value === '') return null
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}

// ── The wizard ──────────────────────────────────────────────────────────────

export function ApplicationWizard({
  services,
  onClose,
  onSubmitted,
  onManageDocuments,
  initialTarget,
}: {
  services: PublicServiceDetailDTO[] // 1 (exclusive) or 2+ (multi-financier, same category)
  onClose: () => void
  onSubmitted: () => void
  onManageDocuments: () => void
  initialTarget?: FinancingTargetPrefill | null
}) {
  const user = useMarketplace((s) => s.user)
  const navigate = useMarketplace((s) => s.navigate)

  const isFinancing = services[0]?.serviceKind === 'FINANCING'
  const isMulti = services.length > 1
  const coverage = useMemo(
    () => [...new Set(services.flatMap((s) => s.coverage))].sort((a, b) => a.localeCompare(b)),
    [services]
  )
  // Strictest amount window across the picked services (server validates each)
  const [amountMin, amountMax] = useMemo(() => {
    const mins = services.map((s) => s.amountMin).filter((v): v is number => v != null)
    const maxs = services.map((s) => s.amountMax).filter((v): v is number => v != null)
    return [mins.length ? Math.max(...mins) : null, maxs.length ? Math.min(...maxs) : null]
  }, [services])

  const { data: meData, loading: meLoading } = useApi<{ profile: ApplicantProfileDTO | null }>(
    user ? '/api/auth/me' : null,
    { skip: !user }
  )
  const { data: orgsData } = useApi<{ organizations: OrgLiteDTO[] }>(user ? '/api/organizations' : null, {
    skip: !user,
  })
  const { data: docsData } = useApi<{ documents: AccountDocumentDTO[] }>(user ? '/api/documents' : null, {
    skip: !user,
  })

  const profile = meData?.profile ?? null
  const orgs = orgsData?.organizations ?? []
  const documents = docsData?.documents ?? []
  const verifiedDocs = documents.filter((d) => d.isActive && d.status === 'VERIFIED')

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [consent, setConsent] = useState(false)
  const [organizationId, setOrganizationId] = useState<string>('')
  const [form, setForm] = useState<WizardForm>(EMPTY_FORM)
  const [answers, setAnswers] = useState<WizardAnswers>({})
  const [attachments, setAttachments] = useState<{ id: string; kind: string }[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [target, setTarget] = useState<FinancingTargetPrefill | null>(initialTarget ?? null)

  const set = <K extends keyof WizardForm>(key: K, value: WizardForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const allRows = useMemo(() => services.flatMap((s) => rowsFromRequirements(s.requirements)), [services])
  const missing = useMemo(() => missingRequired(allRows, answers), [allRows, answers])
  const amount = num(form.amountRequested)
  const amountProblem =
    amount == null
      ? 'Enter the amount you are requesting'
      : amountMin != null && amount < amountMin
        ? `This program finances from ${formatMoney(amountMin, services[0]?.currency)}`
        : amountMax != null && amount > amountMax
          ? `This program finances up to ${formatMoney(amountMax, services[0]?.currency)}`
          : null

  const personalMissing = [
    !profile?.phone && 'Phone number',
    !profile?.identityNumber && 'Identity document',
    !profile?.residenceCity && 'Residence city',
  ].filter(Boolean) as string[]

  // ── Step gates ──
  const canStep2 = consent && (isFinancing || organizationId !== '')
  const canStep3 = isFinancing ? amountProblem === null && !!form.activityCity : true

  // ── Submit sequence ──
  const submit = async () => {
    if (submitting || missing.length > 0) return
    setSubmitting(true)
    const groupId = isMulti ? `mg-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`.slice(0, 32) : null
    const created: { number: string }[] = []
    const failures: string[] = []
    const orgId = organizationId || null

    const payloadBase = isFinancing
      ? {
          activityStatus: (form.activityStatus || null) as WizardForm['activityStatus'],
          activityName: form.activityName.trim() || null,
          activityDescription: form.activityDescription.trim() || null,
          activityStartDate: form.activityStartDate || null,
          activityCity: form.activityCity || null,
          activityDistrict: form.activityDistrict.trim() || null,
          activityAddress: form.activityAddress.trim() || null,
          activityLocationType: (form.activityLocationType || null) as WizardForm['activityLocationType'],
          activityCategory: (form.activityCategory || null) as WizardForm['activityCategory'],
          activityCategoryOther: form.activityCategoryOther.trim() || null,
          capitalAmount: num(form.capitalAmount),
          ownContributionAmount: num(form.ownContributionAmount),
          monthlyInstallmentCapacity: num(form.monthlyInstallmentCapacity),
          previousFinancing: form.previousFinancing === '' ? null : form.previousFinancing === 'yes',
          otherIncomeSources: form.otherIncomeSources.trim() || null,
          amountRequested: amount,
          currency: services[0]?.currency ?? 'YER',
          purpose: form.purpose.trim() || null,
          tenorRequestedMonths: num(form.tenorRequestedMonths) ?? null,
          guaranteeType: form.guaranteeType || null,
          guaranteeTypeOther: form.guaranteeTypeOther.trim() || null,
          guaranteeStatus: form.guaranteeStatus || null,
          guaranteeStatusOther: form.guaranteeStatusOther.trim() || null,
          applicantNotes: form.applicantNotes.trim() || null,
          attachments: attachments.map((a) => ({ accountDocumentId: a.id, kind: a.kind })),
        }
      : {
          scopeNotes: form.scopeNotes.trim() || null,
          attachments: attachments.map((a) => ({ accountDocumentId: a.id, kind: a.kind })),
        }

    for (const service of services) {
      try {
        // 1) create (DRAFT — checklist seeded server-side)
        const createUrl = isFinancing ? '/api/financing/requests' : '/api/accreditation/requests'
        const createRes = await apiRequest<{ request: { id: string; number: string } }>(createUrl, {
          method: 'POST',
          body: JSON.stringify({
            serviceId: service.id,
            organizationId: orgId,
            ...(isFinancing ? { targetType: target?.targetType ?? 'WORKING_CAPITAL', targetId: target?.targetId ?? null } : {}),
            multiGroupId: groupId,
            ...payloadBase,
          }),
        })
        if (!createRes.ok || !createRes.data) {
          failures.push(`${service.name}: ${createRes.error ?? 'could not create'}`)
          continue
        }
        const { id, number } = createRes.data.request

        // 2) fetch the seeded submissions (submission ids ↔ requirement ids)
        const detailUrl = isFinancing
          ? `/api/financing/requests/${id}`
          : `/api/accreditation/requests/${id}`
        const detailRes = await apiRequest<{ request: { submissions: SubmissionDTO[] } }>(detailUrl)
        if (!detailRes.ok || !detailRes.data) {
          failures.push(`${number}: ${detailRes.error ?? 'could not load checklist'}`)
          continue
        }
        const submissions = detailRes.data.request.submissions ?? []

        // 3) answer each checklist item (accreditation answers collect into
        //    `accreditationAnswers` and ride on the submit PATCH — its route
        //    accepts an answers array directly)
        const accreditationAnswers: { submissionId: string; answer: ChecklistAnswer }[] = []
        for (const s of submissions) {
          if (s.template.conditionType === 'PROFILE_FIELD') continue // auto-evaluated
          const answer = answers[s.serviceRequirementId]
          if (!answer) continue
          const clean: ChecklistAnswer = {}
          if (answer.valueText != null && answer.valueText !== '') clean.valueText = answer.valueText
          if (answer.valueNumber != null) clean.valueNumber = answer.valueNumber
          if (answer.valueDate) clean.valueDate = answer.valueDate
          if (answer.accountDocumentId) clean.accountDocumentId = answer.accountDocumentId
          if (Object.keys(clean).length === 0) continue
          if (isFinancing) {
            const res = await apiRequest(`/api/financing/requests/${id}/submissions/${s.id}`, {
              method: 'PATCH',
              body: JSON.stringify(clean),
            })
            if (!res.ok) failures.push(`${number}: ${res.error ?? 'an answer was rejected'}`)
          } else {
            accreditationAnswers.push({ submissionId: s.id, answer: clean })
          }
        }

        // 4) submit (accreditation carries the answers in one PATCH)
        const submitPayload = isFinancing
          ? { action: 'submit' }
          : { action: 'submit', answers: accreditationAnswers }
        const submitRes = await apiRequest<{ status: string }>(
          isFinancing ? `/api/financing/requests/${id}` : `/api/accreditation/requests/${id}`,
          { method: 'PATCH', body: JSON.stringify(submitPayload) }
        )
        if (!submitRes.ok) {
          failures.push(`${number}: ${submitRes.error ?? 'could not submit'}`)
          continue
        }
        created.push({ number })
      } catch {
        failures.push(`${service.name}: unexpected error`)
      }
    }

    setSubmitting(false)
    if (created.length > 0) {
      toast({
        title: `Application ${created.length > 1 ? 's' : ''} submitted`,
        description: `${created.map((c) => c.number).join(', ')} — the platform will verify every requirement before forwarding it to the financier.`,
      })
      onClose()
      onSubmitted()
    } else {
      toast({
        title: 'Could not submit',
        description: failures[0] ?? 'Please review your answers and try again.',
        variant: 'destructive',
      })
    }
  }

  // ── Steps header ──
  const steps = [
    { n: 1, title: 'Profile & consent' },
    { n: 2, title: isFinancing ? 'Activity & ask' : 'Scope' },
    { n: 3, title: 'Review & submit' },
  ]

  return (
    <Dialog open onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent className="flex max-h-[94vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-5 py-4 sm:px-6">
          <DialogTitle className="flex flex-wrap items-center gap-2 text-lg">
            <Wallet size={18} className="text-primary" />
            {isMulti ? `Apply to ${services.length} financiers` : services[0]?.name}
            {isMulti && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                Sibling applications · one group
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="mt-1 text-xs">
            {services.map((s) => s.financier.name).join(' · ')}
            {target && (
              <>
                {' · '}
                <span className="font-medium text-primary">
                  Linked to {target.label}
                </span>
              </>
            )}
          </DialogDescription>
          {/* Stepper */}
          <ol className="mt-3 flex items-center gap-1.5" aria-label="Application progress">
            {steps.map((s, i) => (
              <li key={s.n} className="flex flex-1 items-center gap-1.5">
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                    step > s.n
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : step === s.n
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                  )}
                >
                  {step > s.n ? <Check size={12} /> : s.n}
                </span>
                <span
                  className={cn(
                    'hidden truncate text-[11px] font-semibold sm:block',
                    step === s.n ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {s.title}
                </span>
                {i < steps.length - 1 && <span className="h-px flex-1 bg-border" aria-hidden />}
              </li>
            ))}
          </ol>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="px-5 py-5 sm:px-6">
            {/* ══ STEP 1 — Profile & consent ══ */}
            {step === 1 && (
              <div className="space-y-5">
                {meLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-28 w-full rounded-xl" />
                    <Skeleton className="h-16 w-full rounded-xl" />
                  </div>
                ) : (
                  <>
                    <section className="rounded-xl border">
                      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2.5">
                        <p className="flex items-center gap-1.5 text-sm font-semibold">
                          <BadgeCheck size={15} className="text-primary" /> Applicant profile
                        </p>
                        <button
                          type="button"
                          className="text-xs font-semibold text-primary hover:underline"
                          onClick={() => navigate('account')}
                        >
                          Complete in account
                        </button>
                      </div>
                      <div className="grid gap-x-6 gap-y-1 p-4 sm:grid-cols-2">
                        <ReviewRow label="Name" value={user?.name} />
                        <ReviewRow label="Email" value={user?.email} />
                        <ReviewRow label="Phone" value={profile?.phone} />
                        <ReviewRow label="WhatsApp" value={profile?.whatsappNumber} />
                        <ReviewRow
                          label="Identity"
                          value={
                            profile?.identityNumber
                              ? `${profile.identityType?.replace(/_/g, ' ').toLowerCase() ?? 'ID'} ····${profile.identityNumber.slice(-4)}`
                              : null
                          }
                        />
                        <ReviewRow label="Nationality" value={profile?.nationality} />
                        <ReviewRow label="Date of birth" value={profile?.dateOfBirth?.slice(0, 10)} />
                        <ReviewRow
                          label="Residence"
                          value={[profile?.residenceDistrict, profile?.residenceCity, profile?.residenceType?.toLowerCase()]
                            .filter(Boolean)
                            .join(', ') || null}
                        />
                      </div>
                      {personalMissing.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 border-t px-4 py-2.5">
                          <AlertTriangle size={13} className="text-amber-600 dark:text-amber-400" />
                          <p className="text-xs text-muted-foreground">Missing profile data:</p>
                          {personalMissing.map((m) => (
                            <span
                              key={m}
                              className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
                            >
                              {m}
                            </span>
                          ))}
                        </div>
                      )}
                    </section>

                    <section className="rounded-xl border">
                      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2.5">
                        <p className="flex items-center gap-1.5 text-sm font-semibold">
                          <Building2 size={15} className="text-primary" /> Business (optional)
                        </p>
                        <span className="text-xs text-muted-foreground">
                          {isFinancing ? 'Individuals and companies can apply' : 'Companies only'}
                        </span>
                      </div>
                      <div className="space-y-2 p-4">
                        {orgs.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            You are not a member of an organization — you&apos;ll apply as an individual.
                          </p>
                        ) : (
                          <Select
                            value={organizationId || undefined}
                            onValueChange={setOrganizationId}
                            disabled={!isFinancing}
                          >
                            <SelectTrigger className="h-9 w-full rounded-xl text-sm" aria-label="Apply on behalf of">
                              <SelectValue placeholder={isFinancing ? 'Apply as individual (no organization)' : 'Select your organization'} />
                            </SelectTrigger>
                            <SelectContent>
                              {orgs.map((o) => (
                                <SelectItem key={o.id} value={o.id}>
                                  {o.name}
                                  {o.status !== 'ACTIVE' ? ` (${o.status.toLowerCase()})` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </section>

                    <section className="rounded-xl border">
                      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2.5">
                        <p className="flex items-center gap-1.5 text-sm font-semibold">
                          <FileCheck2 size={15} className="text-primary" /> Document vault
                        </p>
                        <button
                          type="button"
                          className="text-xs font-semibold text-primary hover:underline"
                          onClick={onManageDocuments}
                        >
                          Manage documents
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 p-4">
                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          {verifiedDocs.length} verified
                        </span>
                        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                          {documents.filter((d) => d.isActive && d.status === 'PENDING').length} pending review
                        </span>
                        <p className="w-full text-xs text-muted-foreground">
                          Verified documents satisfy matching checklist items automatically — upload once, reuse everywhere.
                        </p>
                      </div>
                    </section>

                    <label
                      className={cn(
                        'flex cursor-pointer items-start gap-3 rounded-xl border-2 px-4 py-3.5 text-sm transition-colors',
                        consent ? 'border-primary/50 bg-primary/5' : 'border-dashed hover:border-primary/40'
                      )}
                    >
                      <Checkbox checked={consent} onCheckedChange={(c) => setConsent(c === true)} className="mt-0.5" />
                      <span className="leading-relaxed">
                        <span className="font-semibold">Consent to verification &amp; data transfer.</span>{' '}
                        <span className="text-muted-foreground">
                          I authorize Vendora to verify this application against the service&apos;s requirements and to
                          forward the verified file to {services.map((s) => s.financier.name).join(' and ')}. The
                          financier&apos;s offer and any agreement are concluded directly between us — Vendora never
                          lends or holds funds.
                        </span>
                      </span>
                    </label>
                  </>
                )}
              </div>
            )}

            {/* ══ STEP 2 — Activity, amount & checklist ══ */}
            {step === 2 && (
              <div className="space-y-6">
                {isFinancing ? (
                  <>
                    <section>
                      <p className="mb-3 text-sm font-bold">Activity</p>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Activity status" required>
                          <Select value={form.activityStatus || undefined} onValueChange={(v) => set('activityStatus', v as WizardForm['activityStatus'])}>
                            <SelectTrigger className="h-9 rounded-xl" aria-label="Activity status">
                              <SelectValue placeholder="New or existing?" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="NEW">New activity</SelectItem>
                              <SelectItem value="EXISTING">Existing activity</SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label="Activity name">
                          <Input className="rounded-xl" value={form.activityName} onChange={(e) => set('activityName', e.target.value)} maxLength={160} placeholder="e.g. Acme Trading — retail" />
                        </Field>
                        <Field label="Activity category">
                          <Select value={form.activityCategory || undefined} onValueChange={(v) => set('activityCategory', v as WizardForm['activityCategory'])}>
                            <SelectTrigger className="h-9 rounded-xl" aria-label="Activity category">
                              <SelectValue placeholder="Pick a category" />
                            </SelectTrigger>
                            <SelectContent>
                              {ACTIVITY_CATEGORIES.map((c) => (
                                <SelectItem key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase().replace(/_/g, ' ')}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                        {form.activityCategory === 'OTHER' && (
                          <Field label="Specify category">
                            <Input className="rounded-xl" value={form.activityCategoryOther} onChange={(e) => set('activityCategoryOther', e.target.value)} maxLength={160} />
                          </Field>
                        )}
                        <Field label="Start date">
                          <Input type="date" className="rounded-xl" value={form.activityStartDate} onChange={(e) => set('activityStartDate', e.target.value)} />
                        </Field>
                        <Field label="City of activity" required hint={coverage.length > 0 ? `Covered regions: ${coverage.join(', ')}` : undefined}>
                          <Select value={form.activityCity || undefined} onValueChange={(v) => set('activityCity', v)}>
                            <SelectTrigger className="h-9 rounded-xl" aria-label="City of activity">
                              <SelectValue placeholder={coverage.length > 0 ? 'Pick a covered region' : 'Your city'} />
                            </SelectTrigger>
                            <SelectContent>
                              {(coverage.length > 0 ? coverage : ['Sana’a', 'Aden', 'Taiz', 'Al-Hudaydah', 'Ibb', 'Dhamar', 'Mukalla']).map((c) => (
                                <SelectItem key={c} value={c}>{c}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label="District">
                          <Input className="rounded-xl" value={form.activityDistrict} onChange={(e) => set('activityDistrict', e.target.value)} maxLength={120} />
                        </Field>
                        <Field label="Address">
                          <Input className="rounded-xl" value={form.activityAddress} onChange={(e) => set('activityAddress', e.target.value)} maxLength={255} />
                        </Field>
                        <Field label="Location type">
                          <Select value={form.activityLocationType || undefined} onValueChange={(v) => set('activityLocationType', v as WizardForm['activityLocationType'])}>
                            <SelectTrigger className="h-9 rounded-xl" aria-label="Location type">
                              <SelectValue placeholder="Owned or rented?" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="OWNED">Owned</SelectItem>
                              <SelectItem value="RENTED">Rented</SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>
                        <div className="sm:col-span-2">
                          <Field label="Activity description">
                            <Textarea className="min-h-20 rounded-xl" value={form.activityDescription} onChange={(e) => set('activityDescription', e.target.value)} maxLength={10000} placeholder="What the business does, customers, seasonality…" />
                          </Field>
                        </div>
                      </div>
                    </section>

                    <Separator />

                    <section>
                      <p className="mb-3 text-sm font-bold">Financing request</p>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field
                          label="Amount requested"
                          required
                          hint={
                            amountMin != null || amountMax != null
                              ? `Program range: ${formatMoney(amountMin ?? 0, services[0]?.currency)}${amountMax != null ? ` – ${formatMoney(amountMax, services[0]?.currency)}` : '+'}`
                              : undefined
                          }
                        >
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              inputMode="decimal"
                              className={cn('max-w-[200px] rounded-xl', amount != null && amountProblem ? 'border-destructive focus-visible:ring-destructive' : '')}
                              value={form.amountRequested}
                              onChange={(e) => set('amountRequested', e.target.value)}
                              placeholder="0"
                              aria-label="Amount requested"
                            />
                            <span className="rounded-lg bg-muted px-2 py-1 text-xs font-bold tabular-nums">
                              {services[0]?.currency}
                            </span>
                          </div>
                          {amount != null && amountProblem && (
                            <p className="text-[11px] font-medium text-destructive">{amountProblem}</p>
                          )}
                        </Field>
                        <Field label="Tenor (months)" hint={services[0]?.tenorMinMonths || services[0]?.tenorMaxMonths ? `Typical: ${services[0]?.tenorMinMonths ?? '?'}–${services[0]?.tenorMaxMonths ?? '?'} months` : undefined}>
                          <Input type="number" min={1} max={360} className="max-w-[200px] rounded-xl" value={form.tenorRequestedMonths} onChange={(e) => set('tenorRequestedMonths', e.target.value)} aria-label="Tenor in months" />
                        </Field>
                        <div className="sm:col-span-2">
                          <Field label="Purpose">
                            <Textarea className="min-h-20 rounded-xl" value={form.purpose} onChange={(e) => set('purpose', e.target.value)} maxLength={10000} placeholder="Working capital, equipment, inventory purchase…" />
                          </Field>
                        </div>
                      </div>
                    </section>

                    <Separator />

                    <section>
                      <p className="mb-3 text-sm font-bold">Financial profile</p>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Capital amount">
                          <Input type="number" inputMode="decimal" className="rounded-xl" value={form.capitalAmount} onChange={(e) => set('capitalAmount', e.target.value)} aria-label="Capital amount" />
                        </Field>
                        <Field label="Own contribution">
                          <Input type="number" inputMode="decimal" className="rounded-xl" value={form.ownContributionAmount} onChange={(e) => set('ownContributionAmount', e.target.value)} aria-label="Own contribution" />
                        </Field>
                        <Field label="Monthly installment capacity">
                          <Input type="number" inputMode="decimal" className="rounded-xl" value={form.monthlyInstallmentCapacity} onChange={(e) => set('monthlyInstallmentCapacity', e.target.value)} aria-label="Monthly installment capacity" />
                        </Field>
                        <Field label="Previous financing?">
                          <Select value={form.previousFinancing || undefined} onValueChange={(v) => set('previousFinancing', v as WizardForm['previousFinancing'])}>
                            <SelectTrigger className="h-9 rounded-xl" aria-label="Previous financing">
                              <SelectValue placeholder="—"/>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="no">No</SelectItem>
                              <SelectItem value="yes">Yes</SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>
                        <div className="sm:col-span-2">
                          <Field label="Other income sources">
                            <Input className="rounded-xl" value={form.otherIncomeSources} onChange={(e) => set('otherIncomeSources', e.target.value)} maxLength={500} />
                          </Field>
                        </div>
                      </div>
                    </section>

                    <Separator />

                    <section>
                      <p className="mb-3 text-sm font-bold">Guarantee</p>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Guarantee type">
                          <Select value={form.guaranteeType || undefined} onValueChange={(v) => set('guaranteeType', v)}>
                            <SelectTrigger className="h-9 rounded-xl" aria-label="Guarantee type">
                              <SelectValue placeholder="What secures the facility?" />
                            </SelectTrigger>
                            <SelectContent>
                              {GUARANTEE_TYPES.map((g) => (
                                <SelectItem key={g} value={g}>{collateralLabel(g)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                        {form.guaranteeType === 'OTHER' && (
                          <Field label="Specify guarantee">
                            <Input className="rounded-xl" value={form.guaranteeTypeOther} onChange={(e) => set('guaranteeTypeOther', e.target.value)} maxLength={160} />
                          </Field>
                        )}
                        <Field label="Guarantee status">
                          <Select value={form.guaranteeStatus || undefined} onValueChange={(v) => set('guaranteeStatus', v)}>
                            <SelectTrigger className="h-9 rounded-xl" aria-label="Guarantee status">
                              <SelectValue placeholder="Availability of the guarantee" />
                            </SelectTrigger>
                            <SelectContent>
                              {GUARANTEE_STATUSES.map((g) => (
                                <SelectItem key={g} value={g}>{g.charAt(0) + g.slice(1).toLowerCase().replace(/_/g, ' ')}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                        {form.guaranteeStatus === 'OTHER' && (
                          <Field label="Specify status">
                            <Input className="rounded-xl" value={form.guaranteeStatusOther} onChange={(e) => set('guaranteeStatusOther', e.target.value)} maxLength={160} />
                          </Field>
                        )}
                        <div className="sm:col-span-2">
                          <Field label="Notes for the financier">
                            <Textarea className="min-h-16 rounded-xl" value={form.applicantNotes} onChange={(e) => set('applicantNotes', e.target.value)} maxLength={10000} />
                          </Field>
                        </div>
                      </div>
                    </section>

                    <Separator />

                    <section>
                      <p className="mb-3 flex items-center gap-1.5 text-sm font-bold">
                        <Paperclip size={15} className="text-primary" /> Supporting attachments (from your vault)
                      </p>
                      {documents.filter((d) => d.isActive).length === 0 ? (
                        <p className="rounded-xl border border-dashed px-4 py-4 text-center text-xs text-muted-foreground">
                          Your vault is empty —{' '}
                          <button type="button" className="font-semibold text-primary hover:underline" onClick={onManageDocuments}>
                            upload documents
                          </button>{' '}
                          to attach feasibility studies, guarantee docs or project files.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {documents
                            .filter((d) => d.isActive)
                            .map((d) => {
                              const picked = attachments.find((a) => a.id === d.id)
                              return (
                                <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2">
                                  <Checkbox
                                    checked={!!picked}
                                    onCheckedChange={(c) =>
                                      setAttachments((list) =>
                                        c
                                          ? [...list, { id: d.id, kind: 'OTHER' }]
                                          : list.filter((a) => a.id !== d.id)
                                      )
                                    }
                                    aria-label={`Attach ${d.title ?? d.media.originalName}`}
                                  />
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium">{d.title ?? d.media.originalName}</p>
                                    <p className="truncate text-[11px] text-muted-foreground">{d.media.originalName}</p>
                                  </div>
                                  <DocStatusBadge status={d.status} />
                                  {picked && (
                                    <Select value={picked.kind} onValueChange={(v) => setAttachments((list) => list.map((a) => (a.id === d.id ? { ...a, kind: v } : a)))}>
                                      <SelectTrigger className="h-8 w-36 rounded-lg text-xs" aria-label="Attachment kind">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {ATTACHMENT_KINDS.map((k) => (
                                          <SelectItem key={k} value={k}>{k.replace(/_/g, ' ').toLowerCase()}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  )}
                                </li>
                              )
                            })}
                        </ul>
                      )}
                    </section>
                  </>
                ) : (
                  <section>
                    <p className="mb-3 text-sm font-bold">Accreditation scope</p>
                    <Field label="Applying on behalf of" required>
                      <p className="rounded-xl border bg-muted/30 px-3 py-2 text-sm">
                        {orgs.find((o) => o.id === organizationId)?.name ?? '—'}
                      </p>
                    </Field>
                    <div className="mt-4">
                      <Field label="Scope notes" hint="What your company supplies and intends to do under this program.">
                        <Textarea className="min-h-24 rounded-xl" value={form.scopeNotes} onChange={(e) => set('scopeNotes', e.target.value)} maxLength={500} placeholder="e.g. IT equipment supply to corporate clients" />
                      </Field>
                    </div>
                  </section>
                )}

                <Separator />

                {/* The requirements checklist — one block per picked service */}
                <section>
                  <p className="mb-1 text-sm font-bold">Requirements checklist</p>
                  <p className="mb-3 text-xs text-muted-foreground">
                    {isMulti
                      ? 'Answer the checklist of every financier you are applying to — each keeps its own private items.'
                      : 'These items are verified by the platform before your file reaches the financier.'}
                  </p>
                  {services.map((service) => (
                    <div key={service.id} className="mb-5 last:mb-0">
                      {isMulti && (
                        <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                          <ShieldCheck size={13} className="text-primary" /> {service.financier.name} — {categoryLabel(service.category)}
                        </p>
                      )}
                      <RequirementChecklist
                        rows={rowsFromRequirements(service.requirements)}
                        answers={answers}
                        onChange={(reqId, answer) => setAnswers((a) => ({ ...a, [reqId]: answer }))}
                        editable
                        documents={documents}
                        onManageDocuments={onManageDocuments}
                      />
                    </div>
                  ))}
                </section>
              </div>
            )}

            {/* ══ STEP 3 — Review & submit ══ */}
            {step === 3 && (
              <div className="space-y-5">
                <section className="rounded-xl border">
                  <div className="border-b bg-muted/30 px-4 py-2.5">
                    <p className="flex items-center gap-1.5 text-sm font-semibold">
                      <BadgeCheck size={15} className="text-primary" /> Applicant
                    </p>
                  </div>
                  <div className="grid gap-x-6 p-4 sm:grid-cols-2">
                    <ReviewRow label="Name" value={user?.name} />
                    <ReviewRow label="Phone" value={profile?.phone} />
                    <ReviewRow label="Email" value={user?.email} />
                    <ReviewRow
                      label="Identity"
                      value={profile?.identityNumber ? `${profile.identityType?.replace(/_/g, ' ').toLowerCase() ?? 'ID'} ····${profile.identityNumber.slice(-4)}` : null}
                    />
                    <ReviewRow label="Residence" value={[profile?.residenceDistrict, profile?.residenceCity].filter(Boolean).join(', ') || null} />
                    <ReviewRow label="Organization" value={orgs.find((o) => o.id === organizationId)?.name ?? 'Individual'} />
                  </div>
                </section>

                {isFinancing && (
                  <section className="rounded-xl border">
                    <div className="border-b bg-muted/30 px-4 py-2.5">
                      <p className="flex items-center gap-1.5 text-sm font-semibold">
                        <Building2 size={15} className="text-primary" /> Activity &amp; financing ask
                      </p>
                    </div>
                    <div className="grid gap-x-6 p-4 sm:grid-cols-2">
                      <ReviewRow label="Activity" value={form.activityStatus ? `${form.activityStatus === 'NEW' ? 'New' : 'Existing'}${form.activityName ? ` — ${form.activityName}` : ''}` : null} />
                      <ReviewRow label="Category" value={form.activityCategory ? form.activityCategory.charAt(0) + form.activityCategory.slice(1).toLowerCase() : null} />
                      <ReviewRow label="City" value={form.activityCity} />
                      <ReviewRow label="Started" value={form.activityStartDate || null} />
                      <ReviewRow label="Amount requested" value={amount != null ? formatMoney(amount, services[0]?.currency) : null} />
                      <ReviewRow label="Tenor" value={form.tenorRequestedMonths ? `${form.tenorRequestedMonths} months` : null} />
                      <ReviewRow label="Capital" value={num(form.capitalAmount) != null ? formatMoney(num(form.capitalAmount)!, services[0]?.currency) : null} />
                      <ReviewRow label="Own contribution" value={num(form.ownContributionAmount) != null ? formatMoney(num(form.ownContributionAmount)!, services[0]?.currency) : null} />
                      <ReviewRow label="Installment capacity" value={num(form.monthlyInstallmentCapacity) != null ? `${formatMoney(num(form.monthlyInstallmentCapacity)!, services[0]?.currency)} / month` : null} />
                      <ReviewRow label="Previous financing" value={form.previousFinancing === '' ? null : form.previousFinancing === 'yes' ? 'Yes' : 'No'} />
                      <ReviewRow label="Guarantee" value={[collateralLabel(form.guaranteeType || null), form.guaranteeStatus?.toLowerCase().replace(/_/g, ' ')].filter(Boolean).join(' · ') || null} />
                      <ReviewRow label="Purpose" value={form.purpose.trim() || null} />
                    </div>
                  </section>
                )}

                {!isFinancing && (
                  <section className="rounded-xl border">
                    <div className="border-b bg-muted/30 px-4 py-2.5">
                      <p className="text-sm font-semibold">Scope</p>
                    </div>
                    <div className="p-4">
                      <ReviewRow label="Scope notes" value={form.scopeNotes.trim() || null} />
                      <ReviewRow label="Organization" value={orgs.find((o) => o.id === organizationId)?.name} />
                    </div>
                  </section>
                )}

                {attachments.length > 0 && (
                  <section className="rounded-xl border">
                    <div className="border-b bg-muted/30 px-4 py-2.5">
                      <p className="text-sm font-semibold">Attachments ({attachments.length})</p>
                    </div>
                    <ul className="divide-y p-0 text-sm">
                      {attachments.map((a) => {
                        const d = documents.find((x) => x.id === a.id)
                        return (
                          <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2">
                            <span className="min-w-0 truncate">{d?.title ?? d?.media.originalName ?? a.id}</span>
                            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                              {a.kind.replace(/_/g, ' ').toLowerCase()}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                )}

                {/* Checklist completeness */}
                <section
                  className={cn(
                    'rounded-xl border-2 px-4 py-3.5',
                    missing.length > 0 ? 'border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20' : 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20'
                  )}
                >
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    {missing.length > 0 ? (
                      <>
                        <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400" />
                        {missing.length} required checklist item{missing.length > 1 ? 's' : ''} still unanswered
                      </>
                    ) : (
                      <>
                        <Check size={15} className="text-emerald-600 dark:text-emerald-400" />
                        Checklist complete — all required items answered
                      </>
                    )}
                  </p>
                  {missing.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {missing.map((m) => (
                        <li key={m.key} className="text-xs text-amber-800 dark:text-amber-300">
                          • {m.title}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <p className="rounded-xl border bg-muted/30 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                  Submitting sends this application to the <span className="font-semibold text-foreground">platform verification gate</span> —
                  every requirement is verified before the file is forwarded to{' '}
                  {services.map((s) => s.financier.name).join(' / ')}. Incomplete files are returned with exactly what
                  needs fixing; you can resubmit without losing verified items.
                </p>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/30 px-5 py-3.5 sm:px-6">
          <div className="flex items-center gap-2">
            {step > 1 && (
              <Button variant="outline" className="rounded-xl" onClick={() => setStep((s) => (s === 3 ? 2 : 1) as 1 | 2)} disabled={submitting}>
                <ChevronLeft size={15} className="mr-1" /> Back
              </Button>
            )}
            {target && (
              <button
                type="button"
                className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                onClick={() => setTarget(null)}
                disabled={submitting}
                title="Unlink this quote/order"
              >
                {target.label} <X size={11} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step < 3 ? (
              <Button
                className="rounded-xl"
                disabled={submitting || (step === 1 && !canStep2) || (step === 2 && !canStep3)}
                onClick={() => setStep((s) => (s === 1 ? 2 : 3) as 2 | 3)}
              >
                {step === 1 && !canStep2 ? 'Consent required' : 'Continue'}
              </Button>
            ) : (
              <Button className="rounded-xl" disabled={submitting || missing.length > 0} onClick={() => void submit()}>
                {submitting ? (
                  <>
                    <Loader2 size={15} className="mr-1.5 animate-spin" /> Submitting…
                  </>
                ) : (
                  <>
                    <Send size={15} className="mr-1.5" /> Submit application{isMulti ? 's' : ''}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
