import { z } from 'zod'

/**
 * FINANCING DOMAIN — shared types, zod payload schemas and state machines.
 * ─────────────────────────────────────────────────────────────────────────
 * Single vocabulary for every service in src/server/modules/financing/*
 * (FINANCIER_SCHEMA.md v5.0 §3–§6). String status enums live in MySQL
 * VarChar columns — these TS unions + zod schemas are the validation layer
 * (the same pattern every existing module uses).
 *
 * R-1 (zero JSON): every list below is a child table; no Json columns are
 * created or touched anywhere in this module.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Domain unions (FINANCIER_SCHEMA §3 model comments)
// ═══════════════════════════════════════════════════════════════════════════

/** FinancierService.serviceKind (DP-22). */
export type ServiceKind = 'FINANCING' | 'ACCREDITATION'

/** FinancierService.category — FINANCING taxonomy + ACCREDITATION kinds. */
export type ServiceCategory =
  | 'WORKING_CAPITAL'
  | 'INVOICE_FINANCING'
  | 'PO_FINANCING'
  | 'EQUIPMENT'
  | 'VEHICLE'
  | 'HOME'
  | 'EDUCATION'
  | 'AGRICULTURE'
  | 'MICROENTERPRISE'
  | 'SME'
  | 'OTHER'
  | 'SUPPLIER_QUALIFICATION'
  | 'VENDOR_APPROVAL'

/** FinancierService.targetSegment (DP-13). */
export type TargetSegment = 'BUSINESS' | 'INDIVIDUAL' | 'BOTH'

/** FinancierService.status. */
export type ServiceStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED'

/** ConditionTemplate.scope (R-5). */
export type ConditionScope = 'GENERAL' | 'FINANCIER'

/** ConditionTemplate.conditionType — the 8 typed kinds (DP-24). */
export type ConditionType =
  | 'DOCUMENT'
  | 'PROFILE_FIELD'
  | 'DECLARATION'
  | 'TEXT'
  | 'NUMBER'
  | 'DATE'
  | 'SELECT'
  | 'MULTI_SELECT'

/**
 * ConditionTemplate.profileFieldKey — PROFILE_FIELD only, CLOSED set
 * (zod-validated at every write).
 */
export const PROFILE_FIELD_KEYS = [
  'user.phone',
  'user.identityNumber',
  'user.dateOfBirth',
  'org.taxId',
  'org.registrationNumber',
  'org.industry',
] as const
export type ProfileFieldKey = (typeof PROFILE_FIELD_KEYS)[number]

/** AccountDocument.documentType — 15 values (R-2/DP-27 universal vault). */
export type DocumentType =
  | 'NATIONAL_ID'
  | 'PASSPORT'
  | 'RESIDENCE_PERMIT'
  | 'COMMERCIAL_REG'
  | 'TAX_CARD'
  | 'BUSINESS_LICENSE'
  | 'BANK_STATEMENT'
  | 'FINANCIAL_STATEMENT'
  | 'PROOF_OF_ADDRESS'
  | 'GUARANTEE_DOC'
  | 'FEASIBILITY_STUDY'
  | 'INVOICE'
  | 'PURCHASE_ORDER'
  | 'PROJECT_FILE'
  | 'OTHER'

/** AccountDocument.status. */
export type AccountDocumentStatus = 'PENDING' | 'VERIFIED' | 'REJECTED'

/** ServiceRequirement-driven checklist row status (FINANCIER_SCHEMA §5.3). */
export type RequirementStatus = 'PENDING' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'WAIVED'

/** FinancingRequest.status — 11 states (§3.8/§5.1). */
export type FinancingRequestStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_PLATFORM_REVIEW'
  | 'RETURNED_FOR_COMPLETION'
  | 'FORWARDED_TO_FINANCIER'
  | 'UNDER_FINANCIER_REVIEW'
  | 'OFFERED'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'EXPIRED'
  | 'CANCELLED'

/** AccreditationRequest.status — 11 states (§3.13/§5.2). */
export type AccreditationRequestStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_PLATFORM_REVIEW'
  | 'RETURNED_FOR_COMPLETION'
  | 'FORWARDED_TO_FINANCIER'
  | 'UNDER_FINANCIER_REVIEW'
  | 'ACCREDITED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'REVOKED'
  | 'CANCELLED'

