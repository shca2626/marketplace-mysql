import { db } from '@/lib/db'
import { recordAudit, recordAuditTx } from '@/server/modules/audit/service'
import { emitNotification } from '@/server/modules/notifications/service'
import { nextNumber } from '@/server/modules/sequences/service'
import { getPayoutsConfig } from '@/server/modules/payouts/service'

/**
 * COMMISSION — the intermediary monetization core (§8 of the Company-to-
 * Company gap analysis).
 *
 * Vendora is a third-party process orchestrator, NOT a merchant of record:
 * buyer↔supplier money settles outside the platform. What the platform earns
 * is commission, and an obligation comes into existence when a transaction
 * reaches the owner-defined SUCCESSFUL STAGE — implemented here as the order
 * reaching DELIVERED (fulfillment complete). The legacy Payout flow
 * (platform-managed settlement) remains untouched and keeps its own math;
 * both flows share the same rate resolution (vendor override → platform
 * default) so numbers never disagree.
 *
 * Lifecycle:  obligation PENDING ── statement grouping (OPEN) ── invoice issue
 *            (INVOICED) ── partial/full collection (PARTIALLY_COLLECTED /
 *            COLLECTED) or WAIVED / WRITE_OFF. Statements SETTLE when every
 *            obligation is final; invoices flip PAID when fully collected.
 */

export class CommissionServiceError extends Error {
  constructor(message: string, public status = 400) {
    super(message)
  }
}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0]

const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// ── Obligation creation (idempotent trigger) ────────────────────────────────

export const COMMISSION_TRIGGER_STAGE = 'DELIVERED' as const

/**
 * Create one CommissionObligation per (order, seller) — idempotent: existing
 * pairs are skipped, so repeated DELIVERED transitions and backfills never
 * double-count. Called inside the order-status transaction.
 */
export async function recordCommissionForDeliveredOrder(
  tx: Tx,
  order: { id: string; buyerId: string; items: { sellerId: string; price: number; quantity: number }[] }
): Promise<{ created: number }> {
  const cfg = await getPayoutsConfig()

  // Per-seller base = Σ price×qty of that seller's items (mirrors payout math)
  const baseBySeller = new Map<string, number>()
  for (const item of order.items) {
    baseBySeller.set(item.sellerId, (baseBySeller.get(item.sellerId) ?? 0) + item.price * item.quantity)
  }

  // Already-recorded pairs are skipped (idempotency)
  const existing = await tx.commissionObligation.findMany({
    where: { orderId: order.id },
    select: { sellerId: true },
  })
  const done = new Set(existing.map((o) => o.sellerId))

  let created = 0
  for (const [sellerId, baseF] of baseBySeller) {
    if (done.has(sellerId)) continue
    const seller = await tx.user.findUnique({
      where: { id: sellerId },
      select: { commissionRate: true },
    })
    const rate = seller?.commissionRate ?? cfg.defaultCommissionPercent
    const base = Math.round(baseF * 100) / 100
    const amount = Math.round(base * (rate / 100) * 100) / 100
    await tx.commissionObligation.create({
      data: {
        orderId: order.id,
        sellerId,
        baseAmount: base,
        commissionRate: rate,
        amount,
        status: 'PENDING',
        triggerStage: COMMISSION_TRIGGER_STAGE,
      },
    })
    created++
  }
  return { created }
}

/**
 * Backfill — scan DELIVERED (non-cancelled) orders that have no obligations
 * yet and create them. Covers orders delivered before this module existed.
 * Idempotent by construction (recordCommissionForDeliveredOrder skips pairs).
 */
