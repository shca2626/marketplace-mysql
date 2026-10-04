import { db } from '@/lib/db'
import { recordAudit } from '@/server/modules/audit/service'
import { emitNotifications } from '@/server/modules/notifications/service'

/**
 * SETTLEMENTS — external settlement references (§8 of the Company-to-Company
 * gap analysis).
 *
 * Vendora is a third-party process orchestrator: buyer↔supplier money moves
 * OUTSIDE the platform. This module records THAT settlement as evidence:
 * one ExternalSettlementReference per order, declared by the buyer or the
 * supplier (checkout EXTERNAL method pre-declares it for the buyer), with
 * uploaded proof documents (PaymentEvidence), and a trust flow:
 *
 *   DECLARED ──confirm (counterparty or admin)──▶ CONFIRMED
 *      │
 *      └──dispute (either party)──▶ DISPUTED ──confirm (admin)──▶ CONFIRMED
 *
 * The platform never touches the money — it tracks lifecycle + evidence and
 * keeps the audit trail that disputes, financiers and reporting consume.
 */

export class SettlementServiceError extends Error {
  constructor(message: string, public status = 400) {
    super(message)
  }
}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0]

export const SETTLEMENT_METHODS = ['WIRE', 'TRANSFER', 'CHEQUE', 'CASH', 'OTHER'] as const
export type SettlementMethod = (typeof SETTLEMENT_METHODS)[number]

const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export interface SettlementViewer {
  id: string
  role: string
}

/** The settlement DTO returned by the order sidecar + admin listing. */
export interface SettlementDTO {
  id: string
  orderId: string
  orderRef: string
  orderTotal: number
  orderStatus: string
  buyer: { id: string; name: string } | null
  sellerCount: number
  method: string
  reference: string | null
  status: string
  declaredBy: { id: string; name: string } | null
  declaredAt: string
  settledAt: string | null
  confirmedBy: { id: string; name: string } | null
  confirmedAt: string | null
  note: string | null
  evidence: {
    id: string
    name: string
    mime: string
    size: number
    url: string
    uploadedById: string
    createdAt: string
  }[]
  createdAt: string
  updatedAt: string
}

type SettlementRow = {
  id: string
  orderId: string
  method: string
  reference: string | null
  status: string
  declaredById: string
  declaredAt: Date
  settledAt: Date | null
  confirmedById: string | null
  confirmedAt: Date | null
  note: string | null
  createdAt: Date
  updatedAt: Date
  declaredBy: { id: string; name: string } | null
  confirmedBy: { id: string; name: string } | null
  evidence: {
    id: string
    name: string
    mime: string
    size: number
    mediaKey: string
    uploadedById: string
    createdAt: Date
  }[]
  order: {
    total: number
    status: string
    poNumber: string | null
    buyer: { id: string; name: string } | null
    items: { sellerId: string }[]
  }
}

function serializeSettlement(s: SettlementRow): SettlementDTO {
  return {
    id: s.id,
    orderId: s.orderId,
    orderRef: s.order.poNumber || s.orderId.slice(-8).toUpperCase(),
    orderTotal: s.order.total,
    orderStatus: s.order.status,
    buyer: s.order.buyer,
    sellerCount: new Set(s.order.items.map((i) => i.sellerId)).size,
    method: s.method,
    reference: s.reference,
    status: s.status,
    declaredBy: s.declaredBy,
    declaredAt: s.declaredAt.toISOString(),
    settledAt: s.settledAt?.toISOString() ?? null,
    confirmedBy: s.confirmedBy,
    confirmedAt: s.confirmedAt?.toISOString() ?? null,
    note: s.note,
    evidence: s.evidence.map((e) => ({
      id: e.id,
      name: e.name,
      mime: e.mime,
      size: e.size,
      url: `/api/media/${e.mediaKey}`,
      uploadedById: e.uploadedById,
      createdAt: e.createdAt.toISOString(),
    })),
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }
}

const settlementInclude = {
  declaredBy: { select: { id: true, name: true } },
  confirmedBy: { select: { id: true, name: true } },
  evidence: { orderBy: { createdAt: 'asc' as const } },
  order: {
    select: {
      total: true,
      status: true,
      poNumber: true,
      buyer: { select: { id: true, name: true } },
      items: { select: { sellerId: true } },
    },
  },
} as const