/** FinancingOffer.status — 6 states. */
export type OfferStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'WITHDRAWN'

/** FinancingAgreement.status. */
export type AgreementStatus = 'ACTIVE' | 'COMPLETED' | 'DEFAULTED' | 'CANCELLED'

/** FinancingAgreement.fundingStatus. */
export type FundingStatus = 'PENDING' | 'REPORTED_FUNDED' | 'REPORTED_SETTLED'

/** FinancingEvent.type. */
export type FinancingEventType = 'DISBURSEMENT' | 'REPAYMENT' | 'EARLY_SETTLEMENT' | 'LATE_FEE' | 'NOTE'

/** FinancingFee.type. */
export type FeeType = 'SUCCESS' | 'ORIGINATION' | 'ACCREDITATION'

/** FinancingFee.status. */
export type FeeStatus = 'ACCRUED' | 'INVOICED' | 'PAID' | 'WAIVED'

/** RequestAttachment.kind. */
export type RequestAttachmentKind = 'GUARANTEE_DOC' | 'STUDY' | 'PROJECT_FILE' | 'OTHER'

/** RequestAttachment.parentType (loose-parent Dispute pattern). */
export type RequestAttachmentParentType = 'FINANCING_REQUEST' | 'ACCREDITATION_REQUEST'

/** FinancierBranch.kind. */
export type BranchKind = 'BRANCH' | 'AGENT' | 'ATM'

/** FinancingRequest.activityStatus. */
export type ActivityStatus = 'NEW' | 'EXISTING'

/** FinancingRequest.activityCategory. */
export type ActivityCategory =
  | 'INVESTMENT'
  | 'RURAL'
  | 'ENERGY'
  | 'HOUSING'
  | 'FISHERIES'
  | 'OTHER'

/** FinancingRequest.targetType. */
export type TargetType = 'WORKING_CAPITAL' | 'QUOTE' | 'ORDER' | 'RFQ_LINE'

/** FinancingRequest.activityLocationType / User.residenceType. */
export type LocationType = 'OWNED' | 'RENTED'

/** FinancingRequest.guaranteeType — 8 values. */
export type GuaranteeType =
  | 'PERSONAL_GUARANTEE'
  | 'BANK_GUARANTEE'
  | 'GOLD'
  | 'COMMERCIAL'
  | 'MORTGAGE'
  | 'CONVERTIBLE_SECURITIES'
  | 'SELF_GUARANTEE'
  | 'OTHER'

/** FinancingRequest.guaranteeStatus. */
export type GuaranteeStatus = 'AVAILABLE' | 'PARTIALLY_AVAILABLE' | 'UNAVAILABLE' | 'OTHER'

// ═══════════════════════════════════════════════════════════════════════════
// State machines (FINANCIER_SCHEMA §5.1 / §5.2 — memorized)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * FinancingRequest v3 — the gate is structural (§5.1).
 * "Any pre-acceptance state → CANCELLED" (applicant only); lazy sweep at
 * expiresAt → EXPIRED for every non-terminal pre-acceptance state.
 * RETURNED_FOR_COMPLETION may go straight back to UNDER_PLATFORM_REVIEW on
 * resubmit (admin re-verifies; §5.1 note) — SUBMITTED kept for map
 * completeness (a fresh submit is DRAFT → SUBMITTED only).
 */
export const FINANCING_TRANSITIONS: Record<FinancingRequestStatus, FinancingRequestStatus[]> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['UNDER_PLATFORM_REVIEW', 'CANCELLED', 'EXPIRED'],
  UNDER_PLATFORM_REVIEW: ['RETURNED_FOR_COMPLETION', 'FORWARDED_TO_FINANCIER', 'CANCELLED', 'EXPIRED'],
  RETURNED_FOR_COMPLETION: ['SUBMITTED', 'UNDER_PLATFORM_REVIEW', 'CANCELLED', 'EXPIRED'],
  FORWARDED_TO_FINANCIER: ['UNDER_FINANCIER_REVIEW', 'OFFERED', 'DECLINED', 'CANCELLED', 'EXPIRED'],
  UNDER_FINANCIER_REVIEW: ['OFFERED', 'DECLINED', 'CANCELLED', 'EXPIRED'],
  OFFERED: ['ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED'],
  ACCEPTED: [],
  DECLINED: [],
  EXPIRED: [],
  CANCELLED: [],
}

