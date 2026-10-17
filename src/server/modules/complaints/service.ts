import { db } from '@/lib/db'
import { recordAuditTx } from '@/server/modules/audit/service'
import { nextNumber } from '@/server/modules/sequences/service'
import { emitNotifications, type EmitInput } from '@/server/modules/notifications/service'

// ─────────────────────────────────────────────────────────────────────────────
// COMPLAINT-1: company complaints / trust reports — the order-agnostic trust &
// safety surface (the order-bound refund flow lives in Dispute).
//
// Any authenticated user reports a COMPANY: misleading information, counterfeits,
// unprofessional conduct, pricing abuse, fulfillment failure or IP infringement.
// The target org gets ONE response; platform staff triage severity and close.
//
// Lifecycle:
//   OPEN ──org responds──▶ ORG_RESPONDED
//   OPEN/ORG_RESPONDED ──admin closes──▶ RESOLVED | DISMISSED
//   OPEN ──complainant withdraws──▶ WITHDRAWN (before the org responds)
//
// INVARIANTS
//   • the complainant can never target their own organization
//   • a linked order must belong to the complainant (personally or through
//     their filing org) AND contain items sold by the target org — context
//     claims are server-verified, never trusted from the client
//   • a linked product must belong to the target org
//   • one live complaint per (user, target org) — duplicate open reports are
//     rejected instead of flooding the queue
//   • the org response is single-shot: once written the complaint is frozen
//     for the complainant (withdraw) and moves to the admin queue
//   • every mutation writes its audit row in the SAME transaction
//   • org-side actions require membership + (OWNER/ADMIN or org.offers.manage)
//     — the same selling permission that gates the Selling workspace
// ─────────────────────────────────────────────────────────────────────────────

export class ComplaintError extends Error {
  status: number
  code?: string
  constructor(message: string, status = 400, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export const COMPLAINT_CATEGORIES = [
  'MISLEADING_INFO',
  'COUNTERFEIT',
  'CONDUCT',
  'PRICING',
  'FULFILLMENT',
  'IP_INFRINGEMENT',
  'OTHER',
] as const
export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number]

export const COMPLAINT_STATUSES = ['OPEN', 'ORG_RESPONDED', 'RESOLVED', 'DISMISSED', 'WITHDRAWN'] as const
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number]

export const COMPLAINT_SEVERITIES = ['NORMAL', 'HIGH', 'CRITICAL'] as const
export type ComplaintSeverity = (typeof COMPLAINT_SEVERITIES)[number]

export const COMPLAINT_CATEGORY_LABELS: Record<string, string> = {
  MISLEADING_INFO: 'Misleading information',
  COUNTERFEIT: 'Counterfeit or fake goods',
  CONDUCT: 'Unprofessional conduct',
  PRICING: 'Pricing abuse or hidden fees',
  FULFILLMENT: 'Fulfillment failure',
  IP_INFRINGEMENT: 'IP infringement',
  OTHER: 'Other',
}

const SUBJECT_MAX = 120
const BODY_MAX = 4000
const ORG_RESPONSE_MAX = 4000
const RESOLUTION_NOTE_MAX = 4000

// ── shared DTO ──────────────────────────────────────────────────────────────

export interface ComplaintDTO {
  id: string
  number: string
  targetOrgId: string
  targetOrgName: string
  targetOrgSlug: string
  raisedById: string
  raisedByName: string
  raisedByOrgId: string | null
  raisedByOrgName: string | null
  orderId: string | null
  orderRef: string | null // human context: first item title + total when the order exists
  orderTotal: number | null
  productId: string | null
  productTitle: string | null
  category: string
  subject: string
  body: string
  status: string
  orgResponse: string | null
  orgRespondedAt: string | null
  severity: string
  resolutionNote: string | null
  resolvedByName: string | null
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
}

type ComplaintRow = {
  id: string
  number: string
  targetOrgId: string
  raisedById: string
  raisedByOrgId: string | null
  orderId: string | null
  productId: string | null
  category: string
  subject: string
  body: string
  status: string
  orgResponse: string | null
  orgRespondedAt: Date | null
  severity: string
  resolutionNote: string | null
  resolvedAt: Date | null
  createdAt: Date
  updatedAt: Date
  targetOrg: { id: string; name: string; slug: string }
  raisedBy: { id: string; name: string }
  raisedByOrg: { id: string; name: string } | null
  resolvedBy: { id: string; name: string } | null
}

