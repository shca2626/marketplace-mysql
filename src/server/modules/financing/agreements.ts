import { db } from '@/lib/db'
import { recordAudit } from '@/server/modules/audit/service'
import { emitNotification, emitNotifications } from '@/server/modules/notifications/service'
import { FinancingError, assertApplicantActor, iso } from './shared'
import { serializeOffer, type FinancingOfferDTO } from './offers'

/**
 * FINANCING AGREEMENTS — the closed deal + the track-only money ledger.
 *
 * The agreement REFERENCES the frozen accepted offer (DP-20 — no snapshot):
 * the service rejects any edit to an offer (or its installments) once it is
 * not DRAFT. Funding facts are REPORTED by the financier as FinancingEvent
 * rows (DISBURSEMENT / REPAYMENT / EARLY_SETTLEMENT — typed money facts,
 * track-only, D-002: the platform never holds or moves financing money).
 *
 *   fundingStatus: PENDING → REPORTED_FUNDED → REPORTED_SETTLED
 *   status:        ACTIVE → COMPLETED | DEFAULTED | CANCELLED
 *
 * FinancingFee (SUCCESS) accrues at acceptance (offers.ts) and is invoiced +
 * collected EXTERNALLY — admins mark ACCRUED → INVOICED → PAID (mirrors
 * Payout; D-001/002).
 */

// ── DTOs ────────────────────────────────────────────────────────────────────

export interface FinancingEventDTO {
  id: string
  agreementId: string
  type: string // DISBURSEMENT | REPAYMENT | EARLY_SETTLEMENT | LATE_FEE | NOTE
  eventDate: string
  amount: number | null
  note: string | null
  reportedById: string | null
  createdAt: string
}

export interface FinancingFeeDTO {
  id: string
  agreementId: string
  type: string
  baseAmount: number
  percentApplied: number
  amount: number
  status: string // ACCRUED | INVOICED | PAID | WAIVED
  invoicedAt: string | null
  paidAt: string | null
  createdAt: string
}

export interface FinancingAgreementDTO {
  id: string
  number: string
  offerId: string
  fundingStatus: string
  status: string
  acceptedAt: string
  fundedReportedAt: string | null
  settledReportedAt: string | null
  createdAt: string
  // context (by reference — R-2)
  request: {
    id: string
    number: string
    serviceName: string
    applicantName: string
    applicantEmail: string
    organizationName: string | null
    financierOrgId: string
    financierOrgName: string
  }
  offer: FinancingOfferDTO
  events: FinancingEventDTO[]
  fees: FinancingFeeDTO[]
}

// ── Serialization ───────────────────────────────────────────────────────────

const fullInclude = {
  offer: {
    include: {
      createdBy: { select: { id: true, name: true } },
      installments: { orderBy: { installmentNo: 'asc' as const } },
      request: {
        include: {
          organization: { select: { name: true } },
          createdBy: { select: { id: true, name: true, email: true } },
          service: {
            select: {
              name: true,
              financierProfile: { select: { organizationId: true, organization: { select: { name: true } } } },
            },
          },
        },
      },
    },
  },
  events: { orderBy: { eventDate: 'desc' as const } },
  fees: { orderBy: { createdAt: 'asc' as const } },
} as const

type AgreementRaw = Awaited<ReturnType<typeof db.financingAgreement.findFirstOrThrow>>

