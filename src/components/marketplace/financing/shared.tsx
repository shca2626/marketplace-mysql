'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FIN-6 APPLICANT SURFACES — shared client types, upload helper and wizard
// option registries. The status palette / money / badge helpers are REUSED
// from the financier console's shared module (one palette across consoles);
// this file adds the applicant-side DTO mirrors (directory service, vault
// document, checklist submission, applicant profile) and the enum option
// lists the wizard renders.
// ─────────────────────────────────────────────────────────────────────────────

import type { MediaAssetDTO } from '@/lib/types'

// Re-exported so every applicant component imports ONE module.
export {
  type AccreditationRequest,
  type FinConditionTemplate,
  type FinOffer,
  type FinRequest,
  type FinService,
  type FinServiceRequirement,
  ACCREDITATION_STATUS_MAP,
  CONDITION_TYPE_META,
  FIN_REQUEST_STATUS_MAP,
  OFFER_STATUS_MAP,
  SERVICE_KIND_MAP,
  SERVICE_STATUS_MAP,
  SUBMISSION_STATUS_MAP,
  ConditionTypeBadge,
  StatusBadge,
  enumLabel,
  formatMoney,
  isoToDateInput,
  validityLeft,
} from '@/components/marketplace/financier/shared'

// ── Applicant contracts (FIN-6 DTO mirrors) ─────────────────────────────────
// Historically `shared.ts` sat next to this file and SHADOWED it in module
// resolution ('./shared' prefers .ts over .tsx) — importers mixed symbols from
// both barrels and every .tsx-side import failed tsc. The applicant contracts
// now live in `shared-applicant.ts` and are re-exported here so './shared' is
// ONE canonical barrel again. Overlapping names (ChecklistAnswer,
// ApplicantProfileDTO) resolve to the local definitions above (superset
// shapes) — the star re-export yields to explicit exports.
export * from './shared-applicant'

// ═══════════════════════════════════════════════════════════════════════════
// Applicant-side DTO mirrors (JSON shapes of /api/financing/*)
// ═══════════════════════════════════════════════════════════════════════════

/** GET /api/financing/services (public directory row). */
export interface PublicServiceDTO {
  id: string
  name: string
  summary: string | null
  description: string | null
  serviceKind: 'FINANCING' | 'ACCREDITATION'
  category: string
  targetSegment: string | null
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
  financier: { organizationId: string; name: string; orgType: string }
  attributes: { id: string; kind: string; text: string; position: number }[]
  coverage: string[]
}

/** GET /api/financing/documents (vault row). */
export interface VaultDocumentDTO {
  id: string
  userId: string
  organizationId: string | null
  organizationName: string | null
  media: { id: string; key: string; originalName: string; mime: string; size: number }
  documentType: string
  title: string | null
  issuedAt: string | null
  expiresAt: string | null
  status: 'PENDING' | 'VERIFIED' | 'REJECTED'
  reviewedById: string | null
  reviewedByName: string | null
  reviewedAt: string | null
  note: string | null
  isActive: boolean
  createdAt: string
}

/** GET /api/financing/requests/[id] checklist row (the gate's verification unit). */
export interface ChecklistSubmissionDTO {
  id: string
  status: 'PENDING' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'WAIVED'
  requirement: {
    id: string
    isRequired: boolean
    displayOrder: number
    instructions: string | null
    autoPassAccredited: boolean
    isActive: boolean
    template: {
      id: string
      scope: string
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
      documentType: string | null
      profileFieldKey: string | null
      validationMin: number | null
      validationMax: number | null
      validityMonths: number | null
      isRepeatable: boolean
      options: { id: string; value: string; position: number }[]
    }
  }
  valueText: string | null
  valueNumber: number | null
  valueDate: string | null
  accountDocumentId: string | null
  accountDocument: { id: string; documentType: string; title: string | null; status: string; expiresAt: string | null } | null
  submittedAt: string | null
  verifiedAt: string | null
  verifiedById: string | null
  verifiedByName: string | null
  decisionNote: string | null
  createdAt: string
}

/** GET /api/financing/profile (DP-14 applicant scalars, read-only). */
export interface ApplicantProfileDTO {
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
  verifiedAt: string | null
}

/** One checklist answer collected by the wizard (keyed by condition template id). */
export interface ChecklistAnswer {
  valueText?: string | null
  valueNumber?: number | null
  valueDate?: string | null
  accountDocumentId?: string | null
}

/** A vault document filed through the wizard's free-upload attachment zone. */
export interface WizardAttachment {
  id: string
  documentId: string
  kind: string
  title: string
  documentType: string
}

// ═══════════════════════════════════════════════════════════════════════════
// Wizard option registries (mirror the server's closed enum sets)
// ═══════════════════════════════════════════════════════════════════════════

