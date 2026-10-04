// ─────────────────────────────────────────────────────────────────────────────
// OTP service (Phase 3) — phone-first authentication engine.
// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle:
//   request: normalize phone → throttle (60s resend cooldown, 5/day/phone,
//            10/hour/IP) → delete stale unconsumed codes → mint 6-digit code →
//            SHA-256 hash → deliver via WhatsApp (dev-console fallback)
//   verify:  lookup latest live code → attempt-capped (5) → constant-time
//            compare → burn (single-use) → return HMAC-signed PROOF TOKEN
//            (10 min) that register/reset-password accept as possession proof.
//
// The proof token means the API routes never re-check delivery — they just
// verify the signature, matching purpose + phone.

import { createHmac, randomInt, timingSafeEqual } from 'crypto'
import { db } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { sendWhatsAppText } from '@/lib/whatsapp'

export const OTP_TTL_MS = 5 * 60 * 1000 // codes live 5 minutes
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000 // one send per minute per phone
export const OTP_MAX_ATTEMPTS = 5 // wrong entries before the code is burned
export const OTP_PROOF_TTL_MS = 10 * 60 * 1000 // proof token validity
const DAILY_PER_PHONE = 5
const HOURLY_PER_IP = 10

export type OtpPurpose = 'REGISTER' | 'RESET'

const DEV_FALLBACK_SECRET = 'vendora-dev-secret'
function otpSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (secret && secret.length >= 32) return secret
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[otp] FATAL: AUTH_SECRET missing/short — refusing to sign OTP proofs.')
  }
  return DEV_FALLBACK_SECRET
}

function sha256(value: string): string {
  return createHmac('sha256', otpSecret()).update(value).digest('hex')
}

// ── Proof tokens ───────────────────────────────────────────────────────────

/** Sign a possession proof: HMAC over `phone.purpose.expiresAt`. */
export function signOtpProof(phone: string, purpose: OtpPurpose): { token: string; expiresAt: Date } {
  const exp = Date.now() + OTP_PROOF_TTL_MS
  const payload = `${phone}.${purpose}.${exp}`
  return { token: `${payload}.${createHmac('sha256', otpSecret()).update(payload).digest('hex')}`, expiresAt: new Date(exp) }
}

/** Verify a proof token matches phone + purpose and is unexpired. */
export function verifyOtpProof(token: string, phone: string, purpose: OtpPurpose): boolean {
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== 4) return false
  const [p, pu, exp, sig] = parts
  if (p !== phone || pu !== purpose) return false
  const expNum = Number(exp)
  if (!Number.isFinite(expNum) || expNum < Date.now()) return false
  const expected = createHmac('sha256', otpSecret()).update(`${p}.${pu}.${exp}`).digest('hex')
  if (sig.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  } catch {
    return false
  }
}

// ── Issuance ────────────────────────────────────────────────────────────────

export type IssueResult =
  | { ok: true; expiresAt: Date; resendAfterSec: number; devCode?: string }
  | { ok: false; status: number; error: string; retryAfterSec?: number }

