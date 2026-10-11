import { db } from '@/lib/db'
import { recordAudit } from '@/server/modules/audit/service'
import { emitNotifications } from '@/server/modules/notifications/service'
import { isMfaEnrolled, verifyMfaCode } from '@/server/modules/mfa/service'
import { FinancingError, iso } from './shared'
import { getActiveTemplate, renderForAgreement, type AgreementRenderContext, type ContractKind } from './contracts'

/**
 * E-SIGNATURE EVIDENCE PACKAGE (lastplan v5 §10.4) — the applicant's
 * execution of their financing agreement.
 *
 * THE FAIL-CLOSED CHAIN (executeSignature — every violation is a typed
 * FinancingError and NOTHING is persisted):
 *   1. the signer must be the agreement's request applicant → 403
 *   2. the agreement must be ACTIVE with no existing execution → 409
 *   3. an ACTIVE FINANCING_AGREEMENT template must exist → 404 TEMPLATE_INACTIVE
 *   4. HASH FAIL-CLOSED: sha256(template.body) recomputed NOW must equal the
 *      stored template.sha256 AND the client-supplied documentSha256 (what
 *      the user actually saw) → 400 DOCUMENT_HASH_MISMATCH — simulates the
 *      document changing between view and sign
 *   5. explicit consent must be true → 400 CONSENT_REQUIRED
 *   6. STEP-UP MFA: an enrolled TOTP is verified against the current window
 *      (same verification the login flow uses, incl. the replay guard) →
 *      428 MFA_ENROLLMENT_REQUIRED / 400 MFA_CODE_INVALID; the verified
 *      instant is stamped on the execution row
 * Only then is the evidence package persisted (one execution per agreement)
 * with the consent sentence, IP/UA, the template identity + hash, and the
 * checks record.
 */

// ── Errors (typed codes for the UI) ─────────────────────────────────────────

export class EsignError extends FinancingError {
  code: string
  constructor(message: string, status: number, code: string) {
    super(message, status)
    this.code = code
  }
}

// ── DTOs ────────────────────────────────────────────────────────────────────

export interface ConsentContext {
  applicantName: string
  agreementNumber: string
}

export interface ExecutionSummaryDTO {
  id: string
  acceptedAt: string
  documentSha256: string
  signerMfaVerifiedAt: string | null
  template: { id: string; kind: string; version: number; title: string }
}

export interface EsignContextDTO {
  template: {
    id: string
    kind: ContractKind
    version: number
    title: string
    renderedBody: string
    sha256: string
    unresolved: string[]
  }
  consentText: string
  existingExecution: ExecutionSummaryDTO | null
  mfaEnrolled: boolean
}

export interface ExecutionLedgerDTO {
  id: string
  agreementId: string
  agreementNumber: string
  applicantName: string
  applicantEmail: string | null
  template: { id: string; kind: string; version: number; title: string }
  documentSha256: string
  signerMfaVerifiedAt: string | null
  acceptedAt: string
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
  /** Parsed evidence package (the detail dialog renders it). */
  evidence: Record<string, unknown>
}

export interface ExecuteSignatureInput {
  documentSha256: string
  consentAccepted: boolean
  mfaCode: string
  /** The typed-name signature (part of the evidence package). */
  typedName?: string | null
  signatureImageId?: string | null
}

// ── Consent text ────────────────────────────────────────────────────────────

/** The EXACT server-defined sentence the applicant accepts (§10.4). */
export function buildConsentText(ctx: ConsentContext): string {
  return `I, ${ctx.applicantName}, have read financing agreement ${ctx.agreementNumber} and consent to be bound by its terms; I understand the installment schedule and my obligation to pay on time.`
}

// ── Loading ─────────────────────────────────────────────────────────────────

const agreementInclude = {
  offer: {
    include: {
      installments: { orderBy: { installmentNo: 'asc' as const } },
      request: {
        include: {
          organization: { select: { name: true } },
          createdBy: { select: { id: true, name: true, email: true } },
          service: {
            select: {
              name: true,
              financierProfile: {
                select: { organizationId: true, organization: { select: { name: true } } },
              },
            },
          },
        },
      },
    },
  },
  esignature: {
    include: {
      contractTemplate: { select: { kind: true, version: true, title: true } },
    },
  },
} as const

