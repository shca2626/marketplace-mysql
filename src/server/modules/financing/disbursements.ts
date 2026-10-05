import { db } from '@/lib/db'
import { recordAudit } from '@/server/modules/audit/service'
import { emitNotification } from '@/server/modules/notifications/service'
import { FinancingError, iso } from './shared'

/**
 * FINANCING DISBURSEMENTS — lastplan v5 §10.5 (Task 10-a).
 *
 * The controlled queue that moves an agreement from PENDING to
 * REPORTED_FUNDED. Queue → Confirm mirrors the rail: confirmation REQUIRES
 * the payment rail + reference and captures an FX snapshot (ExchangeRate row
 * link + denormalized value) whenever the disbursement currency differs from
 * the agreement/offer currency. Money still moves bank→applicant directly —
 * Vendora records reported facts only (D-002), now with the evidence chain a
 * real lender needs: who queued, who confirmed, on which rail, at which rate.
 *
 *   queueDisbursement   ACTIVE + fundingStatus PENDING, one row per agreement
 *   confirmDisbursement rail + reference mandatory; FX snapshot when currency differs;
 *                       ALSO agreement → REPORTED_FUNDED + a legacy
 *                       FinancingEvent DISBURSEMENT so the track-only ledger
 *                       stays coherent (agreements.ts reportFundingStatus is
 *                       NOT called — it enforces its own event payload shape).
 *   cancelDisbursement  QUEUED only.
 */

// ── DTOs ────────────────────────────────────────────────────────────────────

export interface DisbursementDTO {
  id: string
  agreementId: string
  status: string // QUEUED | CONFIRMED | CANCELLED
  currency: string
  amount: number
  rail: string | null
  reference: string | null
  fxRate: number | null
  exchangeRateId: string | null
  note: string | null
  queuedAt: string
  queuedBy: { id: string; name: string }
  confirmedAt: string | null
  confirmedBy: { id: string; name: string } | null
  cancelledAt: string | null
  // agreement context (by reference — R-2)
  agreement: {
    number: string
    applicantName: string
    organizationName: string | null
    offerAmount: number
    offerCurrency: string
    fundingStatus: string
    status: string
  }
}

// ── Loaders / guards ────────────────────────────────────────────────────────

const disbursementInclude = {
  queuedBy: { select: { id: true, name: true } },
  confirmedBy: { select: { id: true, name: true } },
  exchangeRate: { select: { id: true } },
  agreement: {
    select: {
      id: true,
      number: true,
      fundingStatus: true,
      status: true,
      offer: {
        select: {
          amount: true,
          currency: true,
          request: {
            select: {
              number: true,
              organization: { select: { name: true } },
              createdBy: { select: { id: true, name: true } },
              service: { select: { financierProfile: { select: { organizationId: true } } } },
            },
          },
        },
      },
    },
  },
} as const

type DisbursementRaw = Awaited<ReturnType<typeof db.disbursementRecord.findFirstOrThrow>>

function serializeDisbursement(
  d: DisbursementRaw & {
    queuedBy: { id: string; name: string }
    confirmedBy: { id: string; name: string } | null
    agreement: {
      number: string
      fundingStatus: string
      status: string
      offer: {
        amount: number
        currency: string
        request: {
          number: string
          organization: { name: string } | null
          createdBy: { id: string; name: string }
        }
      }
    }
  }
): DisbursementDTO {
  const offer = d.agreement.offer
  return {
    id: d.id,
    agreementId: d.agreementId,
    status: d.status,
    currency: d.currency,
    amount: d.amount,
    rail: d.rail,
    reference: d.reference,
    fxRate: d.fxRate != null ? Number(d.fxRate) : null,
    exchangeRateId: d.exchangeRateId,
    note: d.note,
    queuedAt: d.createdAt.toISOString(),
    queuedBy: { id: d.queuedBy.id, name: d.queuedBy.name },
    confirmedAt: iso(d.confirmedAt),
    confirmedBy: d.confirmedBy ? { id: d.confirmedBy.id, name: d.confirmedBy.name } : null,
    cancelledAt: iso(d.cancelledAt),
    agreement: {
      number: d.agreement.number,
      applicantName: offer.request.createdBy.name,
      organizationName: offer.request.organization?.name ?? null,
      offerAmount: offer.amount,
      offerCurrency: offer.currency,
      fundingStatus: d.agreement.fundingStatus,
      status: d.agreement.status,
    },
  }
}

/** Load a disbursement + assert the caller is financier staff of the owning org. */
async function loadForFinancier(userId: string, disbursementId: string) {
  const record = await db.disbursementRecord.findUnique({
    where: { id: disbursementId },
    include: disbursementInclude,
  })
  if (!record) throw new FinancingError('Disbursement not found', 404)
  const membership = await db.organizationMember.findFirst({
    where: {
      userId,
      organizationId: record.agreement.offer.request.service.financierProfile.organizationId,
      role: { in: ['OWNER', 'ADMIN'] },
    },
  })
  if (!membership) throw new FinancingError('Financier staff access required', 403)
  return record
}

