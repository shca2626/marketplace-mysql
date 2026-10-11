import { randomBytes } from 'crypto'
import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { recordAudit, recordAuditTx } from '@/server/modules/audit/service'
import { emitNotification } from '@/server/modules/notifications/service'
import { recomputeUserKycLevel, recomputeOrgKycLevel } from '@/server/modules/kyc/service'
import { mockProvider } from './mock-provider'
import {
  ProviderTimeoutError,
  type KycProviderAdapter,
  type KycProviderSettings,
  type KycSubmitInput,
} from './types'

// ─────────────────────────────────────────────────────────────────────────────
// KYC PROVIDER DISPATCH (Phase 12.4, lastplan v5 §12).
//
// Routing, per document type, admin-customizable through the console:
//
//   MANUAL               — NO KycCase is created. The document waits for an
//                          admin in the classic verify queue. This is the
//                          seeded default and the fail-safe when the config
//                          row is absent or disabled (pre-Phase-12 behavior).
//   PROVIDER             — a minimized payload is submitted to the provider;
//                          the decision arrives through the signed webhook.
//   PROVIDER_THEN_MANUAL  — like PROVIDER, but a provider REJECTION routes to
//                          MANUAL_QUEUE: a human takes the second look.
//
// FAILURE SEMANTICS (non-negotiable): a provider error or timeout resolves
// the case to PROVIDER_ERROR and the document STAYS PENDING — the case enters
// the manual queue. A provider outage can never auto-approve anything.
// ─────────────────────────────────────────────────────────────────────────────

export type KycRoutingMode = 'MANUAL' | 'PROVIDER' | 'PROVIDER_THEN_MANUAL'

export interface ResolvedProviderConfig {
  docType: string
  mode: KycRoutingMode
  providerKey: string
  enabled: boolean
  timeoutMs: number
  settings: KycProviderSettings
  configId: string | null
}

const DEFAULT_TIMEOUT_MS = 30_000

/** Absent config → MANUAL defaults (fail-safe, zero-behavior-change day one). */
export async function resolveProviderConfig(docType: string): Promise<ResolvedProviderConfig> {
  const row = await db.kycProviderConfig.findUnique({ where: { docType } })
  if (!row) {
    return {
      docType,
      mode: 'MANUAL',
      providerKey: 'mock',
      enabled: false,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      settings: {},
      configId: null,
    }
  }
  let settings: KycProviderSettings = {}
  try {
    settings = row.settings ? (JSON.parse(row.settings) as KycProviderSettings) : {}
  } catch {
    console.error(`[kyc-provider] config ${docType}: settings JSON unparseable — using defaults`)
  }
  return {
    docType: row.docType,
    mode: (row.mode as KycRoutingMode) ?? 'MANUAL',
    providerKey: row.providerKey,
    enabled: row.enabled,
    timeoutMs: row.timeoutMs || DEFAULT_TIMEOUT_MS,
    settings,
    configId: row.id,
  }
}

// ── Webhook secrets (PlatformSetting 'kyc-provider-secrets', JSON map) ───────

const SECRETS_SETTING_KEY = 'kyc-provider-secrets'

async function readSecretMap(tx: Prisma.TransactionClient): Promise<Record<string, string>> {
  const row = await tx.platformSetting.findUnique({ where: { key: SECRETS_SETTING_KEY } })
  if (!row) return {}
  try {
    const parsed = JSON.parse(row.value) as Record<string, unknown>
    const map: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed)) if (typeof v === 'string' && v.length >= 32) map[k] = v
    return map
  } catch {
    return {}
  }
}

async function writeSecretMap(map: Record<string, string>): Promise<void> {
  await db.platformSetting.upsert({
    where: { key: SECRETS_SETTING_KEY },
    update: { value: JSON.stringify(map) },
    create: { key: SECRETS_SETTING_KEY, value: JSON.stringify(map) },
  })
}

/** Resolve a provider's webhook secret, generating + persisting one on first use. */
export async function getProviderSecret(providerKey: string): Promise<string> {
  const map = await readSecretMap(db)
  const existing = map[providerKey]
  if (existing) return existing
  const secret = randomBytes(32).toString('hex')
  await writeSecretMap({ ...map, [providerKey]: secret })
  await recordAudit({
    actorType: 'SYSTEM',
    action: 'KYC_PROVIDER_SECRET_CREATED',
    entityType: 'KycProvider',
    entityId: providerKey,
    summary: `webhook signing secret generated for provider "${providerKey}" (first use)`,
  })
  return secret
}

