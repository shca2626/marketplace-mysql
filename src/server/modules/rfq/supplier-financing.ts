import { db } from '@/lib/db'
import { createRfq, RfqServiceError } from './service'
import { recordAudit } from '@/server/modules/audit/service'
import { userHasOrgPermission } from '@/server/authz/evaluator'

// ─────────────────────────────────────────────────────────────────────────────
// FINANCING-LINKED SUPPLIER RFQs (Phase 6 — B2B2C sourcing).
//
// A supplier RFQ sources goods/services FOR a customer's financing request.
// It is never a purchase made by the financier itself.
//
// Rules enforced here:
//   • Only the financing applicant (individual or authorized company member)
//     can create/revise the supplier RFQ for their request.
//   • The request must have passed the platform completeness gate before the
//     RFQ is routed anywhere (consent ≠ agreement).
//   • Material revisions require RENEWED applicant consent; previous versions
//     are preserved via the version/supersededById chain.
//   • Suppliers see ONLY the minimum needed to quote: product/quantity/target
//     price/delivery context. Applicant financing or identity documents are
//     never exposed to suppliers.
//   • Only suppliers with a LIVE accreditation from the relevant financier
//     receive financing-linked RFQs.
// ─────────────────────────────────────────────────────────────────────────────

export interface SupplierRfqLineInput {
  productId?: string | null
  productName?: string | null
  variantId?: string | null
  quantity: number
  targetPrice?: number | null
  notes?: string | null
}

/** Financing statuses whose platform completeness gate has PASSED (routing allowed). */
const GATE_PASSED_STATUSES = ['FORWARDED_TO_FINANCIER', 'UNDER_FINANCIER_REVIEW', 'OFFERED', 'ACCEPTED']

async function loadFinancingRequest(userId: string, requestId: string) {
  const request = await db.financingRequest.findUnique({
    where: { id: requestId },
    include: {
      service: { include: { financierProfile: { include: { organization: { select: { id: true, name: true, status: true } } } } } },
      organization: { select: { id: true, name: true } },
    },
  })
  if (!request) throw new RfqServiceError('Financing request not found', 404)

  // Applicant guard: the creator themself, or a member of the applicant org.
  if (request.createdById !== userId) {
    if (!request.organizationId) throw new RfqServiceError('This financing request belongs to another applicant', 403)
    const member = await db.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: request.organizationId, userId } },
    })
    if (!member) throw new RfqServiceError('This financing request belongs to another applicant', 403)
    if (member.role === 'BUYER') {
      // authorized company buyers may act; viewers/approvers may not initiate sourcing
      const allowed = await userHasOrgPermission(userId, request.organizationId, 'org.rfq.create')
      if (!allowed) throw new RfqServiceError('You need the org.rfq.create permission to source for this request', 403)
    }
  }
  return request
}

/** Orgs holding a LIVE accreditation from the given financier. */
export async function liveAccreditedOrgIds(financierOrgId: string): Promise<string[]> {
  const now = new Date()
  const rows = await db.accreditationRequest.findMany({
    where: {
      status: 'ACCREDITED',
      service: { financierProfile: { organizationId: financierOrgId } },
      OR: [{ validUntil: null }, { validUntil: { gt: now } }],
    },
    select: { organizationId: true },
  })
  return [...new Set(rows.map((r) => r.organizationId))]
}