function serializeAgreement(
  a: AgreementRaw & {
    offer: Parameters<typeof serializeOffer>[0] & {
      request: {
        id: string
        number: string
        organization: { name: string } | null
        createdBy: { id: string; name: string; email: string }
        service: {
          name: string
          financierProfile: { organizationId: string; organization: { name: string } }
        }
      }
    }
    events: { id: string; agreementId: string; type: string; eventDate: Date; amount: number | null; note: string | null; reportedById: string | null; createdAt: Date }[]
    fees: { id: string; agreementId: string; type: string; baseAmount: number; percentApplied: number; amount: number; status: string; invoicedAt: Date | null; paidAt: Date | null; createdAt: Date }[]
  }
): FinancingAgreementDTO {
  return {
    id: a.id,
    number: a.number,
    offerId: a.offerId,
    fundingStatus: a.fundingStatus,
    status: a.status,
    acceptedAt: a.acceptedAt.toISOString(),
    fundedReportedAt: iso(a.fundedReportedAt),
    settledReportedAt: iso(a.settledReportedAt),
    createdAt: a.createdAt.toISOString(),
    request: {
      id: a.offer.request.id,
      number: a.offer.request.number,
      serviceName: a.offer.request.service.name,
      applicantName: a.offer.request.createdBy.name,
      applicantEmail: a.offer.request.createdBy.email,
      organizationName: a.offer.request.organization?.name ?? null,
      financierOrgId: a.offer.request.service.financierProfile.organizationId,
      financierOrgName: a.offer.request.service.financierProfile.organization.name,
    },
    offer: serializeOffer(a.offer),
    events: a.events.map((e) => ({
      id: e.id,
      agreementId: e.agreementId,
      type: e.type,
      eventDate: e.eventDate.toISOString(),
      amount: e.amount,
      note: e.note,
      reportedById: e.reportedById,
      createdAt: e.createdAt.toISOString(),
    })),
    fees: a.fees.map((f) => ({
      id: f.id,
      agreementId: f.agreementId,
      type: f.type,
      baseAmount: f.baseAmount,
      percentApplied: f.percentApplied,
      amount: f.amount,
      status: f.status,
      invoicedAt: iso(f.invoicedAt),
      paidAt: iso(f.paidAt),
      createdAt: f.createdAt.toISOString(),
    })),
  }
}

// ── Guards ──────────────────────────────────────────────────────────────────

async function loadAgreement(agreementId: string) {
  const agreement = await db.financingAgreement.findUnique({
    where: { id: agreementId },
    include: fullInclude,
  })
  if (!agreement) throw new FinancingError('Agreement not found', 404)
  return agreement
}

/** Financier staff of the agreement's financier org. */
async function assertFinancierAgreementAccess(userId: string, financierOrgId: string): Promise<void> {
  const membership = await db.organizationMember.findFirst({
    where: { userId, organizationId: financierOrgId, role: { in: ['OWNER', 'ADMIN'] } },
  })
  if (!membership) throw new FinancingError('Financier staff access required', 403)
}

// ── Views ────────────────────────────────────────────────────────────────────

