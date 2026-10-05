'use client'

// ─────────────────────────────────────────────────────────────────────────────
// SHARIA & CONTRACTS SECTION (Phase 10 — lastplan v5 §10.3 + §10.4)
// Three sticky-pill tabs:
//   • Certifications — the scholar-attestation register with computed expiry
//     status (VALID / EXPIRING_SOON ≤30d / EXPIRED) + idempotent 30-day
//     reminders the list call emits (a toast reports them).
//   • Templates — versioned contract templates per kind (single ACTIVE),
//     sha256-stamped; drafts editable, activation/retirement confirmed.
//   • Executions — the e-signature ledger with the full evidence package
//     (identity + MFA step-up, consent text, exact document hash).
// Owner: Task 10-c.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import {
  BadgeCheck,
  CheckCircle2,
  Eye,
  FileSignature,
  FilePlus2,
  Pencil,
  Plus,
  ScrollText,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import type { FinancingAgreementDTO } from '@/lib/types'
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
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  apiRequest,
  EmptyState,
  formatDate,
  formatDateTime,
  LabeledValue,
  toastApiError,
} from '@/components/marketplace/financing/financing-shared'

// ── DTOs (local to this console — mirrors the service serializers) ────────

interface ShariaCertificationDTO {
  id: string
  scholarName: string
  scholarInstitution: string
  certificateRef: string
  scope: string | null
  issuedAt: string
  expiresAt: string
  reminderSentAt: string | null
  documentUrl: string | null
  createdAt: string
  updatedAt: string
  expiryStatus: 'VALID' | 'EXPIRING_SOON' | 'EXPIRED'
  daysToExpiry: number
}

interface ContractTemplateDTO {
  id: string
  kind: 'FINANCING_AGREEMENT' | 'MURABAHA'
  version: number
  title: string
  body: string
  sha256: string
  status: 'DRAFT' | 'ACTIVE' | 'RETIRED'
  createdAt: string
  updatedAt: string
  createdBy: { id: string; name: string }
}

interface ExecutionLedgerDTO {
  id: string
  agreementId: string
  agreementNumber: string
  applicantName: string
  applicantEmail: string
  template: { id: string; kind: string; version: number; title: string }
  documentSha256: string
  signerMfaVerifiedAt: string | null
  acceptedAt: string
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
  evidence: Record<string, unknown>
}

// ── Shared bits ─────────────────────────────────────────────────────────────