/**
 * AccreditationRequest (§5.2). Grant is allowed from FORWARDED_TO_FINANCIER
 * or UNDER_FINANCIER_REVIEW; ACCREDITED → EXPIRED (validUntil passes, lazy
 * sweep) or REVOKED (reason required). "Any pre-decision state → CANCELLED".
 */
export const ACCREDITATION_TRANSITIONS: Record<AccreditationRequestStatus, AccreditationRequestStatus[]> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['UNDER_PLATFORM_REVIEW', 'CANCELLED', 'EXPIRED'],
  UNDER_PLATFORM_REVIEW: ['RETURNED_FOR_COMPLETION', 'FORWARDED_TO_FINANCIER', 'CANCELLED', 'EXPIRED'],
  RETURNED_FOR_COMPLETION: ['SUBMITTED', 'UNDER_PLATFORM_REVIEW', 'CANCELLED', 'EXPIRED'],
  FORWARDED_TO_FINANCIER: ['UNDER_FINANCIER_REVIEW', 'ACCREDITED', 'REJECTED', 'CANCELLED', 'EXPIRED'],
  UNDER_FINANCIER_REVIEW: ['ACCREDITED', 'REJECTED', 'CANCELLED', 'EXPIRED'],
  ACCREDITED: ['EXPIRED', 'REVOKED'],
  REJECTED: [],
  EXPIRED: [],
  REVOKED: [],
  CANCELLED: [],
}

/** Is `status → next` a legal FinancingRequest transition? */
export function canTransitionFinancing(
  status: FinancingRequestStatus,
  next: FinancingRequestStatus
): boolean {
  return FINANCING_TRANSITIONS[status].includes(next)
}

/** Is `status → next` a legal AccreditationRequest transition? */
export function canTransitionAccreditation(
  status: AccreditationRequestStatus,
  next: AccreditationRequestStatus
): boolean {
  return ACCREDITATION_TRANSITIONS[status].includes(next)
}

/**
 * R-4 financier visibility: the forward-ordered status list. A request is
 * visible to a financier ONLY from FORWARDED_TO_FINANCIER onward — a SUBMITTED
 * request is platform-private by construction. (EXPIRED stays visible so the
 * financier inbox can show history; CANCELLED/SUBMITTED/etc. are NOT visible.)
 */
export const FINANCIER_VISIBLE_STATUSES: FinancingRequestStatus[] = [
  'FORWARDED_TO_FINANCIER',
  'UNDER_FINANCIER_REVIEW',
  'OFFERED',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
]

/** Same forward-ordered visibility for accreditation requests (R-4). */
export const ACCREDITATION_VISIBLE_STATUSES: AccreditationRequestStatus[] = [
  'FORWARDED_TO_FINANCIER',
  'UNDER_FINANCIER_REVIEW',
  'ACCREDITED',
  'REJECTED',
  'EXPIRED',
  'REVOKED',
]

// ═══════════════════════════════════════════════════════════════════════════
// Actors (services take explicit actor args — never read cookies here)
// ═══════════════════════════════════════════════════════════════════════════

/** The authenticated viewer as passed down from the route layer. */
export interface Actor {
  id: string
  role: string // BUYER | SELLER | ADMIN (User.role column)
}

// ═══════════════════════════════════════════════════════════════════════════
// Zod payload schemas (FIN-4 route layer parses request bodies with these)
// ═══════════════════════════════════════════════════════════════════════════

const money = z.number().positive().max(9_999_999_999)
const optionalMoney = z.number().min(0).max(9_999_999_999).nullable().optional()
const isoDate = z.coerce.date()
const varChar = (n: number) => z.string().trim().min(1).max(n)

// ── Services (financier console) ───────────────────────────────────────────

