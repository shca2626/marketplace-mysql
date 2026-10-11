import { db } from '@/lib/db'
import { recordAudit } from '@/server/modules/audit/service'
import { emitNotification } from '@/server/modules/notifications/service'
import { userHasPlatformPermission } from '@/server/modules/rbac/service'
import { FinancingError, assertApplicantActor, iso } from './shared'

/**
 * FINANCING INSTALLMENTS — lastplan v5 §10.6 + §10.8 (Task 10-a).
 *
 * The buyer-obligation ledger. Payments are RECEIVED as raw rail facts, then
 * ALLOCATED to the installment schedule by a strict waterfall (dueDate,
 * installmentNo), and can be REVERSED — a reversal is always a NEW row that
 * mirrors the original's allocations (never a rewrite of history).
 *
 * EFFECTIVE PAID per installment (the invariant the whole module hangs on):
 *
 *   paid = Σ allocations of ORIGINAL rows (reversalOfId = null)
 *        − Σ allocations of REVERSAL rows  (reversalOfId != null)
 *
 * A full reversal's mirror cancels its original exactly; a partial reversal
 * cancels only the reversed part. Aging buckets, NPL detection, statements
 * and reconciliation all derive from ALLOCATED state — never from the
 * track-only FinancingEvent rows (D-002 separation).
 *
 * All allocation/outstanding arithmetic is in the AGREEMENT currency; a
 * payment received in another currency snapshots fxRateToAgreement at
 * record time and its effective amount is amount × fxRateToAgreement.
 */

// ── DTOs ────────────────────────────────────────────────────────────────────

export interface InstallmentPaymentDTO {
  id: string
  agreementId: string
  receivedAt: string
  channel: string // BANK_TRANSFER | CASH | AGENT | RAIL_EXPORT | OTHER | REVERSAL
  reference: string | null
  amount: number // in the payment's own currency
  currency: string
  fxRateToAgreement: number | null
  /** Effective amount in the AGREEMENT currency (amount × fxRateToAgreement). */
  effectiveAmount: number
  status: string // RECEIVED | PARTIALLY_ALLOCATED | ALLOCATED | PARTIALLY_REVERSED | REVERSED
  note: string | null
  recordedBy: { id: string; name: string }
  reversalOfId: string | null
  reversalIds: string[]
  /** Σ own allocations (agreement currency). */
  allocated: number
  /** amount×fx − own allocations (agreement currency) — the open credit. */
  unallocated: number
  createdAt: string
}

export interface StatementInstallmentDTO {
  installmentId: string
  installmentNo: number
  dueDate: string
  scheduled: number
  paid: number
  outstanding: number
  status: 'PAID' | 'PARTIAL' | 'OVERDUE' | 'DUE_SOON' | 'UPCOMING'
  daysLate: number
  agingBucket: 'CURRENT' | 'D1_30' | 'D31_60' | 'D61_90' | 'D90_PLUS'
}

export interface AgreementStatementDTO {
  agreementId: string
  agreementNumber: string
  currency: string
  npl: boolean
  installments: StatementInstallmentDTO[]
  payments: InstallmentPaymentDTO[]
  totals: {
    scheduled: number
    paid: number
    outstanding: number
    unallocatedCredit: number
    overdueAmount: number
  }
}

export interface ReconciliationDTO {
  id: string
  agreementId: string
  agreementNumber: string
  applicantName: string
  currency: string
  batchDate: string
  railExpected: number
  ledgerActual: number
  difference: number
  status: string // OPEN | RESOLVED
  resolutionNote: string | null
  resolvedAt: string | null
  resolvedBy: { id: string; name: string } | null
  createdAt: string
}

// ── Loaders / guards ────────────────────────────────────────────────────────

const agreementCoreInclude = {
  offer: {
    select: {
      amount: true,
      currency: true,
      installments: { orderBy: { dueDate: 'asc' as const } },
      request: {
        select: {
          number: true,
          createdById: true,
          organizationId: true,
          organization: { select: { name: true } },
          createdBy: { select: { id: true, name: true } },
          service: { select: { financierProfile: { select: { organizationId: true } } } },
        },
      },
    },
  },
} as const

async function loadAgreement(agreementId: string) {
  const agreement = await db.financingAgreement.findUnique({
    where: { id: agreementId },
    include: agreementCoreInclude,
  })
  if (!agreement) throw new FinancingError('Agreement not found', 404)
  return agreement
}

/** Financier staff of the agreement's financier org (OWNER/ADMIN member).
 *  TENANT-AUDIT F-03: M2 ACTIVE predicate — suspended institutions lose
 *  by-id access (payments, allocations, schedules). */
