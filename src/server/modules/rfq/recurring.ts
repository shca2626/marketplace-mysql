import { db } from '@/lib/db'
import { recordAudit } from '@/server/modules/audit/service'
import { emitNotification, emitNotifications, type EmitInput } from '@/server/modules/notifications/service'
import { resolvePanel } from '@/server/modules/settings/service'
import { nextNumber } from '@/server/modules/sequences/service'
import { createRfq, computeEligibleSellers, rfqSettingsCtx, RfqServiceError } from './service'
import type { RecurringScheduleDTO } from '@/lib/types'
import { userHasPlatformPermission } from '@/server/modules/rbac/service'
import { randomUUID } from 'crypto'

/** 7.5 fencing tokens — random per claim so a stale lease can never act
 * after a reclaim rewrites the token (S5). */
const crypto = { randomUUID }

/**
 * RECURRING RFQs — runtime enforcement of the "Recurring RFQs" settings panel.
 *
 * A schedule is a frozen line snapshot + a cadence. The spawn engine is a lazy
 * sweep (like expiry): every RFQ read path also nudges due schedules. Each due
 * run clones the snapshot into a fresh RFQ and routes it through the normal
 * distribution filter (or the stored recipient list when keepSameRecipients).
 *
 * Settings enforced here:
 *   enabled, patterns[], maxActivePerBuyer, autoPublish, autoApprove (wired in
 *   createQuote), notifyBeforeHours, buyerEditBeforeSend, buyerSkipCycle,
 *   autoCancelEmptyCycles, keepSameRecipients, allowRecipientRefresh.
 */

export class RecurringServiceError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'RecurringServiceError'
    this.status = status
  }
}

export type Frequency = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'CUSTOM'

const DAY = 86_400_000

function cycleMs(frequency: string, intervalDays: number): number {
  switch (frequency) {
    case 'WEEKLY':
      return 7 * DAY
    case 'BIWEEKLY':
      return 14 * DAY
    case 'MONTHLY':
      return 30 * DAY
    case 'QUARTERLY':
      return 91 * DAY
    case 'CUSTOM':
      return Math.max(1, intervalDays) * DAY
    default:
      return 30 * DAY
  }
}

export function frequencyLabel(frequency: string, intervalDays: number): string {
  switch (frequency) {
    case 'WEEKLY':
      return 'Weekly'
    case 'BIWEEKLY':
      return 'Every 2 weeks'
    case 'MONTHLY':
      return 'Monthly'
    case 'QUARTERLY':
      return 'Quarterly'
    case 'CUSTOM':
      return `Every ${intervalDays} days`
    default:
      return frequency
  }
}

export interface ScheduleLineInput {
  productId?: string | null
  productName?: string | null
  sku?: string | null
  variantId?: string | null
  quantity: number
  targetPrice?: number | null
  notes?: string | null
}

export interface CreateScheduleInput {
  title?: string | null
  description?: string | null
  organizationId?: string | null
  frequency: Frequency
  intervalDays?: number | null
  lines: ScheduleLineInput[]
  startInDays?: number | null // first run offset (default: one cycle out)
}

type ScheduleRow = {
  id: string
  userId: string
  organizationId: string | null
  title: string | null
  description: string | null
  frequency: string
  intervalDays: number
  lines: string
  recipientIds: string | null
  active: boolean
  pausedUntil: Date | null
  lastRunAt: Date | null
  nextRunAt: Date
  previewNotifiedAt: Date | null
  emptyCycles: number
  runCount: number
  lastRfqId: string | null
  createdAt: Date
  updatedAt: Date
}

