import { createHmac, randomBytes } from 'crypto'

// ─────────────────────────────────────────────────────────────────────────────
// TOTP — RFC 6238 (Phase 6, lastplan v5 6.7).
// Minimal dependency-free implementation: HMAC-SHA1, 30-second step, 6 digits,
// ±1 step drift window (allows authenticator clock skew of one period).
// The secret is a base32 string — the standard encoding every authenticator
// app (Google Authenticator, Authy, 1Password, FreeOTP) accepts.
// ─────────────────────────────────────────────────────────────────────────────

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** Cryptographically random base32 secret (20 bytes = 160 bits, RFC 4226 §4). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20))
}

export function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  }
  return output
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase()
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char)
    if (idx === -1) throw new Error(`Invalid base32 character "${char}"`)
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

const STEP_SECONDS = 30
const CODE_DIGITS = 6
/** Allowed drift: current step ± DRIFT_STEPS (1 = ±30s). */
const DRIFT_STEPS = 1

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8)
  // Write the 64-bit counter big-endian (Number is safe: counters stay tiny).
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0)
  buf.writeUInt32BE(counter >>> 0, 4)
  const digest = createHmac('sha1', secret).update(buf).digest()
  // Dynamic truncation (RFC 4226 §5.3).
  const offset = digest[digest.length - 1] & 0x0f
  const bin =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3]
  return (bin % 10 ** CODE_DIGITS).toString().padStart(CODE_DIGITS, '0')
}

/** The code an authenticator would show right now (for tests + enrollment UX). */
export function totpNow(secret: string, atMs: number = Date.now()): string {
  return hotp(base32Decode(secret), Math.floor(atMs / 1000 / STEP_SECONDS))
}

/** Constant-time code comparison. */
function codesEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Verify a 6-digit code against the secret within the drift window.
 * Returns the matched step offset (-1 = no match) so callers can prevent the
 * SAME code from being replayed within its validity window.
 */
export function verifyTotp(
  secret: string,
  code: string,
  atMs: number = Date.now()
): { valid: boolean; step: number } {
  const normalized = (code ?? '').replace(/\s+/g, '')
  if (!/^\d{6}$/.test(normalized)) return { valid: false, step: -1 }
  const currentStep = Math.floor(atMs / 1000 / STEP_SECONDS)
  for (let drift = -DRIFT_STEPS; drift <= DRIFT_STEPS; drift++) {
    const candidate = hotp(base32Decode(secret), currentStep + drift)
    if (codesEqual(candidate, normalized)) return { valid: true, step: currentStep + drift }
  }
  return { valid: false, step: -1 }
}

/** otpauth:// URI — the standard enrollment format every authenticator scans. */
export function buildOtpauthUri(params: { secret: string; account: string; issuer?: string }): string {
  const issuer = params.issuer ?? 'Vendora'
  const label = encodeURIComponent(`${issuer}:${params.account}`)
  const query = new URLSearchParams({
    secret: params.secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(CODE_DIGITS),
    period: String(STEP_SECONDS),
  })
  return `otpauth://totp/${label}?${query.toString()}`
}