/** Complainant-side / admin serializer — includes the complainant's identity
 *  (they filed it; the target org needs to know who to make whole). */
function serialize(
  row: ComplaintRow,
  ctx?: { orderTotal: number | null; productTitle: string | null; orderRef: string | null }
): ComplaintDTO {
  return {
    id: row.id,
    number: row.number,
    targetOrgId: row.targetOrg.id,
    targetOrgName: row.targetOrg.name,
    targetOrgSlug: row.targetOrg.slug,
    raisedById: row.raisedBy.id,
    raisedByName: row.raisedBy.name,
    raisedByOrgId: row.raisedByOrg?.id ?? null,
    raisedByOrgName: row.raisedByOrg?.name ?? null,
    orderId: row.orderId,
    orderRef: ctx?.orderRef ?? null,
    orderTotal: ctx?.orderTotal ?? null,
    productId: row.productId,
    productTitle: ctx?.productTitle ?? null,
    category: row.category,
    subject: row.subject,
    body: row.body,
    status: row.status,
    orgResponse: row.orgResponse,
    orgRespondedAt: row.orgRespondedAt?.toISOString() ?? null,
    severity: row.severity,
    resolutionNote: row.resolutionNote,
    resolvedByName: row.resolvedBy?.name ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

const COMPLAINT_INCLUDE = {
  targetOrg: { select: { id: true, name: true, slug: true } },
  raisedBy: { select: { id: true, name: true } },
  raisedByOrg: { select: { id: true, name: true } },
  resolvedBy: { select: { id: true, name: true } },
} as const

/** Enrich loose-FK order/product references (kept alive when the source row
 *  is deleted — the complaint itself is the record). */
async function enrich(rows: ComplaintRow[]): Promise<ComplaintDTO[]> {
  const orderIds = [...new Set(rows.map((r) => r.orderId).filter((v): v is string => Boolean(v)))]
  const productIds = [...new Set(rows.map((r) => r.productId).filter((v): v is string => Boolean(v)))]
  const [orders, products] = await Promise.all([
    orderIds.length
      ? db.order.findMany({
          where: { id: { in: orderIds } },
          select: { id: true, total: true, items: { select: { title: true }, take: 1 } },
        })
      : Promise.resolve([]),
    productIds.length
      ? db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, title: true } })
      : Promise.resolve([]),
  ])
  const orderMap = new Map(orders.map((o) => [o.id, o] as const))
  const productMap = new Map(products.map((p) => [p.id, p] as const))
  return rows.map((r) => {
    const order = r.orderId ? orderMap.get(r.orderId) : undefined
    const product = r.productId ? productMap.get(r.productId) : undefined
    return serialize(r, {
      orderTotal: order?.total ?? null,
      orderRef: order ? `${order.items[0]?.title ?? 'Order'} · $${order.total.toFixed(2)}` : null,
      productTitle: product?.title ?? null,
    })
  })
}

// ── permission helper (same doctrine as sponsorships: membership + role or
//    a custom role holding org.offers.manage) ────────────────────────────────

async function assertOrgSellingPermission(userId: string, organizationId: string): Promise<void> {
  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { role: true },
  })
  if (!membership) throw new ComplaintError('Not a member of that organization', 403, 'NOT_MEMBER')
  if (['OWNER', 'ADMIN'].includes(membership.role)) return
  const allowed = await db.userRole.count({
    where: {
      userId,
      organizationId,
      role: { permissions: { some: { permissionKey: 'org.offers.manage' } } },
    },
  })
  if (allowed === 0) {
    throw new ComplaintError('This action requires the "org.offers.manage" permission.', 403, 'FORBIDDEN')
  }
}

async function userOrgIds(userId: string): Promise<string[]> {
  const memberships = await db.organizationMember.findMany({
    where: { userId },
    select: { organizationId: true },
  })
  return memberships.map((m) => m.organizationId)
}

// ── complainant: file / list / withdraw ──────────────────────────────────────