/** Supplier-facing inbox: financing-linked RFQs the company may quote on. */
export async function supplierFinancingInbox(actorUserId: string, organizationId: string): Promise<unknown[]> {
  const member = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: actorUserId } },
  })
  if (!member) throw new RfqServiceError('You are not a member of that organization', 403)
  const ok = await userHasOrgPermission(actorUserId, organizationId, 'org.rfq.view')
  if (!ok) throw new RfqServiceError('This action requires the "org.rfq.view" permission in this organization', 403)

  // Financiers whose accredited-supplier pool includes this org.
  const financierOrgs = await db.accreditationRequest.findMany({
    where: {
      organizationId,
      status: 'ACCREDITED',
      OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
    },
    select: { service: { select: { financierProfile: { select: { organizationId: true } } } } },
  })
  const financierOrgIds = [...new Set(financierOrgs.map((f) => f.service.financierProfile.organizationId))]
  if (financierOrgIds.length === 0) return []

  // Open supplier-financing RFQs (consented versions only reach suppliers).
  const rfqs = await db.rfq.findMany({
    where: {
      kind: 'SUPPLIER_FINANCING',
      status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'QUOTED'] },
      consentAt: { not: null },
    },
    include: {
      lines: { select: { productId: true, productName: true, quantity: true, targetPrice: true } },
      quotes: { select: { id: true, sellerId: true, status: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  // Filter to those whose financing request routes to one of these financiers.
  const result: unknown[] = []
  for (const rfq of rfqs) {
    if (!rfq.financingRequestId) continue
    const fr = await db.financingRequest.findUnique({
      where: { id: rfq.financingRequestId },
      select: { service: { select: { financierProfile: { select: { organizationId: true, organization: { select: { name: true, status: true } } } } } }, status: true },
    })
    if (!fr) continue
    if (!financierOrgIds.includes(fr.service.financierProfile.organizationId)) continue
    if (fr.service.financierProfile.organization.status !== 'ACTIVE') continue
    if (!GATE_PASSED_STATUSES.includes(fr.status)) continue
    result.push({
      id: rfq.id,
      number: rfq.number,
      title: rfq.title,
      description: rfq.description,
      status: rfq.status,
      version: rfq.version,
      createdAt: rfq.createdAt.toISOString(),
      // Minimum disclosure: product/quantity/target only — never applicant docs.
      lines: rfq.lines.map((l) => ({
        productId: l.productId,
        productName: l.productName,
        quantity: l.quantity,
        targetPrice: l.targetPrice,
      })),
      quoteCount: rfq.quotes.length,
      myQuoteIds: rfq.quotes.filter((q) => q.sellerId === actorUserId).map((q) => q.id),
    })
  }
  return result
}

/**
 * Create the supplier RFQ linked to a financing request (applicant action).
 * consentAt: the applicant's explicit consent for THIS requirement version
 * (captured by the wizard before this call — consent ≠ agreement).
 */
export async function createSupplierRfq(
  userId: string,
  input: {
    financingRequestId: string
    title?: string | null
    description?: string | null
    lines: SupplierRfqLineInput[]
    expiresInDays?: number | null
    organizationId?: string | null
  }
): Promise<{ rfqId: string; number: string; routedOrgCount: number; routedOrgNames: string[] }> {
  const request = await loadFinancingRequest(userId, input.financingRequestId)

  // Platform gate: routing happens only after the completeness gate passes
  // (forwarded to at least one financier — SUBMITTED alone has NOT passed).
  const gatePassed =
    !!request.forwardedAt || GATE_PASSED_STATUSES.includes(request.status)
  if (!gatePassed) {
    throw new RfqServiceError(
      `The platform document gate must pass before a supplier RFQ can be routed (request is ${request.status})`,
      409
    )
  }

  // One live supplier RFQ per financing request (revise, don't duplicate).
  const existing = await db.rfq.findFirst({
    where: { financingRequestId: request.id, status: { in: ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'QUOTED'] } },
  })
  if (existing) {
    throw new RfqServiceError(
      `An active supplier RFQ (${existing.number}) already exists for this request — revise it instead`,
      409
    )
  }

  // The org context of the sourcing (personal → null; company → member org).
  let organizationId: string | null = null
  if (input.organizationId) {
    const member = await db.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: input.organizationId, userId } },
    })
    if (!member) throw new RfqServiceError('You are not a member of that organization', 403)
    organizationId = input.organizationId
  } else if (request.organizationId) {
    organizationId = request.organizationId
  }

  const rfq = await createRfq(userId, {
    title: input.title ?? `Sourcing for financing request ${request.number}`,
    description: input.description ?? null,
    organizationId,
    lines: input.lines,
    expiresInDays: input.expiresInDays ?? 14,
  })

  // Stamp the financing linkage + applicant consent for version 1, and OPEN
  // the RFQ (a DRAFT supplier RFQ would be invisible to suppliers and quotes).
  const financierOrgId = request.service.financierProfile.organizationId
  const stamped = await db.rfq.update({
    where: { id: rfq.id },
    data: {
      kind: 'SUPPLIER_FINANCING',
      financingRequestId: request.id,
      version: 1,
      consentAt: new Date(),
      status: 'SUBMITTED',
      submittedAt: new Date(),
    },
  })

  const routedOrgIds = await liveAccreditedOrgIds(financierOrgId)
  const routedOrgs = await db.organization.findMany({
    where: { id: { in: routedOrgIds }, status: 'ACTIVE' },
    select: { name: true },
  })

  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'SUPPLIER_RFQ_CREATED',
    entityType: 'Rfq',
    entityId: stamped.id,
    summary: `Supplier RFQ ${stamped.number} created for financing request ${request.number} — routed to ${routedOrgs.length} accredited supplier(s) of ${request.service.financierProfile.organization.name}`,
    metadata: {
      financingRequestId: request.id,
      financierOrgId,
      routedOrgIds,
      consentAt: stamped.consentAt?.toISOString(),
    },
  })

  return {
    rfqId: stamped.id,
    number: stamped.number,
    routedOrgCount: routedOrgs.length,
    routedOrgNames: routedOrgs.map((o) => o.name),
  }
}

