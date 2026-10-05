import { db } from '@/lib/db'
import { recordAudit } from '@/server/modules/audit/service'
import { FinancingError } from './shared'

/**
 * MURABAHA CHECKOUT (lastplan v5 §10.9 — C4).
 *
 * Implements the documented transaction sequence (docs/murabaha-preconditions.md):
 * checkout "Finance it (Murabaha)" → pre-qualification (KYC L2+ gate) →
 * financing request (targetType ORDER, through the unchanged platform gate)
 * → offer → agreement execution → disbursement → order FUNDED (never PAID —
 * the buyer obligation lives on the financing ledger, never conflated).
 *
 * The checkout method is gated by the platform setting
 * `financingGeneral.murabahaCheckoutEnabled` (off by default until the
 * legal/Sharia sign-off rows in the precondition doc are completed).
 */

export interface PreQualifyDTO {
  qualified: boolean
  kycLevel: number
  requiredLevel: number
  reason: string
  /** Eligible ACTIVE FINANCING services the checkout request can route to. */
  services: { id: string; name: string; financierOrgName: string; currency: string }[]
}

/** KYC L2 = identity docs verified (User.kycLevel comment, schema §User). */
const REQUIRED_KYC_LEVEL = 2

export async function preQualifyBuyer(userId: string): Promise<PreQualifyDTO> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { kycLevel: true, status: true },
  })
  if (!user) throw new FinancingError('Account not found', 404)
  if (user.status !== 'ACTIVE') {
    return {
      qualified: false,
      kycLevel: user.kycLevel,
      requiredLevel: REQUIRED_KYC_LEVEL,
      reason: 'Your account is not active.',
      services: [],
    }
  }
  // Candidate services: ACTIVE FINANCING offerings (routing refinement by
  // coverage happens in the request pipeline; the buyer sees the count here).
  const services = await db.financierService.findMany({
    where: { status: 'ACTIVE', serviceKind: 'FINANCING' },
    select: {
      id: true,
      name: true,
      currency: true,
      financierProfile: { select: { organization: { select: { name: true } } } },
    },
    take: 25,
    orderBy: { createdAt: 'asc' },
  })
  const qualified = user.kycLevel >= REQUIRED_KYC_LEVEL && services.length > 0
  const reason = !qualified
    ? user.kycLevel < REQUIRED_KYC_LEVEL
      ? `Identity verification level ${user.kycLevel} — level ${REQUIRED_KYC_LEVEL} (identity documents verified) is required to finance an order. Complete verification in Account → Verification, or pay by card / bank transfer.`
      : 'No financing services are currently offered. Please pay by card or bank transfer.'
    : ''
  return {
    qualified,
    kycLevel: user.kycLevel,
    requiredLevel: REQUIRED_KYC_LEVEL,
    reason,
    services: services.map((s) => ({
      id: s.id,
      name: s.name,
      financierOrgName: s.financierProfile.organization.name,
      currency: s.currency,
    })),
  }
}

/**
 * Assert the buyer passes pre-qualification (the checkout API calls this
 * before creating the financed order — fail-closed, 400 typed code).
 */
export async function assertMurabahaPreQualified(userId: string): Promise<void> {
  const pq = await preQualifyBuyer(userId)
  if (!pq.qualified) {
    throw new FinancingError(pq.reason, 400)
  }
}

/**
 * Pick the routing service for an order-financing request: services whose
 * range covers the (currency-converted) order total, preferring PO_FINANCING,
 * then HOME (order-financing-shaped), then any; fallback to the newest ACTIVE
 * FINANCING offering (its range check will speak if nothing fits).
 */