async function assertFinancierAgreementAccess(userId: string, financierOrgId: string): Promise<void> {
  const membership = await db.organizationMember.findFirst({
    where: {
      userId,
      organizationId: financierOrgId,
      role: { in: ['OWNER', 'ADMIN'] },
      user: { status: 'ACTIVE' },
      organization: { status: 'ACTIVE' },
    },
  })
  if (!membership) throw new FinancingError('Financier staff access required', 403)
}

async function loadAgreementForFinancier(userId: string, agreementId: string) {
  const agreement = await loadAgreement(agreementId)
  await assertFinancierAgreementAccess(
    userId,
    agreement.offer.request.service.financierProfile.organizationId
  )
  return agreement
}

const paymentInclude = {
  recordedBy: { select: { id: true, name: true } },
  agreement: {
    select: {
      number: true,
      offer: {
        select: {
          currency: true,
          request: {
            select: {
              organization: { select: { name: true } },
              createdBy: { select: { name: true } },
              service: { select: { financierProfile: { select: { organizationId: true } } } },
            },
          },
        },
      },
    },
  },
} as const

type PaymentRaw = Awaited<ReturnType<typeof db.installmentPayment.findFirstOrThrow>>

/** Net allocations carried by a row: originals count, reversal rows subtract. */
function rowSign(p: { reversalOfId: string | null }): 1 | -1 {
  return p.reversalOfId == null ? 1 : -1
}

function serializePayment(
  p: PaymentRaw & {
    recordedBy: { id: string; name: string }
    allocations: { amount: number }[]
    reversals: { id: string }[]
  }
): InstallmentPaymentDTO {
  const fx = p.fxRateToAgreement != null ? Number(p.fxRateToAgreement) : 1
  const effective = p.amount * fx
  const allocated = p.allocations.reduce((s, a) => s + a.amount, 0)
  return {
    id: p.id,
    agreementId: p.agreementId,
    receivedAt: p.receivedAt.toISOString(),
    channel: p.channel,
    reference: p.reference,
    amount: p.amount,
    currency: p.currency,
    fxRateToAgreement: p.fxRateToAgreement != null ? Number(p.fxRateToAgreement) : null,
    effectiveAmount: Math.round(effective * 100) / 100,
    status: p.status,
    note: p.note,
    recordedBy: { id: p.recordedBy.id, name: p.recordedBy.name },
    reversalOfId: p.reversalOfId,
    reversalIds: p.reversals.map((r) => r.id),
    allocated: Math.round(allocated * 100) / 100,
    unallocated: Math.round((effective - allocated) * 100) / 100,
    createdAt: p.createdAt.toISOString(),
  }
}

// ── Effective-paid engine (the single source of truth) ───────────────────────

interface EffectiveRow {
  id: string
  reversalOfId: string | null
  status: string
  amount: number
  fxRateToAgreement: number | null
  allocations: { installmentId: string; amount: number }[]
}

/**
 * Per-installment effective paid + per-payment allocation summaries for one
 * agreement. paid[installmentId] = Σ original allocations − Σ reversal
 * allocations (see module header). Credit per payment = amount×fx − own
 * allocations, only for rows that still count (never a fully-REVERSED row).
 */
export function computeEffective(rows: EffectiveRow[]): {
  paidByInstallment: Map<string, number>
  creditTotal: number
} {
  const paidByInstallment = new Map<string, number>()
  let creditTotal = 0
  for (const p of rows) {
    const fx = p.fxRateToAgreement != null ? Number(p.fxRateToAgreement) : 1
    const effective = p.amount * fx
    let ownAllocated = 0
    for (const a of p.allocations) {
      ownAllocated += a.amount
      const prev = paidByInstallment.get(a.installmentId) ?? 0
      paidByInstallment.set(a.installmentId, prev + rowSign(p) * a.amount)
    }
    // credit only for rows that still count (a fully reversed original's
    // residual credit is gone with the money)
    if (!(p.reversalOfId == null && p.status === 'REVERSED')) {
      creditTotal += Math.max(0, effective - ownAllocated)
    }
  }
  return { paidByInstallment, creditTotal }
}

async function loadAgreementPayments(agreementId: string): Promise<EffectiveRow[]> {
  return db.installmentPayment.findMany({
    where: { agreementId },
    select: {
      id: true,
      reversalOfId: true,
      status: true,
      amount: true,
      fxRateToAgreement: true,
      allocations: { select: { installmentId: true, amount: true } },
    },
    orderBy: { receivedAt: 'asc' as const },
  })
}