export const serviceCreateSchema = z.object({
  serviceKind: z.enum(['FINANCING', 'ACCREDITATION']),
  category: z.enum([
    'WORKING_CAPITAL', 'INVOICE_FINANCING', 'PO_FINANCING', 'EQUIPMENT', 'VEHICLE',
    'HOME', 'EDUCATION', 'AGRICULTURE', 'MICROENTERPRISE', 'SME', 'OTHER',
    'SUPPLIER_QUALIFICATION', 'VENDOR_APPROVAL',
  ]),
  name: varChar(160),
  summary: z.string().trim().max(500).optional().nullable(),
  description: z.string().trim().max(10_000).optional().nullable(),
  targetSegment: z.enum(['BUSINESS', 'INDIVIDUAL', 'BOTH']).optional().nullable(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
  currency: z.string().trim().length(3).default('YER'),
  amountMin: optionalMoney,
  amountMax: optionalMoney,
  rateType: z.enum(['MURABAHA_ANNUAL', 'FIXED_ANNUAL', 'FLAT_FEE']).optional().nullable(),
  rateMax: z.number().min(0).max(1000).optional().nullable(),
  feeFlat: optionalMoney,
  tenorMinMonths: z.number().int().min(1).max(360).optional().nullable(),
  tenorMaxMonths: z.number().int().min(1).max(360).optional().nullable(),
  repaymentFrequency: z.enum(['MONTHLY', 'QUARTERLY', 'LUMP_SUM']).optional().nullable(),
  gracePeriodDays: z.number().int().min(0).max(365).optional().nullable(),
  shariaCompliant: z.boolean().optional(),
  processingDays: z.number().int().min(0).max(365).optional().nullable(),
  accreditationValidMonths: z.number().int().min(1).max(120).optional().nullable(),
  accreditationFeeAmount: optionalMoney,
  attributes: z
    .array(
      z.object({
        kind: z.enum(['FEATURE', 'ELIGIBILITY_CONDITION']),
        text: z.string().trim().min(1).max(500),
      })
    )
    .max(40)
    .optional(),
  coverage: z.array(z.string().trim().min(1).max(120)).max(200).optional(),
})
export type ServiceCreatePayload = z.infer<typeof serviceCreateSchema>

export const serviceUpdateSchema = serviceCreateSchema.partial()
export type ServiceUpdatePayload = z.infer<typeof serviceUpdateSchema>

// ── Branches ───────────────────────────────────────────────────────────────

export const branchCreateSchema = z.object({
  name: varChar(160),
  kind: z.enum(['BRANCH', 'AGENT', 'ATM']).default('BRANCH'),
  street: z.string().trim().max(255).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  district: z.string().trim().max(120).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  isActive: z.boolean().optional(),
  position: z.number().int().min(0).max(999).optional(),
})
export type BranchCreatePayload = z.infer<typeof branchCreateSchema>

export const branchUpdateSchema = branchCreateSchema.partial()
export type BranchUpdatePayload = z.infer<typeof branchUpdateSchema>

// ── Condition templates (requirements engine, R-5) ─────────────────────────

export const conditionOptionInput = z.object({
  value: varChar(160),
})

/** Base shape (refinements layered separately — zod v4 forbids .partial() on refined objects). */
const conditionCreateBase = z.object({
  scope: z.enum(['GENERAL', 'FINANCIER']),
  conditionType: z.enum([
    'DOCUMENT', 'PROFILE_FIELD', 'DECLARATION', 'TEXT', 'NUMBER', 'DATE', 'SELECT', 'MULTI_SELECT',
  ]),
  code: z
    .string()
    .trim()
    .regex(/^[A-Z0-9-]{2,32}$/, 'Code must be 2–32 uppercase letters, digits or dashes')
    .optional()
    .nullable(),
  title: varChar(160),
  description: z.string().trim().max(10_000).optional().nullable(),
  profileFieldKey: z.enum(PROFILE_FIELD_KEYS).optional().nullable(),
  documentType: z
    .enum([
      'NATIONAL_ID', 'PASSPORT', 'RESIDENCE_PERMIT', 'COMMERCIAL_REG', 'TAX_CARD', 'BUSINESS_LICENSE',
      'BANK_STATEMENT', 'FINANCIAL_STATEMENT', 'PROOF_OF_ADDRESS', 'GUARANTEE_DOC', 'FEASIBILITY_STUDY',
      'INVOICE', 'PURCHASE_ORDER', 'PROJECT_FILE', 'OTHER',
    ])
    .optional()
    .nullable(),
  validationMin: optionalMoney,
  validationMax: optionalMoney,
  validityMonths: z.number().int().min(1).max(240).optional().nullable(),
  isRepeatable: z.boolean().optional(),
  options: z.array(conditionOptionInput).max(100).optional(),
})

export const conditionCreateSchema = conditionCreateBase.superRefine((data, ctx) => {
    if (
      (data.conditionType === 'SELECT' || data.conditionType === 'MULTI_SELECT') &&
      (!data.options || data.options.length < 1)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: 'SELECT / MULTI_SELECT conditions need at least one option',
      })
    }
    if (data.conditionType === 'PROFILE_FIELD' && !data.profileFieldKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['profileFieldKey'],
        message: 'PROFILE_FIELD conditions need a profileFieldKey',
      })
    }
    if (data.conditionType === 'DOCUMENT' && !data.documentType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['documentType'],
        message: 'DOCUMENT conditions need a documentType',
      })
    }
    if (
      data.conditionType === 'NUMBER' &&
      data.validationMin != null &&
      data.validationMax != null &&
      data.validationMin > data.validationMax
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['validationMin'],
        message: 'validationMin cannot exceed validationMax',
      })
    }
  })
