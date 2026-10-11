import { db } from '@/lib/db'
import { recordAudit } from '@/server/modules/audit/service'
import { emitNotification, emitNotifications } from '@/server/modules/notifications/service'
import { resolvePanel } from '@/server/modules/settings/service'

/**
 * FINANCING LAZY SWEEP — expiry + accreditation reminders (FINANCIER_PLAN §7).
 * ─────────────────────────────────────────────────────────────────────────
 * Mirrors the disputes.ts sweepDisputes pattern: idempotent conditional
 * updateMany per row, called from read paths via maybeSweep() (throttled to
 * once per minute — no cron, no loops). Covers:
 *   • financing requests past expiresAt (non-terminal pre-acceptance) → EXPIRED
 *   • SENT offers past validUntil → EXPIRED
 *   • ACCREDITED accreditations past validUntil → EXPIRED
 *   • ACCREDITATION_EXPIRING reminders inside the renewalReminderDays window
 *     (deduped: one per accreditation per 5 days)
 */

/** The pre-acceptance statuses the expiry sweep touches (§5.1). */
const FINANCING_EXPIRABLE = [
  'SUBMITTED',
  'UNDER_PLATFORM_REVIEW',
  'RETURNED_FOR_COMPLETION',
  'FORWARDED_TO_FINANCIER',
  'UNDER_FINANCIER_REVIEW',
  'OFFERED',
] as const

export async function sweepFinancing(): Promise<void> {
  const now = new Date()

  // ── Financing requests past their expiry ──
  const dueRequests = await db.financingRequest.findMany({
    where: { status: { in: [...FINANCING_EXPIRABLE] }, expiresAt: { lt: now } },
    select: { id: true, number: true, createdById: true },
    take: 100,
  })
  for (const r of dueRequests) {
    const updated = await db.financingRequest.updateMany({
      where: { id: r.id, status: { in: [...FINANCING_EXPIRABLE] } },
      data: { status: 'EXPIRED', closedAt: now },
    })
    if (updated.count === 0) continue
    await recordAudit({
      actorId: null,
      actorType: 'SYSTEM',
      action: 'FINANCING_STATUS_CHANGED',
      entityType: 'FinancingRequest',
      entityId: r.id,
      summary: `Request ${r.number} expired (deadline passed without an accepted offer)`,
    })
    await emitNotification({
      userId: r.createdById,
      type: 'FINANCING_STATUS_CHANGED',
      title: `Request ${r.number} expired`,
      body: 'The application window closed without an accepted offer. You can apply again anytime.',
      linkView: 'financing',
      linkId: r.id,
    })
  }

  // ── SENT offers past their validity ──
  const expiredOffers = await db.financingOffer.updateMany({
    where: { status: 'SENT', validUntil: { lt: now } },
    data: { status: 'EXPIRED' },
  })
  if (expiredOffers.count > 0) {
    await recordAudit({
      actorId: null,
      actorType: 'SYSTEM',
      action: 'FINANCING_STATUS_CHANGED',
      entityType: 'FinancingOffer',
      entityId: null,
      summary: `${expiredOffers.count} offer${expiredOffers.count === 1 ? '' : 's'} expired (validity deadline passed)`,
    })
  }

  // ── Live accreditations past their grant lifetime ──
  const dueAccreditations = await db.accreditationRequest.findMany({
    where: { status: 'ACCREDITED', validUntil: { lt: now } },
    select: { id: true, number: true, organizationId: true },
    take: 100,
  })
  for (const a of dueAccreditations) {
    const updated = await db.accreditationRequest.updateMany({
      where: { id: a.id, status: 'ACCREDITED' },
      data: { status: 'EXPIRED' },
    })
    if (updated.count === 0) continue
    await recordAudit({
      actorId: null,
      actorType: 'SYSTEM',
      action: 'FINANCING_STATUS_CHANGED',
      entityType: 'AccreditationRequest',
      entityId: a.id,
      summary: `Accreditation ${a.number} expired (validUntil passed) — renewal requires a new application`,
    })
    const managers = await db.organizationMember.findMany({
      where: { organizationId: a.organizationId, role: { in: ['OWNER', 'ADMIN'] } },
      select: { userId: true },
    })
    await emitNotifications(
      managers.map((m) => ({
        userId: m.userId,
        type: 'FINANCING_STATUS_CHANGED' as const,
        title: `Accreditation ${a.number} expired`,
        body: 'Your accreditation reached its validity limit — apply for renewal to keep RFQ participation.',
        linkView: 'financing' as const,
        linkId: a.id,
      }))
    )
  }

  // ── ACCREDITATION_EXPIRING reminders (window from settings) ──
  const accreditation = await resolvePanel('financingAccreditation')
  const reminderDays = Math.max(1, Number(accreditation.renewalReminderDays ?? 7))
  const windowEnd = new Date(now.getTime() + reminderDays * 86_400_000)
  const expiring = await db.accreditationRequest.findMany({
    where: {
      status: 'ACCREDITED',
      validUntil: { gte: now, lte: windowEnd },
    },
    select: { id: true, number: true, organizationId: true, validUntil: true },
    take: 100,
  })
  for (const a of expiring) {
    // Dedupe: skip when a reminder went out for this accreditation in the
    // last 5 days (one nag per window, not one per sweep)
    const cutoff = new Date(now.getTime() - 5 * 86_400_000)
    const recent = await db.notification.findFirst({
      where: {
        type: 'ACCREDITATION_EXPIRING',
        linkId: a.id,
        createdAt: { gte: cutoff },
      },
      select: { id: true },
    })
    if (recent) continue

    const managers = await db.organizationMember.findMany({
      where: { organizationId: a.organizationId, role: { in: ['OWNER', 'ADMIN'] } },
      select: { userId: true },
    })
    await emitNotifications(
      managers.map((m) => ({
        userId: m.userId,
        type: 'ACCREDITATION_EXPIRING' as const,
        title: `Accreditation ${a.number} expires soon`,
        body: `Your accreditation is valid until ${a.validUntil!.toISOString().slice(0, 10)} — renew to keep RFQ participation and auto-passed requirements.`,
        linkView: 'financing' as const,
        linkId: a.id,
      }))
    )
  }
}

// ── Throttled entry point (called from read paths) ─────────────────────────

let lastSweepAt = 0
let sweepInFlight = false

/**
 * Run the financing sweep at most once per 60s per process — safe to call from
 * any read path (list views, detail views). Best-effort: failures are logged
 * and swallowed, reads never break because a sweep hiccupped.
 */
export async function maybeSweep(): Promise<void> {
  if (sweepInFlight) return
  if (Date.now() - lastSweepAt < 60_000) return
  sweepInFlight = true
  try {
    await sweepFinancing()
    lastSweepAt = Date.now()
  } catch (err) {
    console.error('[financing] sweep failed:', err instanceof Error ? err.message : err)
  } finally {
    sweepInFlight = false
  }
}