/** Applicant agreements: requests created by the user or by their orgs. */
export async function listMyAgreements(userId: string): Promise<FinancingAgreementDTO[]> {
  const orgs = await db.organizationMember.findMany({ where: { userId }, select: { organizationId: true } })
  const agreements = await db.financingAgreement.findMany({
    where: {
      offer: {
        request: {
          OR: [
            { createdById: userId },
            ...(orgs.length ? [{ organizationId: { in: orgs.map((o) => o.organizationId) } }] : []),
          ],
        },
      },
    },
    include: fullInclude,
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  return agreements.map((a) => serializeAgreement(a as never))
}

/** Financier agreements for their org. */
export async function listFinancierAgreements(financierOrgId: string): Promise<FinancingAgreementDTO[]> {
  const agreements = await db.financingAgreement.findMany({
    where: { offer: { request: { service: { financierProfile: { organizationId: financierOrgId } } } } },
    include: fullInclude,
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return agreements.map((a) => serializeAgreement(a as never))
}

export async function getAgreement(
  viewer: { id: string; role: string },
  agreementId: string
): Promise<FinancingAgreementDTO> {
  const agreement = await loadAgreement(agreementId)
  const request = agreement.offer.request as unknown as {
    createdById: string
    organizationId: string | null
  }
  if (viewer.role !== 'ADMIN') {
    const isFinancier = !!(await db.organizationMember.findFirst({
      where: {
        userId: viewer.id,
        organizationId: agreement.offer.request.service.financierProfile.organizationId,
        role: { in: ['OWNER', 'ADMIN'] },
      },
    }))
    if (!isFinancier) {
      await assertApplicantActor(viewer.id, request)
    }
  }
  return serializeAgreement(agreement as never)
}

// ── Funding status transitions (financier-reported — D-002) ────────────────

export interface ReportFundingInput {
  fundingStatus: 'REPORTED_FUNDED' | 'REPORTED_SETTLED'
  event: {
    type: 'DISBURSEMENT' | 'REPAYMENT' | 'EARLY_SETTLEMENT' | 'LATE_FEE' | 'NOTE'
    eventDate?: string
    amount?: number | null
    note?: string | null
  }
}

/**
 * Report funding progress: PENDING → REPORTED_FUNDED (disbursement) →
 * REPORTED_SETTLED (repayment / early settlement). Each report is recorded as
 * a typed FinancingEvent — the track-only money ledger.
 */
export async function reportFundingStatus(
  userId: string,
  agreementId: string,
  input: ReportFundingInput
): Promise<FinancingAgreementDTO> {
  const agreement = await loadAgreement(agreementId)
  await assertFinancierAgreementAccess(userId, agreement.offer.request.service.financierProfile.organizationId)

  const order: Record<string, number> = { PENDING: 0, REPORTED_FUNDED: 1, REPORTED_SETTLED: 2 }
  if (order[input.fundingStatus] !== order[agreement.fundingStatus] + 1) {
    throw new FinancingError(
      `Funding status moves PENDING → REPORTED_FUNDED → REPORTED_SETTLED (currently ${agreement.fundingStatus})`,
      409
    )
  }
  const expectedEvent =
    input.fundingStatus === 'REPORTED_FUNDED' ? 'DISBURSEMENT' : 'REPAYMENT | EARLY_SETTLEMENT'
  const typeOk =
    input.fundingStatus === 'REPORTED_FUNDED'
      ? input.event.type === 'DISBURSEMENT'
      : input.event.type === 'REPAYMENT' || input.event.type === 'EARLY_SETTLEMENT'
  if (!typeOk) throw new FinancingError(`A ${input.fundingStatus} report needs a ${expectedEvent} event`)

  const eventDate = input.event.eventDate ? new Date(input.event.eventDate) : new Date()
  if (Number.isNaN(eventDate.getTime())) throw new FinancingError('Invalid event date')
  if (input.event.amount != null && input.event.amount <= 0) {
    throw new FinancingError('Event amounts must be positive')
  }

  const now = new Date()
  await db.$transaction(async (tx) => {
    await tx.financingEvent.create({
      data: {
        agreementId,
        type: input.event.type,
        eventDate,
        amount: input.event.amount ?? null,
        note: input.event.note?.trim() || null,
        reportedById: userId,
      },
    })
    await tx.financingAgreement.update({
      where: { id: agreementId },
      data: {
        fundingStatus: input.fundingStatus,
        ...(input.fundingStatus === 'REPORTED_FUNDED' ? { fundedReportedAt: now } : { settledReportedAt: now }),
      },
    })
  })

  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'FINANCING_STATUS_CHANGED',
    entityType: 'FinancingAgreement',
    entityId: agreementId,
    summary: `Agreement ${agreement.number}: funding status → ${input.fundingStatus} (${input.event.type})`,
    metadata: { fundingStatus: input.fundingStatus, eventType: input.event.type, amount: input.event.amount ?? null },
  })
  await emitNotification({
    userId: agreement.offer.request.createdBy.id,
    type: 'AGREEMENT_STATUS_CHANGED',
    title: `Agreement ${agreement.number} — ${input.fundingStatus === 'REPORTED_FUNDED' ? 'funds disbursed' : 'fully settled'}`,
    body: `${agreement.offer.request.service.financierProfile.organization.name} reported a ${input.event.type.toLowerCase()}${input.event.amount ? ` of ${input.event.amount.toLocaleString()}` : ''}.`,
    linkView: 'financing',
    linkId: agreementId,
  })
  return getAgreement({ id: userId, role: 'USER' }, agreementId)
}

/** Additional money facts on an active agreement (repayments, late fees, notes). */
export async function addFinancingEvent(
  userId: string,
  agreementId: string,
  input: {
    type: 'DISBURSEMENT' | 'REPAYMENT' | 'EARLY_SETTLEMENT' | 'LATE_FEE' | 'NOTE'
    eventDate?: string
    amount?: number | null
    note?: string | null
  }
): Promise<FinancingAgreementDTO> {
  const agreement = await loadAgreement(agreementId)
  await assertFinancierAgreementAccess(userId, agreement.offer.request.service.financierProfile.organizationId)
  if (agreement.status !== 'ACTIVE') {
    throw new FinancingError(`Agreement is ${agreement.status} — events are closed`, 409)
  }
  const eventDate = input.eventDate ? new Date(input.eventDate) : new Date()
  if (Number.isNaN(eventDate.getTime())) throw new FinancingError('Invalid event date')
  await db.financingEvent.create({
    data: {
      agreementId,
      type: input.type,
      eventDate,
      amount: input.amount ?? null,
      note: input.note?.trim() || null,
      reportedById: userId,
    },
  })
  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'FINANCING_STATUS_CHANGED',
    entityType: 'FinancingAgreement',
    entityId: agreementId,
    summary: `Agreement ${agreement.number}: ${input.type} event reported`,
    metadata: { type: input.type, amount: input.amount ?? null },
  })
  return getAgreement({ id: userId, role: 'USER' }, agreementId)
}