type AgreementWithOffer = Awaited<ReturnType<typeof loadAgreement>>

async function loadAgreement(agreementId: string) {
  const agreement = await db.financingAgreement.findUnique({
    where: { id: agreementId },
    include: agreementInclude,
  })
  if (!agreement) throw new FinancingError('Agreement not found', 404)
  return agreement
}

/** The render context off the frozen offer (R-2 — by reference, DP-20). */
function toRenderContext(a: AgreementWithOffer): AgreementRenderContext {
  return {
    agreementNumber: a.number,
    financierOrgName: a.offer.request.service.financierProfile.organization.name,
    applicantName: a.offer.request.createdBy.name,
    amount: a.offer.amount,
    currency: a.offer.currency,
    tenorMonths: a.offer.tenorMonths,
    rateType: a.offer.rateType,
    ratePercent: a.offer.ratePercent,
    offerNotes: a.offer.notes,
    installments: a.offer.installments.map((i) => ({
      installmentNo: i.installmentNo,
      dueDate: i.dueDate,
      amount: i.amount,
    })),
  }
}

type ExistingExecution = NonNullable<AgreementWithOffer['esignature']>

function serializeExisting(row: ExistingExecution): ExecutionSummaryDTO {
  return {
    id: row.id,
    acceptedAt: row.acceptedAt.toISOString(),
    documentSha256: row.documentSha256,
    signerMfaVerifiedAt: iso(row.signerMfaVerifiedAt),
    template: {
      id: row.contractTemplateId,
      kind: row.contractTemplate?.kind ?? 'FINANCING_AGREEMENT',
      version: row.contractTemplate?.version ?? 0,
      title: row.contractTemplate?.title ?? '',
    },
  }
}

// ── Buyer context (applicant-only view) ─────────────────────────────────────

/**
 * The execution context the buyer sees: the ACTIVE template rendered for
 * THIS agreement, the exact consent sentence, whether they already executed
 * and whether their MFA is enrolled. Fails closed (404 TEMPLATE_INACTIVE)
 * when the financier has no active FINANCING_AGREEMENT template.
 */
export async function getExecutionContext(userId: string, agreementId: string): Promise<EsignContextDTO> {
  const agreement = await loadAgreement(agreementId)
  // applicant-only: the request's creator or an applicant-org member
  const request = agreement.offer.request
  if (request.createdById !== userId) {
    const member = await db.organizationMember.findFirst({
      where: { userId, organizationId: request.organizationId ?? '' },
      select: { id: true },
    })
    if (!member) throw new FinancingError('Access denied', 403)
  }

  const active = await getActiveTemplate(
    agreement.offer.request.service.financierProfile.organizationId,
    'FINANCING_AGREEMENT'
  )
  if (!active) {
    throw new EsignError(
      'No active contract template — this financier has not published a signable agreement yet. Please contact them.',
      404,
      'TEMPLATE_INACTIVE'
    )
  }

  const ctx = toRenderContext(agreement)
  const rendered = renderForAgreement({ body: active.body }, ctx)

  return {
    template: {
      id: active.id,
      kind: active.kind,
      version: active.version,
      title: active.title,
      renderedBody: rendered.body,
      sha256: active.sha256,
      unresolved: rendered.unresolved,
    },
    consentText: buildConsentText({
      applicantName: ctx.applicantName,
      agreementNumber: ctx.agreementNumber,
    }),
    existingExecution: agreement.esignature ? serializeExisting(agreement.esignature) : null,
    mfaEnrolled: await isMfaEnrolled(userId),
  }
}

// ── The execution (fail-closed chain) ──────────────────────────────────────