/** Regenerate (admin action — the console's rotate button). Returns the new secret. */
export async function rotateProviderSecret(providerKey: string, adminId: string): Promise<string> {
  const map = await readSecretMap(db)
  const secret = randomBytes(32).toString('hex')
  await writeSecretMap({ ...map, [providerKey]: secret })
  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'KYC_PROVIDER_SECRET_ROTATED',
    entityType: 'KycProvider',
    entityId: providerKey,
    summary: `webhook signing secret rotated for provider "${providerKey}"`,
  })
  return secret
}

/** The secret map for the admin console (read-only display). */
export async function listProviderSecrets(): Promise<Record<string, string>> {
  return readSecretMap(db)
}

// ── Data minimization: the per-doc-type transmitted field matrix ────────────

/** Fields ALWAYS transmitted (the irreducible core — never the file bytes,
 *  never a public URL: `reference` is an opaque vault pointer, retrievable
 *  only through the platform's authorized proxy (6.6 semantics)). */
const BASE_FIELDS = ['docType', 'mediaSha256', 'reference'] as const

/** Per-doc-type ADDITIONAL fields. A field is transmitted only when the
 *  document actually carries it — absent values are omitted, not nulled. */
const DOC_TYPE_EXTRA_FIELDS: Record<string, readonly string[]> = {
  NATIONAL_ID: ['issuedAt', 'expiresAt', 'title'],
  PASSPORT: ['issuedAt', 'expiresAt', 'title'],
  RESIDENCE_PERMIT: ['issuedAt', 'expiresAt', 'title'],
  PROOF_OF_ADDRESS: ['issuedAt', 'expiresAt', 'title'],
  COMMERCIAL_REG: ['issuedAt', 'expiresAt', 'title'],
  BUSINESS_LICENSE: ['issuedAt', 'expiresAt', 'title'],
  TAX_CARD: ['issuedAt', 'expiresAt', 'title'],
  FINANCIAL_STATEMENT: ['issuedAt', 'title'],
  BANK_STATEMENT: ['issuedAt', 'title'],
  GUARANTEE_DOC: ['issuedAt', 'title'],
  INVOICE: ['issuedAt', 'title'],
  PURCHASE_ORDER: ['issuedAt', 'title'],
  FEASIBILITY_STUDY: ['title'],
  PROJECT_FILE: ['title'],
  OTHER: ['title'],
}

/** The matrix row for a doc type (for the console's evidence display). */
export function transmittedFieldsFor(docType: string): readonly string[] {
  const extra = DOC_TYPE_EXTRA_FIELDS[docType] ?? ['title']
  return [...BASE_FIELDS, ...extra]
}

type DispatchDocument = {
  id: string
  documentType: string
  title: string | null
  issuedAt: Date | null
  expiresAt: Date | null
  userId: string
  organizationId: string | null
  media: { id: string; sha256: string } | null
}

/** Build the minimized payload — ONLY what the doc type requires. */
export function buildMinimizedPayload(doc: DispatchDocument): {
  payload: Record<string, string>
  fields: Record<string, string>
} {
  const payload: Record<string, string> = {
    docType: doc.documentType,
    ...(doc.media ? { mediaSha256: doc.media.sha256, reference: `vault:${doc.media.id}` } : {}),
  }
  for (const field of DOC_TYPE_EXTRA_FIELDS[doc.documentType] ?? ['title']) {
    const value =
      field === 'title' ? doc.title?.trim() : field === 'issuedAt' ? doc.issuedAt?.toISOString().slice(0, 10) : field === 'expiresAt' ? doc.expiresAt?.toISOString().slice(0, 10) : null
    if (value) payload[field] = value
  }
  return { payload, fields: payload }
}

// ── Adapter registry ────────────────────────────────────────────────────────

const ADAPTERS: Record<string, KycProviderAdapter> = { mock: mockProvider }

export function getAdapter(providerKey: string): KycProviderAdapter | null {
  return ADAPTERS[providerKey] ?? null
}

export function availableProviderKeys(): string[] {
  return Object.keys(ADAPTERS)
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

export interface KycDispatchResult {
  dispatched: boolean
  caseId?: string
  status?: 'SUBMITTED' | 'PROVIDER_ERROR'
  reason?: string
  errorDetail?: string
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new ProviderTimeoutError(timeoutMs)), timeoutMs)
    }),
  ])
}

/**
 * Entry point, called after a successful document upload (fire-and-forget —
 * the caller wraps this so a dispatch failure NEVER breaks the upload).
 *
 * MANUAL routing (absent or disabled config) → no case is created: the exact
 * pre-Phase-12 behavior. PROVIDER / PROVIDER_THEN_MANUAL → a KycCase is
 * created carrying the EXACT minimized payload (transmittedFields evidence),
 * submitted to the adapter under the configured timeout.
 */