export async function backfillCommissionObligations(adminId: string): Promise<{ ordersScanned: number; created: number }> {
  const delivered = await db.order.findMany({
    where: { status: 'DELIVERED' },
    include: { items: { select: { sellerId: true, price: true, quantity: true } } },
    orderBy: { createdAt: 'asc' },
    take: 500,
  })

  let created = 0
  for (const order of delivered) {
    const res = await db.$transaction(async (tx) => recordCommissionForDeliveredOrder(tx, order))
    created += res.created
    if (res.created > 0) await notifyObligationSellers(order.id)
  }

  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'COMMISSION_BACKFILL',
    entityType: 'CommissionObligation',
    summary: `Commission backfill scanned ${delivered.length} delivered orders — created ${created} obligations`,
    metadata: { ordersScanned: delivered.length, created },
  })

  return { ordersScanned: delivered.length, created }
}

async function notifyObligationSellers(orderId: string) {
  const obligations = await db.commissionObligation.findMany({
    where: { orderId },
    select: { sellerId: true, amount: true },
  })
  await Promise.all(
    obligations.map((o) =>
      emitNotification({
        userId: o.sellerId,
        type: 'COMMISSION_STATUS',
        title: `Commission obligation recorded (${COMMISSION_TRIGGER_STAGE.toLowerCase()})`,
        body: `Order delivered — platform commission of ${usd(Number(o.amount))} is now due for this order.`,
        linkView: 'seller',
        linkId: orderId,
      })
    )
  )
}

// ── Listing ─────────────────────────────────────────────────────────────────

export interface CommissionObligationDTO {
  id: string
  orderId: string
  orderRef: string
  poNumber: string | null
  buyer: { id: string; name: string } | null
  sellerId: string
  baseAmount: number
  commissionRate: number
  amount: number
  collectedAmount: number
  status: string
  statementId: string | null
  triggerStage: string
  createdAt: string
}

function serializeObligation(
  o: {
    id: string
    orderId: string
    sellerId: string
    baseAmount: { toNumber(): number }
    commissionRate: number
    amount: { toNumber(): number }
    collectedAmount: { toNumber(): number }
    status: string
    statementId: string | null
    triggerStage: string
    createdAt: Date
    order: { poNumber: string | null; buyer: { id: string; name: string } | null } | null
  }
): CommissionObligationDTO {
  return {
    id: o.id,
    orderId: o.orderId,
    orderRef: o.order?.poNumber || o.orderId.slice(-8).toUpperCase(),
    poNumber: o.order?.poNumber ?? null,
    buyer: o.order?.buyer ?? null,
    sellerId: o.sellerId,
    baseAmount: o.baseAmount.toNumber(),
    commissionRate: o.commissionRate,
    amount: o.amount.toNumber(),
    collectedAmount: o.collectedAmount.toNumber(),
    status: o.status,
    statementId: o.statementId,
    triggerStage: o.triggerStage,
    createdAt: o.createdAt.toISOString(),
  }
}

export async function adminListObligations(filters: {
  status?: string
  sellerId?: string
  q?: string
  page?: number
  limit?: number
}) {
  const page = Math.max(1, filters.page ?? 1)
  const limit = Math.min(50, Math.max(1, filters.limit ?? 20))

  const where: Record<string, unknown> = {}
  if (filters.status) where.status = filters.status
  if (filters.sellerId) where.sellerId = filters.sellerId
  const q = filters.q?.trim()
  if (q) {
    where.OR = [{ order: { poNumber: { contains: q } } }, { order: { buyer: { name: { contains: q } } } }]
  }

  const [total, rows, sums] = await Promise.all([
    db.commissionObligation.count({ where }),
    db.commissionObligation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { order: { select: { poNumber: true, buyer: { select: { id: true, name: true } } } } },
    }),
    db.commissionObligation.groupBy({
      by: ['status'],
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ])

  return {
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    totalsByStatus: Object.fromEntries(
      sums.map((s) => [s.status, { count: s._count._all, amount: Number(s._sum.amount ?? 0) }])
    ),
    obligations: rows.map(serializeObligation),
  }
}

