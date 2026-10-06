import { createHmac, timingSafeEqual } from 'crypto'
import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { recordAudit, recordAuditTx } from '@/server/modules/audit/service'
import { emitNotification } from '@/server/modules/notifications/service'
import { recomputeUserKycLevel, recomputeOrgKycLevel } from '@/server/modules/kyc/service'
import { resolveProviderConfig, getProviderSecret, getAdapter } from './dispatch'
import type { KycWebhookBody, KycWebhookResult } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// KYC PROVIDER WEBHOOK (Phase 12.4) — the external decision channel.
//
// POST /api/kyc/webhook/[providerKey] — PUBLIC route: the HMAC signature IS
// the authentication. Security pipeline, in order:
//
//   1. signature       HMAC-SHA256 over `${X-Vendora-Timestamp}.${X-Vendora-Nonce}.${rawBody}`
//                      with the provider secret — constant-time compare.
//                      Missing/invalid → 401 + a KycWebhookEvent row
//                      (signatureValid=false) + a KYC_WEBHOOK_UNAUTHENTICATED
//                      audit row (providerKey + IP recorded).
//   2. freshness       |now − X-Vendora-Timestamp| ≤ 5 min — the replay
//                      window. Stale → 400 (event still logged).
//   3. idempotency     eventId unique per provider: a duplicate delivery is a
//                      NO-OP (200 {duplicate:true}); the original event row is
//                      flagged replayed=true; the decision is never applied twice.
//   4. nonce replay    the DB unique constraint [providerKey, nonce] is the
//                      enforcement: a replayed nonce fails the insert → 400.
//
// Every delivery (authenticated or not) writes an immutable KycWebhookEvent
// receive-log row before any decision logic runs.
// ─────────────────────────────────────────────────────────────────────────────

const REPLAY_WINDOW_MS = 5 * 60 * 1000

export function verifyWebhookSignature(
  secret: string,
  timestamp: string,
  nonce: string,
  rawBody: string,
  signatureHex: string
): boolean {
  if (!/^[0-9a-f]+$/i.test(signatureHex)) return false
  const expected = createHmac('sha256', secret).update(`${timestamp}.${nonce}.${rawBody}`).digest('hex')
  if (expected.length !== signatureHex.length) return false
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signatureHex, 'hex'))
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2002'
  )
}

interface DeliveryInput {
  providerKey: string
  rawBody: string
  signature: string | null
  timestamp: string | null
  nonce: string | null
  ip: string
}

/**
 * The full delivery pipeline (called by the route handler with the RAW body
 * text — the signature covers the exact bytes, so no re-serialization).
 */
export async function handleWebhookDelivery(input: DeliveryInput): Promise<KycWebhookResult> {
  const { providerKey, rawBody, signature, timestamp, nonce, ip } = input

  // Unknown provider → nothing to verify against.
  if (!getAdapter(providerKey)) {
    return { status: 404, body: { error: `Unknown KYC provider "${providerKey}"` } }
  }

  let body: KycWebhookBody | null = null
  try {
    body = JSON.parse(rawBody) as KycWebhookBody
  } catch {
    body = null
  }

  // ── 1. authentication: the HMAC signature ─────────────────────────────────
  if (!signature || !timestamp || !nonce) {
    await logRejectedDelivery(providerKey, body, rawBody, nonce, ip, 'missing signature headers (X-Vendora-Signature/Timestamp/Nonce)')
    return { status: 401, body: { error: 'Missing webhook signature headers' } }
  }
  const secret = await getProviderSecret(providerKey)
  if (!verifyWebhookSignature(secret, timestamp, nonce, rawBody, signature)) {
    await logRejectedDelivery(providerKey, body, rawBody, nonce, ip, 'invalid HMAC signature')
    return { status: 401, body: { error: 'Invalid webhook signature' } }
  }

  if (!body || typeof body.eventId !== 'string' || !body.eventId || typeof body.eventType !== 'string' || typeof body.caseRef !== 'string') {
    return { status: 400, body: { error: 'Malformed webhook body — expected {eventId, eventType, caseRef}' } }
  }

  // ── 2. freshness: the replay window ──────────────────────────────────────
  const tsNumber = Number(timestamp)
  if (!Number.isFinite(tsNumber) || Math.abs(Date.now() - tsNumber) > REPLAY_WINDOW_MS) {
    await insertEventRow(providerKey, body, nonce, { signatureValid: true })
    await recordAudit({
      actorType: 'SYSTEM',
      action: 'KYC_WEBHOOK_REPLAY_WINDOW',
      entityType: 'KycWebhookEvent',
      entityId: body.eventId,
      summary: `webhook from "${providerKey}" outside the ±5min replay window — rejected`,
      metadata: { providerKey, ip, timestamp, eventType: body.eventType },
    })
    return { status: 400, body: { error: 'Webhook timestamp outside the allowed replay window' } }
  }

  // ── 3. event-id idempotency: duplicate delivery = no-op ───────────────────
  const existing = await db.kycWebhookEvent.findUnique({
    where: { providerKey_eventId: { providerKey, eventId: body.eventId } },
    select: { id: true, replayed: true },
  })
  if (existing) {
    if (!existing.replayed) {
      await db.kycWebhookEvent.update({ where: { id: existing.id }, data: { replayed: true } })
    }
    return { status: 200, body: { duplicate: true, eventId: body.eventId, applied: false } }
  }

  // ── 4. nonce uniqueness (replay protection) + the immutable receive log ──
  let eventRowId: string
  try {
    eventRowId = await insertEventRow(providerKey, body, nonce, { signatureValid: true })
  } catch (err) {
    if (isUniqueViolation(err)) {
      await recordAudit({
        actorType: 'SYSTEM',
        action: 'KYC_WEBHOOK_NONCE_REPLAY',
        entityType: 'KycWebhookEvent',
        entityId: body.eventId,
        summary: `webhook from "${providerKey}" replayed a used nonce — rejected`,
        metadata: { providerKey, ip, nonce, eventType: body.eventType },
      })
      return { status: 400, body: { error: 'Replayed nonce — delivery rejected' } }
    }
    throw err
  }

  // ── 5. decision application ──────────────────────────────────────────────
  const outcome = await applyWebhookDecision(providerKey, body)
  await db.kycWebhookEvent.update({
    where: { id: eventRowId },
    data: { caseId: outcome.caseId ?? null, processedAt: new Date() },
  })
  return { status: 200, body: { eventId: body.eventId, applied: outcome.applied, caseId: outcome.caseId ?? null } }
}