export async function executeSignature(
  userId: string,
  agreementId: string,
  input: ExecuteSignatureInput,
  request: { ip?: string | null; userAgent?: string | null }
): Promise<ExecutionLedgerDTO> {
  // 1 — signer must be the agreement's request applicant (creator).
  const agreement = await loadAgreement(agreementId)
  const requestRow = agreement.offer.request
  if (requestRow.createdById !== userId) {
    throw new FinancingError('Only the applicant may execute this agreement', 403)
  }

  // 2 — agreement ACTIVE + no existing execution.
  if (agreement.status !== 'ACTIVE') {
    throw new FinancingError(`Agreement is ${agreement.status} — signature is closed`, 409)
  }
  if (agreement.esignature) {
    throw new FinancingError('This agreement has already been executed', 409)
  }

  // 3 — an ACTIVE template must exist (fail closed when retired).
  const financierOrgId = requestRow.service.financierProfile.organizationId
  const active = await getActiveTemplate(financierOrgId, 'FINANCING_AGREEMENT')
  if (!active) {
    throw new EsignError(
      'No active contract template — this financier has not published a signable agreement yet.',
      404,
      'TEMPLATE_INACTIVE'
    )
  }

  // 4 — HASH FAIL-CLOSED: recompute NOW; it must equal the stored template
  // hash AND the client-supplied hash (what the user saw).
  const { createHash } = await import('crypto')
  const liveHash = createHash('sha256').update(active.body, 'utf8').digest('hex')
  if (liveHash !== active.sha256 || input.documentSha256.trim().toLowerCase() !== liveHash) {
    throw new EsignError(
      'The agreement text changed between viewing and signing — please review the updated contract and try again.',
      400,
      'DOCUMENT_HASH_MISMATCH'
    )
  }

  // 5 — explicit consent.
  if (input.consentAccepted !== true) {
    throw new EsignError('You must accept the consent statement before signing.', 400, 'CONSENT_REQUIRED')
  }

  // 6 — STEP-UP MFA (the same verification login uses, replay guard included).
  if (!(await isMfaEnrolled(userId))) {
    throw new EsignError(
      'Signing requires two-factor authentication. Enroll an authenticator app in Account → Security first, then return to sign.',
      428,
      'MFA_ENROLLMENT_REQUIRED'
    )
  }
  const mfa = await verifyMfaCode(userId, (input.mfaCode ?? '').trim())
  if (!mfa.ok) {
    throw new EsignError(
      'That verification code is not valid — codes rotate every 30 seconds. Enter the current code from your authenticator app.',
      400,
      'MFA_CODE_INVALID'
    )
  }

  // 7 — persist the evidence package (DB clock is the timestamp source).
  const dbNowRows = (await db.$queryRaw`SELECT NOW() AS now`) as { now: Date | string }[]
  const acceptedAt = dbNowRows[0]?.now ? new Date(dbNowRows[0].now) : new Date()
  const renderCtx = toRenderContext(agreement)
  const consentText = buildConsentText({
    applicantName: renderCtx.applicantName,
    agreementNumber: renderCtx.agreementNumber,
  })
  const typedName = input.typedName?.trim() || null
  if (!typedName) throw new FinancingError('Type your full name as your signature', 400)

  const evidence = {
    agreementNumber: renderCtx.agreementNumber,
    offerTerms: {
      amount: renderCtx.amount,
      currency: renderCtx.currency,
      tenorMonths: renderCtx.tenorMonths,
      rateType: renderCtx.rateType,
      ratePercent: renderCtx.ratePercent,
    },
    template: { id: active.id, kind: active.kind, version: active.version, sha256: active.sha256 },
    checks: { applicantVerified: true, hashVerified: true, consentVerified: true, mfaVerified: true },
    acceptedAt: acceptedAt.toISOString(),
    serverTimeSource: 'db-now',
    typedName,
    signatureMethod: 'typed-name',
    consentText,
    mfaVerifiedVia: mfa.via ?? 'TOTP',
    ...(request.ip ? { ipAddress: request.ip } : {}),
    ...(request.userAgent ? { userAgent: request.userAgent } : {}),
  }

  const row = await db.eSignatureExecution.create({
    data: {
      agreementId,
      contractTemplateId: active.id,
      documentSha256: liveHash,
      signerId: userId,
      signerMfaVerifiedAt: acceptedAt,
      consentText,
      acceptedAt,
      ipAddress: request.ip ?? null,
      userAgent: request.userAgent ?? null,
      signatureImageId: input.signatureImageId ?? null,
      evidence: JSON.stringify(evidence),
    },
  })

  // 8 — audit + notify the financier org staff.
  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'ESIGNATURE_EXECUTED',
    entityType: 'ESIGNATURE_EXECUTION',
    entityId: row.id,
    summary: `Agreement ${agreement.number} executed by ${renderCtx.applicantName} (e-sign, template v${active.version}, MFA verified)`,
    metadata: {
      agreementId,
      templateId: active.id,
      templateVersion: active.version,
      documentSha256: liveHash,
      mfaVerified: true,
    },
  })
  const staff = await db.organizationMember.findMany({
    where: { organizationId: financierOrgId, role: { in: ['OWNER', 'ADMIN'] } },
    select: { userId: true },
  })
  await emitNotifications(
    staff.map((s) => ({
      userId: s.userId,
      type: 'AGREEMENT_STATUS_CHANGED' as const,
      title: `Agreement ${agreement.number} executed`,
      body: `${renderCtx.applicantName} signed the financing agreement electronically (template v${active.version}, identity + MFA verified). The evidence package is in Sharia & Contracts → Executions.`,
      linkView: 'financier' as const,
      linkId: agreementId,
    }))
  )

  return {
    id: row.id,
    agreementId,
    agreementNumber: agreement.number,
    applicantName: requestRow.createdBy.name,
    applicantEmail: requestRow.createdBy.email,
    template: { id: active.id, kind: active.kind, version: active.version, title: active.title },
    documentSha256: liveHash,
    signerMfaVerifiedAt: iso(row.signerMfaVerifiedAt),
    acceptedAt: row.acceptedAt.toISOString(),
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    createdAt: row.createdAt.toISOString(),
    evidence,
  }
}