export type ConditionCreatePayload = z.infer<typeof conditionCreateSchema>

export const conditionUpdateSchema = conditionCreateBase.partial()
export type ConditionUpdatePayload = z.infer<typeof conditionUpdateSchema>

// ── ServiceRequirement attachment config ───────────────────────────────────

export const requirementAttachSchema = z.object({
  conditionTemplateId: z.string().min(1),
  isRequired: z.boolean().default(true),
  displayOrder: z.number().int().min(0).max(999).default(0),
  instructions: z.string().trim().max(500).optional().nullable(),
  autoPassAccredited: z.boolean().default(false),
})
export type RequirementAttachPayload = z.infer<typeof requirementAttachSchema>

export const requirementUpdateSchema = requirementAttachSchema
  .omit({ conditionTemplateId: true })
  .partial()
export type RequirementUpdatePayload = z.infer<typeof requirementUpdateSchema>

// ── Documents vault (DP-27) ────────────────────────────────────────────────

export const documentCreateSchema = z.object({
  mediaId: z.string().min(1),
  documentType: z.enum([
    'NATIONAL_ID', 'PASSPORT', 'RESIDENCE_PERMIT', 'COMMERCIAL_REG', 'TAX_CARD', 'BUSINESS_LICENSE',
    'BANK_STATEMENT', 'FINANCIAL_STATEMENT', 'PROOF_OF_ADDRESS', 'GUARANTEE_DOC', 'FEASIBILITY_STUDY',
    'INVOICE', 'PURCHASE_ORDER', 'PROJECT_FILE', 'OTHER',
  ]),
  title: z.string().trim().max(160).optional().nullable(),
  issuedAt: isoDate.optional().nullable(),
  expiresAt: isoDate.optional().nullable(),
  organizationId: z.string().min(1).optional().nullable(),
})
export type DocumentCreatePayload = z.infer<typeof documentCreateSchema>

export const documentMetaSchema = z.object({
  title: z.string().trim().max(160).optional().nullable(),
  issuedAt: isoDate.optional().nullable(),
  expiresAt: isoDate.optional().nullable(),
  isActive: z.boolean().optional(),
})
export type DocumentMetaPayload = z.infer<typeof documentMetaSchema>

export const documentVerifySchema = z.object({
  verdict: z.enum(['verify', 'reject']),
  note: z.string().trim().max(2000).optional().nullable(),
})
export type DocumentVerifyPayload = z.infer<typeof documentVerifySchema>

export const requestAttachmentSchema = z.object({
  parentType: z.enum(['FINANCING_REQUEST', 'ACCREDITATION_REQUEST']),
  parentId: z.string().min(1),
  accountDocumentId: z.string().min(1),
  kind: z.enum(['GUARANTEE_DOC', 'STUDY', 'PROJECT_FILE', 'OTHER']).default('OTHER'),
})
export type RequestAttachmentPayload = z.infer<typeof requestAttachmentSchema>

// ── RequirementSubmission answers (typed per conditionType) ────────────────

export const submissionAnswerSchema = z
  .object({
    valueText: z.string().trim().max(500).optional().nullable(),
    valueNumber: z.number().optional().nullable(),
    valueDate: isoDate.optional().nullable(),
    accountDocumentId: z.string().min(1).optional().nullable(),
  })
  .refine(
    (a) =>
      a.valueText !== undefined ||
      a.valueNumber !== undefined ||
      a.valueDate !== undefined ||
      a.accountDocumentId !== undefined,
    { message: 'An answer must supply at least one typed value' }
  )
export type SubmissionAnswerPayload = z.infer<typeof submissionAnswerSchema>