export interface CreateComplaintInput {
  userId: string
  targetOrgId: string
  category: string
  subject: string
  body: string
  orderId?: string | null
  productId?: string | null
  /** the complainant's org when filing on behalf of a company (server-verified) */
  raisedByOrgId?: string | null
}

export async function createComplaint(input: CreateComplaintInput): Promise<ComplaintDTO> {
  const { userId } = input
  const targetOrgId = (input.targetOrgId || '').trim()
  const category = (input.category || '').trim() as ComplaintCategory
  const subject = (input.subject || '').trim()
  const body = (input.body || '').trim()

  if (!targetOrgId) throw new ComplaintError('A company to report is required', 400)
  if (!COMPLAINT_CATEGORIES.includes(category)) throw new ComplaintError('Invalid complaint category', 400)
  if (subject.length < 5 || subject.length > SUBJECT_MAX) {
    throw new ComplaintError(`Subject must be 5–${SUBJECT_MAX} characters`, 400)
  }
  if (body.length < 20 || body.length > BODY_MAX) {
    throw new ComplaintError(`Please describe the issue in 20–${BODY_MAX} characters`, 400)
  }

  const targetOrg = await db.organization.findUnique({
    where: { id: targetOrgId },
    select: { id: true, name: true, slug: true },
  })
  if (!targetOrg) throw new ComplaintError('That company does not exist', 404, 'ORG_NOT_FOUND')

  // B2B context: verify the filing org membership server-side
  let raisedByOrgId: string | null = null
  if (input.raisedByOrgId) {
    const membership = await db.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: input.raisedByOrgId, userId } },
      select: { organizationId: true },
    })
    if (!membership) throw new ComplaintError('You are not a member of that organization', 403, 'NOT_MEMBER')
    raisedByOrgId = membership.organizationId
  }
  if (raisedByOrgId === targetOrgId) {
    throw new ComplaintError('You cannot file a complaint against your own organization', 400, 'SELF_TARGET')
  }

  // Linked order: must belong to the complainant and include items sold by the target org
  let orderId: string | null = null
  if (input.orderId) {
    const order = await db.order.findUnique({
      where: { id: input.orderId },
      select: { id: true, buyerId: true, organizationId: true, items: { select: { sellerOrgId: true } } },
    })
    if (!order) throw new ComplaintError('Linked order not found', 404, 'ORDER_NOT_FOUND')
    const ownsOrder = order.buyerId === userId || (raisedByOrgId && order.organizationId === raisedByOrgId)
    if (!ownsOrder) throw new ComplaintError('You can only link your own orders', 403, 'NOT_YOUR_ORDER')
    if (!order.items.some((i) => i.sellerOrgId === targetOrgId)) {
      throw new ComplaintError('That company is not a seller on the linked order', 400, 'ORG_NOT_ON_ORDER')
    }
    orderId = order.id
  }

  // Linked product: must belong to the target org
  let productId: string | null = null
  if (input.productId) {
    const product = await db.product.findUnique({
      where: { id: input.productId },
      select: { id: true, organizationId: true },
    })
    if (!product) throw new ComplaintError('Linked product not found', 404, 'PRODUCT_NOT_FOUND')
    if (product.organizationId !== targetOrgId) {
      throw new ComplaintError('That product does not belong to the reported company', 400, 'PRODUCT_MISMATCH')
    }
    productId = product.id
  }

  // Duplicate-live guard — one live report per (user, org)
  const dup = await db.complaint.findFirst({
    where: { raisedById: userId, targetOrgId, status: { in: ['OPEN', 'ORG_RESPONDED'] } },
    select: { id: true },
  })
  if (dup) {
    throw new ComplaintError(
      'You already have an open complaint against this company — follow up on it instead of filing a new one.',
      409,
      'DUPLICATE_OPEN'
    )
  }

  const number = await nextNumber('CMP')
  const created = await db.$transaction(async (tx) => {
    const row = (await tx.complaint.create({
      data: {
        number,
        targetOrgId,
        raisedById: userId,
        raisedByOrgId,
        orderId,
        productId,
        category,
        subject,
        body,
        status: 'OPEN',
        severity: 'NORMAL',
      },
      include: COMPLAINT_INCLUDE,
    })) as unknown as ComplaintRow
    await recordAuditTx(tx, {
      actorId: userId,
      actorType: 'USER',
      action: 'COMPLAINT_FILED',
      entityType: 'Complaint',
      entityId: row.id,
      summary: `Complaint ${number} filed against ${targetOrg.name}${orderId ? ' (order-linked)' : ''}`,
      metadata: { category, subject, targetOrgId, orderId, productId },
    })
    return row
  })

  // Fire-and-forget: tell the target org's owners/admins (capped)
  const orgNotifiees = await db.organizationMember.findMany({
    where: { organizationId: targetOrgId, role: { in: ['OWNER', 'ADMIN'] } },
    select: { userId: true },
    take: 10,
  })
  if (orgNotifiees.length) {
    await emitNotifications(
      orgNotifiees.map((m) => ({
        userId: m.userId,
        type: 'COMPLAINT_STATUS' as const,
        title: 'New complaint filed against your company',
        body: `${COMPLAINT_CATEGORY_LABELS[category] ?? category}: ${subject}`,
        linkView: 'business' as const,
        linkId: created.id,
      })) satisfies EmitInput[]
    )
  }

  return (await enrich([created]))[0]
}