// ── Financier ledger ────────────────────────────────────────────────────────

/** The org's execution ledger (evidence parsed for the detail dialog). */
export async function listExecutions(financierOrgId: string): Promise<ExecutionLedgerDTO[]> {
  const rows = await db.eSignatureExecution.findMany({
    where: {
      agreement: { offer: { request: { service: { financierProfile: { organizationId: financierOrgId } } } } },
    },
    include: {
      agreement: {
        select: {
          number: true,
          offer: {
            select: {
              request: {
                select: {
                  createdBy: { select: { name: true, email: true } },
                },
              },
            },
          },
        },
      },
      contractTemplate: { select: { id: true, kind: true, version: true, title: true } },
    },
    orderBy: { acceptedAt: 'desc' },
    take: 200,
  })
  return rows.map((r) => {
    let evidence: Record<string, unknown> = {}
    try {
      evidence = JSON.parse(r.evidence) as Record<string, unknown>
    } catch {
      evidence = { parseError: true }
    }
    return {
      id: r.id,
      agreementId: r.agreementId,
      agreementNumber: r.agreement.number,
      applicantName: r.agreement.offer.request.createdBy.name,
      applicantEmail: r.agreement.offer.request.createdBy.email,
      template: r.contractTemplate
        ? {
            id: r.contractTemplate.id,
            kind: r.contractTemplate.kind,
            version: r.contractTemplate.version,
            title: r.contractTemplate.title,
          }
        : { id: r.contractTemplateId, kind: 'FINANCING_AGREEMENT', version: 0, title: 'Unresolved template' },
      documentSha256: r.documentSha256,
      signerMfaVerifiedAt: iso(r.signerMfaVerifiedAt),
      acceptedAt: r.acceptedAt.toISOString(),
      ipAddress: r.ipAddress,
      userAgent: r.userAgent,
      createdAt: r.createdAt.toISOString(),
      evidence,
    }
  })
}