/** Participant check: buyer, a seller of the order's items, or an admin. */
async function settlementAccess(orderId: string, v: SettlementViewer) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { items: { select: { sellerId: true } }, payment: { select: { status: true } } },
  })
  if (!order) throw new SettlementServiceError('Order not found', 404)
  const isBuyer = order.buyerId === v.id
  const isSeller = order.items.some((i) => i.sellerId === v.id)
  const isAdmin = v.role === 'ADMIN'
  if (!isBuyer && !isSeller && !isAdmin) throw new SettlementServiceError('Access denied', 403)
  return { order, isBuyer, isSeller, isAdmin, sellerIds: [...new Set(order.items.map((i) => i.sellerId))] }
}

// ── Checkout integration ────────────────────────────────────────────────────

/**
 * Called inside the checkout transaction for the EXTERNAL method: the buyer
 * pre-declares that this order settles externally. The reference/evidence
 * come later via declare/update; the seller confirms when the money moved.
 */
export async function ensureSettlementForCheckout(
  tx: Tx,
  input: { orderId: string; buyerId: string; method: string }
) {
  const existing = await tx.externalSettlementReference.findUnique({ where: { orderId: input.orderId } })
  if (existing) return existing
  return tx.externalSettlementReference.create({
    data: {
      orderId: input.orderId,
      method: input.method,
      status: 'DECLARED',
      declaredById: input.buyerId,
    },
  })
}

// ── Order sidecar: read / declare / update ─────────────────────────────────

export interface SettlementViewerCtx {
  userId: string
  role: string
}

export async function getSettlementForOrder(orderId: string, v: SettlementViewerCtx): Promise<SettlementDTO> {
  await settlementAccess(orderId, { id: v.userId, role: v.role })
  const row = await db.externalSettlementReference.findUnique({
    where: { orderId },
    include: settlementInclude,
  })
  if (!row) throw new SettlementServiceError('No external settlement recorded for this order', 404)
  return serializeSettlement(row as unknown as SettlementRow)
}

/** Whether an order has an external settlement row (cheap check). */
export async function orderHasSettlement(orderId: string): Promise<boolean> {
  const row = await db.externalSettlementReference.findUnique({ where: { orderId }, select: { id: true } })
  return !!row
}

export interface DeclareSettlementInput {
  method: string
  reference?: string | null
  settledAt?: string | null // ISO date — when the parties say money moved
  note?: string | null
  evidenceKeys?: string[]
}

async function validateEvidenceKeys(keys: string[]): Promise<{ mediaKey: string; name: string; mime: string; size: number }[]> {
  const assets = await db.mediaAsset.findMany({ where: { key: { in: keys } } })
  const byKey = new Map(assets.map((a) => [a.key, a]))
  return keys
    .map((k) => {
      const a = byKey.get(k)
      return a ? { mediaKey: a.key, name: a.originalName, mime: a.mime, size: a.size } : null
    })
    .filter((x): x is { mediaKey: string; name: string; mime: string; size: number } => !!x)
}

/** Declare (create) the external settlement record for an order. */
export async function declareSettlement(userId: string, role: string, orderId: string, input: DeclareSettlementInput) {
  const { order, sellerIds } = await settlementAccess(orderId, { id: userId, role })

  if (!SETTLEMENT_METHODS.includes(input.method as SettlementMethod))
    throw new SettlementServiceError('Unsupported settlement method', 400)

  // A platform-managed payment that already succeeded means money went
  // through the platform — an external reference makes no sense then.
  if (order.payment?.status === 'SUCCEEDED')
    throw new SettlementServiceError('This order was already settled through the platform', 409)

  const existing = await db.externalSettlementReference.findUnique({ where: { orderId } })
  if (existing)
    throw new SettlementServiceError(
      existing.status === 'CONFIRMED'
        ? 'The settlement for this order is already confirmed'
        : 'A settlement declaration already exists for this order — update it instead',
      409
    )

  const evidence = input.evidenceKeys?.length ? await validateEvidenceKeys(input.evidenceKeys.slice(0, 10)) : []

  const row = await db.externalSettlementReference.create({
    data: {
      orderId,
      method: input.method,
      reference: input.reference?.trim().slice(0, 160) || null,
      settledAt: input.settledAt ? new Date(input.settledAt) : null,
      note: input.note?.trim().slice(0, 500) || null,
      status: 'DECLARED',
      declaredById: userId,
      evidence: evidence.length
        ? { create: evidence.map((e) => ({ ...e, uploadedById: userId })) }
        : undefined,
    },
    include: settlementInclude,
  })

  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'SETTLEMENT_DECLARED',
    entityType: 'ExternalSettlementReference',
    entityId: row.id,
    summary: `External settlement declared for order ${order.poNumber || orderId.slice(-8).toUpperCase()} (${input.method}${input.reference ? ` · ref ${input.reference}` : ''})`,
    metadata: { orderId, method: input.method, evidenceCount: evidence.length },
  })

  await notifySettlementCounterparts({
    order,
    actorId: userId,
    sellerIds,
    title: 'External settlement declared',
    body: `Settlement (${input.method}) was declared for order ${order.poNumber || orderId.slice(-8).toUpperCase()}${input.reference ? ` — reference ${input.reference}` : ''}. The counterpart can now confirm it.`,
  })

  return serializeSettlement(row as unknown as SettlementRow)
}

