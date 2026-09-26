import { db } from '@/lib/db'
import { recordAudit } from '@/server/modules/audit/service'
import { emitNotification, emitNotifications } from '@/server/modules/notifications/service'
import { nextNumber } from '@/server/modules/sequences/service'
import { resolvePanel } from '@/server/modules/settings/service'
import { FinancingError, assertApplicantActor, iso, type OfferStatus } from './shared'

/**
 * FINANCING OFFERS — the financier's binding proposal (§3.9) + the acceptance
 * loop that closes the deal.
 *
 *   DRAFT ──send──▶ SENT ──applicant accepts──▶ ACCEPTED  (freeze + agreement + fee)
 *                    │ ├──applicant declines──▶ DECLINED
 *                    │ └──financier withdraws──▶ WITHDRAWN
 *                    └── validUntil passes ───▶ EXPIRED (lazy sweep)
 *
 * Revisions are NEW rows (DP-12 — offers stay id-addressed) capped by
 * financingGeneral.maxOffersPerRequest. Accepting one offer declines every
 * other SENT offer on the request (and on multi-group siblings — DP-25),
 * freezes the offer + installments (edits rejected once SENT/ACCEPTED),
 * creates the FinancingAgreement (AGR- sequence) and accrues the SUCCESS
 * FinancingFee (financingFees.financierSuccessPercent — D-001/002).
 */

// ── DTOs ────────────────────────────────────────────────────────────────────

export interface OfferInstallmentDTO {
  id: string
  installmentNo: number
  dueDate: string
  amount: number
}

export interface FinancingOfferDTO {
  id: string
  requestId: string
  requestNumber: string
  amount: number
  currency: string
  rateType: string | null
  ratePercent: number | null
  feeFlat: number | null
  tenorMonths: number
  collateralRequired: string | null
  notes: string | null
  validUntil: string | null
  status: OfferStatus
  sentAt: string | null
  acceptedAt: string | null
  declinedAt: string | null
  withdrawnAt: string | null
  createdAt: string
  createdBy: { id: string; name: string }
  installments: OfferInstallmentDTO[]
}

// ── Serialization ───────────────────────────────────────────────────────────

const offerInclude = {
  createdBy: { select: { id: true, name: true } },
  installments: { orderBy: { installmentNo: 'asc' as const } },
  request: { select: { number: true } },
} as const

type OfferRaw = Awaited<ReturnType<typeof db.financingOffer.findFirstOrThrow>>

export function serializeOffer(
  o: OfferRaw & {
    createdBy: { id: string; name: string }
    installments: { id: string; installmentNo: number; dueDate: Date; amount: number }[]
    request: { number: string }
  }
): FinancingOfferDTO {
  return {
    id: o.id,
    requestId: o.requestId,
    requestNumber: o.request.number,
    amount: o.amount,
    currency: o.currency,
    rateType: o.rateType,
    ratePercent: o.ratePercent,
    feeFlat: o.feeFlat,
    tenorMonths: o.tenorMonths,
    collateralRequired: o.collateralRequired,
    notes: o.notes,
    validUntil: iso(o.validUntil),
    status: o.status as OfferStatus,
    sentAt: iso(o.sentAt),
    acceptedAt: iso(o.acceptedAt),
    declinedAt: iso(o.declinedAt),
    withdrawnAt: iso(o.withdrawnAt),
    createdAt: o.createdAt.toISOString(),
    createdBy: { id: o.createdBy.id, name: o.createdBy.name },
    installments: o.installments.map((i) => ({
      id: i.id,
      installmentNo: i.installmentNo,
      dueDate: i.dueDate.toISOString(),
      amount: i.amount,
    })),
  }
}

/** Offers visible to the applicant (never DRAFT). */
export async function serializeOffersForApplicant(requestId: string): Promise<FinancingOfferDTO[]> {
  const offers = await db.financingOffer.findMany({
    where: { requestId, status: { not: 'DRAFT' } },
    include: offerInclude,
    orderBy: { createdAt: 'desc' },
  })
  return offers.map((o) => serializeOffer(o as never))
}