function parseLines(raw: string): ScheduleLineInput[] {
  try {
    const parsed = JSON.parse(raw) as ScheduleLineInput[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parseRecipientIds(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as string[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function serializeSchedule(s: ScheduleRow, lastRfqNumber?: string | null): RecurringScheduleDTO {
  const lines = parseLines(s.lines)
  return {
    id: s.id,
    title: s.title,
    description: s.description,
    frequency: s.frequency,
    intervalDays: s.intervalDays,
    active: s.active && (!s.pausedUntil || s.pausedUntil.getTime() <= Date.now()),
    pausedUntil: s.pausedUntil?.toISOString() ?? null,
    nextRunAt: s.nextRunAt.toISOString(),
    lastRunAt: s.lastRunAt?.toISOString() ?? null,
    emptyCycles: s.emptyCycles,
    runCount: s.runCount,
    lastRfqId: s.lastRfqId,
    lastRfqNumber: lastRfqNumber ?? null,
    lineCount: lines.length,
    totalQuantity: lines.reduce((sum, l) => sum + (l.quantity ?? 0), 0),
    recipientCount: parseRecipientIds(s.recipientIds).length,
    createdAt: s.createdAt.toISOString(),
  }
}

// ── Create ───────────────────────────────────────────────────────────────────

export async function createSchedule(
  userId: string,
  input: CreateScheduleInput
): Promise<RecurringScheduleDTO> {
  const settings = await resolvePanel('recurring', await rfqSettingsCtx(input.organizationId ?? null))
  if (!settings.enabled) {
    throw new RecurringServiceError('Recurring RFQs are disabled by the platform', 403)
  }
  const patterns: string[] = (settings.patterns as string[]) ?? []
  if (!patterns.includes(input.frequency)) {
    throw new RecurringServiceError('That repeat pattern is not allowed by the platform', 422)
  }
  if (input.frequency === 'CUSTOM') {
    if (!input.intervalDays || input.intervalDays < 1 || input.intervalDays > 365) {
      throw new RecurringServiceError('Custom schedules need an interval of 1–365 days', 422)
    }
  }
  if (!input.lines?.length) throw new RecurringServiceError('A schedule needs at least one line item')

  const activeCount = await db.recurringRfq.count({ where: { userId, active: true } })
  if (activeCount >= Number(settings.maxActivePerBuyer)) {
    throw new RecurringServiceError(
      `You already have ${activeCount} active schedules (limit ${settings.maxActivePerBuyer}).`,
      429
    )
  }

  // Validate the snapshot by drafting the first RFQ through the normal rules
  // (product existence, variant ownership, MOQ) — then delete the draft; the
  // spawn engine re-runs createRfq on every cycle so rules stay live.
  try {
    const draft = await createRfq(userId, {
      title: input.title,
      description: input.description,
      organizationId: input.organizationId,
      lines: input.lines,
    })
    await db.rfq.delete({ where: { id: draft.id } })
  } catch (err) {
    if (err instanceof RfqServiceError) throw new RecurringServiceError(err.message, err.status)
    throw err
  }

  const cycle = cycleMs(input.frequency, input.intervalDays ?? 0)
  const startInDays = input.startInDays ?? null
  const nextRunAt = new Date(
    Date.now() + (startInDays != null ? Math.max(0, startInDays) * DAY : cycle)
  )

  const created = await db.recurringRfq.create({
    data: {
      userId,
      organizationId: input.organizationId ?? null,
      title: input.title?.trim() || null,
      description: input.description?.trim() || null,
      frequency: input.frequency,
      intervalDays: input.frequency === 'CUSTOM' ? (input.intervalDays ?? 30) : 0,
      lines: JSON.stringify(input.lines),
      active: true,
      nextRunAt,
    },
  })

  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'RECURRING_CREATED',
    entityType: 'RecurringRfq',
    entityId: created.id,
    summary: `Recurring schedule created (${frequencyLabel(input.frequency, input.intervalDays ?? 0)})`,
    metadata: { lines: input.lines.length },
  })

  return serializeSchedule(created as unknown as ScheduleRow)
}

// ── Buyer management ─────────────────────────────────────────────────────────

async function ownedSchedule(id: string, userId: string, isAdmin: boolean) {
  const s = await db.recurringRfq.findUnique({ where: { id } })
  if (!s) throw new RecurringServiceError('Schedule not found', 404)
  if (s.userId !== userId && !isAdmin) throw new RecurringServiceError('Not your schedule', 403)
  return s
}

export async function listMySchedules(userId: string): Promise<RecurringScheduleDTO[]> {
  await processDueSchedules()
  const rows = await db.recurringRfq.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })
  // Last run's RFQ number for display
  const lastIds = rows.map((r) => r.lastRfqId).filter((x): x is string => !!x)
  const lastRfqs = lastIds.length
    ? await db.rfq.findMany({ where: { id: { in: lastIds } }, select: { id: true, number: true } })
    : []
  const numberById = new Map(lastRfqs.map((r) => [r.id, r.number]))
  return rows.map((r) => serializeSchedule(r as unknown as ScheduleRow, numberById.get(r.lastRfqId ?? '')))
}

export async function pauseSchedule(id: string, actor: { id: string; role: string }): Promise<RecurringScheduleDTO> {
  const s = await ownedSchedule(id, actor.id, await userHasPlatformPermission(actor.id, 'rfq.pipeline.view'))
  const updated = await db.recurringRfq.update({ where: { id }, data: { active: false } })
  await recordAudit({
    actorId: actor.id,
    actorType: 'USER',
    action: 'RECURRING_PAUSED',
    entityType: 'RecurringRfq',
    entityId: id,
    summary: `Recurring schedule paused`,
  })
  return serializeSchedule(updated as unknown as ScheduleRow)
}

export async function resumeSchedule(id: string, actor: { id: string; role: string }): Promise<RecurringScheduleDTO> {
  const s = await ownedSchedule(id, actor.id, await userHasPlatformPermission(actor.id, 'rfq.pipeline.view'))
  // Don't resurrect auto-cancelled (empty-cycle) schedules without a reset
  const updated = await db.recurringRfq.update({
    where: { id },
    data: {
      active: true,
      pausedUntil: null,
      emptyCycles: 0,
      // next run one full cycle out — pausing shouldn't fire a backlog
      nextRunAt: new Date(Date.now() + cycleMs(s.frequency, s.intervalDays)),
    },
  })
  await recordAudit({
    actorId: actor.id,
    actorType: 'USER',
    action: 'RECURRING_RESUMED',
    entityType: 'RecurringRfq',
    entityId: id,
    summary: `Recurring schedule resumed`,
  })
  return serializeSchedule(updated as unknown as ScheduleRow)
}

export async function skipCycle(id: string, actor: { id: string; role: string }): Promise<RecurringScheduleDTO> {
  const s = await ownedSchedule(id, actor.id, await userHasPlatformPermission(actor.id, 'rfq.pipeline.view'))
  const settings = await resolvePanel('recurring', await rfqSettingsCtx(s.organizationId))
  if (!settings.buyerSkipCycle) {
    throw new RecurringServiceError('Skipping a cycle is not allowed by the platform', 403)
  }
  const updated = await db.recurringRfq.update({
    where: { id },
    data: { nextRunAt: new Date(s.nextRunAt.getTime() + cycleMs(s.frequency, s.intervalDays)) },
  })
  await emitNotification({
    userId: s.userId,
    type: 'RECURRING_PAUSED',
    title: 'Cycle skipped',
    body: `Your ${frequencyLabel(s.frequency, s.intervalDays)} schedule will run at the next cycle instead.`,
    linkView: 'rfq',
    linkId: null,
  })
  await recordAudit({
    actorId: actor.id,
    actorType: 'USER',
    action: 'RECURRING_SKIPPED',
    entityType: 'RecurringRfq',
    entityId: id,
    summary: `Recurring cycle skipped`,
  })
  return serializeSchedule(updated as unknown as ScheduleRow)
}

export async function deleteSchedule(id: string, actor: { id: string; role: string }): Promise<{ ok: true }> {
  await ownedSchedule(id, actor.id, await userHasPlatformPermission(actor.id, 'rfq.pipeline.view'))
  await db.recurringRfq.delete({ where: { id } })
  await recordAudit({
    actorId: actor.id,
    actorType: 'USER',
    action: 'RECURRING_DELETED',
    entityType: 'RecurringRfq',
    entityId: id,
    summary: `Recurring schedule deleted`,
  })
  return { ok: true }
}

// ── Spawn engine (lazy sweep) ────────────────────────────────────────────────

/**
 * Nudged from the RFQ read paths (next to expireStaleQuotes):
 *  1. heads-up notifications inside the notifyBeforeHours window
 *  2. spawns due runs (pausedUntil respected)
 *  3. auto-cancels after N consecutive empty cycles
 */
// 7.5 fencing constants: the lease must comfortably outlive one sweep's work;
// retries are bounded so a poison schedule cannot retry forever.
const FENCED_LEASE_MS = 10 * 60_000
const FENCED_MAX_ATTEMPTS = 3

/** Thrown when a worker's fencing token no longer matches the run row (the
 * A/B/A case: the lease expired, another worker reclaimed with a fresh
 * token — this worker must abort and create nothing). */
class FencedOutError extends Error {}

export async function processDueSchedules(): Promise<void> {
  const now = new Date()

  // ── 7.5a: stale-lease reclaims + bounded retries of FAILED runs ──
  // A crash between claim and execute leaves a CLAIMED run whose lease
  // expired — reclaim it (new fencing token) and re-run the spawn against
  // the ORIGINAL dueAt idempotency key. FAILED runs retry up to the bound.
  const reclaimable = await db.recurringRfqRun.findMany({
    where: {
      OR: [
        { status: 'CLAIMED', leaseExpiresAt: { lt: now } },
        { status: 'FAILED', attempt: { lt: FENCED_MAX_ATTEMPTS } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: 10,
  })
  for (const stale of reclaimable) {
    const schedule = await db.recurringRfq.findUnique({ where: { id: stale.scheduleId } })
    if (!schedule || !schedule.active) {
      await db.recurringRfqRun.update({
        where: { id: stale.id },
        data: { status: 'FAILED', attempt: FENCED_MAX_ATTEMPTS, error: 'schedule no longer active' },
      })
      continue
    }
    const freshToken = crypto.randomUUID()
    const reclaimed = await db.recurringRfqRun.updateMany({
      where: { id: stale.id },
      data: { status: 'CLAIMED', leaseToken: freshToken, leaseExpiresAt: new Date(now.getTime() + FENCED_LEASE_MS), attempt: { increment: 1 }, error: null },
    })
    if (reclaimed.count === 0) continue
    try {
      const reclaimNumber = await nextNumber('RFQ')
      await db.$transaction(async (tx) => {
        const fence = await tx.recurringRfqRun.updateMany({
          where: { id: stale.id, leaseToken: freshToken, status: 'CLAIMED' },
          data: { status: 'CREATED' },
        })
        if (fence.count !== 1) throw new FencedOutError('reclaimed run was re-fenced')
        const created = await createRfq(
          schedule.userId,
          {
            title: schedule.title,
            description: schedule.description,
            organizationId: schedule.organizationId,
            lines: parseLines(schedule.lines),
          },
          { tx, status: 'SUBMITTED', number: reclaimNumber }
        )
        await tx.rfq.update({ where: { id: created.id }, data: { sourceRecurringId: schedule.id } })
        await tx.recurringRfqRun.update({ where: { id: stale.id }, data: { rfqId: created.id } })
      })
      await db.recurringRfq.update({
        where: { id: schedule.id },
        data: { lastRunAt: now, lastRfqId: null, runCount: { increment: 1 } },
      })
    } catch (err) {
      await db.recurringRfqRun.updateMany({
        where: { id: stale.id, status: 'CLAIMED' },
        data: { status: 'FAILED', error: (err instanceof Error ? err.message : 'unexpected error').slice(0, 500) },
      })
    }
  }

  // ── 1. Preview heads-ups ──
  const previewPanel = await resolvePanel('recurring')
  if (previewPanel.enabled) {
    const previewMs = Number(previewPanel.notifyBeforeHours) * 3_600_000
    const upcoming = await db.recurringRfq.findMany({
      where: {
        active: true,
        previewNotifiedAt: null,
        nextRunAt: { gte: now, lte: new Date(now.getTime() + previewMs) },
      },
    })
    for (const s of upcoming) {
      await db.recurringRfq.update({ where: { id: s.id }, data: { previewNotifiedAt: now } })
      await emitNotification({
        userId: s.userId,
        type: 'RECURRING_PREVIEW',
        title: `Recurring request publishes soon`,
        body: `“${s.title ?? 'Your recurring RFQ'}” publishes ${new Date(s.nextRunAt).toLocaleDateString()} — edit or skip it now if the needs changed.`,
        linkView: 'rfq',
        linkId: null,
      })
    }
  }

  // ── 2. Due spawns ──
  const settings = await resolvePanel('recurring')
  if (!settings.enabled) return

  const due = await db.recurringRfq.findMany({
    where: {
      active: true,
      nextRunAt: { lte: now },
      OR: [{ pausedUntil: null }, { pausedUntil: { lte: now } }],
    },
  })

  for (const s of due) {
    const ctx = await rfqSettingsCtx(s.organizationId)
    const panel = await resolvePanel('recurring', ctx)

    // Empty-cycle accounting: did the previous run produce any quotes?
    let emptyCycles = s.emptyCycles
    if (s.lastRfqId) {
      const last = await db.rfq.findUnique({
        where: { id: s.lastRfqId },
        select: { status: true, _count: { select: { quotes: true } } },
      })
      // An "empty cycle" is only FINAL once the run expired without any
      // quotes — live runs (SUBMITTED/QUOTED) can still receive offers.
      if (last && last._count.quotes === 0 && last.status === 'EXPIRED') {
        emptyCycles += 1
      } else if (last && (last._count.quotes > 0 || ['ACCEPTED', 'ORDERED'].includes(last.status))) {
        emptyCycles = 0
      }
    }
    if (emptyCycles >= Number(panel.autoCancelEmptyCycles)) {
      await db.recurringRfq.update({
        where: { id: s.id },
        data: { active: false, emptyCycles },
      })
      await emitNotification({
        userId: s.userId,
        type: 'RECURRING_PAUSED',
        title: 'Recurring schedule auto-paused',
        body: `${emptyCycles} runs in a row received no quotes. Review the request or resume the schedule to try again.`,
        linkView: 'rfq',
        linkId: null,
      })
      await recordAudit({
        actorId: null,
        actorType: 'SYSTEM',
        action: 'RECURRING_AUTO_PAUSED',
        entityType: 'RecurringRfq',
        entityId: s.id,
        summary: `Auto-paused after ${emptyCycles} empty cycles`,
      })
      continue
    }

    // ── 7.5: durable run-state with fencing (S5) ──
    // Tx 1 claims the unique run row (idempotency key scheduleId:dueAt) with
    // a lease + a random fencing token. Tx 2 (below) executes the spawn
    // CONDITIONED on that token — a stale worker whose lease expired (and
    // whose run was reclaimed with a fresh token) fails the conditional
    // update, aborts, and creates NOTHING (the A/B/A fence).
    const dueAt = s.nextRunAt
    const leaseToken = crypto.randomUUID()
    let run: { id: string; leaseToken: string } | null = null
    try {
      const created = await db.recurringRfqRun.create({
        data: {
          scheduleId: s.id,
          dueAt,
          status: 'CLAIMED',
          leaseToken,
          leaseExpiresAt: new Date(now.getTime() + FENCED_LEASE_MS),
        },
      })
      run = { id: created.id, leaseToken }
    } catch {
      // Unique (scheduleId, dueAt) conflict — a run row already exists.
      const existing = await db.recurringRfqRun.findUnique({
        where: { scheduleId_dueAt: { scheduleId: s.id, dueAt } },
      })
      if (!existing || existing.status === 'CREATED') continue // done exactly once
      if (existing.status === 'CLAIMED' && existing.leaseExpiresAt.getTime() > now.getTime()) continue // live worker owns it
      if (existing.status === 'FAILED' && existing.attempt >= FENCED_MAX_ATTEMPTS) continue // bounded retries exhausted
      // Reclaim: rewrite the fencing token (any stale worker is fenced out).
      const reclaimed = await db.recurringRfqRun.updateMany({
        where: { id: existing.id },
        data: {
          status: 'CLAIMED',
          leaseToken,
          leaseExpiresAt: new Date(now.getTime() + FENCED_LEASE_MS),
          attempt: { increment: 1 },
          error: null,
        },
      })
      if (reclaimed.count === 0) continue
      run = { id: existing.id, leaseToken }
    }

    // ── Atomic schedule advance (compare-and-set on nextRunAt) ──
    // Two concurrent sweeps (RFQ list read + schedules read) can both see
    // this row as due; only the one that pushes nextRunAt forward first
    // wins the spawn — the loser's updateMany matches 0 rows and skips.
    // (Crash-safety is the run row's job above, not this one's.)
    const claimed = await db.recurringRfq.updateMany({
      where: { id: s.id, active: true, nextRunAt: s.nextRunAt },
      data: {
        nextRunAt: new Date(now.getTime() + cycleMs(s.frequency, s.intervalDays)),
        previewNotifiedAt: null,
      },
    })
    if (claimed.count === 0) {
      // Another sweep advanced it — but if OUR run claim survived, mark the
      // run CREATED-less so the stale-run sweep re-evaluates it later.
      if (run) {
        await db.recurringRfqRun.updateMany({
          where: { id: run.id, status: 'CLAIMED', leaseToken: run.leaseToken },
          data: { status: 'FAILED', error: 'schedule advanced by a concurrent sweep', attempt: FENCED_MAX_ATTEMPTS },
        })
      }
      continue
    }

    // Spawn the run through the normal creation rules (MOQ, caps, variants)
    try {
      // ── Tx 2 — fenced execute: the RFQ creation transaction ALSO performs
      // the conditional update of the run row (token-verified). A stale
      // worker aborts HERE, before anything is created. Success is durable
      // at this transaction's commit even if the worker dies right after.
      // (Number pre-generated OUTSIDE the tx — nested nextNumber inside a
      // transaction callback is unsupported.)
      const rfqNumber = await nextNumber('RFQ')
      const dto = await db.$transaction(async (tx) => {
        const fence = await tx.recurringRfqRun.updateMany({
          where: { id: run!.id, leaseToken: run!.leaseToken, status: 'CLAIMED' },
          data: { status: 'CREATED' },
        })
        if (fence.count !== 1) {
          throw new FencedOutError('run lease was reclaimed by another worker — aborting before creation')
        }
        const created = await createRfq(
          s.userId,
          {
            title: s.title,
            description: s.description,
            organizationId: s.organizationId,
            lines: parseLines(s.lines),
          },
          { tx, status: panel.autoPublish ? 'SUBMITTED' : 'DRAFT', number: rfqNumber }
        )
        await tx.rfq.update({ where: { id: created.id }, data: { sourceRecurringId: s.id } })
        await tx.recurringRfqRun.update({ where: { id: run!.id }, data: { rfqId: created.id } })
        return created
      })

      // autoPublish → the fenced Tx 2 already submitted; route + notify now
      // (post-commit fan-out only — a crash here leaves the RFQ published
      // but unannounced, never duplicated).
      if (panel.autoPublish) {

        // Recipients: distribution filter, then keepSameRecipients restriction
        const { eligible, titlesBySeller } = await computeEligibleSellers(dto.id, s.organizationId)
        let recipients = eligible
        const stored = parseRecipientIds(s.recipientIds)
        if (panel.keepSameRecipients && stored.length) {
          const restricted = eligible.filter((id) => stored.includes(id))
          if (restricted.length || !panel.allowRecipientRefresh) {
            recipients = restricted
          }
        }

        const emits: EmitInput[] = recipients.map((sellerId) => {
          const titles = titlesBySeller.get(sellerId) ?? []
          return {
            userId: sellerId,
            type: 'RFQ_SUBMITTED_SELLER',
            title: `New quote request ${dto.number}`,
            body: `A buyer needs a quote including ${titles.slice(0, 2).join(', ')}${titles.length > 2 ? ` +${titles.length - 2} more` : ''}`,
            linkView: 'seller',
            linkId: dto.id,
          }
        })
        await emitNotifications(emits)

        await db.recurringRfq.update({
          where: { id: s.id },
          data: {
            lastRunAt: now,
            lastRfqId: dto.id,
            runCount: { increment: 1 },
            emptyCycles,
            recipientIds: JSON.stringify(recipients),
          },
        })
        await emitNotification({
          userId: s.userId,
          type: 'RECURRING_PUBLISHED',
          title: `Recurring request ${dto.number} published`,
          body: `Sent to ${recipients.length} seller${recipients.length === 1 ? '' : 's'} — quotes will arrive as sellers respond.`,
          linkView: 'rfq',
          linkId: dto.id,
        })
      } else {
        // buyerEditBeforeSend && !autoPublish: draft + buyer review
        await db.recurringRfq.update({
          where: { id: s.id },
          data: {
            lastRunAt: now,
            lastRfqId: dto.id,
            runCount: { increment: 1 },
            emptyCycles,
          },
        })
        await emitNotification({
          userId: s.userId,
          type: 'RECURRING_PUBLISHED',
          title: `Recurring request drafted — review before sending`,
          body: `“${s.title ?? 'Your recurring RFQ'}” is ready as a draft. Check the quantities and submit when ready.`,
          linkView: 'rfq',
          linkId: dto.id,
        })
      }
      await recordAudit({
        actorId: null,
        actorType: 'SYSTEM',
        action: 'RECURRING_SPAWNED',
        entityType: 'Rfq',
        entityId: dto.id,
        summary: `Recurring run ${dto.number} spawned (${frequencyLabel(s.frequency, s.intervalDays)})`,
        metadata: { scheduleId: s.id },
      })
    } catch (err) {
      // 7.5 failure path: the run is preserved as FAILED (retry-counted,
      // bounded) with the error; retries reuse the same idempotency key
      // (scheduleId:dueAt row). Rule-level blocks (daily cap, archived
      // products…) are TERMINAL — pause the schedule and tell the buyer
      // instead of retrying forever.
      const isRuleBlock = err instanceof RfqServiceError || err instanceof FencedOutError
      if (run) {
        await db.recurringRfqRun.updateMany({
          where: { id: run.id, status: 'CLAIMED' },
          data: {
            status: 'FAILED',
            error: (err instanceof Error ? err.message : 'unexpected error').slice(0, 500),
            ...(isRuleBlock ? { attempt: FENCED_MAX_ATTEMPTS } : {}),
          },
        })
      }
      if (isRuleBlock) {
        await db.recurringRfq.update({
          where: { id: s.id },
          data: { active: false },
        })
        await emitNotification({
          userId: s.userId,
          type: 'RECURRING_PAUSED',
          title: 'Recurring schedule paused',
          body: `The latest run could not be published: ${err instanceof Error ? err.message : 'unexpected error'}. Edit the schedule and resume it.`,
          linkView: 'rfq',
          linkId: null,
        })
      }
    }
  }
}

/** Public flags for the buyer create-form (patterns, enabled). */
export async function recurringPublicConfig() {
  const panel = await resolvePanel('recurring')
  return {
    enabled: !!panel.enabled,
    patterns: (panel.patterns ?? []) as string[],
    buyerSkipCycle: !!panel.buyerSkipCycle,
  }
}