export async function dispatchDocumentForVerification(documentId: string): Promise<KycDispatchResult> {
  const doc = (await db.accountDocument.findUnique({
    where: { id: documentId },
    include: { media: { select: { id: true, sha256: true } } },
  })) as DispatchDocument | null
  if (!doc) return { dispatched: false, reason: 'document not found' }

  const config = await resolveProviderConfig(doc.documentType)
  if (config.mode === 'MANUAL' || !config.enabled) {
    return { dispatched: false, reason: config.mode === 'MANUAL' ? 'MANUAL routing (admin queue)' : 'routing disabled' }
  }

  const adapter = getAdapter(config.providerKey)
  if (!adapter) {
    // Misconfigured provider key — fail safe to the manual workflow.
    console.error(`[kyc-provider] no adapter registered for "${config.providerKey}" (${doc.documentType}) — staying manual`)
    return { dispatched: false, reason: `no adapter for provider "${config.providerKey}"` }
  }

  // One open case per document (re-dispatch guard).
  const openCase = await db.kycCase.findFirst({
    where: { documentId, status: { in: ['PENDING', 'SUBMITTED', 'PROVIDER_ERROR', 'MANUAL_QUEUE'] } },
    select: { id: true },
  })
  if (openCase) return { dispatched: false, caseId: openCase.id, reason: 'an open case already exists for this document' }

  // The EXACT minimized payload — persisted BEFORE submission so the evidence
  // survives even a throwing submit.
  const { payload } = buildMinimizedPayload(doc)
  const payloadJson = JSON.stringify(payload)

  const kase = await db.kycCase.create({
    data: {
      documentId: doc.id,
      docType: doc.documentType,
      providerKey: config.providerKey,
      configId: config.configId,
      status: 'PENDING',
      transmittedFields: payloadJson,
    },
    select: { id: true },
  })

  const input: KycSubmitInput = {
    caseId: kase.id,
    docType: doc.documentType,
    fields: payload,
    settings: config.settings,
    timeoutMs: config.timeoutMs,
    secret: await getProviderSecret(config.providerKey),
  }

  try {
    const result = await withTimeout(adapter.submit(input), config.timeoutMs)
    await db.kycCase.update({
      where: { id: kase.id },
      data: { status: 'SUBMITTED', providerCaseRef: result.providerCaseRef, submittedAt: new Date() },
    })
    return { dispatched: true, caseId: kase.id, status: 'SUBMITTED' }
  } catch (err) {
    // FAILURE SEMANTICS — provider error/timeout:
    //   case → PROVIDER_ERROR (which IS the manual-queue entry),
    //   document → STAYS PENDING (never auto-approve, never auto-reject).
    const isTimeout = err instanceof ProviderTimeoutError
    const detail = isTimeout
      ? `provider "${config.providerKey}" submit timed out after ${config.timeoutMs}ms — case held for manual review`
      : err instanceof Error
        ? `provider "${config.providerKey}" submit failed: ${err.message}`
        : `provider "${config.providerKey}" submit failed: ${String(err)}`
    // Atomic guard: while submit was hanging, a signed webhook may already
    // have decided the case — a late dispatch failure must never clobber a
    // decision (only PENDING/SUBMITTED cases degrade to PROVIDER_ERROR).
    await db.kycCase.updateMany({
      where: { id: kase.id, status: { in: ['PENDING', 'SUBMITTED'] } },
      data: { status: 'PROVIDER_ERROR', errorDetail: detail.slice(0, 500) },
    })
    await recordAudit({
      actorType: 'SYSTEM',
      action: 'KYC_PROVIDER_ERROR',
      entityType: 'KycCase',
      entityId: kase.id,
      summary: `${doc.documentType} provider submission failed — held for manual review`,
      metadata: { providerKey: config.providerKey, docType: doc.documentType, timeout: isTimeout, error: detail.slice(0, 300) },
    })
    return { dispatched: true, caseId: kase.id, status: 'PROVIDER_ERROR', errorDetail: detail }
  }
}

// ── Manual-queue decisions (admin — POST /api/admin/kyc/cases/[id]) ─────────

export type ManualDecisionAction = 'approve' | 'reject' | 'requeue'

export class KycCaseError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message)
    this.name = 'KycCaseError'
  }
}

const MANUALLY_DECIDABLE = new Set(['PENDING', 'PROVIDER_ERROR', 'MANUAL_QUEUE'])
const REQUEUEABLE = new Set(['PENDING', 'PROVIDER_ERROR', 'MANUAL_QUEUE'])

