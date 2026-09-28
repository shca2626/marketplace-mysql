'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FINANCING SHARED KIT — status palettes, labels, formatters and small atoms
// shared by the financier console (FIN-5), applicant surfaces (FIN-6) and the
// admin financing tab (FIN-7). Visual language mirrors admin/shared.tsx and
// b2b/b2b-shared.tsx (warm stone/burnt-orange theme — NO blue/indigo).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { toast } from '@/hooks/use-toast'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// ── API mutation helper (same contract as admin/shared + b2b-shared) ────────

export async function apiRequest<T = unknown>(
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    // FormData bodies set their own multipart boundary — never force JSON there.
    const isForm = typeof FormData !== 'undefined' && init?.body instanceof FormData
    const res = await fetch(url, {
      ...init,
      headers: init?.body && !isForm
        ? { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }
        : init?.headers,
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      return { ok: false, error: (json.error as string) ?? `Request failed (${res.status})` }
    }
    return { ok: true, data: json as T }
  } catch {
    return { ok: false, error: 'Network error — please try again' }
  }
}

/** Toast shorthand for failed mutations. */
export function toastApiError(error: string | undefined, title = 'Something went wrong') {
  toast({ title, description: error ?? 'Unexpected error', variant: 'destructive' })
}

// ── Status palettes (semantic: emerald=ok · amber=pending · rose=bad · stone=neutral) ──

type BadgeMap = Record<string, { label: string; badge: string }>