// ── Record payment (10.8) ────────────────────────────────────────────────────

export interface RecordPaymentInput {
  receivedAt: string
  channel: 'BANK_TRANSFER' | 'CASH' | 'AGENT' | 'RAIL_EXPORT' | 'OTHER'
  reference?: string | null
  amount: number
  currency?: string
  fxRateToAgreement?: number | null
  note?: string | null
}

export async function recordPayment(
  staffUserId: string,
  agreementId: string,
  input: RecordPaymentInput
): Promise<InstallmentPaymentDTO> {
  const agreement = await loadAgreementForFinancier(staffUserId, agreementId)
  if (agreement.status !== 'ACTIVE') {
    throw new FinancingError(`Agreement is ${agreement.status} — payments are only recorded on ACTIVE agreements`, 409)
  }
  const receivedAt = new Date(input.receivedAt)
  if (Number.isNaN(receivedAt.getTime())) throw new FinancingError('Invalid received-at date')
  if (receivedAt.getTime() > Date.now() + 86_400_000) {
    throw new FinancingError('Received-at cannot be more than a day in the future')
  }
  if (!(input.amount > 0)) throw new FinancingError('Payment amount must be positive')

  const currency = (input.currency ?? agreement.offer.currency).trim().toUpperCase()
  let fxRateToAgreement: number | null = null
  if (currency !== agreement.offer.currency) {
    if (input.fxRateToAgreement == null || !(Number(input.fxRateToAgreement) > 0)) {
      throw new FinancingError(
        `This payment is received in ${currency} but the agreement runs in ${agreement.offer.currency} — fxRateToAgreement is required`
      )
    }
    fxRateToAgreement = Number(input.fxRateToAgreement)
  }

  const created = await db.installmentPayment.create({
    data: {
      agreementId,
      receivedAt,
      channel: input.channel,
      reference: input.reference?.trim() || null,
      amount: input.amount,
      currency,
      fxRateToAgreement,
      status: 'RECEIVED',
      note: input.note?.trim() || null,
      recordedById: staffUserId,
    },
    include: { ...paymentInclude, allocations: { select: { amount: true } }, reversals: { select: { id: true } } },
  })
  await recordAudit({
    actorId: staffUserId,
    actorType: 'USER',
    action: 'PAYMENT_RECORDED',
    entityType: 'InstallmentPayment',
    entityId: created.id,
    summary: `Payment recorded on ${agreement.number} — ${input.amount.toLocaleString()} ${currency} via ${input.channel}`,
    metadata: { agreementId, amount: input.amount, currency, channel: input.channel },
  })
  return serializePayment(created as never)
}

// ── Allocate (waterfall — 10.8) ──────────────────────────────────────────────

/**
 * Apply the payment's still-unallocated amount to the agreement's installments
 * in (dueDate, installmentNo) waterfall order. Idempotent: remaining is
 * recomputed from existing allocations on every call. Runs in one
 * transaction; ends ALLOCATED when fully consumed, PARTIALLY_ALLOCATED with
 * the remainder left as credit otherwise.
 */