/** Log an UNAUTHENTICATED delivery (signature missing/invalid) + audit. */
async function logRejectedDelivery(
  providerKey: string,
  body: KycWebhookBody | null,
  rawBody: string,
  nonce: string | null,
  ip: string,
  reason: string
): Promise<void> {
  // Best-effort receive-log row: an attacker-controlled eventId may collide
  // with a logged event — the insert is skipped then (the 401 response and
  // the audit row below still evidence the attempt).
  try {
    await insertEventRow(
      providerKey,
      body ?? {
        eventId: `unverified-${createHmac('sha256', providerKey).update(rawBody).digest('hex').slice(0, 24)}`,
        eventType: 'ping',
        caseRef: '',
        ts: Date.now(),
        nonce: '',
      },
      nonce,
      { signatureValid: false }
    )
  } catch (err) {
    if (!isUniqueViolation(err)) console.error('[kyc-webhook] unauthenticated log row failed:', err)
  }
  await recordAudit({
    actorType: 'SYSTEM',
    action: 'KYC_WEBHOOK_UNAUTHENTICATED',
    entityType: 'KycWebhookEvent',
    entityId: body?.eventId ?? null,
    summary: `unauthenticated webhook delivery from "${providerKey}" rejected — ${reason}`,
    metadata: { providerKey, ip, reason, eventTypes: body?.eventType ?? null },
  })
}

async function insertEventRow(
  providerKey: string,
  body: KycWebhookBody,
  nonce: string | null,
  opts: { signatureValid: boolean }
): Promise<string> {
  const row = await db.kycWebhookEvent.create({
    data: {
      eventId: body.eventId,
      providerKey,
      eventType: body.eventType,
      payload: JSON.stringify(body).slice(0, 500_000),
      signatureValid: opts.signatureValid,
      nonce: nonce || body.nonce || null,
    },
    select: { id: true },
  })
  return row.id
}

// ── Decision application ─────────────────────────────────────────────────────

/**
 * Apply a provider decision to its case — idempotent by lastEventId, mode
 * aware:
 *
 *   case.approved → document VERIFIED + case APPROVED + KYC level recompute
 *   case.rejected → PROVIDER_THEN_MANUAL ? case MANUAL_QUEUE (document stays
 *                   PENDING — a human takes the second look) : document
 *                   REJECTED + case REJECTED
 *   case.error    → case PROVIDER_ERROR (failure semantics → manual queue)
 *   ping         → nothing to apply
 */