/** Everything the complainant filed — personally or on behalf of their orgs. */
export async function listMyComplaints(userId: string): Promise<ComplaintDTO[]> {
  const orgIds = await userOrgIds(userId)
  const rows = (await db.complaint.findMany({
    where: { OR: [{ raisedById: userId }, ...(orgIds.length ? [{ raisedByOrgId: { in: orgIds } }] : [])] },
    orderBy: { createdAt: 'desc' },
    include: COMPLAINT_INCLUDE,
  })) as unknown as ComplaintRow[]
  return enrich(rows)
}

/** Filing context for the buyer dialog: companies the user has actually
 *  transacted with + their orders (lightweight). */
export interface ComplaintContext {
  orgs: { id: string; name: string }[]
  orders: { id: string; createdAt: string; total: number; sellerOrgIds: string[]; itemSummary: string }[]
  categories: { key: string; label: string }[]
}

export async function getFilingContext(userId: string): Promise<ComplaintContext> {
  const orgIds = await userOrgIds(userId)
  const orders = await db.order.findMany({
    where: { OR: [{ buyerId: userId }, ...(orgIds.length ? [{ organizationId: { in: orgIds } }] : [])] },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      createdAt: true,
      total: true,
      items: { select: { sellerOrgId: true, title: true } },
    },
  })
  const sellerOrgIds = [
    ...new Set(orders.flatMap((o) => o.items.map((i) => i.sellerOrgId).filter((v): v is string => Boolean(v)))),
  ]
  const orgs = sellerOrgIds.length
    ? await db.organization.findMany({
        where: { id: { in: sellerOrgIds } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })
    : []
  return {
    orgs,
    orders: orders.map((o) => ({
      id: o.id,
      createdAt: o.createdAt.toISOString(),
      total: o.total,
      sellerOrgIds: [...new Set(o.items.map((i) => i.sellerOrgId).filter((v): v is string => Boolean(v)))],
      itemSummary: o.items[0]?.title ?? 'Order',
    })),
    categories: COMPLAINT_CATEGORIES.map((key) => ({ key, label: COMPLAINT_CATEGORY_LABELS[key] })),
  }
}

export async function withdrawComplaint(userId: string, complaintId: string): Promise<ComplaintDTO> {
  const row = await db.complaint.findUnique({
    where: { id: complaintId },
    select: { id: true, raisedById: true, status: true, number: true },
  })
  if (!row) throw new ComplaintError('Complaint not found', 404, 'NOT_FOUND')
  if (row.raisedById !== userId) throw new ComplaintError('Only the complainant can withdraw', 403, 'FORBIDDEN')
  if (row.status !== 'OPEN') {
    throw new ComplaintError('Only open complaints can be withdrawn', 409, 'NOT_WITHDRAWABLE')
  }
  const updated = await db.$transaction(async (tx) => {
    const fresh = await tx.complaint.findUnique({ where: { id: complaintId }, select: { status: true } })
    if (!fresh || fresh.status !== 'OPEN') {
      throw new ComplaintError('Only open complaints can be withdrawn', 409, 'NOT_WITHDRAWABLE')
    }
    const r = (await tx.complaint.update({
      where: { id: complaintId },
      data: { status: 'WITHDRAWN' },
      include: COMPLAINT_INCLUDE,
    })) as unknown as ComplaintRow
    await recordAuditTx(tx, {
      actorId: userId,
      actorType: 'USER',
      action: 'COMPLAINT_WITHDRAWN',
      entityType: 'Complaint',
      entityId: complaintId,
      summary: `Complaint ${row.number} withdrawn by the complainant`,
      metadata: {},
    })
    return r
  })
  return (await enrich([updated]))[0]
}