export const FIN_REQUEST_STATUS_MAP: BadgeMap = {
  DRAFT: { label: 'Draft', badge: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
  SUBMITTED: { label: 'Submitted', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  UNDER_PLATFORM_REVIEW: { label: 'Platform review', badge: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300' },
  RETURNED_FOR_COMPLETION: { label: 'Returned', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
  FORWARDED_TO_FINANCIER: { label: 'Forwarded', badge: 'bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-300' },
  UNDER_FINANCIER_REVIEW: { label: 'Financier review', badge: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300' },
  OFFERED: { label: 'Offered', badge: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300' },
  ACCEPTED: { label: 'Accepted', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  DECLINED: { label: 'Declined', badge: 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400' },
  CANCELLED: { label: 'Cancelled', badge: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
  EXPIRED: { label: 'Expired', badge: 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400' },
}

export const ACC_STATUS_MAP: BadgeMap = {
  DRAFT: { label: 'Draft', badge: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
  SUBMITTED: { label: 'Submitted', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  UNDER_PLATFORM_REVIEW: { label: 'Platform review', badge: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300' },
  RETURNED_FOR_COMPLETION: { label: 'Returned', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
  FORWARDED_TO_FINANCIER: { label: 'Forwarded', badge: 'bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-300' },
  UNDER_FINANCIER_REVIEW: { label: 'Financier review', badge: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300' },
  ACCREDITED: { label: 'Accredited', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  REJECTED: { label: 'Rejected', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
  REVOKED: { label: 'Revoked', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
  CANCELLED: { label: 'Cancelled', badge: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
  EXPIRED: { label: 'Expired', badge: 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400' },
}

export const OFFER_STATUS_MAP: BadgeMap = {
  DRAFT: { label: 'Draft', badge: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
  SENT: { label: 'Sent', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  ACCEPTED: { label: 'Accepted', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  DECLINED: { label: 'Declined', badge: 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400' },
  WITHDRAWN: { label: 'Withdrawn', badge: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
  EXPIRED: { label: 'Expired', badge: 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400' },
}

export const SUBMISSION_STATUS_MAP: BadgeMap = {
  PENDING: { label: 'Pending', badge: 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400' },
  SUBMITTED: { label: 'Submitted', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  VERIFIED: { label: 'Verified', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  REJECTED: { label: 'Rejected', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
  WAIVED: { label: 'Waived', badge: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300' },
}

export const DOC_STATUS_MAP: BadgeMap = {
  PENDING: { label: 'Pending', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  VERIFIED: { label: 'Verified', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  REJECTED: { label: 'Rejected', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
}

export const SERVICE_STATUS_MAP: BadgeMap = {
  DRAFT: { label: 'Draft', badge: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
  ACTIVE: { label: 'Active', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  ARCHIVED: { label: 'Archived', badge: 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400' },
}

export const FUNDING_STATUS_MAP: BadgeMap = {
  PENDING: { label: 'Pending funding', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  REPORTED_FUNDED: { label: 'Funded', badge: 'bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-300' },
  REPORTED_SETTLED: { label: 'Settled', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
}

export const AGREEMENT_STATUS_MAP: BadgeMap = {
  ACTIVE: { label: 'Active', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  COMPLETED: { label: 'Completed', badge: 'bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-300' },
  DEFAULTED: { label: 'Defaulted', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
  CANCELLED: { label: 'Cancelled', badge: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
}

export const FEE_STATUS_MAP: BadgeMap = {
  ACCRUED: { label: 'Accrued', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  INVOICED: { label: 'Invoiced', badge: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300' },
  PAID: { label: 'Paid', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  WAIVED: { label: 'Waived', badge: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300' },
}

export const SERVICE_KIND_MAP: BadgeMap = {
  FINANCING: { label: 'Financing', badge: 'bg-primary/15 text-primary' },
  ACCREDITATION: { label: 'Accreditation', badge: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300' },
}

export const ORG_TYPE_MAP: BadgeMap = {
  BANK: { label: 'Bank', badge: 'bg-primary/15 text-primary' },
  MFI: { label: 'Microfinance', badge: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300' },
  EWALLET: { label: 'E-wallet', badge: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300' },
}

export function StatusBadge({
  status,
  map,
  className,
}: {
  status: string
  map: BadgeMap
  className?: string
}) {
  const entry = map[status]
  return (
    <Badge
      className={cn(
        'shrink-0 rounded-full border-0 text-[11px] font-semibold',
        entry?.badge ?? 'bg-muted text-muted-foreground',
        className
      )}
    >
      {entry?.label ?? status}
    </Badge>
  )
}

// ── Closed value-set labels ─────────────────────────────────────────────────

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  NATIONAL_ID: 'National ID',
  PASSPORT: 'Passport',
  RESIDENCE_PERMIT: 'Residence permit',
  COMMERCIAL_REG: 'Commercial registration',
  TAX_CARD: 'Tax card',
  BUSINESS_LICENSE: 'Business license',
  BANK_STATEMENT: 'Bank statement',
  FINANCIAL_STATEMENT: 'Financial statement',
  PROOF_OF_ADDRESS: 'Proof of address',
  GUARANTEE_DOC: 'Guarantee document',
  FEASIBILITY_STUDY: 'Feasibility study',
  INVOICE: 'Invoice',
  PURCHASE_ORDER: 'Purchase order',
  PROJECT_FILE: 'Project file',
  OTHER: 'Other',
}

export const CONDITION_TYPE_LABELS: Record<string, string> = {
  DOCUMENT: 'Document',
  PROFILE_FIELD: 'Profile field',
  DECLARATION: 'Declaration',
  TEXT: 'Text answer',
  NUMBER: 'Number',
  DATE: 'Date',
  SELECT: 'Choice',
  MULTI_SELECT: 'Multi choice',
}

export const PROFILE_FIELD_LABELS: Record<string, string> = {
  'user.phone': 'Phone number',
  'user.identityNumber': 'Identity number',
  'user.dateOfBirth': 'Date of birth',
  'org.taxId': 'Company tax ID',
  'org.registrationNumber': 'Company registration no.',
  'org.industry': 'Company industry',
}

export const FINANCING_CATEGORY_LABELS: Record<string, string> = {
  WORKING_CAPITAL: 'Working capital',
  INVOICE_FINANCING: 'Invoice financing',
  PO_FINANCING: 'Purchase-order financing',
  EQUIPMENT: 'Equipment',
  VEHICLE: 'Vehicle',
  HOME: 'Home',
  EDUCATION: 'Education',
  AGRICULTURE: 'Agriculture',
  MICROENTERPRISE: 'Microenterprise',
  SME: 'SME lending',
  OTHER: 'Other',
}

export const ACCREDITATION_CATEGORY_LABELS: Record<string, string> = {
  SUPPLIER_QUALIFICATION: 'Supplier qualification',
  VENDOR_APPROVAL: 'Vendor approval',
}

export const RATE_TYPE_LABELS: Record<string, string> = {
  MURABAHA_ANNUAL: 'Murabaha (annual)',
  FIXED_ANNUAL: 'Fixed (annual)',
  FLAT_FEE: 'Flat fee',
}

export const FREQUENCY_LABELS: Record<string, string> = {
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  LUMP_SUM: 'Lump sum',
}

// ── Formatters ──────────────────────────────────────────────────────────────

/** Money with grouped digits + currency code (server sends plain numbers). */
export function formatMoney(amount: number | null | undefined, currency = 'YER'): string {
  if (amount == null || Number.isNaN(amount)) return '—'
  const value = amount.toLocaleString('en-US')
  return `${value} ${currency}`
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms)) return '—'
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 31) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

// ── Small atoms ─────────────────────────────────────────────────────────────

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  title: string
  description?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-12 text-center">
      <Icon size={34} className="text-muted-foreground/40" />
      <p className="mt-3 text-sm font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}

/** Labeled key/value block used in dossiers and detail pages. */
export function LabeledValue({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  )
}

/** Condition-type chip (compact, for checklists + composer rows). */
export function ConditionTypeBadge({ type }: { type: string }) {
  return (
    <Badge variant="outline" className="shrink-0 rounded-full text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {CONDITION_TYPE_LABELS[type] ?? type}
    </Badge>
  )
}

/** Scope chip: GENERAL (platform library) vs PRIVATE (financier-owned). */
export function ScopeBadge({ scope }: { scope: string }) {
  return scope === 'GENERAL' ? (
    <Badge variant="outline" className="shrink-0 rounded-full text-[10px] font-semibold text-muted-foreground">
      General
    </Badge>
  ) : (
    <Badge className="shrink-0 rounded-full border-0 bg-orange-100 text-[10px] font-semibold text-orange-800 dark:bg-orange-950 dark:text-orange-300">
      Private
    </Badge>
  )
}

// ── Debounce hook (same cadence as the header search) ──────────────────────

export function useDebounced<T>(value: T, ms = 220): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

// ── Gate status meter (N of M required verified) ───────────────────────────

export function GateMeter({
  verified,
  waived,
  totalRequired,
  className,
}: {
  verified: number
  waived: number
  totalRequired: number
  className?: string
}) {
  const done = verified + waived
  const pct = totalRequired > 0 ? Math.min(100, Math.round((done / totalRequired) * 100)) : 100
  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-muted-foreground">Gate completeness</span>
        <span className="font-semibold">
          {done} of {totalRequired} required
          {waived > 0 && <span className="text-muted-foreground"> ({waived} waived)</span>}
        </span>
      </div>
      <div
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Gate completeness"
      >
        <div
          className={cn(
            'h-full rounded-full transition-all',
            pct === 100 ? 'bg-emerald-500' : pct > 50 ? 'bg-primary' : 'bg-amber-500'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ── Date input helper ───────────────────────────────────────────────────────

/** ISO date → yyyy-mm-dd for <input type="date">. */
export function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// ── FIN-6: applicant-surface label sets + atoms ────────────────────────────

export const ACTIVITY_STATUS_LABELS: Record<string, string> = {
  NEW: 'New activity',
  EXISTING: 'Existing activity',
}

export const ACTIVITY_CATEGORY_LABELS: Record<string, string> = {
  PROJECT: 'Project',
  RURAL_DEVELOPMENT: 'Rural development',
  GREEN_ENERGY: 'Green energy',
  HOUSING: 'Housing',
  FISHERIES: 'Fisheries',
  AGRICULTURE: 'Agriculture',
  TRADE: 'Trade & retail',
  SERVICES: 'Services',
  MANUFACTURING: 'Manufacturing',
  TRANSPORT: 'Transport',
  TECHNOLOGY: 'Technology',
  OTHER: 'Other',
}

export const LOCATION_TYPE_LABELS: Record<string, string> = {
  OWNED: 'Owned',
  RENTED: 'Rented',
}

export const GUARANTEE_TYPE_LABELS: Record<string, string> = {
  PERSONAL_GUARANTEE: 'Personal guarantee',
  BANK_GUARANTEE: 'Bank guarantee',
  GOLD: 'Gold',
  COMMERCIAL: 'Commercial collateral',
  MORTGAGE: 'Mortgage',
  CONVERTIBLE_SECURITIES: 'Convertible securities',
  SELF_GUARANTEE: 'Self guarantee',
  OTHER: 'Other',
}

export const GUARANTEE_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'Available',
  PARTIALLY_AVAILABLE: 'Partially available',
  UNAVAILABLE: 'Unavailable',
  OTHER: 'Other',
}

export const GENDER_LABELS: Record<string, string> = {
  MALE: 'Male',
  FEMALE: 'Female',
  OTHER: 'Other',
}

export const MARITAL_STATUS_LABELS: Record<string, string> = {
  SINGLE: 'Single',
  MARRIED: 'Married',
  DIVORCED: 'Divorced',
  WIDOWED: 'Widowed',
}

export const IDENTITY_TYPE_LABELS: Record<string, string> = {
  NATIONAL_ID: 'National ID',
  PASSPORT: 'Passport',
  RESIDENCE_PERMIT: 'Residence permit',
  OTHER: 'Other',
}

/** Read a closed-set PROFILE_FIELD key off the applicant user / org facts. */
export function readProfileField(
  key: string,
  applicant: { phone?: string | null; identityNumber?: string | null; dateOfBirth?: string | null } | null | undefined,
  org?: { taxId?: string | null; registrationNumber?: string | null; industry?: string | null } | null
): string | null {
  switch (key) {
    case 'user.phone':
      return applicant?.phone ?? null
    case 'user.identityNumber':
      return applicant?.identityNumber ?? null
    case 'user.dateOfBirth':
      return applicant?.dateOfBirth ? isoToDateInput(applicant.dateOfBirth) : null
    case 'org.taxId':
      return org?.taxId ?? null
    case 'org.registrationNumber':
      return org?.registrationNumber ?? null
    case 'org.industry':
      return org?.industry ?? null
    default:
      return null
  }
}

/**
 * Status stepper (W-WIZ/W-MY-REQ/W-ACCRED-STATUS) — horizontal checkpoint
 * timeline with the reached index filled and the current step highlighted.
 */
export function StatusStepper({
  steps,
  current,
  className,
}: {
  steps: { key: string; label: string }[]
  current: number
  className?: string
}) {
  return (
    <ol className={cn('flex w-full min-w-0 flex-wrap items-center gap-y-2', className)} aria-label="Status timeline">
      {steps.map((s, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={s.key} className="flex min-w-0 flex-1 items-center gap-2">
            <span
              aria-current={active ? 'step' : undefined}
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold',
                done && 'border-emerald-500 bg-emerald-500 text-white',
                active && 'border-primary bg-primary text-primary-foreground',
                !done && !active && 'border-muted-foreground/30 text-muted-foreground/50'
              )}
            >
              {done ? '✓' : i + 1}
            </span>
            <span
              className={cn(
                'truncate text-[11px] font-semibold',
                active ? 'text-foreground' : done ? 'text-foreground/70' : 'text-muted-foreground/60'
              )}
              title={s.label}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && <span className="mx-1 hidden h-px min-w-3 flex-1 bg-muted sm:block" />}
          </li>
        )
      })}
    </ol>
  )
}

/** Expiry countdown chip — “expires in 5d” (amber) / “expired” (rose). */
export function ExpiryChip({ expiresAt, prefix = 'Expires' }: { expiresAt: string | null | undefined; prefix?: string }) {
  if (!expiresAt) return null
  const ms = new Date(expiresAt).getTime() - Date.now()
  const days = Math.ceil(ms / 86_400_000)
  if (days > 30) return null
  if (ms <= 0) {
    return (
      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10.5px] font-semibold text-rose-800 dark:bg-rose-950 dark:text-rose-300">
        Expired
      </span>
    )
  }
  return (
    <span
      className="rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300"
      title={formatDate(expiresAt)}
    >
      {prefix} in {days}d
    </span>
  )
}