/** Agreement lifecycle: ACTIVE → COMPLETED | DEFAULTED | CANCELLED. */
export async function updateAgreementStatus(
  userId: string,
  agreementId: string,
  status: 'COMPLETED' | 'DEFAULTED' | 'CANCELLED'
): Promise<FinancingAgreementDTO> {
  const agreement = await loadAgreement(agreementId)
  await assertFinancierAgreementAccess(userId, agreement.offer.request.service.financierProfile.organizationId)
  if (agreement.status !== 'ACTIVE') {
    throw new FinancingError(`Agreement is already ${agreement.status}`, 409)
  }
  await db.financingAgreement.update({ where: { id: agreementId }, data: { status } })
  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'FINANCING_STATUS_CHANGED',
    entityType: 'FinancingAgreement',
    entityId: agreementId,
    summary: `Agreement ${agreement.number}: status → ${status}`,
    metadata: { status },
  })
  await emitNotifications([
    {
      userId: agreement.offer.request.createdBy.id,
      type: 'AGREEMENT_STATUS_CHANGED',
      title: `Agreement ${agreement.number} is now ${status.toLowerCase()}`,
      body: `The financing agreement status changed to ${status}.`,
      linkView: 'financing',
      linkId: agreementId,
    },
  ])
  return getAgreement({ id: userId, role: 'USER' }, agreementId)
}

// ── Admin fee console (ACCRUED → INVOICED → PAID — invoiced externally) ────

export async function adminListFees(filter?: { status?: string }): Promise<FinancingFeeDTO[]> {
  const fees = await db.financingFee.findMany({
    where: filter?.status ? { status: filter.status } : undefined,
    include: { agreement: { include: { offer: { include: { request: { select: { number: true } } } } } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return fees.map((f) => ({
    id: f.id,
    agreementId: f.agreementId,
    type: f.type,
    baseAmount: f.baseAmount,
    percentApplied: f.percentApplied,
    amount: f.amount,
    status: f.status,
    invoicedAt: iso(f.invoicedAt),
    paidAt: iso(f.paidAt),
    createdAt: f.createdAt.toISOString(),
  }))
}

export async function adminMarkFee(
  adminId: string,
  feeId: string,
  action: 'MARK_INVOICED' | 'MARK_PAID' | 'WAIVE'
): Promise<FinancingFeeDTO> {
  const fee = await db.financingFee.findUnique({ where: { id: feeId } })
  if (!fee) throw new FinancingError('Fee not found', 404)
  const now = new Date()
  if (action === 'MARK_INVOICED') {
    if (fee.status !== 'ACCRUED') throw new FinancingError(`Fee is ${fee.status} — cannot mark invoiced`, 409)
    await db.financingFee.update({ where: { id: feeId }, data: { status: 'INVOICED', invoicedAt: now } })
  } else if (action === 'MARK_PAID') {
    if (fee.status !== 'INVOICED') throw new FinancingError(`Fee is ${fee.status} — invoice it first`, 409)
    await db.financingFee.update({ where: { id: feeId }, data: { status: 'PAID', paidAt: now } })
  } else {
    if (fee.status === 'PAID') throw new FinancingError('A paid fee cannot be waived', 409)
    await db.financingFee.update({ where: { id: feeId }, data: { status: 'WAIVED' } })
  }
  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: action === 'MARK_INVOICED' ? 'FEE_INVOICED' : action === 'MARK_PAID' ? 'FEE_PAID' : 'FEE_WAIVED',
    entityType: 'FinancingFee',
    entityId: feeId,
    summary: `Fee ${feeId.slice(-8)} (${fee.type}) ${action === 'MARK_INVOICED' ? 'marked invoiced' : action === 'MARK_PAID' ? 'marked paid' : 'waived'}`,
    metadata: { action, amount: fee.amount },
  })
  const updated = await db.financingFee.findUniqueOrThrow({ where: { id: feeId } })
  return {
    id: updated.id,
    agreementId: updated.agreementId,
    type: updated.type,
    baseAmount: updated.baseAmount,
    percentApplied: updated.percentApplied,
    amount: updated.amount,
    status: updated.status,
    invoicedAt: iso(updated.invoicedAt),
    paidAt: iso(updated.paidAt),
    createdAt: updated.createdAt.toISOString(),
  }
}