async function applyWebhookDecision(
  providerKey: string,
  body: KycWebhookBody
): Promise<{ applied: boolean; caseId?: string }> {
  const kase = await db.kycCase.findFirst({
    where: { providerKey, providerCaseRef: body.caseRef },
    include: { document: true, config: true },
  })
  if (!kase) return { applied: false }

  // Idempotency: this exact event already moved the case.
  if (kase.lastEventId === body.eventId) return { applied: false, caseId: kase.id }
  // A decided case is final — late events are logged, never re-applied.
  if (['APPROVED', 'REJECTED', 'CANCELLED'].includes(kase.status)) return { applied: false, caseId: kase.id }

  if (body.eventType === 'ping') return { applied: true, caseId: kase.id }

  const document = kase.document

  if (body.eventType === 'case.error') {
    // Async provider failure → the same failure semantics as a throwing
    // submit: manual queue, document stays PENDING.
    await db.$transaction(async (tx) => {
      await tx.kycCase.update({
        where: { id: kase.id },
        data: { status: 'PROVIDER_ERROR', errorDetail: (body.decision?.reason ?? 'provider reported a processing error').slice(0, 500) },
      })
      await recordAuditTx(tx, {
        actorType: 'SYSTEM',
        action: 'KYC_PROVIDER_ERROR',
        entityType: 'KycCase',
        entityId: kase.id,
        summary: `${kase.docType} provider reported a processing error — held for manual review`,
        metadata: { providerKey, reason: body.decision?.reason ?? null },
      })
    })
    return { applied: true, caseId: kase.id }
  }

  if (body.eventType === 'case.rejected') {
    const mode = kase.config?.mode ?? (await resolveProviderConfig(kase.docType)).mode
    if (mode === 'PROVIDER_THEN_MANUAL') {
      // The second look: the provider rejected, a human decides the final
      // outcome. The document STAYS PENDING.
      await db.$transaction(async (tx) => {
        await tx.kycCase.update({
          where: { id: kase.id },
          data: { status: 'MANUAL_QUEUE', decisionAt: null, lastEventId: body.eventId },
        })
        await recordAuditTx(tx, {
          actorType: 'SYSTEM',
          action: 'KYC_CASE_MANUAL_QUEUE',
          entityType: 'KycCase',
          entityId: kase.id,
          summary: `${kase.docType} provider rejection routed to the manual queue (PROVIDER_THEN_MANUAL)`,
          metadata: { providerKey, reason: body.decision?.reason ?? null, eventId: body.eventId },
        })
      })
      return { applied: true, caseId: kase.id }
    }

    const note = body.decision?.reason?.slice(0, 500) || 'provider rejected the document'
    const documentEligible = document.status === 'PENDING'
    await db.$transaction(async (tx) => {
      if (documentEligible) {
        await tx.accountDocument.update({
          where: { id: document.id },
          data: { status: 'REJECTED', reviewedAt: new Date(), note: `provider ${providerKey}: ${note}` },
        })
        await recordAuditTx(tx, {
          actorType: 'SYSTEM',
          action: 'DOCUMENT_REJECTED',
          entityType: 'AccountDocument',
          entityId: document.id,
          summary: `${kase.docType} rejected by provider "${providerKey}"`,
          metadata: { note, via: 'kyc-provider-webhook' },
        })
      }
      await tx.kycCase.update({
        where: { id: kase.id },
        data: { status: 'REJECTED', decisionAt: new Date(), lastEventId: body.eventId },
      })
      await recordAuditTx(tx, {
        actorType: 'SYSTEM',
        action: 'KYC_CASE_REJECTED',
        entityType: 'KycCase',
        entityId: kase.id,
        summary: `${kase.docType} case rejected by provider "${providerKey}"`,
        metadata: { reason: note, documentTouched: documentEligible, eventId: body.eventId },
      })
    })
    if (documentEligible) {
      await emitNotification({
        userId: document.userId,
        type: 'DOCUMENT_REJECTED',
        title: 'Document rejected',
        body: `Your ${document.title ?? kase.docType} was rejected: ${note}`,
        linkView: 'financing',
        linkId: document.id,
      })
      await recomputeUserKycLevel(document.userId)
      if (document.organizationId) await recomputeOrgKycLevel(document.organizationId)
    }
    return { applied: true, caseId: kase.id }
  }

  // case.approved
  const note = `provider ${providerKey}: approved`
  const documentEligible = document.status === 'PENDING'
  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    if (documentEligible) {
      await tx.accountDocument.update({
        where: { id: document.id },
        data: { status: 'VERIFIED', reviewedAt: new Date(), note },
      })
      await recordAuditTx(tx, {
        actorType: 'SYSTEM',
        action: 'DOCUMENT_VERIFIED',
        entityType: 'AccountDocument',
        entityId: document.id,
        summary: `${kase.docType} verified by provider "${providerKey}"`,
        metadata: { note, via: 'kyc-provider-webhook' },
      })
    }
    await tx.kycCase.update({
      where: { id: kase.id },
      data: { status: 'APPROVED', decisionAt: new Date(), lastEventId: body.eventId },
    })
    await recordAuditTx(tx, {
      actorType: 'SYSTEM',
      action: 'KYC_CASE_APPROVED',
      entityType: 'KycCase',
      entityId: kase.id,
      summary: `${kase.docType} case approved by provider "${providerKey}"`,
      metadata: { reason: body.decision?.reason ?? null, documentTouched: documentEligible, eventId: body.eventId },
    })
  })
  if (documentEligible) {
    await emitNotification({
      userId: document.userId,
      type: 'DOCUMENT_VERIFIED',
      title: 'Document verified',
      body: `Your ${document.title ?? kase.docType} passed automated verification and can be reused on every application.`,
      linkView: 'financing',
      linkId: document.id,
    })
    // A verification can raise the owner's KYC level (L2 for identity docs,
    // L3 evidence for business docs) — the existing engine recomputes it.
    await recomputeUserKycLevel(document.userId)
    if (document.organizationId) await recomputeOrgKycLevel(document.organizationId)
  }
  return { applied: true, caseId: kase.id }
}