/** Sellers with ungrouped PENDING obligations — statement candidates. */
export async function adminStatementCandidates() {
  const grouped = await db.commissionObligation.groupBy({
    by: ['sellerId'],
    where: { status: 'PENDING', statementId: null },
    _sum: { amount: true, baseAmount: true },
    _count: { _all: true },
  })
  if (grouped.length === 0) return []
  const sellers = await db.user.findMany({
    where: { id: { in: grouped.map((g) => g.sellerId) } },
    select: { id: true, name: true, storeName: true, email: true },
  })
  const byId = new Map(sellers.map((s) => [s.id, s]))
  return grouped
    .filter((g) => byId.has(g.sellerId))
    .map((g) => {
      const s = byId.get(g.sellerId)!
      return {
        seller: { id: s.id, name: s.name, storeName: s.storeName, email: s.email },
        obligationCount: g._count._all,
        baseAmount: Math.round(Number(g._sum.baseAmount ?? 0) * 100) / 100,
        amount: Math.round(Number(g._sum.amount ?? 0) * 100) / 100,
      }
    })
}

// ── Statements ──────────────────────────────────────────────────────────────

export async function generateCommissionStatement(adminId: string, sellerId: string) {
  const seller = await db.user.findUnique({
    where: { id: sellerId },
    select: { id: true, name: true, storeName: true, role: true },
  })
  if (!seller || seller.role !== 'SELLER') throw new CommissionServiceError('Vendor not found', 404)

  const statement = await db.$transaction(async (tx) => {
    const obligations = await tx.commissionObligation.findMany({
      where: { sellerId, status: 'PENDING', statementId: null },
      orderBy: { createdAt: 'asc' },
    })
    if (obligations.length === 0)
      throw new CommissionServiceError('Nothing to statement — no pending, ungrouped obligations', 409)

    const number = await nextNumber('CS')
    const created = await tx.commissionStatement.create({
      data: {
        number,
        sellerId,
        periodStart: obligations[0].createdAt,
        periodEnd: new Date(),
        obligationCount: obligations.length,
        baseAmount: obligations.reduce((s, o) => s + Number(o.baseAmount), 0),
        amount: obligations.reduce((s, o) => s + Number(o.amount), 0),
        status: 'OPEN',
      },
    })
    await tx.commissionObligation.updateMany({
      where: { id: { in: obligations.map((o) => o.id) } },
      data: { statementId: created.id },
    })
    return created
  })

  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'COMMISSION_STATEMENT_CREATED',
    entityType: 'CommissionStatement',
    entityId: statement.id,
    summary: `Commission statement ${statement.number} prepared for ${seller.storeName ?? seller.name}: ${usd(Number(statement.amount))} across ${statement.obligationCount} obligations`,
    metadata: { sellerId, obligationCount: statement.obligationCount },
  })

  await emitNotification({
    userId: sellerId,
    type: 'COMMISSION_STATUS',
    title: `Commission statement ${statement.number} prepared`,
    body: `${statement.obligationCount} delivered orders · commission base ${usd(Number(statement.baseAmount))} — platform commission ${usd(Number(statement.amount))}.`,
    linkView: 'seller',
  })

  return statement
}

export async function cancelCommissionStatement(adminId: string, statementId: string, reason?: string) {
  const statement = await db.commissionStatement.findUnique({ where: { id: statementId } })
  if (!statement) throw new CommissionServiceError('Statement not found', 404)
  if (statement.status !== 'OPEN')
    throw new CommissionServiceError(`Statement is already ${statement.status.toLowerCase()}`, 409)

  const updated = await db.$transaction(async (tx) => {
    // release obligations back to ungrouped PENDING
    await tx.commissionObligation.updateMany({
      where: { statementId, status: { in: ['PENDING', 'INVOICED'] } },
      data: { statementId: null, status: 'PENDING' },
    })
    return tx.commissionStatement.update({
      where: { id: statementId },
      data: { status: 'CANCELLED' },
    })
  })

  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'COMMISSION_STATEMENT_CANCELLED',
    entityType: 'CommissionStatement',
    entityId: statementId,
    summary: `Commission statement ${statement.number} cancelled — ${reason ?? 'no reason given'}`,
  })
  return updated
}

