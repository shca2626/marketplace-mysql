import nodemailer, { type Transporter } from 'nodemailer'
import { getDomains, isResendApiConfigured, sendViaApi } from '@/lib/resend'

/**
 * TRANSACTIONAL MAILER (PRODENV-1, API-first EMAILTRACK-1, branded sender BRIDGE-1)
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared email sender backed by Resend with a two-tier strategy:
 *
 *   1. Resend REST API (RESEND_API_KEY) — preferred. Returns the provider
 *      message id, which the app can poll for DELIVERY state (sent /
 *      delivered / bounced) and finally see Resend's "test mode" behavior.
 *   2. Resend SMTP (SMTP_HOST/SMTP_USER/SMTP_PASS, pooled) — fallback when
 *      the API key is unset or the API call fails (network error, non-2xx).
 *
 *   RESEND_API_KEY  <api key>            ← enables the API-first path
 *   SMTP_HOST       smtp.resend.com
 *   SMTP_PORT       465 (implicit TLS) or 587 (STARTTLS — auto-detected)
 *   SMTP_USER       resend
 *   SMTP_PASS       <api key>
 *   SMTP_FROM       "Vendora <yusr.support@yusr.site.je>"  ← branded sender
 *
 * BRANDED SENDER WITH AUTOMATIC FALLBACK (BRIDGE-1): Resend REJECTS (403) any
 * send from an address on an unverified domain, so SMTP_FROM alone cannot move
 * to the branded address before yusr.site.je is verified. resolveFromAddress()
 * checks the desired sender's domain against the Resend domain list (cached
 * 5 minutes) and transparently falls back to the always-safe testing sender
 * "Vendora <onboarding@resend.dev>" while the branded domain is not verified —
 * the moment it verifies, every send switches with NO config change.
 *
 * NOTE (Resend test mode): until a sending domain is verified in the Resend
 * dashboard, Resend only DELIVERS messages to the account owner's address —
 * sends to other recipients are accepted then silently withheld (or rejected
 * over SMTP). getMailerMode() + the email-config diagnostics endpoint
 * (/api/notifications/digest?config=1) expose this state so the UI can warn
 * honestly. Verifying the domain unlocks delivery.
 */

export interface MailInput {
  to: string
  subject: string
  html: string
  text?: string
}

export type MailResult =
  | { ok: true; via: 'resend-api' | 'smtp'; providerMessageId?: string }
  | { ok: false; error: string }

/** Which mechanism sendMail will use with the current env (diagnostics). */
export type MailerMode = 'resend-api' | 'smtp' | 'none'

/** getMailerMode() result: transport + the sender sendMail would use right now. */
export interface MailerModeInfo {
  mode: MailerMode
  from: string
  fallbackActive: boolean
}

export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
}

export function isMailerConfigured(): boolean {
  return isResendApiConfigured() || isSmtpConfigured()
}

/**
 * Parse a from address in either "Name <email@host>" or "email@host" form.
 * The email is lowercased for matching; a malformed input yields domain ''
 * (which resolveFromAddress then treats conservatively — fallback).
 */
export function parseFromAddress(from: string): { email: string; domain: string } {
  const trimmed = from.trim()
  const bracket = trimmed.match(/<([^<>]*)>/)
  const email = (bracket && bracket[1] ? bracket[1] : trimmed).trim().toLowerCase()
  const at = email.lastIndexOf('@')
  return { email, domain: at >= 0 ? email.slice(at + 1) : '' }
}

/** Raw SMTP_FROM target (the branded sender we WANT to use). */
export function smtpFromAddress(): string {
  return process.env.SMTP_FROM || 'Vendora <onboarding@resend.dev>'
}

/** Resend's shared testing sender — the one address that never needs verification. */
const FALLBACK_FROM = 'Vendora <onboarding@resend.dev>'

export interface FromResolution {
  from: string
  /** true when the desired branded sender was swapped out for the fallback. */
  fallbackActive: boolean
}

// Resolved-sender cache — the domain list is fetched from Resend at most every
// 5 minutes per server process (still cheap enough to flip soon after a
// verification lands in the dashboard).
const FROM_CACHE_TTL_MS = 5 * 60 * 1000
let fromCache: { at: number; value: FromResolution } | null = null

