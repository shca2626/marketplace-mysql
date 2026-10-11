import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'crypto'

// ─────────────────────────────────────────────────────────────────────────────
// Secret-box — AES-256-GCM encryption at rest (Phase 6: MFA TOTP secrets
// 6.7.2, WhatsApp credentials 6.6.8).
//
// Key comes from the secret store (MFA_ENCRYPTION_KEY), NEVER from the
// database credential. Production fails fast on a missing/weak key — the same
// discipline as AUTH_SECRET (auth.ts). Key rotation procedure: set
// MFA_ENCRYPTION_KEY_OLD alongside the new key; decryptWithLegacy falls back
// to it; a re-encrypt sweep (`scripts/rotate-mfa-key.ts`) re-writes rows and
// the old key is then removed. (Documented in docs/environments.md.)
// ─────────────────────────────────────────────────────────────────────────────

const DEV_FALLBACK_KEY = 'vendora-dev-mfa-key'
const KEY_MIN_BYTES = 16

function loadKey(envName: string): Buffer {
  const raw = process.env[envName]
  if (raw && raw.length >= KEY_MIN_BYTES) {
    // Normalize any hex string of the right length into the 32-byte key.
    if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex')
    return createHash('sha256').update(raw).digest()
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `[crypto] FATAL: ${envName} is missing or too short (<${KEY_MIN_BYTES} chars). ` +
        'Generate one with `openssl rand -hex 32` and set it in the secret store. ' +
        'Refusing to encrypt secrets with a weak key.'
    )
  }
  return createHash('sha256').update(DEV_FALLBACK_KEY).digest()
}

/** AES-256-GCM. Output: v1.<iv>.<ciphertext>.<tag> (all base64url). */
export function encryptSecret(plaintext: string, envName = 'MFA_ENCRYPTION_KEY'): string {
  const key = loadKey(envName)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ['v1', iv.toString('base64url'), enc.toString('base64url'), tag.toString('base64url')].join('.')
}

/** Decrypt a secret-box payload; throws on tamper (GCM auth failure).
 *  Rotation: while `MFA_ENCRYPTION_KEY_OLD` is set, payloads that fail under
 *  the new key are retried under the old one (see docs/environments.md). */
export function decryptSecret(payload: string, envName = 'MFA_ENCRYPTION_KEY'): string {
  const parts = payload.split('.')
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('crypto: malformed secret-box payload')
  const key = loadKey(envName)
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(parts[1], 'base64url'))
  decipher.setAuthTag(Buffer.from(parts[3], 'base64url'))
  try {
    return Buffer.concat([decipher.update(Buffer.from(parts[2], 'base64url')), decipher.final()]).toString('utf8')
  } catch (err) {
    const legacyName = `${envName}_OLD`
    const legacy = process.env[legacyName]
    if (legacy) {
      const legacyKey = loadKey(legacyName)
      const d2 = createDecipheriv('aes-256-gcm', legacyKey, Buffer.from(parts[1], 'base64url'))
      d2.setAuthTag(Buffer.from(parts[3], 'base64url'))
      return Buffer.concat([d2.update(Buffer.from(parts[2], 'base64url')), d2.final()]).toString('utf8')
    }
    throw err
  }
}

/** SHA-256 hex of a token (invitation/session hashes — 6.5/6.7.7). */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** Constant-time string equality (token comparisons). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}