const EXPIRY_MAP: Record<string, { label: string; badge: string }> = {
  VALID: { label: 'Valid', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  EXPIRING_SOON: { label: 'Expiring soon', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  EXPIRED: { label: 'Expired', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
}

const TEMPLATE_STATUS_MAP: Record<string, { label: string; badge: string }> = {
  DRAFT: { label: 'Draft', badge: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
  ACTIVE: { label: 'Active', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  RETIRED: { label: 'Retired', badge: 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400' },
}

const KIND_LABELS: Record<string, string> = {
  FINANCING_AGREEMENT: 'Financing agreement',
  MURABAHA: 'Murabaha (10.9)',
}

const PLACEHOLDER_CHEATSHEET: { token: string; fills: string }[] = [
  { token: '{{agreementNumber}}', fills: 'AGR-2026-000004' },
  { token: '{{financierOrgName}}', fills: 'your institution' },
  { token: '{{applicantName}}', fills: 'the applicant' },
  { token: '{{amount}} / {{currency}}', fills: '750,000 YER' },
  { token: '{{tenorMonths}}', fills: '12' },
  { token: '{{rateType}} / {{ratePercent}}', fills: 'Murabaha (annual) / 14.5' },
  { token: '{{installmentSchedule}}', fills: 'numbered due-date lines' },
  { token: '{{date}}', fills: 'today' },
  { token: '{{offerNotes}}', fills: 'the offer notes' },
]

const STARTER_BODY = `FINANCING AGREEMENT {{agreementNumber}}

This financing agreement ("Agreement") is entered into on {{date}} between
{{financierOrgName}} ("Financier") and {{applicantName}} ("Applicant").

1. FACILITY
The Financier extends financing of {{amount}} {{currency}} to the Applicant,
 repayable over {{tenorMonths}} months ({{rateType}}; rate: {{ratePercent}}).

2. REPAYMENT SCHEDULE
{{installmentSchedule}}

3. OFFER TERMS
Offer notes: {{offerNotes}}

4. GENERAL
The Applicant consents to be bound by the terms of this Agreement and
understands the installment schedule and the obligation to pay on time.
`

/** Client-side preview renderer — mirrors the server substitution so the
 *  console can show a rendered read-only preview (signing always renders
 *  server-side — this is a convenience view only). */
function renderPreview(body: string, a: FinancingAgreementDTO): string {
  const day = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  const schedule = a.offer.installments.length
    ? a.offer.installments
        .map((i) => `${i.installmentNo}. ${day(i.dueDate)} — ${i.amount.toLocaleString('en-US')} ${a.offer.currency}`)
        .join('\n')
    : 'To be scheduled by the financier.'
  const values: Record<string, string> = {
    agreementNumber: a.number,
    financierOrgName: a.request.financierOrgName,
    applicantName: a.request.applicantName,
    amount: a.offer.amount.toLocaleString('en-US'),
    currency: a.offer.currency,
    tenorMonths: String(a.offer.tenorMonths),
    rateType: a.offer.rateType ?? 'as offered',
    ratePercent: a.offer.ratePercent != null ? String(a.offer.ratePercent) : 'as offered',
    installmentSchedule: schedule,
    date: day(new Date().toISOString()),
    offerNotes: a.offer.notes ?? '—',
  }
  return body.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g, (full, token: string) =>
    Object.prototype.hasOwnProperty.call(values, token) ? values[token] : full
  )
}

// ── Section shell (sticky pill nav — docked under the dashboard topbar) ────

type TabKey = 'certifications' | 'templates' | 'executions'

const TABS: { key: TabKey; label: string; icon: typeof ScrollText }[] = [
  { key: 'certifications', label: 'Certifications', icon: ShieldCheck },
  { key: 'templates', label: 'Contract Templates', icon: ScrollText },
  { key: 'executions', label: 'Executions', icon: FileSignature },
]

export function ShariaSection() {
  const [tab, setTab] = useState<TabKey>('certifications')
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-bh-muted">
        <ShieldCheck size={13} className="text-bh-gold-dark" />
        <span>
          Sharia attestations, the versioned contract library buyers sign, and the e-signature evidence
          ledger — every signature binds to an exact document hash.
        </span>
      </div>

      <div className="sticky top-14 z-20 -mx-4 border-b bg-background/95 px-4 pb-2 pt-1 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <nav
          aria-label="Sharia & contracts sections"
          className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {TABS.map((t) => {
            const active = tab === t.key
            const Icon = t.icon
            return (
              <button
                key={t.key}
                type="button"
                aria-current={active ? 'true' : undefined}
                onClick={() => setTab(t.key)}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
                )}
              >
                <Icon size={14} />
                {t.label}
              </button>
            )
          })}
        </nav>
      </div>

      {tab === 'certifications' ? (
        <CertificationsTab />
      ) : tab === 'templates' ? (
        <TemplatesTab />
      ) : (
        <ExecutionsTab />
      )}
    </div>
  )
}

// ── Tab 1 — Certifications ─────────────────────────────────────────────────

function CertificationsTab() {
  const { data, loading, error, refetch } = useApi<{
    certifications: ShariaCertificationDTO[]
    remindersEmitted: { id: string; scholarName: string; certificateRef: string }[]
  }>('/api/financier/sharia/certifications')
  const [editing, setEditing] = useState<ShariaCertificationDTO | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<ShariaCertificationDTO | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  // The list call emits idempotent reminders — surface them once per fetch.
  useEffect(() => {
    const emitted = data?.remindersEmitted ?? []
    if (emitted.length > 0) {
      toast({
        title: `Expiry reminder emitted (${emitted.length})`,
        description: `${emitted[0].certificateRef}${emitted.length > 1 ? ` +${emitted.length - 1} more` : ''} — the OWNER/ADMIN staff were notified. Re-alerts at most every 30 days.`,
      })
    }
  }, [data])

  const confirmDelete = async () => {
    if (!deleting) return
    setDeletingBusy(true)
    const res = await apiRequest(`/api/financier/sharia/certifications/${deleting.id}`, { method: 'DELETE' })
    setDeletingBusy(false)
    if (!res.ok) return toastApiError(res.error)
    toast({ title: 'Certification deleted', description: `${deleting.certificateRef} was removed from the register.` })
    setDeleting(null)
    void refetch()
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
    )
  }
  if (error) {
    return (
      <EmptyState icon={ShieldCheck} title="Could not load the certifications" description={error}>
        <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
          Retry
        </Button>
      </EmptyState>
    )
  }

  const certifications = data?.certifications ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Scholar attestations with live expiry tracking — rows within 30 days of expiry (or past it) notify
          your staff at most once every 30 days.
        </p>
        <Button size="sm" className="rounded-xl" onClick={() => setCreating(true)}>
          <Plus size={14} className="mr-1" /> Record certification
        </Button>
      </div>

      {certifications.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No Sharia certifications recorded"
          description="Record the scholar attestations for your institution — buyers and the platform see your compliance posture from here."
        >
          <Button size="sm" className="rounded-xl" onClick={() => setCreating(true)}>
            <Plus size={14} className="mr-1" /> Record the first one
          </Button>
        </EmptyState>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-2xl border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scholar</TableHead>
                  <TableHead>Institution</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {certifications.map((c) => {
                  const exp = EXPIRY_MAP[c.expiryStatus]
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.scholarName}</TableCell>
                      <TableCell>{c.scholarInstitution}</TableCell>
                      <TableCell>
                        <span className="font-mono text-xs">{c.certificateRef}</span>
                        {c.scope && <p className="mt-0.5 max-w-64 truncate text-xs text-muted-foreground">{c.scope}</p>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(c.issuedAt)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(c.expiresAt)}</TableCell>
                      <TableCell>
                        <Badge className={cn('rounded-full border-0 text-[11px] font-semibold', exp.badge)}>
                          {exp.label}
                          {c.expiryStatus !== 'VALID' && ` · ${c.daysToExpiry < 0 ? `${Math.abs(c.daysToExpiry)}d ago` : `${c.daysToExpiry}d`}`}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${c.certificateRef}`} onClick={() => setEditing(c)}>
                            <Pencil size={14} />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-600" aria-label={`Delete ${c.certificateRef}`} onClick={() => setDeleting(c)}>
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {certifications.map((c) => {
              const exp = EXPIRY_MAP[c.expiryStatus]
              return (
                <Card key={c.id}>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{c.scholarName}</p>
                        <p className="truncate text-xs text-muted-foreground">{c.scholarInstitution}</p>
                      </div>
                      <Badge className={cn('shrink-0 rounded-full border-0 text-[11px] font-semibold', exp.badge)}>{exp.label}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <LabeledValue label="Ref">{c.certificateRef}</LabeledValue>
                      <LabeledValue label="Expires">{formatDate(c.expiresAt)}</LabeledValue>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <Button variant="outline" size="sm" className="rounded-lg" onClick={() => setEditing(c)}>
                        <Pencil size={14} className="mr-1" /> Edit
                      </Button>
                      <Button variant="outline" size="sm" className="rounded-lg text-rose-600" onClick={() => setDeleting(c)}>
                        <Trash2 size={14} className="mr-1" /> Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}

      <CertificationDialog
        open={creating || !!editing}
        certification={editing}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
        onSaved={() => {
          setCreating(false)
          setEditing(null)
          void refetch()
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.certificateRef}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The scholar attestation is removed from your register. This cannot be undone — record it
              again if it was a mistake.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl" disabled={deletingBusy}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-rose-600 text-white hover:bg-rose-700"
              disabled={deletingBusy}
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
            >
              {deletingBusy ? 'Deleting…' : 'Delete certification'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function CertificationDialog({
  open,
  certification,
  onClose,
  onSaved,
}: {
  open: boolean
  certification: ShariaCertificationDTO | null
  onClose: () => void
  onSaved: () => void
}) {
  // Keyed inner form — mounts fresh per (certification) so the fields reset
  // without effect-driven setState (React Compiler lint).
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {open && (
          <CertificationForm
            key={certification?.id ?? 'new'}
            certification={certification}
            onClose={onClose}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function CertificationForm({
  certification,
  onClose,
  onSaved,
}: {
  certification: ShariaCertificationDTO | null
  onClose: () => void
  onSaved: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    scholarName: certification?.scholarName ?? '',
    scholarInstitution: certification?.scholarInstitution ?? '',
    certificateRef: certification?.certificateRef ?? '',
    scope: certification?.scope ?? '',
    issuedAt: certification?.issuedAt.slice(0, 10) ?? '',
    expiresAt: certification?.expiresAt.slice(0, 10) ?? '',
    documentUrl: certification?.documentUrl ?? '',
  })

  const save = async () => {
    setBusy(true)
    const payload = {
      scholarName: form.scholarName,
      scholarInstitution: form.scholarInstitution,
      certificateRef: form.certificateRef,
      scope: form.scope || null,
      issuedAt: form.issuedAt ? new Date(form.issuedAt).toISOString() : '',
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : '',
      documentUrl: form.documentUrl || null,
    }
    const res = certification
      ? await apiRequest(`/api/financier/sharia/certifications/${certification.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
      : await apiRequest('/api/financier/sharia/certifications', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
    setBusy(false)
    if (!res.ok) return toastApiError(res.error)
    toast({
      title: certification ? 'Certification updated' : 'Certification recorded',
      description: `${form.certificateRef} — ${form.scholarInstitution}.`,
    })
    onSaved()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{certification ? 'Edit certification' : 'Record a Sharia certification'}</DialogTitle>
        <DialogDescription>
          The attestation of the Sharia Supervisory Board scholar — expiry is tracked and your staff is
          reminded when it approaches.
        </DialogDescription>
      </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="scholarName">Scholar name</Label>
            <Input
              id="scholarName"
              value={form.scholarName}
              onChange={(e) => setForm((f) => ({ ...f, scholarName: e.target.value }))}
              placeholder="Sheikh Abdulrahman Al-Marani"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="scholarInstitution">Institution</Label>
            <Input
              id="scholarInstitution"
              value={form.scholarInstitution}
              onChange={(e) => setForm((f) => ({ ...f, scholarInstitution: e.target.value }))}
              placeholder="Yemeni Sharia Supervisory Board"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="certificateRef">Certificate reference</Label>
            <Input
              id="certificateRef"
              value={form.certificateRef}
              onChange={(e) => setForm((f) => ({ ...f, certificateRef: e.target.value }))}
              placeholder="SSB-2026-114"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="scope">Scope (optional)</Label>
            <Input
              id="scope"
              value={form.scope}
              onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))}
              placeholder="Murabaha financing, SME facilities"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="issuedAt">Issued</Label>
              <Input
                id="issuedAt"
                type="date"
                value={form.issuedAt}
                onChange={(e) => setForm((f) => ({ ...f, issuedAt: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="expiresAt">Expires</Label>
              <Input
                id="expiresAt"
                type="date"
                value={form.expiresAt}
                onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="documentUrl">Evidence document URL (optional)</Label>
            <Input
              id="documentUrl"
              value={form.documentUrl}
              onChange={(e) => setForm((f) => ({ ...f, documentUrl: e.target.value }))}
              placeholder="https://…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button className="rounded-xl" onClick={() => void save()} disabled={busy}>
            {busy ? 'Saving…' : certification ? 'Save changes' : 'Record certification'}
          </Button>
        </DialogFooter>
    </>
  )
}

// ── Tab 2 — Contract templates ─────────────────────────────────────────────

function TemplatesTab() {
  const { data, loading, error, refetch } = useApi<{ templates: ContractTemplateDTO[] }>('/api/financier/contracts')
  const { data: agreementsData } = useApi<{ agreements: FinancingAgreementDTO[] }>('/api/financier/agreements')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<ContractTemplateDTO | null>(null)
  const [activating, setActivating] = useState<ContractTemplateDTO | null>(null)
  const [retiring, setRetiring] = useState<ContractTemplateDTO | null>(null)
  const [previewing, setPreviewing] = useState<ContractTemplateDTO | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const act = async (t: ContractTemplateDTO, action: 'activate' | 'retire') => {
    setBusyId(t.id)
    const res = await apiRequest(`/api/financier/contracts/${t.id}/${action}`, { method: 'POST' })
    setBusyId(null)
    if (!res.ok) return toastApiError(res.error)
    toast({
      title: action === 'activate' ? `Template v${t.version} activated` : `Template v${t.version} retired`,
      description:
        action === 'activate'
          ? 'New signings render this version; existing executions keep theirs.'
          : 'No active template remains — new signings stay closed until you activate one.',
    })
    setActivating(null)
    setRetiring(null)
    void refetch()
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
    )
  }
  if (error) {
    return (
      <EmptyState icon={ScrollText} title="Could not load the templates" description={error}>
        <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
          Retry
        </Button>
      </EmptyState>
    )
  }

  const templates = data?.templates ?? []
  const agreements = agreementsData?.agreements ?? []
  const kinds: ('FINANCING_AGREEMENT' | 'MURABAHA')[] = ['FINANCING_AGREEMENT', 'MURABAHA']

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Versioned agreement text — one ACTIVE version per kind. Every e-signature binds to the exact
          sha256 of the version the applicant saw.
        </p>
        <Button size="sm" className="rounded-xl" onClick={() => setCreating(true)}>
          <FilePlus2 size={14} className="mr-1" /> New template
        </Button>
      </div>

      {templates.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No contract templates yet"
          description="Draft your financing-agreement text, fill the placeholders, and activate a version — buyers can then e-sign it against their agreement."
        >
          <Button size="sm" className="rounded-xl" onClick={() => setCreating(true)}>
            <FilePlus2 size={14} className="mr-1" /> Draft the first template
          </Button>
        </EmptyState>
      ) : (
        kinds.map((kind) => {
          const rows = templates.filter((t) => t.kind === kind)
          if (rows.length === 0) return null
          return (
            <div key={kind} className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">{KIND_LABELS[kind] ?? kind}</h3>
                <Badge variant="outline" className="rounded-full text-[10px] text-muted-foreground">
                  {rows.length} version{rows.length > 1 ? 's' : ''}
                </Badge>
              </div>

              {/* Desktop table */}
              <div className="hidden overflow-hidden rounded-2xl border md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Version</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>sha256</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((t) => {
                      const st = TEMPLATE_STATUS_MAP[t.status]
                      return (
                        <TableRow key={t.id}>
                          <TableCell className="font-mono text-xs font-bold">v{t.version}</TableCell>
                          <TableCell className="max-w-72">
                            <p className="truncate font-medium">{t.title}</p>
                            <p className="truncate text-xs text-muted-foreground">by {t.createdBy.name}</p>
                          </TableCell>
                          <TableCell>
                            <Badge className={cn('rounded-full border-0 text-[11px] font-semibold', st.badge)}>{st.label}</Badge>
                          </TableCell>
                          <TableCell className="font-mono text-[11px] text-muted-foreground" title={t.sha256}>
                            {t.sha256.slice(0, 12)}…
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{formatDate(t.createdAt)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Preview ${t.title}`} onClick={() => setPreviewing(t)}>
                                <Eye size={14} />
                              </Button>
                              {t.status === 'DRAFT' && (
                                <>
                                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${t.title}`} onClick={() => setEditing(t)}>
                                    <Pencil size={14} />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 rounded-lg text-emerald-700 dark:text-emerald-400"
                                    disabled={busyId === t.id}
                                    onClick={() => setActivating(t)}
                                  >
                                    Activate
                                  </Button>
                                </>
                              )}
                              {t.status === 'ACTIVE' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 rounded-lg text-rose-600"
                                  disabled={busyId === t.id}
                                  onClick={() => setRetiring(t)}
                                >
                                  Retire
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile cards */}
              <div className="space-y-3 md:hidden">
                {rows.map((t) => {
                  const st = TEMPLATE_STATUS_MAP[t.status]
                  return (
                    <Card key={t.id}>
                      <CardContent className="space-y-2 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">
                              <span className="font-mono">v{t.version}</span> · {t.title}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {t.createdBy.name} · {formatDate(t.createdAt)} · {t.sha256.slice(0, 10)}…
                            </p>
                          </div>
                          <Badge className={cn('shrink-0 rounded-full border-0 text-[11px] font-semibold', st.badge)}>{st.label}</Badge>
                        </div>
                        <div className="flex flex-wrap justify-end gap-2 pt-1">
                          <Button variant="outline" size="sm" className="rounded-lg" onClick={() => setPreviewing(t)}>
                            <Eye size={14} className="mr-1" /> Preview
                          </Button>
                          {t.status === 'DRAFT' && (
                            <>
                              <Button variant="outline" size="sm" className="rounded-lg" onClick={() => setEditing(t)}>
                                <Pencil size={14} className="mr-1" /> Edit
                              </Button>
                              <Button
                                size="sm"
                                className="rounded-lg"
                                disabled={busyId === t.id}
                                onClick={() => setActivating(t)}
                              >
                                Activate
                              </Button>
                            </>
                          )}
                          {t.status === 'ACTIVE' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-lg text-rose-600"
                              disabled={busyId === t.id}
                              onClick={() => setRetiring(t)}
                            >
                              Retire
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          )
        })
      )}

      <TemplateDialog
        open={creating || !!editing}
        template={editing}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
        onSaved={() => {
          setCreating(false)
          setEditing(null)
          void refetch()
        }}
      />

      <PreviewDialog template={previewing} agreements={agreements} onClose={() => setPreviewing(null)} />

      <AlertDialog open={!!activating} onOpenChange={(o) => !o && setActivating(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Activate “{activating?.title}” (v{activating?.version})?
            </AlertDialogTitle>
            <AlertDialogDescription>
              It becomes the single ACTIVE version for its kind — the current active version (if any) is
              retired. Existing executions keep their version; new signings use this one from the moment
              it is live.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl" disabled={busyId === activating?.id}>Not yet</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl"
              disabled={busyId === activating?.id}
              onClick={(e) => {
                e.preventDefault()
                if (activating) void act(activating, 'activate')
              }}
            >
              {busyId === activating?.id ? 'Activating…' : 'Activate version'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!retiring} onOpenChange={(o) => !o && setRetiring(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Retire “{retiring?.title}” (v{retiring?.version})?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This leaves <strong>no active template</strong> for its kind — new e-signatures stay closed
              until you activate a version again. Existing executions are unaffected (they keep their own
              version and hash).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl" disabled={busyId === retiring?.id}>Keep it active</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-rose-600 text-white hover:bg-rose-700"
              disabled={busyId === retiring?.id}
              onClick={(e) => {
                e.preventDefault()
                if (retiring) void act(retiring, 'retire')
              }}
            >
              {busyId === retiring?.id ? 'Retiring…' : 'Retire template'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function TemplateDialog({
  open,
  template,
  onClose,
  onSaved,
}: {
  open: boolean
  template: ContractTemplateDTO | null
  onClose: () => void
  onSaved: () => void
}) {
  // Keyed inner form — mounts fresh per template so fields reset without
  // effect-driven setState (React Compiler lint).
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] sm:max-w-2xl">
        {open && (
          <TemplateForm key={template?.id ?? 'new'} template={template} onClose={onClose} onSaved={onSaved} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function TemplateForm({
  template,
  onClose,
  onSaved,
}: {
  template: ContractTemplateDTO | null
  onClose: () => void
  onSaved: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [kind, setKind] = useState<'FINANCING_AGREEMENT' | 'MURABAHA'>(template?.kind ?? 'FINANCING_AGREEMENT')
  const [title, setTitle] = useState(template?.title ?? '')
  const [body, setBody] = useState(template?.body ?? STARTER_BODY)

  const save = async () => {
    setBusy(true)
    const res = template
      ? await apiRequest(`/api/financier/contracts/${template.id}`, {
          method: 'PUT',
          body: JSON.stringify({ title, body }),
        })
      : await apiRequest('/api/financier/contracts', {
          method: 'POST',
          body: JSON.stringify({ kind, title, body }),
        })
    setBusy(false)
    if (!res.ok) return toastApiError(res.error)
    toast({
      title: template ? 'Draft updated' : 'Template drafted',
      description: template ? 'sha256 recomputed for the edited body.' : 'It is a DRAFT — edit freely, then activate it to make it signable.',
    })
    onSaved()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{template ? `Edit draft v${template.version}` : 'New contract template'}</DialogTitle>
        <DialogDescription>
          Placeholders like{' '}
          <span className="font-mono text-[11px]">{'{{amount}}'}</span> fill per agreement at signing.
          Drafts are editable; once ACTIVE the text is frozen (its hash is what buyers sign).
        </DialogDescription>
      </DialogHeader>
        <div className="grid gap-4 py-2">
          {!template && (
            <div className="grid gap-2">
              <Label>Kind</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FINANCING_AGREEMENT">Financing agreement</SelectItem>
                  <SelectItem value="MURABAHA">Murabaha (10.9)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="tpl-title">Title</Label>
            <Input
              id="tpl-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Standard financing agreement — 2026 wording"
            />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="tpl-body">Body</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 rounded-lg text-xs text-muted-foreground">
                    <BadgeCheck size={13} className="mr-1" /> Placeholder cheat-sheet
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80">
                  <p className="mb-2 text-xs font-semibold">Available placeholders</p>
                  <ul className="space-y-1.5">
                    {PLACEHOLDER_CHEATSHEET.map((p) => (
                      <li key={p.token} className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="font-mono text-[11px] text-primary">{p.token}</span>
                        <span className="text-right text-muted-foreground">{p.fills}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 border-t pt-2 text-[11px] text-muted-foreground">
                    Unknown placeholders stay visible in the signed text — check the preview.
                  </p>
                </PopoverContent>
              </Popover>
            </div>
            <Textarea
              id="tpl-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="max-h-80 min-h-56 font-mono text-xs leading-relaxed"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button className="rounded-xl" onClick={() => void save()} disabled={busy}>
            {busy ? 'Saving…' : template ? 'Save draft' : 'Create draft'}
          </Button>
        </DialogFooter>
    </>
  )
}

function PreviewDialog({
  template,
  agreements,
  onClose,
}: {
  template: ContractTemplateDTO | null
  agreements: FinancingAgreementDTO[]
  onClose: () => void
}) {
  const [agreementId, setAgreementId] = useState<string>('raw')
  const agreement = agreements.find((a) => a.id === agreementId) ?? null
  const body =
    template && agreement
      ? renderPreview(template.body, agreement)
      : template?.body ?? ''

  return (
    <Dialog open={!!template} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Preview — {template?.title} <span className="font-mono text-sm">(v{template?.version})</span>
          </DialogTitle>
          <DialogDescription>
            Read-only. Render the placeholders against one of your agreements, or view the raw template.
          </DialogDescription>
        </DialogHeader>
        {agreements.length > 0 && (
          <div className="grid gap-2">
            <Label>Render for agreement</Label>
            <Select value={agreementId} onValueChange={setAgreementId}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Choose an agreement" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value="raw">Raw template (no substitution)</SelectItem>
                {agreements.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.number} · {a.request.applicantName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap rounded-xl border bg-muted/30 p-4 font-mono text-xs leading-relaxed">
          {body || '—'}
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Tab 3 — Executions ledger ──────────────────────────────────────────────

function ExecutionsTab() {
  const { data, loading, error, refetch } = useApi<{ executions: ExecutionLedgerDTO[] }>('/api/financier/esign/executions')
  const [viewing, setViewing] = useState<ExecutionLedgerDTO | null>(null)

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
    )
  }
  if (error) {
    return (
      <EmptyState icon={FileSignature} title="Could not load the executions" description={error}>
        <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
          Retry
        </Button>
      </EmptyState>
    )
  }

  const executions = data?.executions ?? []
  const evidence = viewing?.evidence ?? {}
  const checks = (evidence.checks ?? {}) as Record<string, boolean>

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Every executed agreement with its complete evidence package — applicant binding, document hash,
        consent text, and the step-up MFA verification, exactly as captured at signing.
      </p>

      {executions.length === 0 ? (
        <EmptyState
          icon={FileSignature}
          title="No e-signatures yet"
          description="When a buyer executes their agreement through the financing hub, the signed evidence package lands here."
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-2xl border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agreement</TableHead>
                  <TableHead>Applicant</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Signed at</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead className="text-right">Evidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {executions.map((x) => (
                  <TableRow key={x.id}>
                    <TableCell className="font-mono text-xs font-bold">{x.agreementNumber}</TableCell>
                    <TableCell>
                      <p className="font-medium">{x.applicantName}</p>
                      <p className="text-xs text-muted-foreground">{x.applicantEmail}</p>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs">v{x.template.version}</span>
                      <p className="max-w-56 truncate text-xs text-muted-foreground">{x.template.title}</p>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTime(x.acceptedAt)}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{x.ipAddress ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" className="h-8 rounded-lg" onClick={() => setViewing(x)}>
                        View package
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {executions.map((x) => (
              <Card key={x.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold">{x.agreementNumber}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(x.acceptedAt)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <LabeledValue label="Applicant">{x.applicantName}</LabeledValue>
                    <LabeledValue label="Template">v{x.template.version}</LabeledValue>
                  </div>
                  <div className="flex justify-end pt-1">
                    <Button variant="outline" size="sm" className="rounded-lg" onClick={() => setViewing(x)}>
                      View evidence
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Evidence package — {viewing?.agreementNumber}</DialogTitle>
            <DialogDescription>
              The complete execution record as captured at signing (immutable).
            </DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4 py-1">
              <div className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2">
                <LabeledValue label="Applicant">
                  {viewing.applicantName}
                  <span className="block text-xs text-muted-foreground">{viewing.applicantEmail}</span>
                </LabeledValue>
                <LabeledValue label="Accepted at">{formatDateTime(viewing.acceptedAt)}</LabeledValue>
                <LabeledValue label="Template">
                  v{viewing.template.version} — {viewing.template.title}
                </LabeledValue>
                <LabeledValue label="MFA verified">
                  {viewing.signerMfaVerifiedAt ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 size={13} /> {formatDateTime(viewing.signerMfaVerifiedAt)}
                    </span>
                  ) : (
                    '—'
                  )}
                </LabeledValue>
                <LabeledValue label="IP address">
                  <span className="font-mono text-xs">{viewing.ipAddress ?? '—'}</span>
                </LabeledValue>
                <LabeledValue label="Document sha256">
                  <span className="break-all font-mono text-[11px]">{viewing.documentSha256}</span>
                </LabeledValue>
              </div>

              <div className="space-y-1.5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900 dark:bg-emerald-950/40">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                  Fail-closed checks (all must hold)
                </p>
                {[
                  ['applicantVerified', 'Applicant identity binding'],
                  ['hashVerified', 'Document hash — exact version'],
                  ['consentVerified', 'Explicit consent accepted'],
                  ['mfaVerified', 'Step-up MFA at signing'],
                ].map(([key, label]) => (
                  <p key={key} className="flex items-center gap-2 text-xs">
                    <CheckCircle2
                      size={14}
                      className={cn(checks[key] ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground/40')}
                    />
                    {label}
                    <span className={cn('ml-auto font-mono text-[11px]', checks[key] ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600')}>
                      {String(checks[key])}
                    </span>
                  </p>
                ))}
              </div>

              {typeof evidence.consentText === 'string' && (
                <div className="rounded-xl border p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Consent sentence accepted</p>
                  <p className="mt-1 text-xs italic text-muted-foreground">“{evidence.consentText}”</p>
                </div>
              )}

              <div className="rounded-xl border">
                <p className="border-b px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Full JSON package
                </p>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {JSON.stringify(evidence, null, 2)}
                </pre>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setViewing(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