/**
 * A human decides a case that sits in the manual queue (PROVIDER_ERROR /
 * MANUAL_QUEUE) or has not been submitted yet (PENDING):
 *
 *   approve → document VERIFIED + case APPROVED (+ decidedById)
 *   reject  → document REJECTED + case REJECTED (+ decidedById)
 *   requeue → case back to PENDING (e.g. dispatched by mistake)
 *
 * SUBMITTED cases are in provider flight — deciding under a live submission
 * is refused (409) so a late webhook can never fight a human decision.
 */
export async function decideCaseManually(
  caseId: string,
  adminId: string,
  action: ManualDecisionAction,
  note?: string
): Promise<{ caseStatus: string }> {
  const kase = await db.kycCase.findUnique({
    where: { id: caseId },
    include: { document: { include: { user: { select: { id: true } } } } },
  })
  if (!kase) throw new KycCaseError('Case not found', 404)
  if (kase.status === 'SUBMITTED') {
    throw new KycCaseError('The case is still with the provider — wait for its decision or let it fail into the manual queue', 409)
  }
  if (!MANUALLY_DECIDABLE.has(kase.status)) {
    throw new KycCaseError(`Case is already ${kase.status}`, 409)
  }
  const cleanNote = note?.trim() || ''

  if (action === 'requeue') {
    if (!REQUEUEABLE.has(kase.status)) throw new KycCaseError(`Case is ${kase.status} — nothing to requeue`, 409)
    await db.$transaction(async (tx) => {
      await tx.kycCase.update({
        where: { id: caseId },
        data: { status: 'PENDING', decidedById: null, decisionAt: null },
      })
      await recordAuditTx(tx, {
        actorId: adminId,
        actorType: 'ADMIN',
        action: 'KYC_CASE_REQUEUED',
        entityType: 'KycCase',
        entityId: caseId,
        summary: `${kase.docType} case re-queued to PENDING`,
        metadata: { previousStatus: kase.status, note: cleanNote || null },
      })
    })
    return { caseStatus: 'PENDING' }
  }

  const approving = action === 'approve'
  const document = kase.document
  const documentNote = cleanNote || (approving ? 'manual queue: approved' : 'manual queue: rejected')

  // The document may already have been decided through the classic admin
  // queue while the case sat in the manual queue — a second VERIFIED pass is
  // a no-op, a REJECTED document cannot be un-rejected through this path.
  const documentEligible = document.status === 'PENDING'

  await db.$transaction(async (tx) => {
    if (documentEligible) {
      await tx.accountDocument.update({
        where: { id: document.id },
        data: {
          status: approving ? 'VERIFIED' : 'REJECTED',
          reviewedById: adminId,
          reviewedAt: new Date(),
          note: documentNote,
        },
      })
      // Document verification IS sensitive (6.11) — atomic with the change.
      await recordAuditTx(tx, {
        actorId: adminId,
        actorType: 'ADMIN',
        action: approving ? 'DOCUMENT_VERIFIED' : 'DOCUMENT_REJECTED',
        entityType: 'AccountDocument',
        entityId: document.id,
        summary: `${kase.docType}${document.title ? ` “${document.title}”` : ''} ${approving ? 'verified' : 'rejected'} (manual queue)`,
        metadata: { note: documentNote, via: 'kyc-case-manual-decision' },
      })
    }
    await tx.kycCase.update({
      where: { id: caseId },
      data: {
        status: approving ? 'APPROVED' : 'REJECTED',
        decidedById: adminId,
        decisionAt: new Date(),
        errorDetail: kase.status === 'PROVIDER_ERROR' ? kase.errorDetail : null,
      },
    })
    await recordAuditTx(tx, {
      actorId: adminId,
      actorType: 'ADMIN',
      action: approving ? 'KYC_CASE_APPROVED' : 'KYC_CASE_REJECTED',
      entityType: 'KycCase',
      entityId: caseId,
      summary: `${kase.docType} case ${approving ? 'approved' : 'rejected'} by manual queue decision`,
      metadata: { note: cleanNote || null, documentTouched: documentEligible },
    })
  })

  if (documentEligible) {
    await emitNotification({
      userId: document.userId,
      type: approving ? 'DOCUMENT_VERIFIED' : 'DOCUMENT_REJECTED',
      title: approving ? 'Document verified' : 'Document rejected',
      body: approving
        ? `Your ${document.title ?? kase.docType} passed verification and can be reused on every application.`
        : `Your ${document.title ?? kase.docType} was rejected: ${documentNote}`,
      linkView: 'financing',
      linkId: document.id,
    })
    await recomputeUserKycLevel(document.userId)
    if (document.organizationId) await recomputeOrgKycLevel(document.organizationId)
  }
  return { caseStatus: approving ? 'APPROVED' : 'REJECTED' }
}