// ── target org: list received + respond ──────────────────────────────────────

export async function listComplaintsAgainstOrg(userId: string, organizationId: string): Promise<ComplaintDTO[]> {
  await assertOrgSellingPermission(userId, organizationId)
  const rows = (await db.complaint.findMany({
    where: { targetOrgId: organizationId },
    orderBy: { createdAt: 'desc' },
    include: COMPLAINT_INCLUDE,
  })) as unknown as ComplaintRow[]
  return enrich(rows)
}

export async function respondToComplaint(
  userId: string,
  organizationId: string,
  complaintId: string,
  message: string
): Promise<ComplaintDTO> {
  const response = (message || '').trim()
  if (response.length < 10 || response.length > ORG_RESPONSE_MAX) {
    throw new ComplaintError(`The response must be 10–${ORG_RESPONSE_MAX} characters`, 400)
  }
  await assertOrgSellingPermission(userId, organizationId)

  const row = await db.complaint.findUnique({
    where: { id: complaintId },
    select: { id: true, targetOrgId: true, status: true, orgResponse: true, number: true, raisedById: true },
  })
  if (!row) throw new ComplaintError('Complaint not found', 404, 'NOT_FOUND')
  if (row.targetOrgId !== organizationId) {
    throw new ComplaintError('This complaint is not against your organization', 403, 'FORBIDDEN')
  }
  if (row.status !== 'OPEN' || row.orgResponse) {
    throw new ComplaintError('This complaint can no longer be answered', 409, 'NOT_ANSWERABLE')
  }

  const updated = await db.$transaction(async (tx) => {
    const fresh = await tx.complaint.findUnique({
      where: { id: complaintId },
      select: { status: true, orgResponse: true },
    })
    if (!fresh || fresh.status !== 'OPEN' || fresh.orgResponse) {
      throw new ComplaintError('This complaint can no longer be answered', 409, 'NOT_ANSWERABLE')
    }
    const r = (await tx.complaint.update({
      where: { id: complaintId },
      data: { orgResponse: response, orgRespondedAt: new Date(), status: 'ORG_RESPONDED' },
      include: COMPLAINT_INCLUDE,
    })) as unknown as ComplaintRow
    await recordAuditTx(tx, {
      actorId: userId,
      actorType: 'USER',
      action: 'COMPLAINT_ORG_RESPONSE',
      entityType: 'Complaint',
      entityId: complaintId,
      summary: `Organization responded to complaint ${row.number}`,
      metadata: { organizationId },
    })
    return r
  })

  await emitNotifications([
    {
      userId: row.raisedById,
      type: 'COMPLAINT_STATUS',
      title: `The company responded to your complaint ${row.number}`,
      body: 'Review their response and follow up if needed.',
      linkView: 'complaints',
      linkId: complaintId,
    },
  ] satisfies EmitInput[])

  return (await enrich([updated]))[0]
}

// ── platform staff: queue + triage ──────────────────────────────────────────

export interface AdminComplaintFilters {
  status?: string
  severity?: string
  targetOrgId?: string
}

export async function listAllComplaints(filters: AdminComplaintFilters = {}): Promise<ComplaintDTO[]> {
  const where: Record<string, unknown> = {}
  if (filters.status && COMPLAINT_STATUSES.includes(filters.status as ComplaintStatus)) where.status = filters.status
  if (filters.severity && COMPLAINT_SEVERITIES.includes(filters.severity as ComplaintSeverity)) {
    where.severity = filters.severity
  }
  if (filters.targetOrgId) where.targetOrgId = filters.targetOrgId
  const rows = (await db.complaint.findMany({
    where,
    orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
    take: 200,
    include: COMPLAINT_INCLUDE,
  })) as unknown as ComplaintRow[]
  return enrich(rows)
}

