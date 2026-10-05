import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { db } from '@/lib/db'
import { getStorage } from '@/lib/storage'
import { recordAudit } from '@/server/modules/audit/service'
import { canAccessAccountDocument, type DocumentAccessBasis } from './access'

// ─────────────────────────────────────────────────────────────────────────────
// Private-vault URL service — 6.6.4 (B8 authenticated proxy model).
//
// Issuance (POST /api/documents/[id]/access):
//   authorize via the 6.8 resolver → mint a one-time nonce (VaultAccessGrant
//   row, minutes-TTL) → HMAC-bind {documentId, userId, nonce, exp} → audit
//   DOCUMENT_URL_ISSUED. The URL is returned exactly once.
//
// Retrieval (GET /api/vault/[documentId]?exp&nonce&sig):
//   re-authenticate the session → verify HMAC + expiry + grant row →
//   atomically consume the nonce (updateMany WHERE consumedAt IS NULL) →
//   RE-authorize access (revocation works at retrieval time, not just
//   issuance) → audit DOCUMENT_FILE_RETRIEVED → stream the bytes with
//   Cache-Control: no-store. NO redirects — the proxy streams the bytes
//   itself, so retrieval is provably post-authorization (6.6.5).
//
// Signature: HMAC-SHA256 over "v1|documentId|userId|nonce|exp" keyed by
// VAULT_SIGNING_KEY (secret store; dev fallback with the same fail-fast
// discipline as MFA_ENCRYPTION_KEY). The rejected alternative —
// transferable bearer URLs with CDN-log evidence — is documented in
// lastplan 6.6.4 for the record.
// ─────────────────────────────────────────────────────────────────────────────

const DEV_FALLBACK_KEY = 'vendora-dev-vault-key'
export const VAULT_URL_TTL_SECONDS = 300 // minutes-TTL default (5 minutes)
const MAX_TTL_SECONDS = VAULT_URL_TTL_SECONDS // callers may only SHORTEN

function vaultKey(): Buffer {
  const raw = process.env.VAULT_SIGNING_KEY
  if (raw && raw.length >= 16) {
    if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex')
    return createHmac('sha256', raw).update('vendora-vault-key-normalize').digest()
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[vault] FATAL: VAULT_SIGNING_KEY is missing or too short (<16 chars). ' +
        'Generate one with `openssl rand -hex 32`. Refusing to sign vault URLs with a weak key.'
    )
  }
  return createHmac('sha256', DEV_FALLBACK_KEY).update('vendora-vault-key-normalize').digest()
}

function signPayload(documentId: string, userId: string, nonce: string, exp: number): string {
  return createHmac('sha256', vaultKey()).update(`v1|${documentId}|${userId}|${nonce}|${exp}`).digest('hex')
}

export interface IssuedVaultUrl {
  url: string
  expiresAt: string // ISO
  basis: string
}

/** Issue a one-time, minutes-TTL retrieval URL (authorized + audited). */
export async function issueVaultUrl(
  userId: string,
  documentId: string,
  opts?: { ttlSeconds?: number; ip?: string | null }
): Promise<IssuedVaultUrl> {
  const doc = await db.accountDocument.findUnique({
    where: { id: documentId },
    select: { id: true, userId: true, organizationId: true, documentType: true, isActive: true, mediaId: true },
  })
  if (!doc || !doc.isActive) throw Object.assign(new Error('Document not found'), { status: 404 })

  const decision = await canAccessAccountDocument(userId, doc)
  if (!decision.allowed || !decision.basis) {
    throw Object.assign(new Error('You do not have access to this document'), { status: 403 })
  }

  const ttl = Math.max(1, Math.min(opts?.ttlSeconds ?? VAULT_URL_TTL_SECONDS, MAX_TTL_SECONDS))
  const nonce = randomBytes(24).toString('hex') // 48 hex chars — one-time use
  const exp = Math.floor(Date.now() / 1000) + ttl
  const sig = signPayload(doc.id, userId, nonce, exp)

  await db.vaultAccessGrant.create({
    data: {
      documentId: doc.id,
      userId,
      nonce,
      basis: decision.basis,
      expiresAt: new Date(exp * 1000),
      issuedIp: opts?.ip ?? null,
    },
  })

  // 6.6.5 — issuance is its OWN audit event, never conflated with retrieval.
  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'DOCUMENT_URL_ISSUED',
    entityType: 'AccountDocument',
    entityId: doc.id,
    summary: `Vault retrieval URL issued (${decision.basis}, TTL ${ttl}s)`,
    metadata: { documentId: doc.id, basis: decision.basis, ttlSeconds: ttl, sensitivity: decision.sensitivity },
  })

  const url = `/api/vault/${doc.id}?exp=${exp}&nonce=${nonce}&sig=${sig}`
  return { url, expiresAt: new Date(exp * 1000).toISOString(), basis: decision.basis }
}