// ── Invoices ────────────────────────────────────────────────────────────────

export async function issueCommissionInvoice(adminId: string, statementId: string, dueInDays = 30) {
  const statement = await db.commissionStatement.findUnique({
    where: { id: statementId },
    include: { seller: { select: { id: true, name: true, storeName: true } } },
  })
  if (!statement) throw new CommissionServiceError('Statement not found', 404)
  if (statement.status !== 'OPEN')
    throw new CommissionServiceError(`Statement is ${statement.status.toLowerCase()} — only open statements can be invoiced`, 409)

  const invoice = await db.$transaction(async (tx) => {
    const number = await nextNumber('CIV')
    const created = await tx.commissionInvoice.create({
      data: {
        number,
        statementId,
        sellerId: statement.sellerId,
        amount: statement.amount,
        status: 'ISSUED',
        dueAt: new Date(Date.now() + Math.min(365, Math.max(0, dueInDays)) * 86_400_000),
      },
    })
    await tx.commissionStatement.update({
      where: { id: statementId },
      data: { status: 'ISSUED', issuedAt: new Date() },
    })
    await tx.commissionObligation.updateMany({
      where: { statementId, status: 'PENDING' },
      data: { status: 'INVOICED' },
    })
    await recordAuditTx(tx, {
      actorId: adminId,
      actorType: 'ADMIN',
      action: 'COMMISSION_INVOICE_ISSUED',
      entityType: 'CommissionInvoice',
      entityId: invoice.id,
      summary: `Commission invoice ${invoice.number} issued to ${statement.seller.storeName ?? statement.seller.name}: ${usd(Number(invoice.amount))} (statement ${statement.number})`,
      metadata: { statementId, dueAt: invoice.dueAt?.toISOString() ?? null },
    })
    return created
  })


  await emitNotification({
    userId: statement.sellerId,
    type: 'COMMISSION_STATUS',
    title: `Commission invoice ${invoice.number} issued`,
    body: `Platform commission ${usd(Number(invoice.amount))} is due${invoice.dueAt ? ` by ${invoice.dueAt.toDateString()}` : ''}. Download it from your dashboard.`,
    linkView: 'seller',
    linkId: invoice.id,
  })

  return invoice
}

export async function voidCommissionInvoice(adminId: string, invoiceId: string, reason?: string) {
  const invoice = await db.commissionInvoice.findUnique({ where: { id: invoiceId } })
  if (!invoice) throw new CommissionServiceError('Invoice not found', 404)
  if (invoice.status === 'PAID') throw new CommissionServiceError('Paid invoices cannot be voided', 409)

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.commissionInvoice.update({
      where: { id: invoiceId },
      data: { status: 'VOID', note: reason?.slice(0, 500) ?? invoice.note },
    })
    await recordAuditTx(tx, {
      actorId: adminId,
      actorType: 'ADMIN',
      action: 'COMMISSION_INVOICE_VOIDED',
      entityType: 'CommissionInvoice',
      entityId: invoiceId,
      summary: `Commission invoice ${invoice.number} voided — ${reason ?? 'no reason given'}`,
    })
    return row
  })
  return updated
}

// ── Collection ───────────────────────────────────────────────────────────────

async function settleStatementIfFinal(tx: Tx, statementId: string) {
  const remaining = await tx.commissionObligation.count({
    where: { statementId, status: { in: ['PENDING', 'INVOICED', 'PARTIALLY_COLLECTED'] } },
  })
  if (remaining > 0) return
  await tx.commissionStatement.update({
    where: { id: statementId },
    data: { status: 'SETTLED' },
  })
  // Fully-collected statement → its invoices are paid
  const notCollected = await tx.commissionObligation.count({
    where: { statementId, status: { in: ['WAIVED', 'WRITE_OFF'] } },
  })
  if (notCollected === 0) {
    await tx.commissionInvoice.updateMany({
      where: { statementId, status: 'ISSUED' },
      data: { status: 'PAID', paidAt: new Date() },
    })
  }
}