export async function allocatePayment(staffUserId: string, paymentId: string): Promise<InstallmentPaymentDTO> {
  const payment = await db.installmentPayment.findUnique({
    where: { id: paymentId },
    include: paymentInclude,
  })
  if (!payment) throw new FinancingError('Payment not found', 404)
  await assertFinancierAgreementAccess(staffUserId, payment.agreement.offer.request.service.financierProfile.organizationId)
  if (payment.reversalOfId != null) {
    throw new FinancingError('A reversal row cannot be re-allocated — reverse the original instead', 409)
  }
  if (payment.status === 'REVERSED') {
    throw new FinancingError('This payment was fully reversed — nothing left to allocate', 409)
  }

  const agreement = await loadAgreement(payment.agreementId)
  const installments = agreement.offer.installments
  if (installments.length === 0) {
    throw new FinancingError('This agreement has no installment schedule to allocate against', 409)
  }

  const fx = payment.fxRateToAgreement != null ? Number(payment.fxRateToAgreement) : 1
  const effectiveTotal = payment.amount * fx

  const updated = await db.$transaction(async (tx) => {
    // re-read inside the tx so concurrent calls can't double-allocate
    const fresh = await tx.installmentPayment.findUniqueOrThrow({
      where: { id: paymentId },
      select: { id: true, status: true, amount: true, fxRateToAgreement: true, allocations: { select: { installmentId: true, amount: true } } },
    })
    let alreadyAllocated = 0
    for (const a of fresh.allocations) alreadyAllocated += a.amount
    let remaining = Math.round((fresh.amount * (fresh.fxRateToAgreement != null ? Number(fresh.fxRateToAgreement) : 1) - alreadyAllocated) * 100) / 100
    if (remaining <= 0.009) {
      // nothing new to apply — just normalize the status
      const status = alreadyAllocated <= 0.009 ? 'RECEIVED' : fresh.amount * (fresh.fxRateToAgreement != null ? Number(fresh.fxRateToAgreement) : 1) - alreadyAllocated > 0.009 ? 'PARTIALLY_ALLOCATED' : 'ALLOCATED'
      const normalized = await tx.installmentPayment.update({
        where: { id: paymentId },
        data: { status: fresh.status.startsWith('PARTIALLY_REVERSED') || fresh.status === 'REVERSED' ? fresh.status : status },
        include: { ...paymentInclude, allocations: { select: { amount: true } }, reversals: { select: { id: true } } },
      })
      return normalized
    }

    // effective paid per installment (within the tx — includes this payment's
    // existing allocations already counted via fresh.allocations)
    const allRows = await tx.installmentPayment.findMany({
      where: { agreementId: payment.agreementId },
      select: { reversalOfId: true, status: true, allocations: { select: { installmentId: true, amount: true } } },
    })
    const { paidByInstallment } = computeEffective(
      allRows.map((r) => ({
        id: '',
        reversalOfId: r.reversalOfId,
        status: r.status,
        amount: 0,
        fxRateToAgreement: null,
        allocations: r.allocations,
      }))
    )

    const creates: { paymentId: string; installmentId: string; amount: number }[] = []
    for (const inst of installments) {
      if (remaining <= 0.009) break
      const paid = paidByInstallment.get(inst.id) ?? 0
      const outstanding = Math.round((inst.amount - paid) * 100) / 100
      if (outstanding <= 0.009) continue
      const apply = Math.min(remaining, outstanding)
      creates.push({ paymentId, installmentId: inst.id, amount: Math.round(apply * 100) / 100 })
      remaining = Math.round((remaining - apply) * 100) / 100
    }
    if (creates.length) {
      await tx.installmentAllocation.createMany({ data: creates, skipDuplicates: true })
    }
    const newAllocatedTotal = alreadyAllocated + creates.reduce((s, c) => s + c.amount, 0)
    const fullyConsumed = effectiveTotal - newAllocatedTotal <= 0.009
    // original statuses that carry reversal info keep it (PARTIALLY_REVERSED)
    const status = fresh.status === 'PARTIALLY_REVERSED'
      ? 'PARTIALLY_REVERSED'
      : fullyConsumed
        ? 'ALLOCATED'
        : 'PARTIALLY_ALLOCATED'
    return tx.installmentPayment.update({
      where: { id: paymentId },
      data: { status },
      include: { ...paymentInclude, allocations: { select: { amount: true } }, reversals: { select: { id: true } } },
    })
  })

  await recordAudit({
    actorId: staffUserId,
    actorType: 'USER',
    action: 'PAYMENT_ALLOCATED',
    entityType: 'InstallmentPayment',
    entityId: paymentId,
    summary: `Payment waterfall applied on ${payment.agreement.number}`,
    metadata: { agreementId: payment.agreementId },
  })
  return serializePayment(updated as never)
}

// ── Reverse (never rewrites — 10.8) ───────────────────────────────────────────

/**
 * Reverse (part of) an allocated payment: creates a NEW InstallmentPayment
 * row with channel REVERSAL + reversalOfId = original, amount = min(requested,
 * original's allocated), and allocation rows mirroring the original's
 * allocations in the same waterfall order capped at the reversed amount
 * (un-applying from the same installments). Original → REVERSED (full) or
 * PARTIALLY_REVERSED (partial). Cannot reverse below zero net allocations.
 */
