'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FINANCIER CONSOLE — shared client types, status palette and small helpers.
// Mirrors the JSON shapes of the /api/financier/* + /api/financing/* routes
// (the server DTOs live in src/server/modules/financing/* and are never
// imported into client code — this file is the client-side contract).
// Badge palette follows admin/shared.tsx (warm theme — no blue/indigo).
// ─────────────────────────────────────────────────────────────────────────────

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  Calendar,
  Hash,
  Layers,
  ListChecks,
  ScrollText,
  Type,
  UserRound,
  FileText,
} from 'lucide-react'

// ═══════════════════════════════════════════════════════════════════════════
// Client-side DTO mirrors
// ═══════════════════════════════════════════════════════════════════════════

export interface FinConditionTemplate {
  id: string
  scope: 'GENERAL' | 'FINANCIER'
  organizationId: string | null
  conditionType:
    | 'DOCUMENT'
    | 'PROFILE_FIELD'
    | 'DECLARATION'
    | 'TEXT'
    | 'NUMBER'
    | 'DATE'
    | 'SELECT'
    | 'MULTI_SELECT'
  code: string | null
  title: string
  description: string | null
  profileFieldKey: string | null
  documentType: string | null
  validationMin: number | null
  validationMax: number | null
  validityMonths: number | null
  isRepeatable: boolean
  isActive: boolean
  options: { id: string; value: string; position: number }[]
  activeRequirementCount: number
}

export interface FinServiceRequirement {
  id: string
  serviceId: string
  conditionTemplateId: string
  isRequired: boolean
  displayOrder: number
  instructions: string | null
  autoPassAccredited: boolean
  isActive: boolean
  template: FinConditionTemplate | null
}

export interface FinService {
  id: string
  name: string
  summary: string | null
  serviceKind: 'FINANCING' | 'ACCREDITATION'
  category: string
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
  targetSegment: string | null
  currency: string
  amountMin: number | null
  amountMax: number | null
  rateType: string | null
  rateMax: number | null
  feeFlat: number | null
  tenorMinMonths: number | null
  tenorMaxMonths: number | null
  processingDays: number | null
  shariaCompliant: boolean
  accreditationValidMonths: number | null
  financierOrgId: string
  financierOrgName: string
  requirementsActive: number
  createdAt: string
}

export interface FinRequest {
  id: string
  number: string
  organizationId: string | null
  serviceId: string
  service: { id: string; name: string; category: string; serviceKind: string; financierOrgId: string; financierOrgName: string } | null
  targetType: string
  targetId: string | null
  multiGroupId: string | null
  activityStatus: string | null
  activityName: string | null
  activityDescription: string | null
  activityStartDate: string | null
  activityCity: string | null
  activityDistrict: string | null
  activityAddress: string | null
  activityLocationType: string | null
  activityCategory: string | null
  activityCategoryOther: string | null
  capitalAmount: number | null
  ownContributionAmount: number | null
  monthlyInstallmentCapacity: number | null
  previousFinancing: boolean | null
  otherIncomeSources: string | null
  amountRequested: number
  currency: string
  purpose: string | null
  tenorRequestedMonths: number | null
  guaranteeType: string | null
  guaranteeTypeOther: string | null
  guaranteeStatus: string | null
  guaranteeStatusOther: string | null
  applicantNotes: string | null
  consentAt: string | null
  platformReviewedAt: string | null
  platformNote: string | null
  returnedAt: string | null
  returnedReason: string | null
  forwardedAt: string | null
  status: string
  expiresAt: string | null
  submittedAt: string | null
  closedAt: string | null
  offerCount: number
  createdAt: string
}

export interface AccreditationRequest {
  id: string
  number: string
  organizationId: string
  organizationName: string | null
  submittedById: string
  serviceId: string
  service: {
    id: string
    name: string
    category: string
    serviceKind: string
    financierOrgId: string
    financierOrgName: string
    accreditationValidMonths: number | null
  } | null
  multiGroupId: string | null
  scopeNotes: string | null
  consentAt: string | null
  platformReviewedAt: string | null
  platformNote: string | null
  returnedAt: string | null
  returnedReason: string | null
  forwardedAt: string | null
  status: string
  submittedAt: string | null
  decidedAt: string | null
  decisionNote: string | null
  accreditedAt: string | null
  validUntil: string | null
  revokedAt: string | null
  revocationReason: string | null
  expiresAt: string | null
  createdAt: string
}

export interface FinOffer {
  id: string
  requestId: string
  requestNumber: string | null
  amount: number
  currency: string
  rateType: string | null
  ratePercent: number | null
  feeFlat: number | null
  tenorMonths: number
  collateralRequired: string | null
  notes: string | null
  validUntil: string | null
  status: string
  sentAt: string | null
  acceptedAt: string | null
  declinedAt: string | null
  withdrawnAt: string | null
  installments: { id: string; installmentNo: number; dueDate: string; amount: number }[]
  createdAt: string
}