export async function pickOrderFinancingServiceId(convertedAmount?: number): Promise<string> {
  if (convertedAmount != null) {
    for (const category of ['PO_FINANCING', 'HOME']) {
      const svc = await db.financierService.findFirst({
        where: {
          status: 'ACTIVE',
          serviceKind: 'FINANCING',
          category,
          OR: [{ amountMin: null }, { amountMin: { lte: convertedAmount } }],
          AND: [{ OR: [{ amountMax: null }, { amountMax: { gte: convertedAmount } }] }],
        },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      })
      if (svc) return svc.id
    }
    const anyFit = await db.financierService.findFirst({
      where: {
        status: 'ACTIVE',
        serviceKind: 'FINANCING',
        OR: [{ amountMin: null }, { amountMin: { lte: convertedAmount } }],
        AND: [{ OR: [{ amountMax: null }, { amountMax: { gte: convertedAmount } }] }],
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    })
    if (anyFit) return anyFit.id
  }
  const svc = await db.financierService.findFirst({
    where: { status: 'ACTIVE', serviceKind: 'FINANCING', category: 'PO_FINANCING' },
    select: { id: true },
  })
  if (svc) return svc.id
  const any = await db.financierService.findFirst({
    where: { status: 'ACTIVE', serviceKind: 'FINANCING' },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
  })
  if (!any) throw new FinancingError('No financing services are currently offered', 400)
  return any.id
}

/** Convert an order total into the financing service's currency using the
 * latest pinned rate (the financier offers in their currency; the FX snapshot
 * at disbursement handles the money side). Falls back to the raw amount. */
export async function convertToServiceCurrency(
  amount: number,
  fromCode: string,
  toCode: string
): Promise<number> {
  if (fromCode === toCode) return amount
  const rate = await db.exchangeRate.findFirst({
    where: { baseCode: fromCode, quoteCode: toCode },
    orderBy: { validFrom: 'desc' },
    select: { rate: true },
  })
  if (!rate) return amount // let the service range check speak
  return Math.round(amount * Number(rate.rate) * 100) / 100
}

/**
 * After the financed order is created: mint + SUBMIT the linked financing
 * request (targetType ORDER). The platform gate (R-4) stays fully intact —
 * admins forward it exactly like any other request.
 */
export async function createOrderFinancingRequest(
  userId: string,
  order: { id: string; total: number; currency: string; city: string }
): Promise<{ requestId: string; requestNumber: string }> {
  const serviceId = await pickOrderFinancingServiceId()
  const service = await db.financierService.findUnique({
    where: { id: serviceId },
    select: { currency: true },
  })
  const amountRequested = await convertToServiceCurrency(
    order.total,
    order.currency,
    service?.currency ?? order.currency
  )
  // Re-pick now that the converted amount is known (range-fit routing).
  const routedServiceId = await pickOrderFinancingServiceId(amountRequested)
  const routedService = routedServiceId === serviceId ? service : await db.financierService.findUnique({
    where: { id: routedServiceId },
    select: { currency: true },
  })
  const { createFinancingRequest, submitFinancingRequest } = await import('./requests')
  const created = await createFinancingRequest(userId, {
    serviceId: routedServiceId,
    targetType: 'ORDER',
    targetId: order.id,
    activityCity: order.city,
    amountRequested,
    currency: routedService?.currency ?? service?.currency ?? order.currency,
    purpose: `Murabaha financing for order ${order.id.slice(-8).toUpperCase()} (checkout Finance-it).`,
    applicantNotes: 'Created automatically by the Murabaha checkout flow.',
  })
  // SUBMIT immediately — the buyer consented to the data transfer at
  // checkout (the Finance-it terms step in the precondition doc §2).
  const submitted = await submitFinancingRequest(userId, created.id, { consent: true })
  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'MURABAHA_CHECKOUT_STARTED',
    entityType: 'Order',
    entityId: order.id,
    summary: `Financed checkout started — request ${submitted.number} submitted for order financing`,
    metadata: { orderId: order.id, requestId: submitted.id, requestNumber: submitted.number, total: order.total, currency: order.currency, amountRequested },
  })
  return { requestId: submitted.id, requestNumber: submitted.number }
}