export const DOCUMENT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'NATIONAL_ID', label: 'National ID' },
  { value: 'PASSPORT', label: 'Passport' },
  { value: 'RESIDENCE_PERMIT', label: 'Residence permit' },
  { value: 'COMMERCIAL_REG', label: 'Commercial registration' },
  { value: 'TAX_CARD', label: 'Tax card' },
  { value: 'BUSINESS_LICENSE', label: 'Business license' },
  { value: 'BANK_STATEMENT', label: 'Bank statement' },
  { value: 'FINANCIAL_STATEMENT', label: 'Financial statement' },
  { value: 'PROOF_OF_ADDRESS', label: 'Proof of address' },
  { value: 'GUARANTEE_DOC', label: 'Guarantee document' },
  { value: 'FEASIBILITY_STUDY', label: 'Feasibility study' },
  { value: 'INVOICE', label: 'Invoice' },
  { value: 'PURCHASE_ORDER', label: 'Purchase order' },
  { value: 'PROJECT_FILE', label: 'Project file' },
  { value: 'OTHER', label: 'Other' },
]

export function documentTypeLabel(type: string): string {
  return DOCUMENT_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type.replaceAll('_', ' ')
}

export const ACTIVITY_STATUS_OPTIONS = [
  { value: 'NEW', label: 'New activity' },
  { value: 'EXISTING', label: 'Existing activity' },
]

export const ACTIVITY_CATEGORY_OPTIONS = [
  'INVESTMENT', 'RURAL', 'ENERGY', 'HOUSING', 'FISHERIES', 'AGRICULTURE', 'SEASONAL',
  'EQUIPMENT', 'WORKING_CAPITAL', 'INVOICE_FINANCING', 'PO_FINANCING', 'VEHICLE',
  'HOME', 'EDUCATION', 'MICROENTERPRISE', 'SME', 'OTHER',
].map((v) => ({ value: v, label: v.replaceAll('_', ' ') }))


export const LOCATION_TYPE_OPTIONS = [
  { value: 'OWNED', label: 'Owned premises' },
  { value: 'RENTED', label: 'Rented premises' },
]

export const GUARANTEE_TYPE_OPTIONS = [
  'PERSONAL_GUARANTEE', 'BANK_GUARANTEE', 'GOLD', 'COMMERCIAL', 'MORTGAGE',
  'CONVERTIBLE_SECURITIES', 'SELF_GUARANTEE', 'OTHER',
].map((v) => ({ value: v, label: v.replaceAll('_', ' ') }))

export const GUARANTEE_STATUS_OPTIONS = [
  'AVAILABLE', 'PARTIALLY_AVAILABLE', 'UNAVAILABLE', 'OTHER',
].map((v) => ({ value: v, label: v.replaceAll('_', ' ') }))

export const ATTACHMENT_KIND_OPTIONS = [
  { value: 'GUARANTEE_DOC', label: 'Guarantee document' },
  { value: 'STUDY', label: 'Study / feasibility' },
  { value: 'PROJECT_FILE', label: 'Project file' },
  { value: 'OTHER', label: 'Other' },
]

/** Attachment kind → the vault document type the free-upload files it as. */
export const ATTACHMENT_KIND_TO_DOC_TYPE: Record<string, string> = {
  GUARANTEE_DOC: 'GUARANTEE_DOC',
  STUDY: 'FEASIBILITY_STUDY',
  PROJECT_FILE: 'PROJECT_FILE',
  OTHER: 'OTHER',
}

export const TARGET_TYPE_OPTIONS = [
  { value: 'WORKING_CAPITAL', label: 'Working capital' },
  { value: 'QUOTE', label: 'A quote' },
  { value: 'ORDER', label: 'An order' },
  { value: 'RFQ_LINE', label: 'An RFQ line' },
]

/** Vault document status palette (documents center + wizard pickers). */
export const DOCUMENT_STATUS_MAP: Record<string, { label: string; badge: string }> = {
  PENDING: { label: 'Pending', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  VERIFIED: { label: 'Verified', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  REJECTED: { label: 'Rejected', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
}

// ═══════════════════════════════════════════════════════════════════════════
// Upload helper — the financing-scoped media upload (open to every role).
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Upload one image file for the document vault. Returns the created/reused
 * MediaAsset, or null with a toast raised on failure. (R-6: upload-only —
 * there is never a URL input.)
 */
export async function uploadFinancingImage(file: File): Promise<MediaAssetDTO | null> {
  const form = new FormData()
  form.append('file', file)
  try {
    const res = await fetch('/api/financing/documents/upload', { method: 'POST', body: form })
    const json = (await res.json().catch(() => ({}))) as {
      assets?: MediaAssetDTO[]
      errors?: { name: string; error: string }[]
      error?: string
    }
    if (res.ok && json.assets && json.assets.length > 0) return json.assets[0]
    throw new Error(json.errors?.[0]?.error ?? json.error ?? 'Upload failed')
  } catch (err) {
    throw err instanceof Error ? err : new Error('Upload failed')
  }
}