/** Load an agreement (with the same org chain) for the financier caller. */
async function loadAgreementForFinancier(userId: string, agreementId: string) {
  const agreement = await db.financingAgreement.findUnique({
    where: { id: agreementId },
    include: {
      offer: {
        select: {
          amount: true,
          currency: true,
          request: {
            select: {
              number: true,
              organization: { select: { name: true } },
              createdBy: { select: { id: true, name: true } },
              service: { select: { financierProfile: { select: { organizationId: true } } } },
            },
          },
        },
      },
    },
  })
  if (!agreement) throw new FinancingError('Agreement not found', 404)
  const membership = await db.organizationMember.findFirst({
    where: {
      userId,
      organizationId: agreement.offer.request.service.financierProfile.organizationId,
      role: { in: ['OWNER', 'ADMIN'] },
    },
  })
  if (!membership) throw new FinancingError('Financier staff access required', 403)
  return agreement
}

// ── Views ────────────────────────────────────────────────────────────────────

/** All disbursements for the financier org (agreement context included). */
export async function listDisbursements(financierOrgId: string): Promise<DisbursementDTO[]> {
  const records = await db.disbursementRecord.findMany({
    where: {
      agreement: { offer: { request: { service: { financierProfile: { organizationId: financierOrgId } } } } },
    },
    include: disbursementInclude,
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return records.map(serializeDisbursement)
}

// ── Queue (10.5) ─────────────────────────────────────────────────────────────

export interface QueueDisbursementInput {
  amount?: number
  currency?: string
  note?: string | null
}

/**
 * Queue the disbursement for an ACTIVE / PENDING agreement. One row per
 * agreement (QUEUED, CONFIRMED and CANCELLED rows all block re-queueing —
 * the rail history is immutable). Defaults: amount = accepted offer amount,
 * currency = offer currency.
 */
export async function queueDisbursement(
  staffUserId: string,
  agreementId: string,
  input: QueueDisbursementInput
): Promise<DisbursementDTO> {
  const agreement = await loadAgreementForFinancier(staffUserId, agreementId)
  if (agreement.status !== 'ACTIVE') {
    throw new FinancingError(`Agreement is ${agreement.status} — only ACTIVE agreements can be disbursed`, 409)
  }
  if (agreement.fundingStatus !== 'PENDING') {
    throw new FinancingError(
      `Agreement funding is ${agreement.fundingStatus} — disbursements are only queued while PENDING`,
      409
    )
  }
  const existing = await db.disbursementRecord.findUnique({ where: { agreementId }, select: { id: true } })
  if (existing) {
    throw new FinancingError('This agreement already has a disbursement record (one per agreement)', 409)
  }

  const amount = input.amount ?? agreement.offer.amount
  if (!(amount > 0)) throw new FinancingError('Disbursement amount must be positive')
  if (amount > agreement.offer.amount + 0.009) {
    throw new FinancingError(
      `Disbursement cannot exceed the accepted offer amount (${agreement.offer.amount.toLocaleString()} ${agreement.offer.currency})`
    )
  }
  const currency = (input.currency ?? agreement.offer.currency).trim().toUpperCase()

  const created = await db.disbursementRecord.create({
    data: {
      agreementId,
      status: 'QUEUED',
      currency,
      amount,
      note: input.note?.trim() || null,
      queuedById: staffUserId,
    },
    include: disbursementInclude,
  })
  await recordAudit({
    actorId: staffUserId,
    actorType: 'USER',
    action: 'DISBURSEMENT_QUEUED',
    entityType: 'DisbursementRecord',
    entityId: created.id,
    summary: `Disbursement queued on ${agreement.number} — ${amount.toLocaleString()} ${currency}`,
    metadata: { agreementId, amount, currency },
  })
  await emitNotification({
    userId: agreement.offer.request.createdBy.id,
    type: 'AGREEMENT_STATUS_CHANGED',
    title: `Disbursement being prepared — ${agreement.number}`,
    body: `Your financier queued a disbursement of ${amount.toLocaleString()} ${currency}. You will be notified once it is confirmed on the payment rail.`,
    linkView: 'financing',
    linkId: agreementId,
  })
  return serializeDisbursement(created as never)
}

// ── Confirm (10.5 — rail + reference mandatory, FX snapshot) ────────────────

export interface ConfirmDisbursementInput {
  rail: 'BANK' | 'CASH' | 'WALLET' | 'OTHER'
  reference: string
  note?: string | null
}

/**
 * Confirm the queued disbursement: rail + reference are MANDATORY evidence.
 * When the disbursement currency differs from the offer currency an FX
 * snapshot is captured from the latest ExchangeRate row for
 * (offerCurrency → disbursementCurrency) — no rate pinned → 400 asking the
 * admin to pin one first. On confirm: row → CONFIRMED, agreement →
 * REPORTED_FUNDED + fundedReportedAt, and a legacy FinancingEvent
 * DISBURSEMENT keeps the track-only ledger coherent.
 */
export async function confirmDisbursement(
  staffUserId: string,
  disbursementId: string,
  input: ConfirmDisbursementInput
): Promise<DisbursementDTO> {
  const record = await loadForFinancier(staffUserId, disbursementId)
  if (record.status !== 'QUEUED') {
    throw new FinancingError(`Disbursement is ${record.status} — only queued disbursements can be confirmed`, 409)
  }
  const offerCurrency = record.agreement.offer.currency
  if (record.currency !== offerCurrency) {
    // FX snapshot: latest pinned rate for offerCurrency → disbursement currency
    const rate = await db.exchangeRate.findFirst({
      where: { baseCode: offerCurrency, quoteCode: record.currency },
      orderBy: { validFrom: 'desc' },
      select: { id: true, rate: true },
    })
    if (!rate) {
      throw new FinancingError(
        `No exchange rate is pinned for ${offerCurrency} → ${record.currency}. Pin one in the admin Currencies & FX console first, then confirm this disbursement.`,
        400
      )
    }
    await db.disbursementRecord.update({
      where: { id: disbursementId },
      data: { exchangeRateId: rate.id, fxRate: Number(rate.rate) },
    })
  }

  const now = new Date()
  await db.$transaction(async (tx) => {
    await tx.disbursementRecord.update({
      where: { id: disbursementId },
      data: {
        status: 'CONFIRMED',
        rail: input.rail,
        reference: input.reference.trim(),
        note: input.note?.trim() || record.note,
        confirmedAt: now,
        confirmedById: staffUserId,
      },
    })
    // agreement funding status transition (mirrors agreements.ts
    // reportFundingStatus minimal core — one place, no duplicate event shape)
    await tx.financingAgreement.update({
      where: { id: record.agreementId },
      data: { fundingStatus: 'REPORTED_FUNDED', fundedReportedAt: now },
    })
    // legacy track-only ledger stays coherent
    await tx.financingEvent.create({
      data: {
        agreementId: record.agreementId,
        type: 'DISBURSEMENT',
        eventDate: now,
        amount: record.amount,
        note: [
          `Disbursement confirmed via ${input.rail} (ref ${input.reference.trim()})`,
          record.currency !== offerCurrency ? `FX snapshot ${offerCurrency}→${record.currency}` : null,
          input.note?.trim() || null,
        ]
          .filter(Boolean)
          .join(' — ') || null,
        reportedById: staffUserId,
      },
    })
    // 10.9 Murabaha checkout: financed orders go FUNDED on disbursement —
    // never PAID. The buyer obligation stays on the financing ledger
    // (installments) until the agreement settles; sellers see the order as
    // paid-to-them and fulfillment unlocks (legacy status PAID).
    const financed = await tx.order.findMany({
      where: { financingAgreementId: record.agreementId },
      select: { id: true },
    })
    if (financed.length > 0) {
      await tx.order.updateMany({
        where: { financingAgreementId: record.agreementId },
        data: { paymentStatus: 'FUNDED', status: 'PAID' },
      })
    }
  })

  await recordAudit({
    actorId: staffUserId,
    actorType: 'USER',
    action: 'DISBURSEMENT_CONFIRMED',
    entityType: 'DisbursementRecord',
    entityId: disbursementId,
    summary: `Disbursement confirmed on ${record.agreement.number} — ${input.rail} ref ${input.reference.trim()}`,
    metadata: { agreementId: record.agreementId, rail: input.rail, amount: record.amount },
  })
  await emitNotification({
    userId: record.agreement.offer.request.createdBy.id,
    type: 'AGREEMENT_STATUS_CHANGED',
    title: `Funds disbursed — ${record.agreement.number}`,
    body: `${record.amount.toLocaleString()} ${record.currency} confirmed via ${input.rail.toLowerCase()} (reference ${input.reference.trim()}). Your installment schedule is now active.`,
    linkView: 'financing',
    linkId: record.agreementId,
  })
  const updated = await db.disbursementRecord.findUniqueOrThrow({
    where: { id: disbursementId },
    include: disbursementInclude,
  })
  return serializeDisbursement(updated as never)
}

// ── Cancel (QUEUED only) ──────────────────────────────────────────────────────

export async function cancelDisbursement(
  staffUserId: string,
  disbursementId: string,
  note?: string | null
): Promise<DisbursementDTO> {
  const record = await loadForFinancier(staffUserId, disbursementId)
  if (record.status !== 'QUEUED') {
    throw new FinancingError(`Disbursement is ${record.status} — only queued disbursements can be cancelled`, 409)
  }
  const now = new Date()
  const updated = await db.disbursementRecord.update({
    where: { id: disbursementId },
    data: { status: 'CANCELLED', cancelledAt: now, note: note?.trim() || record.note },
    include: disbursementInclude,
  })
  await recordAudit({
    actorId: staffUserId,
    actorType: 'USER',
    action: 'DISBURSEMENT_CANCELLED',
    entityType: 'DisbursementRecord',
    entityId: disbursementId,
    summary: `Disbursement cancelled on ${record.agreement.number}`,
    metadata: { agreementId: record.agreementId, amount: record.amount },
  })
  return serializeDisbursement(updated as never)
}