/** Update the declaration details (declarer or admin, while DECLARED). */
export async function updateSettlementDeclaration(
  userId: string,
  role: string,
  orderId: string,
  input: Partial<DeclareSettlementInput>
) {
  await settlementAccess(orderId, { id: userId, role })
  const row = await db.externalSettlementReference.findUnique({ where: { orderId } })
  if (!row) throw new SettlementServiceError('No settlement declared for this order', 404)
  if (row.status !== 'DECLARED')
    throw new SettlementServiceError(`Settlement is ${row.status.toLowerCase()} — the declaration can no longer be edited`, 409)
  if (row.declaredById !== userId && role !== 'ADMIN')
    throw new SettlementServiceError('Only the declarer or an admin can edit the declaration', 403)

  const updated = await db.externalSettlementReference.update({
    where: { orderId },
    data: {
      ...(input.method && SETTLEMENT_METHODS.includes(input.method as SettlementMethod)
        ? { method: input.method }
        : {}),
      ...(input.reference !== undefined ? { reference: input.reference?.trim().slice(0, 160) || null } : {}),
      ...(input.settledAt !== undefined ? { settledAt: input.settledAt ? new Date(input.settledAt) : null } : {}),
      ...(input.note !== undefined ? { note: input.note?.trim().slice(0, 500) || null } : {}),
    },
    include: settlementInclude,
  })
  return serializeSettlement(updated as unknown as SettlementRow)
}

// ── Confirm / dispute / evidence ────────────────────────────────────────────

export async function confirmSettlement(userId: string, role: string, orderId: string, note?: string) {
  const { order, isBuyer, isSeller, isAdmin, sellerIds } = await settlementAccess(orderId, { id: userId, role })
  const row = await db.externalSettlementReference.findUnique({ where: { orderId } })
  if (!row) throw new SettlementServiceError('No settlement declared for this order', 404)

  if (!isAdmin) {
    // The counterpart confirms — the declarer cannot self-confirm.
    if (row.declaredById === userId)
      throw new SettlementServiceError('You declared this settlement — the other party (or an admin) confirms it', 403)
    if (!isBuyer && !isSeller)
      throw new SettlementServiceError('Access denied', 403)
  }

  if (row.status === 'CONFIRMED') throw new SettlementServiceError('Settlement is already confirmed', 409)
  if (row.status === 'DISPUTED' && !isAdmin)
    throw new SettlementServiceError('This settlement is disputed — only an admin can confirm it', 403)

  const updated = await db.externalSettlementReference.update({
    where: { orderId },
    data: {
      status: 'CONFIRMED',
      confirmedById: userId,
      confirmedAt: new Date(),
      settledAt: row.settledAt ?? new Date(),
      note: note?.trim().slice(0, 500) || row.note,
    },
    include: settlementInclude,
  })

  await recordAudit({
    actorId: userId,
    actorType: isAdmin ? 'ADMIN' : 'USER',
    action: 'SETTLEMENT_CONFIRMED',
    entityType: 'ExternalSettlementReference',
    entityId: row.id,
    summary: `External settlement confirmed for order ${order.poNumber || orderId.slice(-8).toUpperCase()}`,
    metadata: { orderId, method: row.method },
  })

  await notifySettlementCounterparts({
    order,
    actorId: userId,
    sellerIds,
    title: 'External settlement confirmed',
    body: `The settlement for order ${order.poNumber || orderId.slice(-8).toUpperCase()} is confirmed — the transaction is fully evidenced.`,
  })

  return serializeSettlement(updated as unknown as SettlementRow)
}

