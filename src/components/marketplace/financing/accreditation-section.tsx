'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FINANCING · ACCREDITATION (W-ACCRED-STATUS — flow 8, DP-26). Company apply
// flow (org select + ACCREDITATION-kind programs + checklist + consent → create
// DRAFT then submit with answers) and the status page (ACCREDITED badge w/
// validUntil countdown, REJECTED w/ note, renewal CTA, live grants).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  Landmark,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import type {
  AccreditationRequestDetailDTO,
  AccreditationRequestSummaryDTO,
  AccountDocumentDTO,
  ApplicantProfileDTO,
  FinancierServiceDTO,
  OrganizationDTO,
  PublicServiceDetailDTO,
  ServiceRequirementDTO,
} from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
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
  ACC_STATUS_MAP,
  apiRequest,
  ConditionTypeBadge,
  DOCUMENT_TYPE_LABELS,
  EmptyState,
  formatDate,
  formatMoney,
  GateMeter,
  readProfileField,
  ScopeBadge,
  StatusBadge,
  StatusStepper,
  SUBMISSION_STATUS_MAP,
  timeAgo,
  toastApiError,
} from '@/components/marketplace/financing/financing-shared'

const ACC_TIMELINE = [
  { key: 'SUBMITTED', label: 'Submitted' },
  { key: 'UNDER_PLATFORM_REVIEW', label: 'Platform gate' },
  { key: 'FORWARDED_TO_FINANCIER', label: 'Forwarded' },
  { key: 'UNDER_FINANCIER_REVIEW', label: 'Financier review' },
  { key: 'ACCREDITED', label: 'Accredited' },
]

const ACC_STATUS_INDEX: Record<string, number> = {
  DRAFT: 0,
  SUBMITTED: 0,
  UNDER_PLATFORM_REVIEW: 1,
  RETURNED_FOR_COMPLETION: 1,
  FORWARDED_TO_FINANCIER: 2,
  UNDER_FINANCIER_REVIEW: 3,
  ACCREDITED: 4,
  REJECTED: 4,
  REVOKED: 4,
  EXPIRED: 4,
  CANCELLED: 4,
}

// ── Section ──────────────────────────────────────────────────────────────────

