import nodemailer, { type Transporter } from 'nodemailer'
import { isResendApiConfigured, sendViaApi } from '@/lib/resend'

/**
 * TRANSACTIONAL MAILER (PRODENV-1, API-first EMAILTRACK-1)
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
 *   SMTP_FROM       "Vendora <onboarding@resend.dev>"  ← switch to a verified domain
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

export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
}

export function isMailerConfigured(): boolean {
  return isResendApiConfigured() || isSmtpConfigured()
}

export function getMailerMode(): MailerMode {
  if (isResendApiConfigured()) return 'resend-api'
  if (isSmtpConfigured()) return 'smtp'
  return 'none'
}

export function smtpFromAddress(): string {
  return process.env.SMTP_FROM || 'Vendora <onboarding@resend.dev>'
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
 * Never throws: failures come back as { ok: false, error } so callers can
 * persist an honest status instead of crashing the request.
 */
export async function sendMail(input: MailInput): Promise<MailResult> {
  let apiError: string | null = null

  // 1) Resend REST API — the id it returns enables delivery tracking.
  if (isResendApiConfigured()) {
    try {
      const sent = await sendViaApi({ ...input, from: smtpFromAddress() })
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
        from: smtpFromAddress(),
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