export async function reversePayment(
  staffUserId: string,
  paymentId: string,
  input: { amount?: number; note: string }
): Promise<InstallmentPaymentDTO> {
  if (!input.note?.trim() || input.note.trim().length < 3) {
    throw new FinancingError('A reversal note (≥3 chars) is required')
  }
  const original = await db.installmentPayment.findUnique({
    where: { id: paymentId },
    include: {
      ...paymentInclude,
      allocations: { orderBy: [{ installment: { dueDate: 'asc' } }, { installment: { installmentNo: 'asc' } }], select: { installmentId: true, amount: true } },
      reversals: { select: { id: true, amount: true, fxRateToAgreement: true, allocations: { select: { amount: true } } } },
    },
  })
  if (!original) throw new FinancingError('Payment not found', 404)
  await assertFinancierAgreementAccess(staffUserId, original.agreement.offer.request.service.financierProfile.organizationId)
  if (original.reversalOfId != null) {
    throw new FinancingError('A reversal row cannot itself be reversed — record a correcting payment instead', 409)
  }
  if (original.status === 'REVERSED') {
    throw new FinancingError('This payment is already fully reversed', 409)
  }

  const fx = original.fxRateToAgreement != null ? Number(original.fxRateToAgreement) : 1
  // net allocated so far = original allocations − existing reversal allocations
  let netAllocated = original.allocations.reduce((s, a) => s + a.amount, 0)
  for (const rev of original.reversals) {
    netAllocated -= rev.allocations.reduce((s, a) => s + a.amount, 0)
  }
  netAllocated = Math.round(netAllocated * 100) / 100
  if (netAllocated <= 0.009) {
    throw new FinancingError('Nothing is allocated on this payment to reverse', 409)
  }

  // reversal amount is expressed in the AGREEMENT currency (what gets un-applied)
  const requested = input.amount != null ? Number(input.amount) : netAllocated
  if (!(requested > 0)) throw new FinancingError('Reversal amount must be positive')
  const capped = Math.min(requested, netAllocated)
  const full = capped >= netAllocated - 0.009

  // mirror allocations in the same waterfall order, capped at `capped`
  const mirror: { installmentId: string; amount: number }[] = []
  let left = capped
  for (const a of original.allocations) {
    if (left <= 0.009) break
    const take = Math.min(left, a.amount)
    mirror.push({ installmentId: a.installmentId, amount: Math.round(take * 100) / 100 })
    left = Math.round((left - take) * 100) / 100
  }

  const now = new Date()
  const reversal = await db.$transaction(async (tx) => {
    const created = await tx.installmentPayment.create({
      data: {
        agreementId: original.agreementId,
        receivedAt: now,
        channel: 'REVERSAL',
        reference: original.reference,
        amount: fx !== 1 ? Math.round((capped / fx) * 100) / 100 : capped,
        currency: original.currency,
        fxRateToAgreement: original.fxRateToAgreement,
        status: mirror.length && left <= 0.009 ? 'ALLOCATED' : mirror.length ? 'PARTIALLY_ALLOCATED' : 'RECEIVED',
        note: `Reversal of payment ${original.id}: ${input.note.trim()}`,
        recordedById: staffUserId,
        reversalOfId: original.id,
      },
    })
    if (mirror.length) {
      await tx.installmentAllocation.createMany({
        data: mirror.map((m) => ({ paymentId: created.id, installmentId: m.installmentId, amount: m.amount })),
      })
    }
    await tx.installmentPayment.update({
      where: { id: original.id },
      data: { status: full ? 'REVERSED' : 'PARTIALLY_REVERSED' },
    })
    return created
  })

  await recordAudit({
    actorId: staffUserId,
    actorType: 'USER',
    action: 'PAYMENT_REVERSED',
    entityType: 'InstallmentPayment',
    entityId: reversal.id,
    summary: `Payment reversed on ${original.agreement.number} — ${Math.round(capped * 100) / 100} un-applied${full ? ' (full)' : ' (partial)'}`,
    metadata: { agreementId: original.agreementId, originalPaymentId: original.id, amount: capped, full },
  })
  const dto = await getPayment(staffUserId, reversal.id)
  return dto
}

// ── Views ─────────────────────────────────────────────────────────────────────

export async function getPayment(staffUserId: string, paymentId: string): Promise<InstallmentPaymentDTO> {
  const payment = await db.installmentPayment.findUnique({
    where: { id: paymentId },
    include: { ...paymentInclude, allocations: { select: { amount: true } }, reversals: { select: { id: true } } },
  })
  if (!payment) throw new FinancingError('Payment not found', 404)
  await assertFinancierAgreementAccess(staffUserId, payment.agreement.offer.request.service.financierProfile.organizationId)
  return serializePayment(payment as never)
}

/**
 * Payments for one agreement (financier view, newest first). Optional
 * orgId-wide listing when agreementId is omitted.
 */
