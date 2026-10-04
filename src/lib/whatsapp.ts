// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp dispatch client (Phase 3) — server-side ONLY.
// ─────────────────────────────────────────────────────────────────────────────
// Sends outbound WhatsApp texts through the Baileys mini-service
// (mini-services/whatsapp-service, port 3031). The mini-service owns the
// paired sender sessions; this client:
//   1. checks a PAIRED default sender exists in the DB,
//   2. POSTs { toPhone, body } to the service,
//   3. writes the WhatsAppMessage audit row (SENT/FAILED),
//   4. falls back to DEV-mode console delivery when the service is down or no
//      sender is paired yet — so OTP flows stay testable end-to-end today.
//
// The same helper is reused by the notification-mirroring fan-out (WA twin of
// every in-app notification) and by admin "test message" actions.

import { db } from '@/lib/db'

const SERVICE_URL = process.env.WHATSAPP_SERVICE_URL ?? 'http://localhost:3031'
const SERVICE_TOKEN = process.env.WHATSAPP_SERVICE_TOKEN ?? 'vendora-internal'
const FETCH_TIMEOUT_MS = 8_000

export interface WhatsAppSendInput {
  toPhone: string // E.164
  body: string
  template?: 'OTP' | 'NOTIFICATION' | 'TEST' | 'CUSTOM'
  userId?: string | null // recipient user when known
  notificationId?: string | null // mirrored in-app notification when applicable
}

export interface WhatsAppSendResult {
  ok: boolean
  delivered: 'whatsapp' | 'dev'
  error?: string
  /**
   * DEV delivery only: when the sandbox console fallback carries an OTP
   * message, the 6-digit code is surfaced here so the UI can show a
   * "sandbox code" chip — without it the code is only in dev.log and the
   * OTP flow is untestable for a human. Never set on real WhatsApp delivery.
   */
  devCode?: string
}

/**
 * Fire-and-forget-safe WhatsApp text send. NEVER throws — returns a result
 * so callers can decide whether to surface a warning. When no sender is
 * paired or the service is unreachable, the message is logged to the server
 * console as a DEV delivery (visible in dev.log) so flows never dead-end.
 */
export async function sendWhatsAppText(input: WhatsAppSendInput): Promise<WhatsAppSendResult> {
  const template = input.template ?? 'CUSTOM'

  // 1. Is there an active outbound line?
  let senderId: string | null = null
  try {
    const sender = await db.whatsAppSender.findFirst({
      where: { status: 'PAIRED', isDefault: true },
      select: { id: true },
    })
    senderId = sender?.id ?? null
  } catch {
    // DB hiccup — still attempt the service (it may pair its own session)
  }

  // 2. Dispatch via the mini-service when a line exists (or always try in dev)
  if (senderId) {
    try {
      const res = await fetch(`${SERVICE_URL}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Token': SERVICE_TOKEN },
        body: JSON.stringify({ toPhone: input.toPhone, body: input.body, senderId }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      const ok = res.ok
      const errText = ok ? undefined : `service responded ${res.status}`
      await logMessage(input, template, senderId, ok ? 'SENT' : 'FAILED', errText)
      if (ok) return { ok: true, delivered: 'whatsapp' }
      console.error(`[whatsapp] send failed (${input.toPhone}): ${errText}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await logMessage(input, template, senderId, 'FAILED', msg)
      console.error(`[whatsapp] service unreachable (${input.toPhone}): ${msg}`)
    }
  }

  // 3. DEV fallback — the code/message lands in dev.log; flows keep working.
  console.log(`[whatsapp:DEV] to=${input.toPhone} template=${template} :: ${input.body}`)
  await logMessage(input, template, senderId, 'SENT', null, true)
  // Extract the OTP for the UI sandbox chip (dev delivery only).
  const devCode = process.env.NODE_ENV === 'production' ? undefined : input.body.match(/\b(\d{6})\b/)?.[1]
  return { ok: true, delivered: 'dev', devCode }
}

async function logMessage(
  input: WhatsAppSendInput,
  template: string,
  senderId: string | null,
  status: 'SENT' | 'FAILED',
  error: string | null | undefined,
  dev = false
) {
  try {
    await db.whatsAppMessage.create({
      data: {
        senderId,
        toPhone: input.toPhone,
        template,
        body: input.body,
        status,
        error: dev ? 'dev-console-delivery' : error,
        userId: input.userId ?? null,
        notificationId: input.notificationId ?? null,
        sentAt: status === 'SENT' ? new Date() : null,
      },
    })
  } catch {
    // logging must never break the caller
  }
}