/**
 * Resolve the sender address sendMail should use right now (BRIDGE-1):
 *
 *   - desired = SMTP_FROM (or the onboarding default when unset);
 *   - desired on resend.dev → use it as-is (always allowed);
 *   - no RESEND_API_KEY → use it as-is (SMTP-only deployment is trusted to
 *     point SMTP_FROM at an address its provider accepts — nothing to check
 *     against, and no API send path that could 403);
 *   - otherwise ask Resend (GET /domains): verified domain → use it as-is;
 *     anything else (not_started / pending / failed / absent, or the domain
 *     list unavailable) → the onboarding fallback, because Resend would
 *     REJECT the branded sender with 403. Never risk the 403.
 *
 * Never throws: getDomains() degrades to null on failure (→ fallback).
 */
export async function resolveFromAddress(): Promise<FromResolution> {
  if (fromCache && Date.now() - fromCache.at < FROM_CACHE_TTL_MS) return fromCache.value

  const desired = smtpFromAddress()
  const { domain } = parseFromAddress(desired)
  let value: FromResolution

  if (domain === 'resend.dev') {
    // Resend's shared testing sender — no verification needed, ever.
    value = { from: desired, fallbackActive: false }
  } else if (!isResendApiConfigured()) {
    // SMTP-only mode: no Resend API to check against — trust the config.
    value = { from: desired, fallbackActive: false }
  } else {
    const domains = await getDomains()
    const verified =
      domains !== null &&
      domains.some((d) => d.status === 'verified' && d.name.toLowerCase() === domain)
    value = verified
      ? { from: desired, fallbackActive: false }
      : { from: FALLBACK_FROM, fallbackActive: true }
    if (domains === null) {
      console.warn(
        '[mailer] could not fetch the Resend domain list — using the onboarding fallback sender for this send'
      )
    } else if (!verified) {
      console.warn(
        `[mailer] domain "${domain}" is not verified in Resend yet — sending as ${FALLBACK_FROM} (switches to ${desired} automatically once verified)`
      )
    }
  }

  fromCache = { at: Date.now(), value }
  return value
}

/** Diagnostics: mechanism + resolved sender for the current env (async since BRIDGE-1). */
export async function getMailerMode(): Promise<MailerModeInfo> {
  const { from, fallbackActive } = await resolveFromAddress()
  const mode: MailerMode = isResendApiConfigured()
    ? 'resend-api'
    : isSmtpConfigured()
      ? 'smtp'
      : 'none'
  return { mode, from, fallbackActive }
}

let cachedTransporter: Transporter | null = null

function getTransporter(): Transporter {
  if (cachedTransporter) return cachedTransporter

  const port = Number(process.env.SMTP_PORT || 465)
  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // 465 speaks implicit TLS; anything else (587/2525) upgrades via STARTTLS.
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER as string,
      pass: process.env.SMTP_PASS as string,
    },
    // Resend answers fast; generous ceilings guard the request path.
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
    pool: true,
    maxConnections: 3,
  })
  return cachedTransporter
}

/**
 * Send one transactional email — Resend REST API first, SMTP pool fallback.
 * The from address is resolved once per call via resolveFromAddress() (branded
 * sender when its domain is verified in Resend, onboarding fallback otherwise)
 * and is used for BOTH paths. Never throws: failures come back as
 * { ok: false, error } so callers can persist an honest status instead of
 * crashing the request.
 */
export async function sendMail(input: MailInput): Promise<MailResult> {
  // Resolved sender (BRIDGE-1) — shared by the API and the SMTP path.
  const { from } = await resolveFromAddress()

  let apiError: string | null = null

  // 1) Resend REST API — the id it returns enables delivery tracking.
  if (isResendApiConfigured()) {
    try {
      const sent = await sendViaApi({ ...input, from })
      if (sent) {
        console.log(`[mailer] sent via resend API → recipient: ${input.to} · id: ${sent.id}`)
        return { ok: true, via: 'resend-api', providerMessageId: sent.id }
      }
    } catch (err) {
      apiError = err instanceof Error ? err.message : String(err)
      console.error(`[mailer] resend API send failed, falling back to SMTP → ${apiError}`)
    }
  }

  // 2) SMTP fallback (pooled transport).
  if (isSmtpConfigured()) {
    try {
      const info = await getTransporter().sendMail({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      })
      console.log(`[mailer] sent via SMTP → recipient: ${input.to} · id: ${info.messageId}`)
      return { ok: true, via: 'smtp', providerMessageId: info.messageId }
    } catch (err) {
      const smtpError = err instanceof Error ? err.message : String(err)
      return {
        ok: false,
        error: apiError
          ? `Resend API: ${apiError} · SMTP: ${smtpError}`
          : `SMTP: ${smtpError}`,
      }
    }
  }

  return {
    ok: false,
    error: apiError
      ? `Resend API: ${apiError}`
      : 'No mail transport configured — set RESEND_API_KEY or SMTP_HOST/SMTP_USER/SMTP_PASS',
  }
}