export interface FinAgreement {
  id: string
  number: string
  status: string
  fundingStatus: string
  acceptedAt: string
  fundedReportedAt: string | null
  settledReportedAt: string | null
  createdAt: string
  offer: {
    id: string
    amount: number
    currency: string
    rateType: string | null
    ratePercent: number | null
    feeFlat: number | null
    tenorMonths: number
    requestNumber: string | null
    requestId: string | null
    requestAmount: number | null
    organization: boolean
  } | null
  service: string | null
  events: { id: string; type: string; eventDate: string; amount: number | null; note: string | null }[]
  fees: { id: string; type: string; amount: number; status: string }[]
}

export interface FinancierProfileDTO {
  id: string
  organizationId: string
  organizationName: string
  orgType: string
  about: string | null
  licenseNumber: string | null
  regulator: string | null
  contactEmail: string | null
  contactPhone: string | null
  minTicket: number | null
  maxTicket: number | null
  logoMediaId: string | null
  logoUrl: string | null
  branches: { id: string; name: string; kind: string; city: string | null; district: string | null; phone: string | null; isActive: boolean }[]
  updatedAt: string
}

// ═══════════════════════════════════════════════════════════════════════════
// Status palette — ONE map per family, warm theme, consistent across the
// console (mirrors admin/shared.tsx conventions: amber pending, orange
// in-review, emerald positive, rose negative, neutral/stone terminal).
// ═══════════════════════════════════════════════════════════════════════════

type BadgeMap = Record<string, { label: string; badge: string }>

const AMBER = 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
const ORANGE = 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300'
const EMERALD = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
const ROSE = 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
const VIOLET = 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300'
const NEUTRAL = 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
const STONE = 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400'

/** FinancingRequest.status (§5.1) — the financier-visible subset + the rest for reference. */
export const FIN_REQUEST_STATUS_MAP: BadgeMap = {
  DRAFT: { label: 'Draft', badge: NEUTRAL },
  SUBMITTED: { label: 'Submitted', badge: AMBER },
  UNDER_PLATFORM_REVIEW: { label: 'Platform review', badge: AMBER },
  RETURNED_FOR_COMPLETION: { label: 'Returned', badge: ORANGE },
  FORWARDED_TO_FINANCIER: { label: 'Forwarded', badge: ORANGE },
  UNDER_FINANCIER_REVIEW: { label: 'In review', badge: ORANGE },
  OFFERED: { label: 'Offered', badge: VIOLET },
  ACCEPTED: { label: 'Accepted', badge: EMERALD },
  DECLINED: { label: 'Declined', badge: ROSE },
  EXPIRED: { label: 'Expired', badge: STONE },
  CANCELLED: { label: 'Cancelled', badge: NEUTRAL },
}

/** AccreditationRequest.status (§5.2). */
export const ACCREDITATION_STATUS_MAP: BadgeMap = {
  DRAFT: { label: 'Draft', badge: NEUTRAL },
  SUBMITTED: { label: 'Submitted', badge: AMBER },
  UNDER_PLATFORM_REVIEW: { label: 'Platform review', badge: AMBER },
  RETURNED_FOR_COMPLETION: { label: 'Returned', badge: ORANGE },
  FORWARDED_TO_FINANCIER: { label: 'Forwarded', badge: ORANGE },
  UNDER_FINANCIER_REVIEW: { label: 'In review', badge: ORANGE },
  ACCREDITED: { label: 'Accredited', badge: EMERALD },
  REJECTED: { label: 'Rejected', badge: ROSE },
  EXPIRED: { label: 'Expired', badge: STONE },
  REVOKED: { label: 'Revoked', badge: ROSE },
  CANCELLED: { label: 'Cancelled', badge: NEUTRAL },
}

/** FinancingOffer.status. */
export const OFFER_STATUS_MAP: BadgeMap = {
  DRAFT: { label: 'Draft', badge: NEUTRAL },
  SENT: { label: 'Sent', badge: AMBER },
  ACCEPTED: { label: 'Accepted', badge: EMERALD },
  DECLINED: { label: 'Declined', badge: ROSE },
  EXPIRED: { label: 'Expired', badge: STONE },
  WITHDRAWN: { label: 'Withdrawn', badge: NEUTRAL },
}

/** FinancingAgreement.status + fundingStatus. */
export const AGREEMENT_STATUS_MAP: BadgeMap = {
  ACTIVE: { label: 'Active', badge: EMERALD },
  COMPLETED: { label: 'Completed', badge: VIOLET },
  DEFAULTED: { label: 'Defaulted', badge: ROSE },
  CANCELLED: { label: 'Cancelled', badge: NEUTRAL },
}

export const FUNDING_STATUS_MAP: BadgeMap = {
  PENDING: { label: 'Pending', badge: AMBER },
  REPORTED_FUNDED: { label: 'Reported funded', badge: EMERALD },
  REPORTED_SETTLED: { label: 'Reported settled', badge: EMERALD },
}

/** FinancierService.serviceKind + status. */
export const SERVICE_KIND_MAP: BadgeMap = {
  FINANCING: { label: 'Financing', badge: VIOLET },
  ACCREDITATION: { label: 'Accreditation', badge: EMERALD },
}