export async function listPayments(
  staffUserId: string,
  filter: { agreementId?: string; financierOrgId?: string }
): Promise<InstallmentPaymentDTO[]> {
  let agreementGuard: string | null = null
  if (filter.agreementId) {
    const agreement = await loadAgreementForFinancier(staffUserId, filter.agreementId)
    agreementGuard = agreement.id
  } else if (filter.financierOrgId) {
    // org-wide: verify the caller is staff of THAT org (shared.ts context)
    await assertFinancierAgreementAccess(staffUserId, filter.financierOrgId)
  } else {
    throw new FinancingError('agreementId is required')
  }
  const payments = await db.installmentPayment.findMany({
    where: agreementGuard
      ? { agreementId: agreementGuard }
      : { agreement: { offer: { request: { service: { financierProfile: { organizationId: filter.financierOrgId } } } } } },
    include: { ...paymentInclude, allocations: { select: { amount: true } }, reversals: { select: { id: true } } },
    orderBy: [{ receivedAt: 'desc' as const }, { createdAt: 'desc' as const }],
    take: 200,
  })
  return payments.map((p) => serializePayment(p as never))
}

// ── Statement (10.6 — the buyer-obligation ledger view) ─────────────────────

const DAY_MS = 86_400_000
const EPS = 0.009

function agingBucketFor(daysLate: number): StatementInstallmentDTO['agingBucket'] {
  if (daysLate <= 0) return 'CURRENT'
  if (daysLate <= 30) return 'D1_30'
  if (daysLate <= 60) return 'D31_60'
  if (daysLate <= 90) return 'D61_90'
  return 'D90_PLUS'
}

/**
 * The agreement statement: per-installment schedule with paid/outstanding/
 * aging, the payments history (allocation summary + reversal links) and
 * totals. Guard: viewer is financier staff of the org OR the applicant (same
 * chain as agreements.ts getAgreement). Aging derives from ALLOCATED state
 * only — never from FinancingEvent rows.
 */
export async function agreementStatement(
  viewer: { id: string; role: string },
  agreementId: string
): Promise<AgreementStatementDTO> {
  const agreement = await loadAgreement(agreementId)
  // TENANT-AUDIT F-01: legacy User.role === 'ADMIN' bypass replaced by an
  // explicit RBAC capability — platform reviewers holding the financing gate
  // permission may open any statement.
  const isPlatformReviewer = await userHasPlatformPermission(viewer.id, 'financing.gate.view')
  if (!isPlatformReviewer) {
    const isFinancier = !!(await db.organizationMember.findFirst({
      where: {
        userId: viewer.id,
        organizationId: agreement.offer.request.service.financierProfile.organizationId,
        role: { in: ['OWNER', 'ADMIN'] },
        user: { status: 'ACTIVE' },
        organization: { status: 'ACTIVE' },
      },
    }))
    if (!isFinancier) {
      await assertApplicantActor(viewer.id, {
        createdById: agreement.offer.request.createdById,
        organizationId: agreement.offer.request.organizationId,
      })
    }
  }

  const [rows, payments] = await Promise.all([
    loadAgreementPayments(agreementId),
    db.installmentPayment.findMany({
      where: { agreementId },
      include: { ...paymentInclude, allocations: { select: { amount: true } }, reversals: { select: { id: true } } },
      orderBy: [{ receivedAt: 'desc' as const }, { createdAt: 'desc' as const }],
    }),
  ])
  const { paidByInstallment, creditTotal } = computeEffective(rows)

  const now = Date.now()
  let scheduled = 0
  let paid = 0
  let outstanding = 0
  let overdueAmount = 0
  let npl = agreement.status === 'DEFAULTED'

  const installments: StatementInstallmentDTO[] = agreement.offer.installments.map((inst) => {
    const paidInst = Math.round((paidByInstallment.get(inst.id) ?? 0) * 100) / 100
    const outstandingInst = Math.round((inst.amount - paidInst) * 100) / 100
    const daysLateNum = Math.floor((now - inst.dueDate.getTime()) / DAY_MS)
    const isOverdue = outstandingInst > EPS && inst.dueDate.getTime() < now
    const bucket = agingBucketFor(isOverdue ? Math.max(daysLateNum, 1) : 0)
    if (bucket === 'D90_PLUS') npl = true
    scheduled += inst.amount
    paid += paidInst
    outstanding += Math.max(outstandingInst, 0)
    if (isOverdue) overdueAmount += outstandingInst
    let status: StatementInstallmentDTO['status']
    if (outstandingInst <= EPS) status = 'PAID'
    else if (isOverdue) status = 'OVERDUE'
    else if (paidInst > EPS) status = 'PARTIAL'
    else if (inst.dueDate.getTime() <= now + 7 * DAY_MS) status = 'DUE_SOON'
    else status = 'UPCOMING'
    return {
      installmentId: inst.id,
      installmentNo: inst.installmentNo,
      dueDate: inst.dueDate.toISOString(),
      scheduled: inst.amount,
      paid: paidInst,
      outstanding: Math.max(outstandingInst, 0),
      status,
      daysLate: isOverdue ? Math.max(daysLateNum, 1) : 0,
      agingBucket: bucket,
    }
  })

  return {
    agreementId,
    agreementNumber: agreement.number,
    currency: agreement.offer.currency,
    npl,
    installments,
    payments: payments.map((p) => serializePayment(p as never)),
    totals: {
      scheduled: Math.round(scheduled * 100) / 100,
      paid: Math.round(paid * 100) / 100,
      outstanding: Math.round(outstanding * 100) / 100,
      unallocatedCredit: Math.round(creditTotal * 100) / 100,
      overdueAmount: Math.round(overdueAmount * 100) / 100,
    },
  }
}

