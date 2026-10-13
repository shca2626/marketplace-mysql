// In-memory sliding-window rate limiter (day-1 core infrastructure).
// ─────────────────────────────────────────────────────────────────────
// Keyed buckets (e.g. `login:1.2.3.4`, `upload:user_abc`) hold recent
// timestamps; a request passes while fewer than `limit` fall inside `windowMs`.
// Single-process by design (dev / single-node); the same signature maps 1:1
// onto a Redis sorted-set implementation for horizontal scale later.
//
// Buckets are pruned lazily on access + every 5 minutes via an unref'd timer.

const buckets = new Map<string, number[]>() // key → timestamps (ms)

const GC_INTERVAL = 5 * 60 * 1000
let gcTimer: ReturnType<typeof setInterval> | null = null

export interface RateLimitResult {
  ok: boolean
  remaining: number
  retryAfterSec: number // 0 when ok
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  ensureGc()

  const now = Date.now()
  const windowStart = now - windowMs
  const stamps = (buckets.get(key) ?? []).filter((t) => t > windowStart)

  if (stamps.length >= limit) {
    const retryAt = stamps[0] + windowMs // oldest hit leaves the window here
    return { ok: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((retryAt - now) / 1000)) }
  }

  stamps.push(now)
  buckets.set(key, stamps)
  return { ok: true, remaining: limit - stamps.length, retryAfterSec: 0 }
}

/** Reset a bucket (e.g. after a successful login, so honest users aren't locked out). */
export function resetRateLimit(key: string) {
  buckets.delete(key)
}

function ensureGc() {
  if (gcTimer) return
  gcTimer = setInterval(() => {
    const now = Date.now()
    let maxWindow = 0
    for (const stamps of buckets.values()) maxWindow = Math.max(maxWindow, stamps.length)
    // cheap universal prune: drop buckets whose every stamp is older than 1h
    for (const [key, stamps] of buckets) {
      if (stamps.every((t) => now - t > 3_600_000) && stamps.length > 0) buckets.delete(key)
    }
  }, GC_INTERVAL)
  gcTimer.unref()
}

// ── Named policies (single source of truth) ──────────────────────────
export const RATE_LIMITS = {
  login: { limit: 10, windowMs: 10 * 60_000 }, // per IP — brute-force damping
  register: { limit: 5, windowMs: 30 * 60_000 }, // per IP
  upload: { limit: 30, windowMs: 10 * 60_000 }, // per user
  productWrite: { limit: 60, windowMs: 10 * 60_000 }, // per user (create/update/delete/bulk)
  review: { limit: 10, windowMs: 60 * 60_000 }, // per user
  order: { limit: 20, windowMs: 10 * 60_000 }, // per user (checkout)
  mediaRead: { limit: 600, windowMs: 60_000 }, // per IP — generous, responses are immutable
  digest: { limit: 10, windowMs: 10 * 60_000 }, // per user (preview/generate digest actions)
  digestStatus: { limit: 30, windowMs: 10 * 60_000 }, // per user (delivery checks → outbound Resend API)
  emailConfig: { limit: 30, windowMs: 10 * 60_000 }, // per user (mailer diagnostics → outbound Resend API)
  mysqlCheck: { limit: 10, windowMs: 10 * 60_000 }, // per admin (MySQL diagnostics → outbound DB connection, MYSQLTOOL-1)
  passwordForgot: { limit: 5, windowMs: 30 * 60_000 }, // per IP — email-send damping (AUTHSEC-1)
  passwordReset: { limit: 10, windowMs: 30 * 60_000 }, // per IP — token consumption attempts (AUTHSEC-1)
  emailVerify: { limit: 5, windowMs: 60 * 60_000 }, // per user — verification send requests (AUTHSEC-1)
  document: { limit: 30, windowMs: 10 * 60_000 }, // per user — document uploads (RFQ attachments, settlement evidence)
  otpRequest: { limit: 12, windowMs: 10 * 60_000 }, // per IP — OTP issuance (Phase 3; per-phone/per-day caps live in the OTP service)
  otpVerify: { limit: 30, windowMs: 10 * 60_000 }, // per IP — OTP verification attempts (attempt caps also live in the OTP service)
  companyRegister: { limit: 5, windowMs: 30 * 60_000 }, // per user — merchant/dealer company registration submit (Phase 3)
  financierRegister: { limit: 5, windowMs: 30 * 60_000 }, // per IP — financier application submit (Phase 3)
  chatWidgetSession: { limit: 10, windowMs: 60_000 }, // per IP — webchat widget session creation (WA-CHAT)
  chatWidgetSend: { limit: 20, windowMs: 60_000 }, // per token — webchat widget message send (WA-CHAT)
  chatWidgetPoll: { limit: 60, windowMs: 60_000 }, // per token — webchat widget incremental poll (WA-CHAT)
} as const
