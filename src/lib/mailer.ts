import nodemailer, { type Transporter } from 'nodemailer'

/**
 * TRANSACTIONAL MAILER (PRODENV-1)
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared email sender backed by Resend SMTP (any standard SMTP provider works).
 * Configuration is env-driven; when SMTP is not configured the feature callers
 * fall back to their dev transports (digest stays LOGGED).
 *
 *   SMTP_HOST   smtp.resend.com
 *   SMTP_PORT   465 (implicit TLS) or 587 (STARTTLS — auto-detected)
 *   SMTP_USER   resend
 *   SMTP_PASS   <api key>
 *   SMTP_FROM   "Vendora <onboarding@resend.dev>"  ← switch to a verified domain
 *
 * NOTE (Resend test mode): until a sending domain is verified in the Resend
 * dashboard, Resend only DELIVERS messages to the account owner's address —
 * sends to other recipients are rejected (the send is attempted, the error is
 * surfaced to the caller). Verifying the domain unlocks delivery everywhere.
 */

export interface MailInput {
  to: string
  subject: string
  html: string
  text?: string
}

export interface MailResult {
  messageId: string
  accepted: string[]
}

export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
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

/** Send one transactional email. Throws with the provider's error on failure. */
export async function sendMail(input: MailInput): Promise<MailResult> {
  const info = await getTransporter().sendMail({
    from: smtpFromAddress(),
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  })
  return {
    messageId: info.messageId,
    accepted: (info.accepted as (string | { address: string })[] | undefined)
      ?.map((a) => (typeof a === 'string' ? a : a.address)) ?? [],
  }
}