export const adminVerdictSchema = z.object({
  verdict: z.enum(['verify', 'reject', 'waive']),
  note: z.string().trim().max(500).optional().nullable(),
})
export type AdminVerdictPayload = z.infer<typeof adminVerdictSchema>

// ── FinancingRequest wizard payload (schema §3.8 — full 3-step form) ────────

export const financingRequestCreateSchema = z.object({
  serviceId: z.string().min(1),
  organizationId: z.string().min(1).optional().nullable(),
  targetType: z.enum(['WORKING_CAPITAL', 'QUOTE', 'ORDER', 'RFQ_LINE']).default('WORKING_CAPITAL'),
  targetId: z.string().max(64).optional().nullable(),
  multiGroupId: z.string().max(32).optional().nullable(),

  activityStatus: z.enum(['NEW', 'EXISTING']).optional().nullable(),
  activityName: z.string().trim().max(160).optional().nullable(),
  activityDescription: z.string().trim().max(10_000).optional().nullable(),
  activityStartDate: isoDate.optional().nullable(),
  activityCity: z.string().trim().max(120).optional().nullable(),
  activityDistrict: z.string().trim().max(120).optional().nullable(),
  activityAddress: z.string().trim().max(255).optional().nullable(),
  activityLocationType: z.enum(['OWNED', 'RENTED']).optional().nullable(),
  activityCategory: z
    .enum(['INVESTMENT', 'RURAL', 'ENERGY', 'HOUSING', 'FISHERIES', 'OTHER'])
    .optional()
    .nullable(),
  activityCategoryOther: z.string().trim().max(160).optional().nullable(),

  capitalAmount: optionalMoney,
  ownContributionAmount: optionalMoney,
  monthlyInstallmentCapacity: optionalMoney,
  previousFinancing: z.boolean().optional().nullable(),
  otherIncomeSources: z.string().trim().max(500).optional().nullable(),

  amountRequested: money,
  currency: z.string().trim().length(3).default('YER'),
  purpose: z.string().trim().max(10_000).optional().nullable(),
  tenorRequestedMonths: z.number().int().min(1).max(360).optional().nullable(),

  guaranteeType: z
    .enum([
      'PERSONAL_GUARANTEE', 'BANK_GUARANTEE', 'GOLD', 'COMMERCIAL', 'MORTGAGE',
      'CONVERTIBLE_SECURITIES', 'SELF_GUARANTEE', 'OTHER',
    ])
    .optional()
    .nullable(),
  guaranteeTypeOther: z.string().trim().max(160).optional().nullable(),
  guaranteeStatus: z
    .enum(['AVAILABLE', 'PARTIALLY_AVAILABLE', 'UNAVAILABLE', 'OTHER'])
    .optional()
    .nullable(),
  guaranteeStatusOther: z.string().trim().max(160).optional().nullable(),

  applicantNotes: z.string().trim().max(10_000).optional().nullable(),

  /** answers: submissionId → typed answer (validated per conditionType) */
  answers: z.array(z.object({ submissionId: z.string().min(1), answer: submissionAnswerSchema })).max(200).optional(),
  /** free attachments (guarantee docs / studies / project files) */
  attachments: z
    .array(
      z.object({
        accountDocumentId: z.string().min(1),
        kind: z.enum(['GUARANTEE_DOC', 'STUDY', 'PROJECT_FILE', 'OTHER']).default('OTHER'),
      })
    )
    .max(50)
    .optional(),
  /** submit immediately after create (wizard final step) */
  submit: z.boolean().optional(),
})
export type FinancingRequestCreatePayload = z.infer<typeof financingRequestCreateSchema>

export const financingRequestUpdateSchema = z.object({
  /** partial wizard re-save while DRAFT/RETURNED_FOR_COMPLETION */
  ...financingRequestCreateSchema.omit({
    serviceId: true,
    targetType: true,
    targetId: true,
    multiGroupId: true,
    submit: true,
  }).shape,
  answers: z.array(z.object({ submissionId: z.string().min(1), answer: submissionAnswerSchema })).max(200).optional(),
  attachments: z
    .array(
      z.object({
        accountDocumentId: z.string().min(1),
        kind: z.enum(['GUARANTEE_DOC', 'STUDY', 'PROJECT_FILE', 'OTHER']).default('OTHER'),
      })
    )
    .max(50)
    .optional(),
})
export type FinancingRequestUpdatePayload = z.infer<typeof financingRequestUpdateSchema>