export const SERVICE_STATUS_MAP: BadgeMap = {
  DRAFT: { label: 'Draft', badge: AMBER },
  ACTIVE: { label: 'Active', badge: EMERALD },
  ARCHIVED: { label: 'Archived', badge: NEUTRAL },
}

/** RequirementSubmission.status (dossier checklist verdicts). */
export const SUBMISSION_STATUS_MAP: BadgeMap = {
  PENDING: { label: 'Pending', badge: NEUTRAL },
  SUBMITTED: { label: 'Submitted', badge: AMBER },
  VERIFIED: { label: 'Verified', badge: EMERALD },
  REJECTED: { label: 'Rejected', badge: ROSE },
  WAIVED: { label: 'Waived', badge: VIOLET },
}

/** Condition scope badge. */
export const CONDITION_SCOPE_MAP: BadgeMap = {
  GENERAL: { label: 'General library', badge: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300' },
  FINANCIER: { label: 'Private', badge: ORANGE },
}

export function StatusBadge({ status, map, className }: { status: string; map: BadgeMap; className?: string }) {
  const entry = map[status]
  return (
    <Badge
      className={cn('shrink-0 rounded-full border-0 text-[11px] font-semibold', entry?.badge ?? 'bg-muted text-muted-foreground', className)}
    >
      {entry?.label ?? status}
    </Badge>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Condition-type visual registry (lucide icon + short label per kind)
// ═══════════════════════════════════════════════════════════════════════════

export const CONDITION_TYPE_META: Record<
  string,
  { icon: typeof FileText; label: string; badge: string }
> = {
  DOCUMENT: { icon: FileText, label: 'Document', badge: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300' },
  PROFILE_FIELD: { icon: UserRound, label: 'Profile field', badge: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300' },
  DECLARATION: { icon: ScrollText, label: 'Declaration', badge: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300' },
  TEXT: { icon: Type, label: 'Text answer', badge: NEUTRAL },
  NUMBER: { icon: Hash, label: 'Number', badge: 'bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-300' },
  DATE: { icon: Calendar, label: 'Date', badge: AMBER },
  SELECT: { icon: ListChecks, label: 'Select', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  MULTI_SELECT: { icon: Layers, label: 'Multi-select', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
}

export function ConditionTypeBadge({ type }: { type: string }) {
  const meta = CONDITION_TYPE_META[type]
  if (!meta) return <Badge variant="secondary" className="rounded-full text-[11px]">{type}</Badge>
  const Icon = meta.icon
  return (
    <Badge className={cn('shrink-0 gap-1 rounded-full border-0 text-[11px] font-semibold', meta.badge)}>
      <Icon size={11} aria-hidden /> {meta.label}
    </Badge>
  )
}

/** Per-kind one-line summary of the template's configuration. */
export function conditionTemplateSummary(t: FinConditionTemplate): string | null {
  const parts: string[] = []
  if (t.documentType) parts.push(String(t.documentType).replaceAll('_', ' ').toLowerCase())
  if (t.profileFieldKey) parts.push(t.profileFieldKey)
  if (t.validationMin !== null || t.validationMax !== null) {
    if (t.validationMin !== null && t.validationMax !== null) parts.push(`between ${t.validationMin} and ${t.validationMax}`)
    else if (t.validationMin !== null) parts.push(`≥ ${t.validationMin}`)
    else parts.push(`≤ ${t.validationMax}`)
  }
  if (t.options.length > 0) parts.push(`${t.options.length} options`)
  if (t.validityMonths) parts.push(`valid ${t.validityMonths} mo`)
  if (t.isRepeatable) parts.push('repeatable')
  return parts.length > 0 ? parts.join(' · ') : null
}

// ═══════════════════════════════════════════════════════════════════════════
// Formatting + misc helpers
// ═══════════════════════════════════════════════════════════════════════════

/** Money for financing amounts (YER etc. — no decimals for zero-decimal currencies). */
export function formatMoney(amount: number | null | undefined, currency = 'YER'): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—'
  const zeroDecimal = currency === 'YER' || currency === 'JPY'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'YER',
    maximumFractionDigits: zeroDecimal ? 0 : 2,
  }).format(amount)
}

/** Human label for an enum-ish string: MURABAHA_ANNUAL → Murabaha annual. */
export function enumLabel(value: string | null | undefined): string {
  if (!value) return '—'
  return value.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
}

/** Validity countdown (live accreditations, offers). */
export function validityLeft(iso?: string | null): { text: string; urgent: boolean; expired: boolean } {
  if (!iso) return { text: '', urgent: false, expired: false }
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return { text: 'Expired', urgent: true, expired: true }
  const days = Math.floor(ms / 86_400_000)
  const months = Math.floor(days / 30)
  const text = days < 31 ? `${days}d left` : months < 24 ? `${months}mo left` : `${Math.floor(days / 365)}y left`
  return { text, urgent: ms < 48 * 3_600_000, expired: false }
}

/** ISO date → yyyy-mm-dd for native date inputs. */
export function isoToDateInput(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** yyyy-mm-dd + optional months → ISO string (grant validUntil helper). */
export function datePlusMonths(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return d.toISOString()
}
