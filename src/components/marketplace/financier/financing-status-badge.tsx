'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FINANCING SHARED PRIMITIVES — status badge system, money + label maps and
// the client-side DTO contracts for the financier console (FIN-5).
//
// The backend unions live in src/server/modules/financing/types.ts; these
// interfaces mirror the JSON the FIN-4 routes actually return (verified
// against the serializers in catalog/offers/requests/conditions/submissions).
// ─────────────────────────────────────────────────────────────────────────────

import type { LucideIcon } from 'lucide-react'
import {
  ArrowRightLeft,
  BadgeCheck,
  Ban,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  HandCoins,
  RotateCcw,
  Search,
  Send,
  ShieldQuestion,
  XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// ═══════════════════════════════════════════════════════════════════════════
// DTO contracts (client mirror of the FIN-4 route responses)
// ═══════════════════════════════════════════════════════════════════════════

export interface FinancierDashboardDTO {
  requests: Record<string, number>
  openRequests: number
  accreditations: Record<string, number>
  liveAccreditations: number
  offersPending: number
  agreements: Record<string, number>
  recentRequests: {
    id: string
    number: string
    status: string
    serviceName: string
    organizationName: string | null
    amountRequested: number
    currency: string
    forwardedAt: string | null
  }[]
  recentAccreditations: {
    id: string
    number: string
    status: string
    serviceName: string
    organizationName: string | null
    forwardedAt: string | null
  }[]
}

export interface ServiceAttributeDTO {
  id: string
  kind: string
  position: number
  text: string
}

export interface FinancierServiceDTO {
  id: string
  serviceKind: string
  category: string
  name: string
  summary: string | null
  description: string | null
  targetSegment: string | null
  status: string
  currency: string
  amountMin: number | null
  amountMax: number | null
  rateType: string | null
  rateMax: number | null
  feeFlat: number | null
  tenorMinMonths: number | null
  tenorMaxMonths: number | null
  repaymentFrequency: string | null
  gracePeriodDays: number | null
  shariaCompliant: boolean
  processingDays: number | null
  accreditationValidMonths: number | null
  accreditationFeeAmount: number | null
  viewCount: number
  attributes: ServiceAttributeDTO[]
  coverage: { id: string; regionName: string }[]
  requirementCount: number
  requestCount: number
  createdAt: string
  updatedAt: string
}

export interface ConditionTemplateDTO {
  id: string
  scope: string
  organizationId: string | null
  conditionType: string
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
  attachmentCount: number
  createdAt: string
  updatedAt: string
}

export interface ServiceRequirementDTO {
  id: string
  serviceId: string
  conditionTemplateId: string
  isRequired: boolean
  displayOrder: number
  instructions: string | null
  autoPassAccredited: boolean
  isActive: boolean
  template: {
    id: string
    scope: string
    conditionType: string
    title: string
    description: string | null
    profileFieldKey: string | null
    documentType: string | null
    validationMin: number | null
    validationMax: number | null
    validityMonths: number | null
    isRepeatable: boolean
    options: { id: string; value: string; position: number }[]
  }
}

export interface FinancierRequestListItemDTO {
  id: string
  number: string
  status: string
  serviceName: string
  organizationName: string | null
  requesterName: string
  amountRequested: number
  currency: string
  tenorRequestedMonths: number | null
  activityCity: string | null
  activityCategory: string | null
  purpose: string | null
  forwardedAt: string | null
  submittedAt: string | null
  expiresAt: string | null
  createdAt: string
  submissionCounts: Record<string, number>
  offerCount: number
}

export interface SubmissionDTO {
  id: string
  serviceRequirementId: string
  status: string
  isRequired: boolean
  displayOrder: number
  instructions: string | null
  autoPassAccredited: boolean
  valueText: string | null
  valueNumber: number | null
  valueDate: string | null
  accountDocumentId: string | null
  submittedAt: string | null
  verifiedAt: string | null
  verifiedById: string | null
  decisionNote: string | null
  template: {
    id: string
    scope: string
    conditionType: string
    title: string
    description: string | null
    documentType: string | null
    profileFieldKey: string | null
    validationMin: number | null
    validationMax: number | null
    validityMonths: number | null
    isRepeatable: boolean
    options: { id: string; value: string; position: number }[]
  }
}

export interface OfferDTO {
  id: string
  requestId: string
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
  createdAt: string
  createdBy: { id: string; name: string }
  installments: { id: string; installmentNo: number; dueDate: string; amount: number }[]
}

export interface FinancierRequestDetailDTO {
  id: string
  number: string
  status: string
  amountRequested: number
  currency: string
  purpose: string | null
  activity: Record<string, string | number | null>
  underwriting: Record<string, string | number | boolean | null>
  guarantee: Record<string, string | null>
  submissions: SubmissionDTO[]
  offers: OfferDTO[]
  request: {
    targetType: string
    targetId: string | null
    applicantNotes: string | null
    organization: Record<string, string | null> | null
    requester: Record<string, string | null>
    forwardedAt: string | null
  }
}

export interface FinancierAccreditationDTO {
  id: string
  number: string
  status: string
  serviceId: string
  serviceName: string
  organizationId: string
  organizationName: string | null
  submittedBy: { id: string; name: string; email: string } | null
  scopeNotes: string | null
  submittedAt: string | null
  forwardedAt: string | null
  decidedAt: string | null
  decisionNote: string | null
  accreditedAt: string | null
  validUntil: string | null
  revokedAt: string | null
  revocationReason: string | null
  createdAt: string
  submissionCounts: Record<string, number>
}

export interface FinancierAgreementDTO {
  id: string
  number: string
  fundingStatus: string
  status: string
  acceptedAt: string
  fundedReportedAt: string | null
  settledReportedAt: string | null
  createdAt: string
  events: { id: string; type: string; eventDate: string; amount: number | null; note: string | null }[]
  fees: { id: string; type: string; baseAmount: number; percentApplied: number; amount: number; status: string; createdAt: string }[]
  offer: OfferDTO
  applicant: { organizationName: string | null; requesterName: string; requesterEmail: string } | null
  serviceName: string
}

export interface FinancierProfileDTO {
  id: string
  about: string | null
  licenseNumber: string | null
  regulator: string | null
  logoUrl: string | null
  contactEmail: string | null
  contactPhone: string | null
  minTicket: number | null
  maxTicket: number | null
  organization: { id: string; name: string; orgType: string; status: string }
  branchCount: number
  serviceCount: number
}

export interface FinancierBranchDTO {
  id: string
  name: string
  kind: string
  street: string | null
  city: string | null
  district: string | null
  latitude: number | null
  longitude: number | null
  phone: string | null
  isActive: boolean
  position: number
  createdAt: string
}

// ═══════════════════════════════════════════════════════════════════════════
// Money & labels
// ═══════════════════════════════════════════════════════════════════════════

/** Currency-aware money — YER is the domain default (whole rials, no cents). */
export function formatMoney(amount: number | null | undefined, currency = 'YER'): string {
  if (amount == null || Number.isNaN(amount)) return '—'
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency: currency || 'YER',
    maximumFractionDigits: 0,
  }).format(amount)
}