// ── Daily reconciliation (10.8) ──────────────────────────────────────────────

/** Normalize a date to the UTC day [start, end) bounds. */
function utcDayBounds(d: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  return { start, end: new Date(start.getTime() + DAY_MS) }
}

/**
 * Run the daily batch for one agreement: ledgerActual = Σ effective payments
 * (originals − reversals, fx-converted) received within the UTC day of
 * batchDate; difference = ledgerActual − railExpected. Upserts the
 * (agreementId × batchDate) PaymentReconciliation — OPEN when the difference
 * exceeds ±0.009, RESOLVED otherwise.
 */
export async function reconcileDay(
  staffUserId: string,
  input: { agreementId: string; batchDate: string; railExpected: number }
): Promise<ReconciliationDTO> {
  const agreement = await loadAgreementForFinancier(staffUserId, input.agreementId)
  const batchDate = new Date(input.batchDate)
  if (Number.isNaN(batchDate.getTime())) throw new FinancingError('Invalid batch date')
  if (!(input.railExpected >= 0)) throw new FinancingError('Rail expected must be zero or positive')
  const { start, end } = utcDayBounds(batchDate)

  const rows = await db.installmentPayment.findMany({
    where: { agreementId: input.agreementId, receivedAt: { gte: start, lt: end } },
    select: { amount: true, fxRateToAgreement: true, reversalOfId: true, status: true },
  })
  let ledgerActual = 0
  for (const r of rows) {
    const fx = r.fxRateToAgreement != null ? Number(r.fxRateToAgreement) : 1
    ledgerActual += rowSign(r) * r.amount * fx
  }
  ledgerActual = Math.round(ledgerActual * 100) / 100
  const difference = Math.round((ledgerActual - input.railExpected) * 100) / 100
  const status = Math.abs(difference) > EPS ? 'OPEN' : 'RESOLVED'

  const normalized = new Date(Date.UTC(batchDate.getUTCFullYear(), batchDate.getUTCMonth(), batchDate.getUTCDate()))
  const row = await db.paymentReconciliation.upsert({
    where: { agreementId_batchDate: { agreementId: input.agreementId, batchDate: normalized } },
    create: {
      agreementId: input.agreementId,
      batchDate: normalized,
      railExpected: input.railExpected,
      ledgerActual,
      difference,
      status,
      resolvedAt: status === 'RESOLVED' ? new Date() : null,
      resolvedById: status === 'RESOLVED' ? staffUserId : null,
    },
    update: {
      railExpected: input.railExpected,
      ledgerActual,
      difference,
      status,
      ...(status === 'RESOLVED' ? { resolvedAt: new Date(), resolvedById: staffUserId } : {}),
    },
  })
  // mark the payments the batch covered
  await db.installmentPayment.updateMany({
    where: { agreementId: input.agreementId, receivedAt: { gte: start, lt: end } },
    data: { reconciledAt: new Date() },
  })
  await recordAudit({
    actorId: staffUserId,
    actorType: 'USER',
    action: 'RECONCILIATION_RUN',
    entityType: 'PaymentReconciliation',
    entityId: row.id,
    summary: `Daily batch on ${agreement.number} — ledger ${ledgerActual.toLocaleString()} vs rail ${input.railExpected.toLocaleString()} (${difference >= 0 ? '+' : ''}${difference.toLocaleString()})`,
    metadata: { agreementId: input.agreementId, batchDate: normalized.toISOString(), ledgerActual, railExpected: input.railExpected, difference },
  })
  return {
    id: row.id,
    agreementId: row.agreementId,
    agreementNumber: agreement.number,
    applicantName: agreement.offer.request.organization?.name ?? agreement.offer.request.createdBy.name,
    currency: agreement.offer.currency,
    batchDate: row.batchDate.toISOString(),
    railExpected: row.railExpected,
    ledgerActual: row.ledgerActual,
    difference: row.difference,
    status: row.status,
    resolutionNote: row.resolutionNote,
    resolvedAt: iso(row.resolvedAt),
    resolvedBy: null,
    createdAt: row.createdAt.toISOString(),
  }
}