/**
 * Record the applicant's renewed consent (used after a material revision or
 * a financier-specified requirement change). Idempotent per version.
 */
export async function recordConsent(userId: string, rfqId: string, note?: string | null): Promise<{ consentAt: string; version: number }> {
  const rfq = await db.rfq.findUnique({ where: { id: rfqId } })
  if (!rfq) throw new RfqServiceError('RFQ not found', 404)
  if (rfq.kind !== 'SUPPLIER_FINANCING' || !rfq.financingRequestId) {
    throw new RfqServiceError('This RFQ is not linked to a financing request', 409)
  }
  await loadFinancingRequest(userId, rfq.financingRequestId)
  if (rfq.consentAt) {
    return { consentAt: rfq.consentAt.toISOString(), version: rfq.version }
  }
  const updated = await db.rfq.update({ where: { id: rfqId }, data: { consentAt: new Date() } })
  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'SUPPLIER_RFQ_CONSENT',
    entityType: 'Rfq',
    entityId: rfqId,
    summary: `Applicant consent recorded for supplier RFQ ${rfq.number} v${rfq.version}${note ? ` — ${note}` : ''}`,
    metadata: { financingRequestId: rfq.financingRequestId, version: rfq.version },
  })
  return { consentAt: updated.consentAt!.toISOString(), version: updated.version }
}

/**
 * Revise a supplier RFQ after a material requirement change. The CURRENT rfq
 * is preserved (superseded), a new version is created, and consent resets —
 * routing resumes only after the applicant consents again.
 */
export async function reviseSupplierRfq(
  userId: string,
  rfqId: string,
  input: { title?: string | null; description?: string | null; lines: SupplierRfqLineInput[]; reason?: string | null }
): Promise<{ rfqId: string; number: string; version: number }> {
  const previous = await db.rfq.findUnique({ where: { id: rfqId }, include: { lines: true } })
  if (!previous) throw new RfqServiceError('RFQ not found', 404)
  if (previous.kind !== 'SUPPLIER_FINANCING' || !previous.financingRequestId) {
    throw new RfqServiceError('This RFQ is not linked to a financing request', 409)
  }
  const request = await loadFinancingRequest(userId, previous.financingRequestId)

  const revised = await createRfq(userId, {
    title: input.title ?? previous.title,
    description: input.description ?? previous.description,
    organizationId: previous.organizationId,
    lines: input.lines,
    expiresInDays: 14,
  })
  const stamped = await db.$transaction(async (tx) => {
    // Preserve the previous version: mark superseded, keep quotes readable.
    await tx.rfq.update({ where: { id: rfqId }, data: { status: 'CANCELLED' } })
    const r = await tx.rfq.update({
      where: { id: revised.id },
      data: {
        kind: 'SUPPLIER_FINANCING',
        financingRequestId: request.id,
        version: previous.version + 1,
        consentAt: null, // renewed consent required before routing
        supersededById: rfqId,
        // the new version opens immediately — the CONSENT gate, not DRAFT
        // status, controls whether suppliers see it
        status: 'SUBMITTED',
        submittedAt: new Date(),
      },
    })
    return r
  }, { timeout: 15000 })

  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'SUPPLIER_RFQ_REVISED',
    entityType: 'Rfq',
    entityId: stamped.id,
    summary: `Supplier RFQ ${previous.number} superseded by ${stamped.number} (v${stamped.version}) — awaiting renewed applicant consent`,
    metadata: { previousRfqId: rfqId, financingRequestId: request.id, reason: input.reason ?? null },
  })

  return { rfqId: stamped.id, number: stamped.number, version: stamped.version }
}