/** All offers incl. drafts — financier staff only. */
export async function serializeOffersForFinancier(requestId: string): Promise<FinancingOfferDTO[]> {
  const offers = await db.financingOffer.findMany({
    where: { requestId },
    include: offerInclude,
    orderBy: { createdAt: 'desc' },
  })
  return offers.map((o) => serializeOffer(o as never))
}

// ── Guard: financier staff of the request's financier org ─────────────────

async function loadRequestForFinancier(userId: string, requestId: string) {
  const request = await db.financingRequest.findUnique({
    where: { id: requestId },
    include: {
      service: { select: { name: true, financierProfile: { select: { organizationId: true, organization: { select: { name: true } } } } } },
    },
  })
  if (!request) throw new FinancingError('Request not found', 404)
  // R-4: the financier may only act on requests that passed the gate
  if (request.forwardedAt == null) throw new FinancingError('Request not found', 404)
  const membership = await db.organizationMember.findFirst({
    where: {
      userId,
      organizationId: request.service.financierProfile.organizationId,
      role: { in: ['OWNER', 'ADMIN'] },
    },
  })
  if (!membership) throw new FinancingError('Financier staff access required', 403)
  return request
}

// ── Create (DRAFT) + optional send ────────────────────────────────────────

export interface OfferInput {
  requestId: string
  amount: number
  tenorMonths: number
  rateType?: string | null
  ratePercent?: number | null
  feeFlat?: number | null
  collateralRequired?: string | null
  notes?: string | null
  validUntil?: string | null
  installments?: { installmentNo: number; dueDate: string; amount: number }[]
  send?: boolean
}

function validateInstallments(
  installments: { installmentNo: number; dueDate: string; amount: number }[]
): { installmentNo: number; dueDate: Date; amount: number }[] {
  if (!installments.length) return []
  const numbers = new Set<number>()
  let lastDue: Date | null = null
  const sorted = [...installments].sort((a, b) => a.installmentNo - b.installmentNo)
  for (const i of sorted) {
    if (numbers.has(i.installmentNo)) {
      throw new FinancingError(`Installment number ${i.installmentNo} is duplicated`)
    }
    numbers.add(i.installmentNo)
    if (i.amount <= 0) throw new FinancingError('Installment amounts must be positive')
    const due = new Date(i.dueDate)
    if (Number.isNaN(due.getTime())) throw new FinancingError('Invalid installment due date')
    if (lastDue && due.getTime() <= lastDue.getTime()) {
      throw new FinancingError('Installment due dates must be ascending')
    }
    lastDue = due
  }
  return sorted.map((i) => ({ installmentNo: i.installmentNo, dueDate: new Date(i.dueDate), amount: i.amount }))
}