export function AccreditationSection({
  me,
  onBrowse,
}: {
  me: { user: { id: string; name: string }; applicant: ApplicantProfileDTO | null }
  onBrowse: () => void
}) {
  const { data: orgsData, loading: orgsLoading } = useApi<{ organizations: OrganizationDTO[] }>('/api/organizations')
  const orgs = orgsData?.organizations ?? []
  const { data: accData, loading: accLoading, refetch } = useApi<{
    requests: AccreditationRequestSummaryDTO[]
    live: AccreditationRequestSummaryDTO[]
  }>('/api/accreditation/requests')
  const [applyOpen, setApplyOpen] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  if (orgsLoading || accLoading) {
    return (
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    )
  }

  if (openId) {
    return (
      <AccreditationDetail
        requestId={openId}
        onBack={() => {
          setOpenId(null)
          void refetch()
        }}
      />
    )
  }

  const requests = accData?.requests ?? []
  const live = accData?.live ?? []

  return (
    <div className="space-y-4">
      {/* live grants */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-card p-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <BadgeCheck size={18} className="text-primary" />
          <p className="text-sm font-bold">
            {live.length > 0 ? `${live.length} live accreditation${live.length === 1 ? '' : 's'}` : 'No live accreditations'}
          </p>
          {live.map((l) => (
            <span
              key={l.id}
              className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10.5px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
            >
              {l.financierOrgName} · until {formatDate(l.validUntil)}
            </span>
          ))}
        </div>
        {orgs.length > 0 && (
          <Button className="h-11 rounded-xl" onClick={() => setApplyOpen(true)}>
            <BadgeCheck size={14} className="mr-1.5" /> Apply for accreditation
          </Button>
        )}
      </div>

      {orgs.length === 0 && (
        <p className="flex items-center gap-2 rounded-2xl border bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
          <AlertTriangle size={14} className="shrink-0" />
          Accreditation is a company capability — create or join an organization first (Business Account → Organization).
        </p>
      )}

      {live.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {live.map((l) => (
            <motion.div key={l.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
              <Card className="border-emerald-300/60">
                <CardContent className="space-y-2.5 p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{l.serviceName}</p>
                      <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <Landmark size={11} /> {l.financierOrgName} · {l.organizationName}
                      </p>
                    </div>
                    <StatusBadge status={l.status} map={ACC_STATUS_MAP} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock size={11} /> granted {formatDate(l.accreditedAt)}
                    </span>
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                      <ShieldCheck size={11} /> valid until {formatDate(l.validUntil)}
                    </span>
                  </div>
                  <Button variant="outline" size="sm" className="h-10 w-full rounded-xl" onClick={() => setOpenId(l.id)}>
                    Open details
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* request history */}
      {requests.length === 0 ? (
        <EmptyState
          icon={BadgeCheck}
          title="No accreditation requests yet"
          description="Accredited companies unlock RFQ participation with the financier and auto-pass on covered financing requirements."
        >
          {orgs.length > 0 && (
            <Button className="rounded-xl" onClick={() => setApplyOpen(true)}>
              Apply for your first accreditation
            </Button>
          )}
        </EmptyState>
      ) : (
        <div className="space-y-3">
          <h3 className="text-sm font-bold">History</h3>
          {requests.map((r) => (
            <motion.div key={r.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="flex flex-col gap-2.5 p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg bg-muted px-2 py-1 font-mono text-xs font-bold">{r.number}</span>
                    <StatusBadge status={r.status} map={ACC_STATUS_MAP} />
                    {r.isLive && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        live · {Math.max(0, Math.ceil((new Date(r.validUntil ?? 0).getTime() - Date.now()) / 86_400_000))}d left
                      </span>
                    )}
                    <span className="ml-auto text-[11px] text-muted-foreground">{timeAgo(r.createdAt)}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{r.serviceName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.financierOrgName} · for {r.organizationName}
                    </p>
                  </div>
                  {r.status === 'RETURNED_FOR_COMPLETION' && r.returnedReason && (
                    <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                      <AlertTriangle size={12} className="mr-1 inline" /> Returned: {r.returnedReason}
                    </p>
                  )}
                  {r.status === 'REJECTED' && r.decisionNote && (
                    <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                      Rejected: {r.decisionNote}
                    </p>
                  )}
                  {r.status === 'REVOKED' && r.revocationReason && (
                    <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                      Revoked: {r.revocationReason}
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-10 rounded-xl" onClick={() => setOpenId(r.id)}>
                      Open
                    </Button>
                    {['EXPIRED', 'REVOKED', 'REJECTED'].includes(r.status) && (
                      <Button size="sm" className="h-10 rounded-xl" onClick={() => setApplyOpen(true)}>
                        <RefreshCw size={13} className="mr-1.5" /> Request renewal
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <AccreditationApplyDialog
        open={applyOpen}
        onOpenChange={setApplyOpen}
        orgs={orgs}
        me={me}
        onSubmitted={(id) => {
          setApplyOpen(false)
          setOpenId(id)
          void refetch()
        }}
        onBrowse={onBrowse}
      />
    </div>
  )
}

// ── Apply dialog (org + program + checklist + consent → create + submit) ────

function AccreditationApplyDialog({
  open,
  onOpenChange,
  orgs,
  me,
  onSubmitted,
  onBrowse,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  orgs: OrganizationDTO[]
  me: { user: { id: string; name: string }; applicant: ApplicantProfileDTO | null }
  onSubmitted: (requestId: string) => void
  onBrowse: () => void
}) {
  const [orgId, setOrgId] = useState('')
  const [scopeNotes, setScopeNotes] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [answers, setAnswers] = useState<Record<string, { valueText?: string; valueNumber?: number; valueDate?: string; accountDocumentId?: string; confirmed?: boolean; multi?: string[] }>>({})

  const { data: programsData } = useApi<{ services: FinancierServiceDTO[] }>(
    open ? '/api/financing/services?kind=ACCREDITATION&limit=60' : null
  )
  const programs = programsData?.services ?? []
  const [serviceId, setServiceId] = useState('')

  const { data: serviceData } = useApi<{ service: PublicServiceDetailDTO }>(serviceId ? `/api/financing/services/${serviceId}` : null)
  const service = serviceData?.service
  const { data: vaultData } = useApi<{ documents: AccountDocumentDTO[] }>(open ? '/api/documents' : null)
  const activeOrg = orgs.find((o) => o.id === orgId) ?? null

  const requirements = useMemo(
    () => (service?.requirements ?? []).filter((r) => r.isActive).sort((a, b) => a.displayOrder - b.displayOrder),
    [service]
  )
  const setAnswer = (id: string, patch: Record<string, unknown>) =>
    setAnswers((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  const missingRequired = requirements.filter((r) => {
    if (!r.isRequired || r.template.conditionType === 'PROFILE_FIELD') return false
    const a = answers[r.conditionTemplateId] as Record<string, unknown> | undefined
    const kind = r.template.conditionType
    if (kind === 'DOCUMENT') return !a?.accountDocumentId
    if (kind === 'DECLARATION') return !a?.confirmed
    if (kind === 'NUMBER') return a?.valueNumber == null
    if (kind === 'DATE') return !a?.valueDate
    if (kind === 'MULTI_SELECT') return ((a?.multi as string[] | undefined) ?? []).length === 0
    if (kind === 'SELECT') return !a?.valueText
    return !a?.valueText
  })

  const submit = async () => {
    if (!serviceId || !orgId) return
    setBusy(true)
    // 1) create the DRAFT
    const createRes = await apiRequest<{ request: { id: string } }>('/api/accreditation/requests', {
      method: 'POST',
      body: JSON.stringify({ serviceId, organizationId: orgId, scopeNotes: scopeNotes || null }),
    })
    if (!createRes.ok || !createRes.data) {
      setBusy(false)
      return toastApiError(createRes.error, 'Could not create the request')
    }
    // 2) submit with answers + consent (checklist generated on submit)
    const payloadAnswers = requirements
      .filter((r) => r.template.conditionType !== 'PROFILE_FIELD')
      .map((r) => {
        const a = answers[r.conditionTemplateId] as Record<string, unknown> | undefined
        const kind = r.template.conditionType
        if (kind === 'DOCUMENT') return { conditionTemplateId: r.conditionTemplateId, accountDocumentId: a?.accountDocumentId ?? null }
        if (kind === 'DECLARATION') return { conditionTemplateId: r.conditionTemplateId, confirmed: !!a?.confirmed }
        if (kind === 'NUMBER') return { conditionTemplateId: r.conditionTemplateId, valueNumber: a?.valueNumber ?? null }
        if (kind === 'DATE') return { conditionTemplateId: r.conditionTemplateId, valueDate: a?.valueDate ?? null }
        if (kind === 'MULTI_SELECT') return { conditionTemplateId: r.conditionTemplateId, valueText: ((a?.multi as string[] | undefined) ?? []).join(', ') }
        return { conditionTemplateId: r.conditionTemplateId, valueText: a?.valueText ?? null }
      })
    const submitRes = await apiRequest<{ request: AccreditationRequestDetailDTO }>(
      `/api/accreditation/requests/${createRes.data.request.id}/submit`,
      { method: 'POST', body: JSON.stringify({ consent: true, answers: payloadAnswers }) }
    )
    setBusy(false)
    if (!submitRes.ok) return toastApiError(submitRes.error, 'Could not submit the request')
    toast({
      title: 'Accreditation request submitted',
      description: `${createRes.data.request.id ? '' : ''}The platform gate verifies your file before the financier sees it.`,
    })
    setOrgId('')
    setServiceId('')
    setScopeNotes('')
    setConsent(false)
    setAnswers({})
    onSubmitted(createRes.data.request.id)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Apply for accreditation</DialogTitle>
          <DialogDescription>
            Company application — verified once by the platform, granted by the financier. Live accreditation unlocks
            RFQ participation and auto-passes covered requirements.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Company</Label>
            <Select value={orgId} onValueChange={setOrgId}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder="Pick your organization" />
              </SelectTrigger>
              <SelectContent>
                {orgs.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    <span className="inline-flex items-center gap-1.5">
                      <Building2 size={12} /> {o.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Program</Label>
            {programs.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-3 text-center text-xs text-muted-foreground">
                No accreditation programs are published yet.
              </p>
            ) : (
              <Select value={serviceId} onValueChange={setServiceId}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue placeholder="Pick a program" />
                </SelectTrigger>
                <SelectContent>
                  {programs.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {p.financierOrgName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {service && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/20 px-3 py-2.5 text-[11px] font-semibold">
              <span className="rounded-full bg-muted px-2 py-0.5">
                Valid {service.accreditationValidMonths ?? '—'} months
              </span>
              {service.accreditationFeeAmount != null && (
                <span className="rounded-full bg-muted px-2 py-0.5">Fee {formatMoney(service.accreditationFeeAmount, service.currency)}</span>
              )}
              <span className="rounded-full bg-muted px-2 py-0.5">{requirements.length} requirements</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="acc-scope">Scope notes (optional)</Label>
            <Textarea
              id="acc-scope"
              rows={2}
              value={scopeNotes}
              onChange={(e) => setScopeNotes(e.target.value)}
              placeholder='e.g. "IT equipment suppliers"'
            />
          </div>

          {service && requirements.length > 0 && (
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Requirements checklist</h4>
              {requirements.map((req) => (
                <AccreditationChecklistRow
                  key={req.conditionTemplateId}
                  req={req}
                  answer={answers[req.conditionTemplateId] as Record<string, unknown> | undefined}
                  setAnswer={(patch) => setAnswer(req.conditionTemplateId, patch)}
                  vaultDocs={vaultData?.documents ?? []}
                  applicant={me.applicant}
                  org={activeOrg}
                />
              ))}
            </div>
          )}

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-xs">
            <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
            <span>
              I confirm the company information and documents are true and consent to platform verification before the
              financier decides.
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={onBrowse}>
            Browse programs
          </Button>
          <Button
            className="rounded-xl"
            disabled={busy || !serviceId || !orgId || !consent || missingRequired.length > 0}
            onClick={submit}
          >
            {busy ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Send size={14} className="mr-1.5" />}
            Submit{missingRequired.length > 0 ? ` (${missingRequired.length} left)` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AccreditationChecklistRow({
  req,
  answer,
  setAnswer,
  vaultDocs,
  applicant,
  org,
}: {
  req: ServiceRequirementDTO
  answer: Record<string, unknown> | undefined
  setAnswer: (patch: Record<string, unknown>) => void
  vaultDocs: AccountDocumentDTO[]
  applicant: ApplicantProfileDTO | null
  org: OrganizationDTO | null
}) {
  const t = req.template
  const kind = t.conditionType
  return (
    <div className="rounded-xl border bg-card p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <ConditionTypeBadge type={kind} />
        <ScopeBadge scope={t.scope} />
        {req.isRequired && <span className="text-[11px] font-bold text-primary">✱ required</span>}
      </div>
      <p className="mt-1.5 text-sm font-semibold">{t.title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{req.instructions ?? t.description ?? ''}</p>
      <div className="mt-2.5">
        {kind === 'PROFILE_FIELD' && (
          <ProfileNotice value={readProfileField(t.profileFieldKey ?? '', applicant, org)} />
        )}
        {kind === 'DOCUMENT' && (
          <select
            className="h-10 w-full rounded-lg border bg-background px-3 text-xs"
            value={(answer?.accountDocumentId as string) ?? ''}
            onChange={(e) => setAnswer({ accountDocumentId: e.target.value || undefined })}
          >
            <option value="">Pick a vault document…</option>
            {(t.documentType ? vaultDocs.filter((d) => d.documentType === t.documentType) : vaultDocs).map((d) => (
              <option key={d.id} value={d.id}>
                {d.title ?? d.media?.originalName ?? d.documentType} ({d.status})
              </option>
            ))}
          </select>
        )}
        {kind === 'DECLARATION' && (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border bg-background px-3 py-2.5 text-xs">
            <Checkbox
              checked={!!answer?.confirmed}
              onCheckedChange={(v) => setAnswer({ confirmed: v === true })}
            />
            {t.description ?? 'I confirm this declaration.'}
          </label>
        )}
        {kind === 'TEXT' && (
          <Textarea
            rows={2}
            className="text-xs"
            value={(answer?.valueText as string) ?? ''}
            onChange={(e) => setAnswer({ valueText: e.target.value })}
          />
        )}
        {kind === 'NUMBER' && (
          <Input
            type="number"
            className="h-10"
            value={(answer?.valueNumber as number) ?? ''}
            onChange={(e) => setAnswer({ valueNumber: e.target.value === '' ? undefined : Number(e.target.value) })}
            placeholder={t.validationMin != null ? `between ${t.validationMin} and ${t.validationMax ?? '∞'}` : 'Number'}
          />
        )}
        {kind === 'DATE' && (
          <Input
            type="date"
            className="h-10"
            value={(answer?.valueDate as string) ?? ''}
            onChange={(e) => setAnswer({ valueDate: e.target.value })}
          />
        )}
        {kind === 'SELECT' && (
          <select
            className="h-10 w-full rounded-lg border bg-background px-3 text-xs"
            value={(answer?.valueText as string) ?? ''}
            onChange={(e) => setAnswer({ valueText: e.target.value })}
          >
            <option value="">Choose…</option>
            {t.options.map((o) => (
              <option key={o.id} value={o.value}>
                {o.value}
              </option>
            ))}
          </select>
        )}
        {kind === 'MULTI_SELECT' && (
          <div className="grid gap-1.5 rounded-lg border bg-background px-3 py-2.5 sm:grid-cols-2">
            {t.options.map((o) => {
              const multi = (answer?.multi as string[]) ?? []
              return (
                <label key={o.id} className="flex cursor-pointer items-center gap-2 text-xs">
                  <Checkbox
                    checked={multi.includes(o.value)}
                    onCheckedChange={(v) =>
                      setAnswer({ multi: v ? [...multi, o.value] : multi.filter((x) => x !== o.value) })
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

function ProfileNotice({ value }: { value: string | null }) {
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
      {value ? `${value} — auto-verified at submit` : 'Missing — fill the company profile first (auto-evaluated)'}
    </p>
  )
}

// ── Detail (status page) ─────────────────────────────────────────────────────

function AccreditationDetail({ requestId, onBack }: { requestId: string; onBack: () => void }) {
  const { data, loading, error, refetch } = useApi<{ request: AccreditationRequestDetailDTO }>(
    `/api/accreditation/requests/${requestId}`
  )
  const r = data?.request
  const [busy, setBusy] = useState(false)

  const cancel = async () => {
    if (!r) return
    setBusy(true)
    const res = await apiRequest(`/api/accreditation/requests/${r.id}/cancel`, { method: 'POST' })
    setBusy(false)
    if (!res.ok) return toastApiError(res.error, 'Could not cancel')
    toast({ title: 'Request cancelled' })
    void refetch()
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-44 rounded-xl" />
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    )
  }
  if (error || !r) {
    return (
      <EmptyState icon={AlertTriangle} title="Could not load the accreditation" description={error ?? 'Not found'}>
        <Button variant="outline" className="rounded-xl" onClick={onBack}>
          <ChevronLeft size={14} className="mr-1.5" /> Back
        </Button>
      </EmptyState>
    )
  }

  const canCancel = ['DRAFT', 'SUBMITTED', 'UNDER_PLATFORM_REVIEW', 'RETURNED_FOR_COMPLETION'].includes(r.status)
  const daysLeft = r.validUntil ? Math.max(0, Math.ceil((new Date(r.validUntil).getTime() - Date.now()) / 86_400_000)) : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" className="h-11 w-11 rounded-xl" onClick={onBack} aria-label="Back">
            <ChevronLeft size={18} />
          </Button>
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-2 font-mono text-lg font-bold">
              {r.number} <StatusBadge status={r.status} map={ACC_STATUS_MAP} />
            </h2>
            <p className="truncate text-xs text-muted-foreground">
              {r.serviceName} · {r.financierOrgName} · for {r.organizationName}
            </p>
          </div>
        </div>
        {canCancel && (
          <Button variant="outline" className="h-11 rounded-xl" disabled={busy} onClick={cancel}>
            Cancel request
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <StatusStepper steps={ACC_TIMELINE} current={ACC_STATUS_INDEX[r.status] ?? 0} />
          {r.status === 'ACCREDITED' && r.validUntil && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 dark:border-emerald-900 dark:bg-emerald-950/40">
              <BadgeCheck size={20} className="text-emerald-600" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                  Accredited{r.accreditedAt ? ` since ${formatDate(r.accreditedAt)}` : ''}
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  Valid until {formatDate(r.validUntil)}
                  {daysLeft != null && ` — ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
                  {daysLeft != null && daysLeft <= 7 && ' (expiry reminder active)'}
                </p>
              </div>
              <div className="ml-auto flex flex-col items-end gap-1 text-[11px] text-emerald-700 dark:text-emerald-400">
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck size={12} /> RFQ participation unlocked with this financier
                </span>
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 size={12} /> auto-passes covered financing requirements
                </span>
              </div>
            </div>
          )}
          {r.status === 'REJECTED' && r.decisionNote && (
            <p className="rounded-xl bg-rose-50 px-3.5 py-3 text-xs font-medium text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
              Rejected: {r.decisionNote}
            </p>
          )}
          {r.status === 'REVOKED' && r.revocationReason && (
            <p className="rounded-xl bg-rose-50 px-3.5 py-3 text-xs font-medium text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
              Revoked: {r.revocationReason}
            </p>
          )}
          {r.status === 'RETURNED_FOR_COMPLETION' && r.returnedReason && (
            <p className="rounded-xl bg-rose-50 px-3.5 py-3 text-xs font-medium text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
              <AlertTriangle size={12} className="mr-1 inline" /> Returned by the platform: {r.returnedReason}
            </p>
          )}
          {r.scopeNotes && (
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold">Scope:</span> {r.scopeNotes}
            </p>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] text-muted-foreground sm:grid-cols-4">
            <span className="inline-flex items-center gap-1">
              <UserIcon size={11} /> {r.submittedBy.name}
            </span>
            <span>created {formatDate(r.createdAt)}</span>
            {r.submittedAt && <span>submitted {formatDate(r.submittedAt)}</span>}
            {r.forwardedAt && <span>forwarded {formatDate(r.forwardedAt)}</span>}
          </div>
          <GateMeter verified={r.gate.verified} waived={r.gate.waived} totalRequired={r.gate.totalRequired} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-4 sm:p-6">
          <h3 className="text-sm font-bold">Checklist</h3>
          {r.submissions.map((s) => {
            const t = s.requirement.template
            return (
              <div key={s.id} className="rounded-xl border p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <ConditionTypeBadge type={t.conditionType} />
                  <ScopeBadge scope={t.scope} />
                  {s.requirement.isRequired && <span className="text-[11px] font-bold text-primary">✱ required</span>}
                  <span className="ml-auto">
                    <StatusBadge status={s.status} map={SUBMISSION_STATUS_MAP} />
                  </span>
                </div>
                <p className="mt-1.5 text-sm font-semibold">{t.title}</p>
                {s.decisionNote && (
                  <p className="mt-1.5 rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs">Platform note: {s.decisionNote}</p>
                )}
                {s.accountDocumentId && t.documentType && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Document: {DOCUMENT_TYPE_LABELS[t.documentType] ?? t.documentType} (vault){' '}
                    <span className="font-semibold">{s.status === 'VERIFIED' ? '✓' : ''}</span>
                  </p>
                )}
              </div>
            )
          })}
          {r.submissions.length === 0 && (
            <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
              The checklist appears after submission.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