export async function recordCommissionCollection(adminId: string, obligationId: string, amount: number, note?: string) {
  if (!Number.isFinite(amount) || amount <= 0)
    throw new CommissionServiceError('Collected amount must be positive', 400)

  const obligation = await db.commissionObligation.findUnique({ where: { id: obligationId } })
  if (!obligation) throw new CommissionServiceError('Obligation not found', 404)
  if (['COLLECTED', 'WAIVED', 'WRITE_OFF'].includes(obligation.status))
    throw new CommissionServiceError(`Obligation is already ${obligation.status.toLowerCase()}`, 409)

  const due = Number(obligation.amount)
  const newCollected = Math.min(Number(obligation.collectedAmount) + amount, due)
  const status = newCollected >= due - 0.001 ? 'COLLECTED' : 'PARTIALLY_COLLECTED'

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.commissionObligation.update({
      where: { id: obligationId },
      data: {
        collectedAmount: newCollected,
        status,
        note: note?.slice(0, 500) ?? obligation.note,
      },
    })
    if (row.statementId) await settleStatementIfFinal(tx, row.statementId)
    return row
  })

  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'COMMISSION_COLLECTED',
    entityType: 'CommissionObligation',
    entityId: obligationId,
    summary: `Commission collection of ${usd(amount)} recorded (${usd(newCollected)} of ${usd(due)}) — obligation ${updated.status.toLowerCase()}`,
    metadata: { orderId: obligation.orderId, sellerId: obligation.sellerId },
  })

  await emitNotification({
    userId: obligation.sellerId,
    type: 'COMMISSION_STATUS',
    title: `Commission payment recorded — ${usd(newCollected)} of ${usd(due)}`,
    body: status === 'COLLECTED' ? 'This commission obligation is fully settled. Thank you!' : 'Partial commission payment recorded — the remainder is still open.',
    linkView: 'seller',
    linkId: obligation.orderId,
  })

  return updated
}

export async function adjustCommissionObligation(
  adminId: string,
  obligationId: string,
  action: 'WAIVE' | 'WRITE_OFF',
  reason?: string
) {
  const obligation = await db.commissionObligation.findUnique({ where: { id: obligationId } })
  if (!obligation) throw new CommissionServiceError('Obligation not found', 404)
  if (obligation.status === 'COLLECTED')
    throw new CommissionServiceError('Collected obligations cannot be adjusted', 409)

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.commissionObligation.update({
      where: { id: obligationId },
      data: { status: action === 'WAIVE' ? 'WAIVED' : 'WRITE_OFF', note: reason?.slice(0, 500) ?? obligation.note },
    })
    if (row.statementId) await settleStatementIfFinal(tx, row.statementId)
    return row
  })

  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: action === 'WAIVE' ? 'COMMISSION_WAIVED' : 'COMMISSION_WRITE_OFF',
    entityType: 'CommissionObligation',
    entityId: obligationId,
    summary: `Commission obligation ${action === 'WAIVE' ? 'waived' : 'written off'} (${usd(Number(obligation.amount))}) — ${reason ?? 'no reason given'}`,
    metadata: { orderId: obligation.orderId, sellerId: obligation.sellerId },
  })

  await emitNotification({
    userId: obligation.sellerId,
    type: 'COMMISSION_STATUS',
    title: `Commission obligation ${action === 'WAIVE' ? 'waived' : 'written off'}`,
    body: reason ?? `The platform ${action === 'WAIVE' ? 'waived' : 'wrote off'} the commission of ${usd(Number(obligation.amount))} for one of your orders.`,
    linkView: 'seller',
    linkId: obligation.orderId,
  })

  return updated
}