const CATEGORY_LABELS: Record<string, string> = {
  WORKING_CAPITAL: 'Working capital',
  INVOICE_FINANCING: 'Invoice financing',
  PO_FINANCING: 'Purchase order financing',
  EQUIPMENT: 'Equipment',
  VEHICLE: 'Vehicle',
  HOME: 'Home',
  EDUCATION: 'Education',
  AGRICULTURE: 'Agriculture',
  MICROENTERPRISE: 'Micro-enterprise',
  SME: 'SME',
  OTHER: 'Other',
  SUPPLIER_QUALIFICATION: 'Supplier qualification',
  VENDOR_APPROVAL: 'Vendor approval',
}

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category
}

const RATE_TYPE_LABELS: Record<string, string> = {
  MURABAHA_ANNUAL: 'Murabaha (annual)',
  FIXED_ANNUAL: 'Fixed (annual)',
  FLAT_FEE: 'Flat fee',
}

export function rateTypeLabel(rateType: string | null): string | null {
  if (!rateType) return null
  return RATE_TYPE_LABELS[rateType] ?? rateType
}

const DOC_TYPE_LABELS: Record<string, string> = {
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

export function documentTypeLabel(documentType: string | null): string | null {
  if (!documentType) return null
  return DOC_TYPE_LABELS[documentType] ?? documentType
}

const COLLATERAL_LABELS: Record<string, string> = {
  PERSONAL_GUARANTEE: 'Personal guarantee',
  BANK_GUARANTEE: 'Bank guarantee',
  GOLD: 'Gold',
  COMMERCIAL: 'Commercial',
  MORTGAGE: 'Mortgage',
  CONVERTIBLE_SECURITIES: 'Convertible securities',
  SELF_GUARANTEE: 'Self guarantee',
  OTHER: 'Other',
}

export function collateralLabel(collateral: string | null): string | null {
  if (!collateral) return null
  return COLLATERAL_LABELS[collateral] ?? collateral
}

const CONDITION_TYPE_LABELS: Record<string, string> = {
  DOCUMENT: 'Document',
  PROFILE_FIELD: 'Profile field',
  DECLARATION: 'Declaration',
  TEXT: 'Text',
  NUMBER: 'Number',
  DATE: 'Date',
  SELECT: 'Select',
  MULTI_SELECT: 'Multi-select',
}

export function conditionTypeLabel(conditionType: string): string {
  return CONDITION_TYPE_LABELS[conditionType] ?? conditionType
}

const FREQUENCY_LABELS: Record<string, string> = {
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  LUMP_SUM: 'Lump sum',
}

export function frequencyLabel(frequency: string | null): string | null {
  if (!frequency) return null
  return FREQUENCY_LABELS[frequency] ?? frequency
}

// ═══════════════════════════════════════════════════════════════════════════
// Status badge system — one map for every financing-domain status family
// (warm palette, no blue/indigo; mirrors the admin/shared StatusBadge look)
// ═══════════════════════════════════════════════════════════════════════════

export interface StatusStyle {
  label: string
  badge: string
  icon?: LucideIcon
}

/** FinancingRequest + AccreditationRequest statuses (shared prefix states).
 *  Visual hierarchy: solid fills for active work, outline-only for the
 *  idle/terminal end states (draft, cancelled, declined, rejected, expired). */
export const REQUEST_STATUS_MAP: Record<string, StatusStyle> = {
  DRAFT: {
    label: 'Draft',
    badge: 'border border-border bg-transparent text-muted-foreground',
  },
  SUBMITTED: { label: 'Submitted', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300', icon: Clock },
  UNDER_PLATFORM_REVIEW: { label: 'Platform review', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300', icon: Eye },
  RETURNED_FOR_COMPLETION: {
    label: 'Returned',
    badge: 'border border-amber-300 bg-transparent text-amber-800 dark:border-amber-900 dark:text-amber-300',
    icon: RotateCcw,
  },
  FORWARDED_TO_FINANCIER: { label: 'Forwarded', badge: 'border bg-background text-foreground', icon: ArrowRightLeft },
  UNDER_FINANCIER_REVIEW: { label: 'Under review', badge: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300', icon: Search },
  OFFERED: { label: 'Offered', badge: 'bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-300', icon: HandCoins },
  ACCEPTED: { label: 'Accepted', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300', icon: CheckCircle2 },
  ACCREDITED: { label: 'Accredited', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300', icon: BadgeCheck },
  DECLINED: {
    label: 'Declined',
    badge: 'border border-rose-200 bg-transparent text-rose-700 dark:border-rose-900 dark:text-rose-300',
    icon: XCircle,
  },
  REJECTED: {
    label: 'Rejected',
    badge: 'border border-rose-200 bg-transparent text-rose-700 dark:border-rose-900 dark:text-rose-300',
    icon: XCircle,
  },
  EXPIRED: {
    label: 'Expired',
    badge: 'border bg-transparent text-muted-foreground',
    icon: Clock,
  },
  CANCELLED: {
    label: 'Cancelled',
    badge: 'border border-border bg-transparent text-muted-foreground',
  },
  REVOKED: { label: 'Revoked', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300', icon: Ban },
}

/** FinancingOffer statuses. */
export const OFFER_STATUS_MAP: Record<string, StatusStyle> = {
  DRAFT: {
    label: 'Draft',
    badge: 'border border-border bg-transparent text-muted-foreground',
  },
  SENT: { label: 'Sent', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300', icon: Send },
  ACCEPTED: { label: 'Accepted', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300', icon: CheckCircle2 },
  DECLINED: {
    label: 'Declined',
    badge: 'border border-rose-200 bg-transparent text-rose-700 dark:border-rose-900 dark:text-rose-300',
    icon: XCircle,
  },
  EXPIRED: { label: 'Expired', badge: 'border bg-transparent text-muted-foreground', icon: Clock },
  WITHDRAWN: {
    label: 'Withdrawn',
    badge: 'border border-border bg-transparent text-muted-foreground',
  },
}

/** RequirementSubmission verdicts (the gate's checklist rows). */
export const SUBMISSION_STATUS_MAP: Record<string, StatusStyle> = {
  PENDING: { label: 'Pending', badge: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400', icon: Clock },
  SUBMITTED: { label: 'Submitted', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  VERIFIED: { label: 'Verified', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300', icon: Check },
  REJECTED: {
    label: 'Rejected',
    badge: 'border border-rose-200 bg-transparent text-rose-700 dark:border-rose-900 dark:text-rose-300',
    icon: XCircle,
  },
  WAIVED: {
    label: 'Waived',
    badge: 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400',
    icon: ShieldQuestion,
  },
}

/** FinancingAgreement status + fundingStatus. */
export const AGREEMENT_STATUS_MAP: Record<string, StatusStyle> = {
  ACTIVE: { label: 'Active', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  COMPLETED: { label: 'Completed', badge: 'bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-300' },
  DEFAULTED: {
    label: 'Defaulted',
    badge: 'border border-rose-200 bg-transparent text-rose-700 dark:border-rose-900 dark:text-rose-300',
  },
  CANCELLED: {
    label: 'Cancelled',
    badge: 'border border-border bg-transparent text-muted-foreground',
  },
}

export const FUNDING_STATUS_MAP: Record<string, StatusStyle> = {
  PENDING: { label: 'Pending funds', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  REPORTED_FUNDED: { label: 'Funded', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  REPORTED_SETTLED: { label: 'Settled', badge: 'bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-300' },
}

/** FinancingFee statuses. */
export const FEE_STATUS_MAP: Record<string, StatusStyle> = {
  ACCRUED: { label: 'Accrued', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  INVOICED: { label: 'Invoiced', badge: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300' },
  PAID: { label: 'Paid', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300', icon: Check },
  WAIVED: {
    label: 'Waived',
    badge: 'border border-border bg-transparent text-muted-foreground',
  },
}

/** FinancierService status. */
export const SERVICE_STATUS_MAP: Record<string, StatusStyle> = {
  DRAFT: {
    label: 'Draft',
    badge: 'border border-border bg-transparent text-muted-foreground',
  },
  ACTIVE: { label: 'Active', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  ARCHIVED: {
    label: 'Archived',
    badge: 'border border-border bg-transparent text-muted-foreground',
  },
}

/** The universal badge — pass any status string; unknown falls back to muted. */
export function FinancingStatusBadge({
  status,
  map = REQUEST_STATUS_MAP,
  className,
}: {
  status: string
  map?: Record<string, StatusStyle>
  className?: string
}) {
  const entry = map[status]
  const Icon = entry?.icon
  return (
    <Badge
      className={cn(
        'shrink-0 gap-1 rounded-full border-0 px-2 text-[11px] font-semibold',
        entry?.badge ?? 'bg-muted text-muted-foreground',
        className
      )}
    >
      {Icon && <Icon size={11} className="shrink-0" aria-hidden />}
      {entry?.label ?? status}
    </Badge>
  )
}