export function complaintStats(rows: ComplaintDTO[]) {
  return {
    total: rows.length,
    open: rows.filter((r) => r.status === 'OPEN').length,
    orgResponded: rows.filter((r) => r.status === 'ORG_RESPONDED').length,
    resolved: rows.filter((r) => r.status === 'RESOLVED').length,
    dismissed: rows.filter((r) => r.status === 'DISMISSED').length,
    withdrawn: rows.filter((r) => r.status === 'WITHDRAWN').length,
    urgent: rows.filter((r) => r.severity !== 'NORMAL' && ['OPEN', 'ORG_RESPONDED'].includes(r.status)).length,
  }
}

export async function adminResolveComplaint(
  adminId: string,
  complaintId: string,
  outcome: 'RESOLVED' | 'DISMISSED',
  resolutionNote: string,
  severity?: string
): Promise<ComplaintDTO> {
  if (outcome !== 'RESOLVED' && outcome !== 'DISMISSED') {
    throw new ComplaintError('Outcome must be RESOLVED or DISMISSED', 400)
  }
  const note = (resolutionNote || '').trim()
  if (outcome === 'RESOLVED' && (note.length < 10 || note.length > RESOLUTION_NOTE_MAX)) {
    throw new ComplaintError(`A resolution note of 10–${RESOLUTION_NOTE_MAX} characters is required`, 400)
  }
  let nextSeverity: string | undefined
  if (severity !== undefined) {
    if (!COMPLAINT_SEVERITIES.includes(severity as ComplaintSeverity)) {
      throw new ComplaintError('Invalid severity', 400)
    }
    nextSeverity = severity
  }

  const row = await db.complaint.findUnique({
    where: { id: complaintId },
    select: { id: true, status: true, number: true, raisedById: true, severity: true },
  })
  if (!row) throw new ComplaintError('Complaint not found', 404, 'NOT_FOUND')
  if (row.status === 'WITHDRAWN') throw new ComplaintError('Withdrawn complaints are closed', 409, 'NOT_TRIAGEABLE')

  const alreadyClosed = ['RESOLVED', 'DISMISSED'].includes(row.status)
  if (alreadyClosed && !nextSeverity) {
    throw new ComplaintError('This complaint is already closed', 409, 'ALREADY_CLOSED')
  }

  const updated = await db.$transaction(async (tx) => {
    const r = (await tx.complaint.update({
      where: { id: complaintId },
      data: {
        // severity-only edits keep an existing outcome untouched
        status: alreadyClosed && nextSeverity ? row.status : outcome,
        resolutionNote: note || undefined,
        severity: nextSeverity ?? undefined,
        resolvedById: alreadyClosed && nextSeverity ? undefined : adminId,
        resolvedAt: alreadyClosed && nextSeverity ? undefined : new Date(),
      },
      include: COMPLAINT_INCLUDE,
    })) as unknown as ComplaintRow
    await recordAuditTx(tx, {
      actorId: adminId,
      actorType: 'ADMIN',
      action: 'COMPLAINT_RESOLVED',
      entityType: 'Complaint',
      entityId: complaintId,
      summary: `Complaint ${row.number} ${alreadyClosed && nextSeverity ? 're-triaged (severity)' : outcome.toLowerCase()} by platform review`,
      metadata: { outcome, severity: r.severity, note },
    })
    return r
  })

  if (updated.status !== row.status) {
    await emitNotifications([
      {
        userId: row.raisedById,
        type: 'COMPLAINT_STATUS',
        title: `Your complaint ${row.number} has been ${updated.status === 'RESOLVED' ? 'resolved' : 'reviewed and dismissed'}`,
        body: note ? note.slice(0, 200) : 'See the complaint detail for the platform decision.',
        linkView: 'complaints',
        linkId: complaintId,
      },
    ] satisfies EmitInput[])
  }

  return (await enrich([updated]))[0]
}