export async function createOffer(userId: string, input: OfferInput): Promise<FinancingOfferDTO> {
  const request = await loadRequestForFinancier(userId, input.requestId)
  if (!['FORWARDED_TO_FINANCIER', 'UNDER_FINANCIER_REVIEW', 'OFFERED'].includes(request.status)) {
    throw new FinancingError(`The request is ${request.status} — offers are closed`, 409)
  }
  if (input.amount <= 0) throw new FinancingError('Offer amount must be positive')
  if (input.tenorMonths < 1 || input.tenorMonths > 120) throw new FinancingError('Tenor must be between 1 and 120 months')

  // maxOffersPerRequest cap (every revision is a new row — DP-12)
  const general = await resolvePanel('financingGeneral')
  const cap = Number(general.maxOffersPerRequest) || 5
  const existing = await db.financingOffer.count({ where: { requestId: input.requestId } })
  if (existing >= cap) {
    throw new FinancingError(`This request already has ${existing} offers (platform cap: ${cap})`, 409)
  }

  let validUntil: Date | null = null
  if (input.validUntil) {
    validUntil = new Date(input.validUntil)
    if (Number.isNaN(validUntil.getTime()) || validUntil.getTime() <= Date.now()) {
      throw new FinancingError('Offer validity must be a future date')
    }
  }

  const installments = validateInstallments(input.installments ?? [])

  const offer = await db.financingOffer.create({
    data: {
      requestId: input.requestId,
      createdById: userId,
      amount: input.amount,
      rateType: input.rateType ?? null,
      ratePercent: input.ratePercent ?? null,
      feeFlat: input.feeFlat ?? null,
      tenorMonths: input.tenorMonths,
      collateralRequired: input.collateralRequired ?? null,
      notes: input.notes?.trim() || null,
      validUntil,
      status: 'DRAFT',
      installments: installments.length ? { create: installments } : undefined,
    },
    include: offerInclude,
  })
  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'OFFER_DRAFTED',
    entityType: 'FinancingOffer',
    entityId: offer.id,
    summary: `Offer drafted on ${request.number} — ${input.amount} over ${input.tenorMonths} months`,
    metadata: { requestId: input.requestId, amount: input.amount, installments: installments.length },
  })
  if (input.send) return sendOffer(userId, offer.id)
  return serializeOffer(offer as never)
}

/** Revise = a NEW offer row (the previous one stays for comparison — DP-12). */
export const reviseOffer = createOffer

// ── Send (DRAFT → SENT; request → OFFERED) ───────────────────────────────

export async function sendOffer(userId: string, offerId: string, validUntilOverride?: string): Promise<FinancingOfferDTO> {
  const offer = await db.financingOffer.findUnique({
    where: { id: offerId },
    include: { request: { select: { id: true, status: true, number: true, createdById: true } } },
  })
  if (!offer) throw new FinancingError('Offer not found', 404)
  await loadRequestForFinancier(userId, offer.requestId)
  if (offer.status !== 'DRAFT') throw new FinancingError(`Offer is already ${offer.status}`, 409)
  if (!['FORWARDED_TO_FINANCIER', 'UNDER_FINANCIER_REVIEW', 'OFFERED'].includes(offer.request.status)) {
    throw new FinancingError(`The request is ${offer.request.status} — offers are closed`, 409)
  }

  // validUntil default: +14 days (§6 convention)
  let validUntil: Date | null
  if (validUntilOverride) {
    validUntil = new Date(validUntilOverride)
    if (Number.isNaN(validUntil.getTime()) || validUntil.getTime() <= Date.now()) {
      throw new FinancingError('Offer validity must be a future date')
    }
  } else {
    validUntil = offer.validUntil ?? new Date(Date.now() + 14 * 86_400_000)
  }

  const now = new Date()
  const updated = await db.$transaction(async (tx) => {
    const sent = await tx.financingOffer.update({
      where: { id: offerId },
      data: { status: 'SENT', sentAt: now, validUntil },
      include: offerInclude,
    })
    // First SENT offer moves the request to OFFERED
    if (['FORWARDED_TO_FINANCIER', 'UNDER_FINANCIER_REVIEW'].includes(offer.request.status)) {
      await tx.financingRequest.update({
        where: { id: offer.requestId },
        data: { status: 'OFFERED' },
      })
    }
    return sent
  })

  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'OFFER_SENT',
    entityType: 'FinancingOffer',
    entityId: offerId,
    summary: `Offer sent on ${offer.request.number} — ${offer.amount} ${offer.currency} over ${offer.tenorMonths} months`,
    metadata: { requestId: offer.requestId, amount: offer.amount },
  })
  await emitNotification({
    userId: offer.request.createdById,
    type: 'OFFER_RECEIVED',
    title: `Financing offer received — ${offer.request.number}`,
    body: `${offer.amount.toLocaleString()} ${offer.currency} over ${offer.tenorMonths} months. Compare and accept before the validity expires.`,
    linkView: 'financing',
    linkId: offer.requestId,
  })
  return serializeOffer(updated as never)
}