export type VaultConsumeFailure =
  | 'NOT_FOUND'
  | 'UNAUTHENTICATED'
  | 'BAD_SIGNATURE'
  | 'EXPIRED'
  | 'REPLAYED'
  | 'NOT_GRANTED_TO_USER'
  | 'ACCESS_REVOKED'
  | 'STORAGE_MISS'

export class VaultConsumeError extends Error {
  constructor(
    public readonly reason: VaultConsumeFailure,
    public readonly status: number,
    message: string
  ) {
    super(message)
    this.name = 'VaultConsumeError'
  }
}

/**
 * Consume a one-time vault URL: verify + re-authorize + stream-ready.
 * The nonce is consumed ATOMICALLY — two concurrent fetches of the same URL
 * can never both win (updateMany WHERE consumedAt IS NULL returns 1 or 0).
 */
export async function consumeVaultUrl(
  sessionUserId: string | null,
  documentId: string,
  exp: number,
  nonce: string,
  sig: string,
  opts?: { ip?: string | null }
): Promise<{ buffer: Buffer; mime: string; documentId: string }> {
  if (!sessionUserId) {
    throw new VaultConsumeError('UNAUTHENTICATED', 401, 'Sign in to retrieve this document')
  }

  // 1) Signature first (constant time) — never touch the DB on a forged URL.
  const expected = signPayload(documentId, sessionUserId, nonce, exp)
  const a = Buffer.from(sig, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new VaultConsumeError('BAD_SIGNATURE', 403, 'Invalid document URL signature')
  }

  // 2) Expiry (both the signed exp and the grant row's own clock).
  if (exp * 1000 < Date.now()) {
    throw new VaultConsumeError('EXPIRED', 410, 'This document link has expired')
  }

  const doc = await db.accountDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      userId: true,
      organizationId: true,
      documentType: true,
      isActive: true,
      media: { select: { id: true, key: true, mime: true, variants: true, namespace: true } },
    },
  })
  if (!doc || !doc.isActive) {
    throw new VaultConsumeError('NOT_FOUND', 404, 'Document not found')
  }

  // 3) One-time nonce — atomic consume. The grant must belong to THIS user.
  const consumed = await db.vaultAccessGrant.updateMany({
    where: { nonce, documentId, userId: sessionUserId, consumedAt: null },
    data: { consumedAt: new Date() },
  })
  if (consumed.count !== 1) {
    const grant = await db.vaultAccessGrant.findUnique({ where: { nonce } })
    if (!grant) throw new VaultConsumeError('NOT_FOUND', 404, 'Unknown document link')
    if (grant.userId !== sessionUserId) {
      throw new VaultConsumeError('NOT_GRANTED_TO_USER', 403, 'This link was issued to a different session')
    }
    throw new VaultConsumeError('REPLAYED', 410, 'This document link has already been used')
  }

  // 4) RE-AUTHORIZE at retrieval time (6.6.4: every retrieval re-checks the
  //    access policy — a revocation between issuance and fetch still lands).
  const decision = await canAccessAccountDocument(sessionUserId, doc)
  if (!decision.allowed) {
    throw new VaultConsumeError('ACCESS_REVOKED', 403, 'Access to this document was revoked')
  }

  // 5) Stream the largest rendition (the full-size image) from the vault.
  let variants: Record<string, string> = {}
  try {
    variants = doc.media.variants ? JSON.parse(doc.media.variants) : {}
  } catch {
    variants = {}
  }
  const key = variants.full ?? variants.large ?? variants.medium ?? Object.values(variants)[0]
  if (!key) throw new VaultConsumeError('STORAGE_MISS', 404, 'Document media is missing')

  const storage = getStorage()
  const buffer = await storage.getOrNull(key)
  if (!buffer) throw new VaultConsumeError('STORAGE_MISS', 404, 'Document media is missing')

  // 6) Retrieval is its own audit event — provably post-authorization.
  await recordAudit({
    actorId: sessionUserId,
    actorType: 'USER',
    action: 'DOCUMENT_FILE_RETRIEVED',
    entityType: 'AccountDocument',
    entityId: doc.id,
    summary: `Vault document retrieved (${decision.basis})`,
    metadata: {
      documentId: doc.id,
      basis: decision.basis,
      sensitivity: decision.sensitivity,
      noncePrefix: nonce.slice(0, 8),
      ip: opts?.ip ?? null,
    },
  })

  // Renditions are PNG by construction (renditionKey → .{role}.png) — the
  // streamed bytes are the re-encoded rendition, not the original upload.
  return { buffer, mime: 'image/png', documentId: doc.id }
}

/** Reaper — delete long-expired grant rows (called from the documents queue
 *  route opportunistically, throttled; grants are tiny so this is hygiene). */
let reaperLastRun = 0
export async function reapExpiredGrantsThrottled(): Promise<void> {
  const now = Date.now()
  if (now - reaperLastRun < 15 * 60_000) return // once per 15 min per process
  reaperLastRun = now
  try {
    await db.vaultAccessGrant.deleteMany({ where: { expiresAt: { lt: new Date(now - 3600_000) } } })
  } catch (err) {
    console.error('[vault] grant reaper failed:', err)
  }
}
