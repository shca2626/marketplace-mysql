'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN FINANCING CONSOLE — shared client contracts + tiny helpers (FIN-7).
//
// These interfaces mirror the JSON the FIN-4 admin routes actually return
// (verified against the serializers in requests/catalog/offers/conditions/
// submissions/documents + live API responses). Status badges, money and label
// maps are REUSED from the financier primitives (financing-status-badge) so
// the whole financing domain renders identically on every surface.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  SubmissionDTO,
  ConditionTemplateDTO,
} from '@/components/marketplace/financier/financing-status-badge'
import type {
  AccountDocumentDTO,
  MyRequestDetailDTO,
  MyAccreditationDetailDTO,
} from '@/components/marketplace/financing/shared'

export type { SubmissionDTO, ConditionTemplateDTO, AccountDocumentDTO }

// ═══════════════════════════════════════════════════════════════════════════
// THE GATE queue — GET /api/admin/financing/queue
// ═══════════════════════════════════════════════════════════════════════════

export interface GateQueueRow {
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
  siblings: { id: string; number: string; status: string; serviceName: string; amountRequested: number }[]
  /** R-4 gate blockers — required items not yet VERIFIED/WAIVED (amber when > 0). */
  blockingCount: number
  requester: { id: string; name: string; email: string } | null
}

export interface GateQueueResponse {
  financing: GateQueueRow[]
  accreditation: GateQueueRow[]
}

/** The 409 payload when Forward is attempted on an incomplete file. */
export interface GateBlocker {
  submissionId: string
  requirementId: string
  title: string
  status: string
  isRequired: boolean
}

// ═══════════════════════════════════════════════════════════════════════════
// Admin dossier — GET /api/admin/financing/requests/[id] (polymorphic)
// ═══════════════════════════════════════════════════════════════════════════

export interface AdminDossierDTO {
  requestType: 'FINANCING' | 'ACCREDITATION'
  request: MyRequestDetailDTO | MyAccreditationDetailDTO
  documents: AccountDocumentDTO[]
  applicant: {
    user: {
      id: string
      name: string
      email: string
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
    } | null
    organization: {
      id: string
      name: string
      taxId: string | null
      registrationNumber: string | null
      industry: string | null
      website: string | null
      status: string
    } | null
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Institutions — GET /api/admin/financing/institutions
// ═══════════════════════════════════════════════════════════════════════════

export interface AdminInstitutionDTO {
  organizationId: string
  name: string
  orgType: string
  status: string
  verifiedAt: string | null
  profile: {
    id: string
    licenseNumber: string | null
    regulator: string | null
    contactEmail: string | null
    contactPhone: string | null
  }
  memberCount: number
  serviceCount: number
  activeServiceCount: number
  openRequestCount: number
  openAccreditationCount: number
  liveAccreditationCount: number
}

// ═══════════════════════════════════════════════════════════════════════════
// Fees — GET /api/admin/financing/fees (agreement join)
// ═══════════════════════════════════════════════════════════════════════════

export interface AdminFeeDTO {
  id: string
  agreementId: string
  agreementNumber: string
  type: string
  baseAmount: number
  percentApplied: number
  amount: number
  status: string
  createdAt: string
  applicantOrganization: string | null
  financierName: string | null
}

// ═══════════════════════════════════════════════════════════════════════════
// Small helpers
// ═══════════════════════════════════════════════════════════════════════════

export const ORG_TYPE_LABELS: Record<string, string> = {
  BANK: 'Bank',
  MFI: 'Microfinance',
  EWALLET: 'E-wallet',
  COMPANY: 'Company',
}

export function orgTypeLabel(orgType: string): string {
  return ORG_TYPE_LABELS[orgType] ?? orgType
}

/** `null`/`''` → null (keeps the guards honest for conditional rendering). */
export function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

/** Human summary of what the applicant submitted for a checklist row. */
export function submissionAnswer(s: SubmissionDTO): string {
  if (s.accountDocumentId) return 'Document attached'
  if (s.valueText) return s.valueText === 'CONFIRMED' ? 'Confirmed' : s.valueText
  if (s.valueNumber != null) return String(s.valueNumber)
  if (s.valueDate) return s.valueDate.slice(0, 10)
  if (s.template.conditionType === 'DECLARATION') return s.status === 'PENDING' ? 'Not answered' : 'Answered'
  return s.status === 'PENDING' ? 'Not answered' : '—'
}

/** Required items still blocking the R-4 gate rule (client mirror of listGateBlockers). */
export function gateBlockersOf(submissions: SubmissionDTO[]): SubmissionDTO[] {
  return submissions.filter((s) => s.isRequired && !['VERIFIED', 'WAIVED'].includes(s.status))
}