// ── Withdraw (SENT → WITHDRAWN; request may fall back) ────────────────────

export async function withdrawOffer(userId: string, offerId: string): Promise<FinancingOfferDTO> {
  const offer = await db.financingOffer.findUnique({
    where: { id: offerId },
    include: { request: { select: { id: true, status: true, number: true, createdById: true } } },
  })
  if (!offer) throw new FinancingError('Offer not found', 404)
  await loadRequestForFinancier(userId, offer.requestId)
  if (offer.status !== 'SENT') throw new FinancingError(`Offer is ${offer.status} — cannot withdraw`, 409)

  const now = new Date()
  const updated = await db.$transaction(async (tx) => {
    const withdrawn = await tx.financingOffer.update({
      where: { id: offerId },
      data: { status: 'WITHDRAWN', withdrawnAt: now },
      include: offerInclude,
    })
    // No other SENT offers left → the request goes back to financier review
    const openOffers = await tx.financingOffer.count({
      where: { requestId: offer.requestId, status: 'SENT', id: { not: offerId } },
    })
    if (openOffers === 0 && offer.request.status === 'OFFERED') {
      await tx.financingRequest.update({
        where: { id: offer.requestId },
        data: { status: 'UNDER_FINANCIER_REVIEW' },
      })
    }
    return withdrawn
  })

  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'OFFER_WITHDRAWN',
    entityType: 'FinancingOffer',
    entityId: offerId,
    summary: `Offer withdrawn on ${offer.request.number}`,
    metadata: { requestId: offer.requestId },
  })
  await emitNotification({
    userId: offer.request.createdById,
    type: 'OFFER_WITHDRAWN',
    title: `Offer withdrawn — ${offer.request.number}`,
    body: 'The financier withdrew this offer. Other offers (if any) remain open.',
    linkView: 'financing',
    linkId: offer.requestId,
  })
  return serializeOffer(updated as never)
}

/** DRAFT offers only — SENT/ACCEPTED offers are FROZEN (agreement references them, DP-20). */
export async function updateOfferDraft(
  userId: string,
  offerId: string,
  input: Partial<OfferInput>
): Promise<FinancingOfferDTO> {
  const offer = await db.financingOffer.findUnique({ where: { id: offerId } })
  if (!offer) throw new FinancingError('Offer not found', 404)
  await loadRequestForFinancier(userId, offer.requestId)
  if (offer.status !== 'DRAFT') {
    throw new FinancingError(
      offer.status === 'ACCEPTED'
        ? 'This offer was accepted — its terms are frozen on the agreement (DP-20)'
        : `Offer is ${offer.status} and can no longer be edited`,
      409
    )
  }
  const installments = input.installments ? validateInstallments(input.installments) : undefined
  const updated = await db.financingOffer.update({
    where: { id: offerId },
    data: {
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.tenorMonths !== undefined ? { tenorMonths: input.tenorMonths } : {}),
      ...(input.rateType !== undefined ? { rateType: input.rateType } : {}),
      ...(input.ratePercent !== undefined ? { ratePercent: input.ratePercent } : {}),
      ...(input.feeFlat !== undefined ? { feeFlat: input.feeFlat } : {}),
      ...(input.collateralRequired !== undefined ? { collateralRequired: input.collateralRequired } : {}),
      ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
      ...(input.validUntil !== undefined
        ? { validUntil: input.validUntil ? new Date(input.validUntil) : null }
        : {}),
      ...(installments
        ? {
            installments: {
              deleteMany: {},
              create: installments,
            },
          }
        : {}),
    },
    include: offerInclude,
  })
  return serializeOffer(updated as never)
}

// ── Applicant responses (accept / decline) ────────────────────────────────