export async function issueOtp(args: {
  phone: string // already-normalized E.164
  purpose: OtpPurpose
  ip?: string
  userId?: string | null // recipient when known (log enrichment)
}): Promise<IssueResult> {
  const { phone, purpose } = args

  // Throttles — independent buckets, fail-closed with clear messages.
  const perPhone = rateLimit(`otp-phone:${phone}`, DAILY_PER_PHONE, 24 * 60 * 60 * 1000)
  if (!perPhone.ok) {
    return {
      ok: false,
      status: 429,
      error: 'Too many codes requested for this number today. Try again tomorrow or contact support.',
      retryAfterSec: perPhone.retryAfterSec,
    }
  }
  const perIp = args.ip ? rateLimit(`otp-ip:${args.ip}`, HOURLY_PER_IP, 60 * 60 * 1000) : null
  if (perIp && !perIp.ok) {
    return {
      ok: false,
      status: 429,
      error: 'Too many verification requests from this network. Please wait a few minutes.',
      retryAfterSec: perIp.retryAfterSec,
    }
  }

  // Resend cooldown — newest live code must be ≥60s old.
  const live = await db.otpCode.findFirst({
    where: { phone, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  })
  if (live && Date.now() - live.createdAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((OTP_RESEND_COOLDOWN_MS - (Date.now() - live.createdAt.getTime())) / 1000)
    return { ok: false, status: 429, error: `Please wait ${wait}s before requesting a new code.`, retryAfterSec: wait }
  }

  // Mint + persist (replace any stale unconsumed codes for this phone+purpose).
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const expiresAt = new Date(Date.now() + OTP_TTL_MS)
  await db.otpCode.deleteMany({ where: { phone, purpose, consumedAt: null } })
  await db.otpCode.create({
    data: {
      phone,
      purpose,
      codeHash: sha256(code),
      expiresAt,
      ip: args.ip ?? null,
    },
  })

  // Deliver — WhatsApp first, dev-console fallback keeps flows testable.
  const delivery = await sendWhatsAppText({
    toPhone: phone,
    template: 'OTP',
    userId: args.userId ?? null,
    body:
      purpose === 'REGISTER'
        ? `Vendora — your verification code is ${code}. Valid for 5 minutes. Do not share it with anyone.`
        : `Vendora — your password reset code is ${code}. Valid for 5 minutes. If you did not request it, ignore this message.`,
  })

  // Sandbox/dev delivery — surface the code to the requesting UI so a human
  // can complete the flow (the real line is not paired yet). Never in prod.
  const devCode = delivery.delivered === 'dev' ? delivery.devCode ?? code : undefined

  return {
    ok: true,
    expiresAt,
    resendAfterSec: Math.ceil(OTP_RESEND_COOLDOWN_MS / 1000),
    ...(devCode && process.env.NODE_ENV !== 'production' ? { devCode } : {}),
  }
}

// ── Verification ────────────────────────────────────────────────────────────

export type VerifyResult =
  | { ok: true; proofToken: string; proofExpiresAt: Date }
  | { ok: false; status: number; error: string }

export async function verifyOtp(args: {
  phone: string // already-normalized E.164
  code: string
  purpose: OtpPurpose
}): Promise<VerifyResult> {
  const { phone, code, purpose } = args
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, status: 400, error: 'Enter the 6-digit code from WhatsApp.' }
  }

  const otp = await db.otpCode.findFirst({
    where: { phone, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  })
  if (!otp || otp.expiresAt.getTime() < Date.now()) {
    return { ok: false, status: 400, error: 'This code has expired. Request a new one.' }
  }
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    await db.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } })
    return { ok: false, status: 429, error: 'Too many wrong attempts. Request a new code.' }
  }

  const expected = otp.codeHash
  const actual = sha256(code)
  const match =
    expected.length === actual.length &&
    (() => {
      try {
        return timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
      } catch {
        return false
      }
    })()

  if (!match) {
    const attempts = otp.attempts + 1
    await db.otpCode.update({ where: { id: otp.id }, data: { attempts } })
    return {
      ok: false,
      status: 400,
      error: `Incorrect code. ${OTP_MAX_ATTEMPTS - attempts} attempt${OTP_MAX_ATTEMPTS - attempts === 1 ? '' : 's'} left.`,
    }
  }

  // Burn + issue the signed possession proof.
  await db.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date(), attempts: otp.attempts + 1 } })
  const proof = signOtpProof(phone, purpose)
  return { ok: true, proofToken: proof.token, proofExpiresAt: proof.expiresAt }
}

// ── Housekeeping ─────────────────────────────────────────────────────────────

/** Purge expired/burned codes older than a day (cheap, call opportunistically). */
export async function sweepOtps(): Promise<void> {
  try {
    await db.otpCode.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } })
  } catch {
    // never fatal
  }
}