/** Resolve an OPEN discrepancy with a note (the evidence trail). */
export async function resolveDiscrepancy(
  staffUserId: string,
  reconciliationId: string,
  input: { resolutionNote: string }
): Promise<ReconciliationDTO> {
  if (!input.resolutionNote?.trim() || input.resolutionNote.trim().length < 3) {
    throw new FinancingError('A resolution note (≥3 chars) is required')
  }
  const row = await db.paymentReconciliation.findUnique({
    where: { id: reconciliationId },
    include: {
      agreement: {
        select: {
          number: true,
          offer: {
            select: {
              currency: true,
              request: {
                select: {
                  organization: { select: { name: true } },
                  createdBy: { select: { name: true } },
                  service: { select: { financierProfile: { select: { organizationId: true } } } },
                },
              },
            },
          },
        },
      },
    },
  })
  if (!row) throw new FinancingError('Reconciliation not found', 404)
  await assertFinancierAgreementAccess(staffUserId, row.agreement.offer.request.service.financierProfile.organizationId)
  if (row.status !== 'OPEN') throw new FinancingError('This discrepancy is already resolved', 409)

  const now = new Date()
  const updated = await db.paymentReconciliation.update({
    where: { id: reconciliationId },
    data: {
      status: 'RESOLVED',
      resolutionNote: input.resolutionNote.trim(),
      resolvedAt: now,
      resolvedById: staffUserId,
    },
  })
  await recordAudit({
    actorId: staffUserId,
    actorType: 'USER',
    action: 'DISCREPANCY_RESOLVED',
    entityType: 'PaymentReconciliation',
    entityId: reconciliationId,
    summary: `Discrepancy resolved on ${row.agreement.number} (diff ${updated.difference.toLocaleString()})`,
    metadata: { agreementId: row.agreementId, difference: updated.difference, note: input.resolutionNote.trim() },
  })
  return {
    id: updated.id,
    agreementId: updated.agreementId,
    agreementNumber: row.agreement.number,
    applicantName: row.agreement.offer.request.organization?.name ?? row.agreement.offer.request.createdBy.name,
    currency: row.agreement.offer.currency,
    batchDate: updated.batchDate.toISOString(),
    railExpected: updated.railExpected,
    ledgerActual: updated.ledgerActual,
    difference: updated.difference,
    status: updated.status,
    resolutionNote: updated.resolutionNote,
    resolvedAt: iso(updated.resolvedAt),
    resolvedBy: null,
    createdAt: updated.createdAt.toISOString(),
  }
}

/** Discrepancy queue for the financier org (optionally by status). */
export async function listReconciliations(
  financierOrgId: string,
  filter?: { status?: string }
): Promise<ReconciliationDTO[]> {
  const rows = await db.paymentReconciliation.findMany({
    where: {
      ...(filter?.status ? { status: filter.status } : {}),
      agreement: { offer: { request: { service: { financierProfile: { organizationId: financierOrgId } } } } },
    },
    include: {
      resolvedBy: { select: { id: true, name: true } },
      agreement: {
        select: {
          number: true,
          offer: {
            select: {
              currency: true,
              request: {
                select: {
                  organization: { select: { name: true } },
                  createdBy: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
    orderBy: [{ status: 'asc' }, { batchDate: 'desc' }],
    take: 200,
  })
  return rows.map((r) => ({
    id: r.id,
    agreementId: r.agreementId,
    agreementNumber: r.agreement.number,
    applicantName: r.agreement.offer.request.organization?.name ?? r.agreement.offer.request.createdBy.name,
    currency: r.agreement.offer.currency,
    batchDate: r.batchDate.toISOString(),
    railExpected: r.railExpected,
    ledgerActual: r.ledgerActual,
    difference: r.difference,
    status: r.status,
    resolutionNote: r.resolutionNote,
    resolvedAt: iso(r.resolvedAt),
    resolvedBy: r.resolvedBy ? { id: r.resolvedBy.id, name: r.resolvedBy.name } : null,
    createdAt: r.createdAt.toISOString(),
  }))
}