/** Freeze + agreement + SUCCESS fee — the shared acceptance core. */
async function acceptOfferCore(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  offer: { id: string; requestId: string; amount: number; currency: string },
  agreementNumber: string,
  successPercent: number
): Promise<string> {
  const now = new Date()
  // freeze the accepted offer + decline every other SENT offer on the request
  await tx.financingOffer.update({
    where: { id: offer.id },
    data: { status: 'ACCEPTED', acceptedAt: now },
  })
  await tx.financingOffer.updateMany({
    where: { requestId: offer.requestId, status: 'SENT', id: { not: offer.id } },
    data: { status: 'DECLINED', declinedAt: now },
  })
  // sibling offers across the multi-group also auto-decline (plan flow 7)
  const request = await tx.financingRequest.findUnique({
    where: { id: offer.requestId },
    select: { multiGroupId: true, status: true },
  })
  if (request?.multiGroupId) {
    const siblingIds = await tx.financingRequest.findMany({
      where: { multiGroupId: request.multiGroupId, id: { not: offer.requestId } },
      select: { id: true },
    })
    for (const sibling of siblingIds) {
      await tx.financingOffer.updateMany({
        where: { requestId: sibling.id, status: 'SENT' },
        data: { status: 'DECLINED', declinedAt: now },
      })
    }
  }
  await tx.financingRequest.update({
    where: { id: offer.requestId },
    data: { status: 'ACCEPTED', closedAt: now },
  })
  // FinancingAgreement via the AGR sequence (references the FROZEN offer — DP-20).
  // The number is minted OUTSIDE the tx (nextNumber opens its own — SQLite
  // write-lock discipline) and the fee percent is resolved before too.
  const agreement = await tx.financingAgreement.create({
    data: { number: agreementNumber, offerId: offer.id, acceptedAt: now, status: 'ACTIVE', fundingStatus: 'PENDING' },
  })
  // FinancingFee SUCCESS — the platform's commission (D-001/002)
  const percent = successPercent
  const feeAmount = Math.round(offer.amount * (percent / 100) * 100) / 100
  await tx.financingFee.create({
    data: {
      agreementId: agreement.id,
      type: 'SUCCESS',
      baseAmount: offer.amount,
      percentApplied: percent,
      amount: feeAmount,
      status: 'ACCRUED',
    },
  })
  return agreement.id
}

export async function acceptOffer(
  userId: string,
  offerId: string
): Promise<{ offer: FinancingOfferDTO; agreementId: string }> {
  const offer = await db.financingOffer.findUnique({
    where: { id: offerId },
    include: {
      request: {
        select: { id: true, number: true, status: true, createdById: true, organizationId: true, multiGroupId: true },
      },
    },
  })
  if (!offer) throw new FinancingError('Offer not found', 404)
  await assertApplicantActor(userId, offer.request)
  if (offer.status !== 'SENT') throw new FinancingError(`Offer is ${offer.status} — cannot accept`, 409)
  if (offer.validUntil && offer.validUntil.getTime() < Date.now()) {
    throw new FinancingError('This offer has expired', 409)
  }
  if (!['OFFERED', 'UNDER_FINANCIER_REVIEW', 'FORWARDED_TO_FINANCIER'].includes(offer.request.status)) {
    throw new FinancingError(`The request is ${offer.request.status} — offers are closed`, 409)
  }

  // mint the AGR number + resolve the fee percent BEFORE the transaction
  // (nextNumber opens its own tx — SQLite write-lock discipline)
  const [agreementNumber, feesPanel] = await Promise.all([
    nextNumber('AGR'),
    resolvePanel('financingFees'),
  ])
  const successPercent = Number(feesPanel.financierSuccessPercent) || 0
  const agreementId = await db.$transaction(async (tx) =>
    acceptOfferCore(tx, offer, agreementNumber, successPercent)
  )

  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'OFFER_ACCEPTED',
    entityType: 'FinancingOffer',
    entityId: offerId,
    summary: `Offer accepted on ${offer.request.number} — agreement created, success fee accrued`,
    metadata: { requestId: offer.requestId, amount: offer.amount },
  })
  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'FEE_ACCRUED',
    entityType: 'FinancingAgreement',
    entityId: agreementId,
    summary: `SUCCESS fee accrued on agreement for ${offer.request.number}`,
    metadata: { baseAmount: offer.amount },
  })

  // notify financier staff + platform admins
  const request = await db.financingRequest.findUnique({
    where: { id: offer.requestId },
    select: {
      service: { select: { financierProfile: { select: { organizationId: true, organization: { select: { name: true } } } } } },
    },
  })
  const financierOrgId = request?.service.financierProfile.organizationId
  if (financierOrgId) {
    const staff = await db.organizationMember.findMany({
      where: { organizationId: financierOrgId, role: { in: ['OWNER', 'ADMIN'] } },
      select: { userId: true },
    })
    await emitNotifications(
      staff.map((s) => ({
        userId: s.userId,
        type: 'OFFER_ACCEPTED' as const,
        title: `Offer accepted — ${offer.request.number}`,
        body: `The applicant accepted ${offer.amount.toLocaleString()} ${offer.currency} over ${offer.tenorMonths} months. Report funding events on the agreement.`,
        linkView: 'financier' as const,
        linkId: offer.requestId,
      }))
    )
  }
  const admins = await db.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
  await emitNotifications(
    admins.map((a) => ({
      userId: a.id,
      type: 'FEE_ACCRUED' as const,
      title: `Success fee accrued — ${offer.request.number}`,
      body: `A financing agreement was accepted (${offer.amount.toLocaleString()} ${offer.currency}). Invoice the financier externally and mark the fee paid when collected.`,
      linkView: 'admin' as const,
      linkId: agreementId,
    }))
  )

  const updated = await db.financingOffer.findUniqueOrThrow({
    where: { id: offerId },
    include: offerInclude,
  })
  return { offer: serializeOffer(updated as never), agreementId }
}

