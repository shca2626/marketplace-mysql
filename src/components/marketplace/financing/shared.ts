// ─────────────────────────────────────────────────────────────────────────────
// APPLICANT FINANCING — shared client contracts (FIN-6)
//
// These interfaces mirror the JSON the FIN-4 applicant-facing routes actually
// return (verified against the serializers in catalog/requests/accreditation/
// documents + live API responses). The badge system, money formatting and label
// maps are REUSED from the financier console primitives (financing-status-badge)
// so both sides of the domain render identically.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  OfferDTO,
  SubmissionDTO,
} from '@/components/marketplace/financier/financing-status-badge'

export type { OfferDTO, SubmissionDTO }

// ═══════════════════════════════════════════════════════════════════════════
// Public services directory — GET /api/financing/services(+/[id])
// ═════════════════════════════════════════════════════════════════════════

export interface PublicServiceCardDTO {
  id: string
  serviceKind: string // FINANCING | ACCREDITATION
  category: string
  name: string
  summary: string | null
  targetSegment: string | null
  currency: string
  amountMin: number | null
  amountMax: number | null
  rateType: string | null
  rateMax: number | null
  feeFlat: number | null
  tenorMinMonths: number | null
  tenorMaxMonths: number | null
  shariaCompliant: boolean
  processingDays: number | null
  accreditationValidMonths: number | null
  accreditationFeeAmount: number | null
  features: string[]
  eligibility: string[]
  coverageCount: number
  coverageSample: string[]
  financier: { name: string; logoUrl: string | null; regulator: string | null }
}

/** Labels-only requirement (no internal template/scope data — FIN-4 contract). */
export interface PublicRequirementDTO {
  id: string // the ServiceRequirement id — submissions key back to it
  conditionType: string
  title: string
  description: string | null
  isRequired: boolean
  instructions: string | null
  documentType: string | null
  profileFieldKey: string | null
  validationMin: number | null
  validationMax: number | null
  validityMonths: number | null
  isRepeatable: boolean
  autoPassAccredited: boolean
  displayOrder: number
  options: { value: string; position: number }[]
}

export interface PublicServiceDetailDTO extends PublicServiceCardDTO {
  description: string | null
  coverage: string[]
  requirements: PublicRequirementDTO[]
}

export interface ServicesDirectoryResponse {
  services: PublicServiceCardDTO[]
  total: number
  page: number
  pageCount: number
  pageSize: number
}

// ═══════════════════════════════════════════════════════════════════════════
// My requests — GET /api/financing/requests(+/[id])
// ═════════════════════════════════════════════════════════════════════════

export interface SiblingSummaryDTO {
  id: string
  number: string
  status: string
  serviceName: string
  amountRequested: number
}

export interface MyRequestListItemDTO {
  id: string
  number: string
  status: string
  serviceId: string
  serviceName: string
  serviceCategory: string
  financierName: string | null
  organizationId: string | null
  organizationName: string | null
  createdById: string
  targetType: string
  targetId: string | null
  multiGroupId: string | null
  amountRequested: number
  currency: string
  tenorRequestedMonths: number | null
  activityCity: string | null
  activityCategory: string | null
  guaranteeType: string | null
  submittedAt: string | null
  forwardedAt: string | null
  returnedAt: string | null
  returnedReason: string | null
  expiresAt: string | null
  closedAt: string | null
  createdAt: string
  updatedAt: string
  submissionCounts: Record<string, number>
  siblings: SiblingSummaryDTO[]
}

export interface MyRequestDetailDTO extends MyRequestListItemDTO {
  activity: Record<string, string | number | null>
  underwriting: Record<string, string | number | boolean | null>
  purpose: string | null
  applicantNotes: string | null
  consentAt: string | null
  gate: {
    platformReviewedById: string | null
    platformReviewedAt: string | null
    platformNote: string | null
    returnedAt: string | null
    returnedReason: string | null
    forwardedAt: string | null
  }
  submissions: SubmissionDTO[]
  offers: (OfferDTO & {
    agreement: {
      id: string
      number: string
      status: string
      fundingStatus: string
    } | null
  })[]
}

