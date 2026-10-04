// ─────────────────────────────────────────────────────────────────────────────
// crypto-box — AES-256-GCM at rest for WhatsAppSender.credsJson (6.6.8).
// Self-contained copy of the app's src/lib/secret-box.ts format (v1.<iv>.<ct>.
// <tag>, base64url) so the app and this service interoperate on the same rows.
//
// Key source: MFA_ENCRYPTION_KEY (the app-wide secret-box key, documented in
// docs/environments.md) — read from the service .env / root .env. Production
// fails fast on a missing/weak key exactly like the app does. The plaintext
// Baileys session exists ONLY in process memory (and the local sessions/
// snapshot dir with 0600 perms) — never in the database.
//
// Legacy rows (plaintext JSON written before 6.6.8) are read transparently:
// decryptBox() passes through anything that is not a v1 payload; the next
// persist re-writes the row encrypted.
// ─────────────────────────────────────────────────────────────────────────────
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const KEY_MIN_BYTES = 16
const ENC_PREFIX = 'v1.'

function loadKey(): Buffer {
  let raw = process.env.MFA_ENCRYPTION_KEY
  if (!raw || raw.length < KEY_MIN_BYTES) {
    // .env copy in this folder, else the root .env (same resolution order as
    // ensureDatabaseUrl).
    for (const candidate of [path.join(HERE, '.env'), path.join(HERE, '..', '..', '.env')]) {
      try {
        if (!existsSync(candidate)) continue
        const m = readFileSync(candidate, 'utf8').match(/^MFA_ENCRYPTION_KEY=(.+)$/m)
        if (!m) continue
        const v = m[1].trim().replace(/^["']|["']$/g, '')
        if (v.length >= KEY_MIN_BYTES) {
          raw = v
          break
        }
      } catch {
        // unreadable candidate — try the next
      }
    }
  }
  if (!raw || raw.length < KEY_MIN_BYTES) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[crypto-box] FATAL: MFA_ENCRYPTION_KEY missing/short — refusing to store WhatsApp credentials unencrypted.'
      )
    }
    raw = 'vendora-dev-mfa-key'
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex')
  return createHash('sha256').update(raw).digest()
}

/** Encrypt → "v1.<iv>.<ciphertext>.<tag>" (base64url parts). */
export function encryptBox(plaintext: string): string {
  const key = loadKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ['v1', iv.toString('base64url'), enc.toString('base64url'), tag.toString('base64url')].join('.')
}

/**
 * Decrypt a v1 secret-box payload. Non-v1 input (legacy plaintext JSON)
 * passes through unchanged — callers re-encrypt on their next write.
 * Throws on tamper (GCM auth failure).
 */
export function decryptBox(payload: string): string {
  if (!payload.startsWith(ENC_PREFIX)) return payload // legacy plaintext
  const parts = payload.split('.')
  if (parts.length !== 4) throw new Error('crypto-box: malformed payload')
  const key = loadKey()
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(parts[1], 'base64url'))
  decipher.setAuthTag(Buffer.from(parts[3], 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(parts[2], 'base64url')), decipher.final()]).toString('utf8')
}

/** Quick predicate (cheap, no key material touched). */
export function isEncryptedBox(payload: string): boolean {
  return payload.startsWith(ENC_PREFIX)
}
