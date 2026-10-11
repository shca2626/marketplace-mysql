import { db } from '@/lib/db'
import { emitNotification } from '@/server/modules/notifications/service'
import { sendWhatsAppText } from '@/lib/whatsapp'

/**
 * DOCUMENT EXPIRY REMINDERS (Phase 3 — KYC freshness).
 *
 * Scans the shared document vault for VERIFIED documents whose expiresAt is
 * within the next 30 days and reminds the owner once per dedupe window
 * (14 days) per document:
 *   · in-app notification (type DOCUMENT_EXPIRING, linkView 'account' — the
 *     Verification card lives there and links into the vault)
 *   · WhatsApp twin (template NOTIFICATION) when the owner has a phone —
 *     fire-and-forget, never blocks the scan
 *
 * Dedupe strategy: the notification's linkId carries the AccountDocument id;
 * an existing DOCUMENT_EXPIRING notification for the same doc within the
 * last 14 days suppresses a repeat.
 *
 * Triggers: POST /api/admin/kyc/expiry-scan (manual, admin) + an opportunistic
 * throttle hook in the admin documents queue GET (once per hour, module-level
 * timestamp — no cron infrastructure needed in the sandbox).
 */

export const EXPIRY_WINDOW_DAYS = 30
export const EXPIRY_DEDUPE_DAYS = 14

function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000)
}

export interface ExpiryScanResult {
  scanned: number
  reminded: number
}

export async function scanDocumentExpiry(): Promise<ExpiryScanResult> {
  const horizon = new Date(Date.now() + EXPIRY_WINDOW_DAYS * 86_400_000)
  const dedupeFloor = new Date(Date.now() - EXPIRY_DEDUPE_DAYS * 86_400_000)

  // 1. All verified docs expiring within the window (incl. already-expired —
  //    those get a "has expired" variant so owners can replace them).
  const docs = await db.accountDocument.findMany({
    where: {
      isActive: true,
      status: 'VERIFIED',
      expiresAt: { not: null, lte: horizon },
    },
    include: { user: { select: { id: true, name: true, phone: true } } },
    take: 400,
  })

  // 2. Which doc ids were already reminded recently? (one query, then a set)
  const recent = await db.notification.findMany({
    where: {
      type: 'DOCUMENT_EXPIRING',
      linkId: { in: docs.map((d) => d.id) },
      createdAt: { gte: dedupeFloor },
    },
    select: { linkId: true },
  })
  const remindedIds = new Set(recent.map((n) => n.linkId))

  let reminded = 0
  for (const doc of docs) {
    if (remindedIds.has(doc.id)) continue
    const expiresAt = doc.expiresAt!
    const days = daysUntil(expiresAt)
    const docName = doc.title ?? doc.documentType.replaceAll('_', ' ').toLowerCase()
    const dateStr = expiresAt.toISOString().slice(0, 10)

    const title = days < 0 ? 'Document has expired' : 'Document expiring soon'
    const body =
      days < 0
        ? `Your ${docName} (expired ${dateStr}) is no longer valid — upload a current version so your verification and financing flows keep working.`
        : `Your ${docName} expires on ${dateStr} (${days} day${days === 1 ? '' : 's'}). Upload a renewed copy to keep your verified status.`

    await emitNotification({
      userId: doc.userId,
      type: 'DOCUMENT_EXPIRING',
      title,
      body,
      linkView: 'account',
      linkId: doc.id,
    })

    // WhatsApp twin — only when a phone exists. Fire-and-forget.
    if (doc.user.phone) {
      void sendWhatsAppText({
        toPhone: doc.user.phone,
        body: `Vendora — ${title}: ${body}`,
        template: 'NOTIFICATION',
        userId: doc.user.id,
      })
    }
    reminded++
  }

  return { scanned: docs.length, reminded }
}

// ── Opportunistic auto-trigger ──────────────────────────────────────────────
// No cron in the sandbox: when an admin opens the documents verification
// queue, run the scan in the background — throttled to once per hour per
// server process via a module-level timestamp.
const AUTO_SCAN_INTERVAL_MS = 60 * 60 * 1000
let lastAutoScanAt = 0
let autoScanInFlight: Promise<unknown> | null = null

export function triggerExpiryScanThrottled(): void {
  if (Date.now() - lastAutoScanAt < AUTO_SCAN_INTERVAL_MS) return
  lastAutoScanAt = Date.now()
  autoScanInFlight = scanDocumentExpiry()
    .then((r) => {
      if (r.reminded > 0) {
        console.log(`[kyc:expiry] auto-scan reminded ${r.reminded} owner(s) of ${r.scanned} expiring doc(s)`)
      }
    })
    .catch((err) => {
      console.error('[kyc:expiry] auto-scan failed:', err instanceof Error ? err.message : err)
    })
    .finally(() => {
      autoScanInFlight = null
    })
}

/** Await any in-flight background scan (used by tests/manual runs). */
export async function waitForExpiryScan(): Promise<void> {
  if (autoScanInFlight) await autoScanInFlight
}