// ═══════════════════════════════════════════════════════════════════════════
// Accreditations — GET /api/accreditation/requests(+/[id], /valid)
// ═════════════════════════════════════════════════════════════════════════

export interface MyAccreditationDTO {
  id: string
  number: string
  status: string
  serviceId: string
  serviceName: string
  financierName: string | null
  organizationId: string
  organizationName: string | null
  submittedById: string
  multiGroupId: string | null
  scopeNotes: string | null
  consentAt: string | null
  submittedAt: string | null
  decidedAt: string | null
  decisionNote: string | null
  accreditedAt: string | null
  validUntil: string | null
  revokedAt: string | null
  revocationReason: string | null
  expiresAt: string | null
  returnedReason: string | null
  forwardedAt: string | null
  createdAt: string
  submissionCounts: Record<string, number>
  siblings: SiblingSummaryDTO[]
}

export interface MyAccreditationDetailDTO extends MyAccreditationDTO {
  submissions: SubmissionDTO[]
}

// ═════════════════════════════════════════════════════════════════════════
// Documents vault — GET/POST /api/documents, PATCH /api/documents/[id]
// ═════════════════════════════════════════════════════════════════════════

export interface VaultMediaDTO {
  id: string
  originalName: string
  url: string
  urls: { thumb: string; medium: string; large: string; full: string }
}

export interface AccountDocumentDTO {
  id: string
  documentType: string
  title: string | null
  organizationId: string | null
  organizationName: string | null
  status: string // PENDING | VERIFIED | REJECTED
  issuedAt: string | null
  expiresAt: string | null
  reviewedAt: string | null
  reviewedByName: string | null
  note: string | null
  isActive: boolean
  media: VaultMediaDTO
  createdAt: string
}

// ═════════════════════════════════════════════════════════════════════════
// Applicant profile — GET /api/auth/me `profile` (DP-14 additive scalars)
// ═════════════════════════════════════════════════════════════════════════

export interface ApplicantProfileDTO {
  phone: string | null
  whatsappNumber: string | null
  dateOfBirth: string | null
  gender: string | null
  maritalStatus: string | null
  nationality: string | null
  identityType: string | null
  identityNumber: string | null
  residenceStreet: string | null
  residenceCity: string | null
  residenceDistrict: string | null
  residenceType: string | null
}

export interface OrgLiteDTO {
  id: string
  name: string
  status: string
  myRole?: string
}

// ═════════════════════════════════════════════════════════════════════════
// Checklist answers (typed per conditionType — mirrors submissionAnswerSchema)
// ═════════════════════════════════════════════════════════════════════════

export interface ChecklistAnswer {
  valueText?: string | null
  valueNumber?: number | null
  valueDate?: string | null
  accountDocumentId?: string | null
}

/** Wizard answers are keyed by ServiceRequirement id — submissions map back to it. */
export type WizardAnswers = Record<string, ChecklistAnswer>

// ═════════════════════════════════════════════════════════════════════════
// Quote/order → financing directory handoff (sessionStorage, RFQ-prefill style)
// ═════════════════════════════════════════════════════════════════════════

export interface FinancingTargetPrefill {
  targetType: 'QUOTE' | 'ORDER'
  targetId: string
  label: string // human ref (QTE-… / order #) for toasts + the wizard chip
}

const FINANCING_PREFILL_KEY = 'financing-target'

export function setFinancingTarget(target: FinancingTargetPrefill) {
  try {
    window.sessionStorage.setItem(FINANCING_PREFILL_KEY, JSON.stringify(target))
  } catch {
    /* private mode — non-fatal */
  }
}

export function readFinancingTarget(): FinancingTargetPrefill | null {
  try {
    const raw = window.sessionStorage.getItem(FINANCING_PREFILL_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as FinancingTargetPrefill
    if (!parsed?.targetType || !parsed?.targetId) return null
    return parsed
  } catch {
    return null
  }
}

export function clearFinancingTarget() {
  try {
    window.sessionStorage.removeItem(FINANCING_PREFILL_KEY)
  } catch {
    /* non-fatal */
  }
}