export async function declineOffer(userId: string, offerId: string): Promise<FinancingOfferDTO> {
  const offer = await db.financingOffer.findUnique({
    where: { id: offerId },
    include: {
      request: {
        select: { id: true, number: true, createdById: true, organizationId: true, service: { select: { financierProfile: { select: { organizationId: true } } } } },
      },
    },
  })
  if (!offer) throw new FinancingError('Offer not found', 404)
  await assertApplicantActor(userId, offer.request)
  if (offer.status !== 'SENT') throw new FinancingError(`Offer is ${offer.status} — cannot decline`, 409)

  const now = new Date()
  const updated = await db.financingOffer.update({
    where: { id: offerId },
    data: { status: 'DECLINED', declinedAt: now },
    include: offerInclude,
  })
  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'OFFER_DECLINED',
    entityType: 'FinancingOffer',
    entityId: offerId,
    summary: `Offer declined on ${offer.request.number}`,
    metadata: { requestId: offer.requestId },
  })
  const staff = await db.organizationMember.findMany({
    where: {
      organizationId: offer.request.service.financierProfile.organizationId,
      role: { in: ['OWNER', 'ADMIN'] },
    },
    select: { userId: true },
  })
  await emitNotifications(
    staff.map((s) => ({
      userId: s.userId,
      type: 'OFFER_DECLINED' as const,
      title: `Offer declined — ${offer.request.number}`,
      body: 'The applicant declined this offer. A revised offer may still be possible.',
      linkView: 'financier' as const,
      linkId: offer.requestId,
    }))
  )
  return serializeOffer(updated as never)
}

export async function getOfferForApplicant(userId: string, offerId: string): Promise<FinancingOfferDTO> {
  const offer = await db.financingOffer.findUnique({
    where: { id: offerId },
    include: {
      ...offerInclude,
      request: { select: { number: true, createdById: true, organizationId: true } },
    },
  })
  if (!offer) throw new FinancingError('Offer not found', 404)
  if (offer.status === 'DRAFT') throw new FinancingError('Offer not found', 404)
  await assertApplicantActor(userId, offer.request)
  return serializeOffer(offer as never)
}