// ── Listing: statements ────────────────────────────────────────────────────

export async function adminListStatements(filters: { status?: string; q?: string; page?: number; limit?: number }) {
  const page = Math.max(1, filters.page ?? 1)
  const limit = Math.min(50, Math.max(1, filters.limit ?? 20))

  const where: Record<string, unknown> = {}
  if (filters.status) where.status = filters.status
  const q = filters.q?.trim()
  if (q) {
    where.OR = [{ number: { contains: q } }, { seller: { name: { contains: q } } }, { seller: { storeName: { contains: q } } }]
  }

  const [total, rows] = await Promise.all([
    db.commissionStatement.count({ where }),
    db.commissionStatement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        seller: { select: { id: true, name: true, storeName: true, email: true } },
        invoices: { orderBy: { createdAt: 'desc' } },
      },
    }),
  ])

  return {
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    statements: rows.map((s) => ({
      id: s.id,
      number: s.number,
      seller: s.seller,
      periodStart: s.periodStart.toISOString(),
      periodEnd: s.periodEnd.toISOString(),
      obligationCount: s.obligationCount,
      baseAmount: Number(s.baseAmount),
      amount: Number(s.amount),
      status: s.status,
      issuedAt: s.issuedAt?.toISOString() ?? null,
      invoices: s.invoices.map((i) => ({
        id: i.id,
        number: i.number,
        amount: Number(i.amount),
        status: i.status,
        dueAt: i.dueAt?.toISOString() ?? null,
        createdAt: i.createdAt.toISOString(),
      })),
      createdAt: s.createdAt.toISOString(),
    })),
  }
}

// ── Seller-facing transparency view ────────────────────────────────────────

export async function sellerCommissionView(sellerId: string) {
  const [obligations, statements, agg] = await Promise.all([
    db.commissionObligation.findMany({
      where: { sellerId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { order: { select: { poNumber: true, buyer: { select: { id: true, name: true } } } } },
    }),
    db.commissionStatement.findMany({
      where: { sellerId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { invoices: { orderBy: { createdAt: 'desc' } } },
    }),
    db.commissionObligation.groupBy({
      by: ['status'],
      where: { sellerId },
      _sum: { amount: true, collectedAmount: true },
      _count: { _all: true },
    }),
  ])

  const totalsByStatus = Object.fromEntries(
    agg.map((a) => [
      a.status,
      { count: a._count._all, amount: Number(a._sum.amount ?? 0), collected: Number(a._sum.collectedAmount ?? 0) },
    ])
  )

  return {
    triggerStage: COMMISSION_TRIGGER_STAGE,
    totalsByStatus,
    obligations: obligations.map(serializeObligation),
    statements: statements.map((s) => ({
      id: s.id,
      number: s.number,
      periodStart: s.periodStart.toISOString(),
      periodEnd: s.periodEnd.toISOString(),
      obligationCount: s.obligationCount,
      baseAmount: Number(s.baseAmount),
      amount: Number(s.amount),
      status: s.status,
      invoices: s.invoices.map((i) => ({
        id: i.id,
        number: i.number,
        amount: Number(i.amount),
        status: i.status,
        dueAt: i.dueAt?.toISOString() ?? null,
      })),
      createdAt: s.createdAt.toISOString(),
    })),
  }
}

/** Invoice payload for the PDF route (admin view + seller download). */
export async function getCommissionInvoiceForPdf(invoiceId: string) {
  const invoice = await db.commissionInvoice.findUnique({
    where: { id: invoiceId },
    include: {
      statement: {
        include: {
          seller: { select: { id: true, name: true, storeName: true, email: true } },
          obligations: {
            include: { order: { select: { poNumber: true, buyer: { select: { name: true } } } } },
            orderBy: { createdAt: 'asc' },
          },
        },
      },
    },
  })
  if (!invoice) throw new CommissionServiceError('Invoice not found', 404)
  return invoice
}