export async function disputeSettlement(userId: string, role: string, orderId: string, note: string) {
  const { order, sellerIds } = await settlementAccess(orderId, { id: userId, role })
  if (!note?.trim()) throw new SettlementServiceError('Describe the problem with the settlement', 400)
  const row = await db.externalSettlementReference.findUnique({ where: { orderId } })
  if (!row) throw new SettlementServiceError('No settlement declared for this order', 404)
  if (row.status === 'CONFIRMED') throw new SettlementServiceError('Confirmed settlements cannot be disputed — raise a dispute instead', 409)

  const updated = await db.externalSettlementReference.update({
    where: { orderId },
    data: { status: 'DISPUTED', note: note.trim().slice(0, 500) },
    include: settlementInclude,
  })

  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'SETTLEMENT_DISPUTED',
    entityType: 'ExternalSettlementReference',
    entityId: row.id,
    summary: `External settlement disputed for order ${order.poNumber || orderId.slice(-8).toUpperCase()} — ${note.trim().slice(0, 200)}`,
    metadata: { orderId },
  })

  await notifySettlementCounterparts({
    order,
    actorId: userId,
    sellerIds,
    title: 'External settlement disputed',
    body: note.trim(),
  })

  return serializeSettlement(updated as unknown as SettlementRow)
}

export async function addSettlementEvidence(userId: string, role: string, orderId: string, mediaKeys: string[]) {
  const { order, sellerIds } = await settlementAccess(orderId, { id: userId, role })
  const row = await db.externalSettlementReference.findUnique({ where: { orderId } })
  if (!row) throw new SettlementServiceError('No settlement declared for this order', 404)
  if (!mediaKeys?.length) throw new SettlementServiceError('No documents provided', 400)

  const evidence = await validateEvidenceKeys(mediaKeys.slice(0, 10))
  if (evidence.length === 0) throw new SettlementServiceError('None of the uploaded documents were found', 400)

  await db.paymentEvidence.createMany({
    data: evidence.map((e) => ({ settlementId: row.id, ...e, uploadedById: userId })),
  })

  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'SETTLEMENT_EVIDENCE_ADDED',
    entityType: 'ExternalSettlementReference',
    entityId: row.id,
    summary: `${evidence.length} settlement evidence document(s) added to order ${order.poNumber || orderId.slice(-8).toUpperCase()}`,
    metadata: { orderId, evidence: evidence.map((e) => e.name) },
  })

  await notifySettlementCounterparts({
    order,
    actorId: userId,
    sellerIds,
    title: 'Settlement evidence added',
    body: `${evidence.length} document(s) were attached to the settlement of order ${order.poNumber || orderId.slice(-8).toUpperCase()}.`,
  })

  return getSettlementForOrder(orderId, { userId, role })
}

// ── Admin listing ──────────────────────────────────────────────────────────

export async function adminListSettlements(filters: { status?: string; q?: string; page?: number; limit?: number }) {
  const page = Math.max(1, filters.page ?? 1)
  const limit = Math.min(50, Math.max(1, filters.limit ?? 20))

  const where: Record<string, unknown> = {}
  if (filters.status) where.status = filters.status
  const q = filters.q?.trim()
  if (q) {
    where.OR = [
      { reference: { contains: q } },
      { order: { poNumber: { contains: q } } },
      { order: { buyer: { name: { contains: q } } } },
    ]
  }

  const [total, rows, sums] = await Promise.all([
    db.externalSettlementReference.count({ where }),
    db.externalSettlementReference.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: settlementInclude,
    }),
    db.externalSettlementReference.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
  ])

  return {
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    totalsByStatus: Object.fromEntries(sums.map((s) => [s.status, s._count._all])),
    settlements: rows.map((r) => serializeSettlement(r as unknown as SettlementRow)),
  }
}

// ── helpers ────────────────────────────────────────────────────────────────

async function notifySettlementCounterparts(input: {
  order: { id: string; buyerId: string; total: number; poNumber: string | null }
  actorId: string
  sellerIds: string[]
  title: string
  body: string
}) {
  const recipients = new Set<string>([input.order.buyerId, ...input.sellerIds])
  recipients.delete(input.actorId)
  await emitNotifications(
    [...recipients].map((userId) => ({
      userId,
      type: 'SETTLEMENT_STATUS' as const,
      title: input.title.slice(0, 160),
      body: input.body.slice(0, 400),
      linkView: 'orders' as const,
      linkId: input.order.id,
    }))
  )
}

export { usd as settlementUsd }