export const returnRequestSchema = z.object({
  reason: varChar(500),
})
export type ReturnRequestPayload = z.infer<typeof returnRequestSchema>

export const resubmitSchema = z.object({
  answers: z.array(z.object({ submissionId: z.string().min(1), answer: submissionAnswerSchema })).max(200).optional(),
})
export type ResubmitPayload = z.infer<typeof resubmitSchema>

// ── Offers (financier side) ────────────────────────────────────────────────

export const installmentSchema = z.object({
  installmentNo: z.number().int().min(1).max(600),
  dueDate: isoDate,
  amount: money,
})

export const offerCreateSchema = z
  .object({
    amount: money,
    currency: z.string().trim().length(3).default('YER'),
    rateType: z.enum(['MURABAHA_ANNUAL', 'FIXED_ANNUAL', 'FLAT_FEE']).optional().nullable(),
    ratePercent: z.number().min(0).max(1000).optional().nullable(),
    feeFlat: optionalMoney,
    tenorMonths: z.number().int().min(1).max(360),
    collateralRequired: z
      .enum([
        'PERSONAL_GUARANTEE', 'BANK_GUARANTEE', 'GOLD', 'COMMERCIAL', 'MORTGAGE',
        'CONVERTIBLE_SECURITIES', 'SELF_GUARANTEE', 'OTHER',
      ])
      .optional()
      .nullable(),
    notes: z.string().trim().max(1000).optional().nullable(),
    validUntil: isoDate.optional().nullable(),
    installments: z.array(installmentSchema).min(1).max(600),
  })
  .superRefine((data, ctx) => {
    const nos = data.installments.map((i) => i.installmentNo).sort((a, b) => a - b)
    for (let i = 0; i < nos.length; i++) {
      if (nos[i] !== i + 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['installments'],
          message: 'installmentNo must be unique and sequential from 1',
        })
        break
      }
    }
    const dates = [...data.installments].sort((a, b) => a.installmentNo - b.installmentNo).map((i) => i.dueDate.getTime())
    for (let i = 1; i < dates.length; i++) {
      if (dates[i] < dates[i - 1]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['installments'],
          message: 'dueDate must be ascending by installmentNo',
        })
        break
      }
    }
  })
export type OfferCreatePayload = z.infer<typeof offerCreateSchema>

export const offerWithdrawSchema = z.object({}) // no body needed

export const declineRequestSchema = z.object({
  note: varChar(1000),
})
export type DeclineRequestPayload = z.infer<typeof declineRequestSchema>

// ── Agreements / events (financier reports) ───────────────────────────────

export const eventCreateSchema = z.object({
  type: z.enum(['DISBURSEMENT', 'REPAYMENT', 'EARLY_SETTLEMENT', 'LATE_FEE', 'NOTE']),
  eventDate: isoDate,
  amount: optionalMoney,
  note: z.string().trim().max(500).optional().nullable(),
})
export type EventCreatePayload = z.infer<typeof eventCreateSchema>

// ── Accreditation payloads ─────────────────────────────────────────────────

export const accreditationCreateSchema = z.object({
  serviceId: z.string().min(1),
  organizationId: z.string().min(1).optional().nullable(),
  multiGroupId: z.string().max(32).optional().nullable(),
  scopeNotes: z.string().trim().max(500).optional().nullable(),
  answers: z.array(z.object({ submissionId: z.string().min(1), answer: submissionAnswerSchema })).max(200).optional(),
  attachments: z
    .array(
      z.object({
        accountDocumentId: z.string().min(1),
        kind: z.enum(['GUARANTEE_DOC', 'STUDY', 'PROJECT_FILE', 'OTHER']).default('OTHER'),
      })
    )
    .max(50)
    .optional(),
  submit: z.boolean().optional(),
})
export type AccreditationCreatePayload = z.infer<typeof accreditationCreateSchema>

export const accreditationDecisionSchema = z.object({
  decision: z.enum(['grant', 'reject']),
  note: z.string().trim().max(500).optional().nullable(),
})
export type AccreditationDecisionPayload = z.infer<typeof accreditationDecisionSchema>

export const accreditationRevokeSchema = z.object({
  reason: varChar(500),
})
export type AccreditationRevokePayload = z.infer<typeof accreditationRevokeSchema>
