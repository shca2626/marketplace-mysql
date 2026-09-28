import { db } from '@/lib/db'
import { getMailerMode, smtpFromAddress } from '@/lib/mailer'
import { getDigestProviderId } from '@/lib/notifications/digest-provider-store'
import { getDomains, getEmailStatus, RESEND_EVENTS } from '@/lib/resend'
import type { DigestDeliveryStatusDTO, EmailConfigDTO } from '@/lib/types'

/**
 * EMAIL DELIVERY TRACKING (EMAILTRACK-1)
 * ─────────────────────────────────────────────────────────────────────────────
 * Makes email delivery VISIBLE and HONEST: polls Resend's real delivery state
 * for sent digests and reports whether the account is in Resend "test mode"
 * (no verified sending domain → Resend accepts sends but only DELIVERS to the
 * account owner's address — the root cause of "email sent but not received").
 *
 * Delivery status is the body of what /api/notifications/digest/status should
 * serve; email config is the body of /api/notifications/email-config. The
 * sandbox file tools cannot create new route directories, so both handlers
 * currently live as query-param branches on the existing
 * /api/notifications/digest route — the functions below are the complete,
 * framework-free logic; splitting them into their own route files is a
 * mechanical 5-minute move for a shell-capable session.
 */

export type DeliveryStatusResult =
  | { ok: true; status: DigestDeliveryStatusDTO }
  | { ok: false; httpStatus: 404 | 503; error: string }

/**
 * Poll one stored digest's delivery state from the Resend REST API
 * (GET /emails/{id} → last_event). Ownership-scoped: the digest must belong
 * to the given user, so provider message ids are never cross-probable.
 *
 *   delivery mirrors Resend's last_event (delivered | sent | bounced |
 *   complained | delivery_delayed) or 'unknown' when the provider lookup
 *   failed (outage, unset key). 404 when the digest is unknown for this
 *   user; 503 when no provider id was stored (SMTP/dev send or legacy row).
 */
export async function getDigestDeliveryStatus(
  userId: string,
  digestId: string
): Promise<DeliveryStatusResult> {
  const digest = await db.notificationDigest.findFirst({
    where: { id: digestId, userId },
    select: { id: true },
  })
  if (!digest) return { ok: false, httpStatus: 404, error: 'Digest not found' }

  const providerId = await getDigestProviderId(digestId)
  if (!providerId) {
    return {
      ok: false,
      httpStatus: 503,
      error: 'No provider message id stored for this digest — delivery tracking requires a Resend API send',
    }
  }

  const provider = await getEmailStatus(providerId)
  const lastEvent = provider?.last_event ?? null
  const delivery =
    lastEvent && (RESEND_EVENTS as readonly string[]).includes(lastEvent) ? lastEvent : 'unknown'

  return {
    ok: true,
    status: { delivery, lastEvent, checkedAt: new Date().toISOString() },
  }
}

/**
 * Mailer diagnostics for the digest dialog. testMode is true when NO Resend
 * domain has status 'verified' — i.e. Resend only delivers to the account
 * owner's address. On Resend API failure testMode degrades to 'unknown'
 * (banner stays hidden rather than raising a false alarm).
 */
export async function getEmailConfig(): Promise<EmailConfigDTO> {
  const domains = await getDomains()
  const testMode: boolean | 'unknown' =
    domains === null ? 'unknown' : !domains.some((d) => d.status === 'verified')

  return {
    testMode,
    domains: domains ?? [],
    fromAddress: smtpFromAddress(),
    mailerMode: getMailerMode(),
  }
}
