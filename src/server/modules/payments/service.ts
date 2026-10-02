import { db } from '@/lib/db'
import { recordAudit } from '@/server/modules/audit/service'
import { emitNotification, emitNotifications, type EmitInput } from '@/server/modules/notifications/service'

/**
 * Payments — explicit money settlement for orders.
 *
 * Methods:
 *  - CARD          simulated gateway (no PSP dependency for self-hosting):
 *                  succeeds inline inside the same transaction as the order.
 *  - BANK_TRANSFER manual: buyer wires money using the bank details from the
 *                  platform config and provides a reference; an admin captures.
 *  - INVOICE       NET-terms B2B flow (quote conversion): payment tracked with
 *                  a due date; admin captures when the invoice is settled.
 *
 * Order status interplay: a SUCCEEDED payment flips the order to PAID
 * (cart checkout path). Quote-conversion orders run on terms (PROCESSING) and
 * carry an INVOICE payment that is tracked independently.
 */

export class PaymentServiceError extends Error {
  constructor(message: string, public status = 400) {
    super(message)
  }
}

export type PaymentMethod = 'CARD' | 'BANK_TRANSFER' | 'INVOICE'

// ── Platform payment configuration (PlatformSetting key "payments") ─────────

export interface PaymentsConfig {
  bankName: string
  accountName: string
  accountDetails: string // IBAN / account number / SWIFT lines
  instructions: string // extra transfer instructions shown to buyers
}

const DEFAULT_CONFIG: PaymentsConfig = {
  bankName: 'Vendora Platform Bank',
  accountName: 'Vendora Marketplace Ltd',
  accountDetails: 'IBAN XX00 0000 0000 0000 0000 0000 · SWIFT VENDORA22',
  instructions:
    'Include your order number in the transfer reference. Payments are confirmed by a platform operator on business days.',
}

export async function getPaymentsConfig(): Promise<PaymentsConfig> {
  const row = await db.platformSetting.findUnique({ where: { key: 'payments' } })
  if (!row) return DEFAULT_CONFIG
  try {
    const parsed = JSON.parse(row.value) as Partial<PaymentsConfig>
    return {
      bankName: parsed.bankName?.slice(0, 120) || DEFAULT_CONFIG.bankName,
      accountName: parsed.accountName?.slice(0, 160) || DEFAULT_CONFIG.accountName,
      accountDetails: parsed.accountDetails?.slice(0, 400) || DEFAULT_CONFIG.accountDetails,
      instructions: parsed.instructions?.slice(0, 600) || DEFAULT_CONFIG.instructions,
    }
  } catch {
    return DEFAULT_CONFIG
  }
}

export async function updatePaymentsConfig(patch: Partial<PaymentsConfig>): Promise<PaymentsConfig> {
  const current = await getPaymentsConfig()
  const next: PaymentsConfig = {
    bankName: patch.bankName?.slice(0, 120) || current.bankName,
    accountName: patch.accountName?.slice(0, 160) || current.accountName,
    accountDetails: patch.accountDetails?.slice(0, 400) || current.accountDetails,
    instructions: patch.instructions?.slice(0, 600) || current.instructions,
  }
  await db.platformSetting.upsert({
    where: { key: 'payments' },
    create: { key: 'payments', value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  })
  return next
}

/** Methods offered at cart checkout. CARD is the simulated gateway; keep it
 *  available unless the deployment explicitly runs manual-only. */
export function checkoutMethods(): { id: PaymentMethod; label: string; manual: boolean; description: string }[] {
  const cardEnabled = process.env.PAYMENT_DRIVER !== 'manual'
  const methods: { id: PaymentMethod; label: string; manual: boolean; description: string }[] = []
  if (cardEnabled) {
    methods.push({
      id: 'CARD',
      label: 'Card',
      manual: false,
      description: 'Secure card payment — confirmed instantly.',
    })
  }
  methods.push({
    id: 'BANK_TRANSFER',
    label: 'Bank transfer',
    manual: true,
    description: 'Wire the total to the platform account; an operator confirms receipt.',
  })
  return methods
}

function bankInstructions(cfg: PaymentsConfig, orderRef: string): string {
  return [
    `Bank: ${cfg.bankName}`,
    `Account name: ${cfg.accountName}`,
    cfg.accountDetails,
    `Reference: ${orderRef}`,
    cfg.instructions,
  ].join('\n')
}

function parseNetDays(terms: string | null | undefined): number | null {
  if (!terms) return null
  const m = terms.match(/NET[-\s]?(\d{1,3})/i)
  return m ? Math.min(365, parseInt(m[1], 10)) : null
}

// ── Creation ────────────────────────────────────────────────────────────────

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0]

/** Create (or refresh) the payment row for an order. Safe to call when a row
 *  already exists and is still PENDING (updates method/instructions). */
export async function ensurePayment(
  tx: Tx,
  input: {
    orderId: string
    amount: number
    method: PaymentMethod
    reference?: string | null
    paymentTerms?: string | null
    orderRef: string // human reference (order id / PO number) for the bank slip
  }
): Promise<{ id: string; method: PaymentMethod; status: string; instructions: string | null; dueAt: Date | null }> {
  const cfg = input.method === 'CARD' ? null : await getPaymentsConfig()
  const existing = await tx.payment.findUnique({ where: { orderId: input.orderId } })

  const netDays = parseNetDays(input.paymentTerms)
  const dueAt = input.method === 'INVOICE' && netDays ? new Date(Date.now() + netDays * 86_400_000) : null
  const instructions =
    input.method === 'BANK_TRANSFER' ? bankInstructions(cfg!, input.orderRef) : null

  if (existing) {
    if (existing.status !== 'PENDING')
      throw new PaymentServiceError('This order already has a settled payment', 409)
    const updated = await tx.payment.update({
      where: { orderId: input.orderId },
      data: {
        method: input.method,
        amount: input.amount,
        instructions,
        dueAt,
        ...(input.reference ? { reference: input.reference.slice(0, 160) } : {}),
      },
    })
    return { id: updated.id, method: updated.method, status: updated.status, instructions, dueAt }
  }

  const created = await tx.payment.create({
    data: {
      orderId: input.orderId,
      method: input.method,
      amount: input.amount,
      reference: input.reference?.slice(0, 160) ?? null,
      instructions,
      dueAt,
    },
  })
  return { id: created.id, method: created.method, status: created.status, instructions, dueAt }
}

/** Mark a payment SUCCEEDED and (unless the order runs on invoice terms) flip
 *  the order to PAID. Used by the card gateway path and admin capture.
 *  Returns whether the ORDER flipped to PAID so callers can fan out the
 *  ORDER_STATUS notifications AFTER their transaction commits. */
export async function succeedPayment(
  tx: Tx,
  input: { paymentId: string; capturedById?: string | null; reference?: string | null; note?: string | null; orderBecomesPaid?: boolean }
): Promise<{ orderBecamePaid: boolean }> {
  const payment = await tx.payment.findUnique({ where: { id: input.paymentId }, include: { order: true } })
  if (!payment) throw new PaymentServiceError('Payment not found', 404)
  if (payment.status === 'SUCCEEDED') throw new PaymentServiceError('Payment already captured', 409)
  if (payment.status !== 'PENDING') throw new PaymentServiceError(`Payment is ${payment.status}`, 409)

  const now = new Date()
  await tx.payment.update({
    where: { id: input.paymentId },
    data: {
      status: 'SUCCEEDED',
      paidAt: now,
      capturedById: input.capturedById ?? null,
      ...(input.reference ? { reference: input.reference.slice(0, 160) } : {}),
      ...(input.note ? { note: input.note.slice(0, 500) } : {}),
    },
  })

  // Quote-conversion orders run on NET terms — fulfillment continues regardless;
  // money is tracked on the payment row only.
  const orderOnTerms = payment.order.sourceType === 'RFQ' || !!payment.order.paymentTerms
  const orderBecamePaid = input.orderBecomesPaid !== false && !orderOnTerms
  if (orderBecamePaid) {
    await tx.order.update({ where: { id: payment.orderId }, data: { status: 'PAID' } })
  }
  return { orderBecamePaid }
}

/** Best-effort fan-out when a captured payment flips an order to PAID: the
 *  buyer gets a payment confirmation and every participating seller learns
 *  that fulfillment is unlocked. Call AFTER the payment transaction commits
 *  (no ghost pings on rollback). Never throws. */
export async function notifyOrderPaid(orderId: string): Promise<void> {
  try {
    const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true } })
    if (!order) return
    const number = order.poNumber ?? order.id.slice(-8).toUpperCase()
    const inputs: EmitInput[] = [
      {
        userId: order.buyerId,
        type: 'ORDER_STATUS',
        title: `Payment confirmed — order ${number}`,
        body: 'Your payment was confirmed and the order is now being processed.',
        linkView: 'orders',
        linkId: order.id,
      },
    ]
    for (const sellerId of new Set(order.items.map((i) => i.sellerId))) {
      if (sellerId === order.buyerId) continue
      inputs.push({
        userId: sellerId,
        type: 'ORDER_STATUS',
        title: `Order ${number} paid`,
        body: "The buyer's payment was confirmed — fulfillment is unlocked.",
        linkView: 'seller',
        linkId: order.id,
      })
    }
    await emitNotifications(inputs)
  } catch (err) {
    console.error('order notification error', err)
  }
}

/** Cancel the pending payment of a cancelled order (idempotent). */
export async function cancelPaymentForOrder(tx: Tx, orderId: string) {
  await tx.payment.updateMany({
    where: { orderId, status: 'PENDING' },
    data: { status: 'CANCELLED' },
  })
}

// ── Buyer actions ───────────────────────────────────────────────────────────

/** Buyer pays a PENDING_PAYMENT order. CARD settles instantly; BANK_TRANSFER
 *  records the transfer reference and awaits operator capture. */
export async function buyerPayOrder(
  userId: string,
  orderId: string,
  input: { method?: PaymentMethod; reference?: string }
) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { payment: true } })
  if (!order) throw new PaymentServiceError('Order not found', 404)
  if (order.buyerId !== userId) throw new PaymentServiceError('Only the buyer can pay this order', 403)
  if (order.status !== 'PENDING_PAYMENT')
    throw new PaymentServiceError(`This order is ${order.status.replace('_', ' ').toLowerCase()} — no payment is due`, 409)
  if (order.payment && order.payment.status === 'SUCCEEDED')
    throw new PaymentServiceError('This order is already paid', 409)

  const method: PaymentMethod = input.method ?? order.payment?.method ?? 'BANK_TRANSFER'
  if (method === 'INVOICE') throw new PaymentServiceError('Invoices are settled by the platform', 400)

  let becamePaid = false
  const result = await db.$transaction(async (tx) => {
    const payment = await ensurePayment(tx, {
      orderId: order.id,
      amount: order.total,
      method,
      reference: input.reference,
      orderRef: order.poNumber ?? order.id.slice(-8).toUpperCase(),
    })

    if (method === 'CARD') {
      const settled = await succeedPayment(tx, { paymentId: payment.id, reference: `SIM-${Date.now().toString(36).toUpperCase()}` })
      becamePaid = settled.orderBecamePaid
      return { order: await tx.order.findUnique({ where: { id: order.id } }), payment: await tx.payment.findUnique({ where: { id: payment.id } }), paid: true }
    }

    // BANK_TRANSFER — record the reference, stay PENDING until capture
    if (input.reference) {
      await tx.payment.update({
        where: { id: payment.id },
        data: { reference: input.reference.slice(0, 160) },
      })
    }
    return { order, payment: await tx.payment.findUnique({ where: { id: payment.id } }), paid: false }
  })

  // Order-side fan-out — only after the transaction commits
  if (becamePaid) await notifyOrderPaid(order.id)
  return result
}

// ── Admin actions ───────────────────────────────────────────────────────────

export async function adminListPayments(filters: {
  q?: string
  status?: string
  method?: string
  page?: number
  limit?: number
}) {
  const page = Math.max(1, filters.page ?? 1)
  const limit = Math.min(50, Math.max(1, filters.limit ?? 20))

  const where: Record<string, unknown> = {}
  const q = filters.q?.trim()
  if (q) {
    where.OR = [
      { reference: { contains: q } },
      { order: { id: { contains: q } } },
      { order: { buyer: { name: { contains: q } } } },
      { order: { buyer: { email: { contains: q } } } },
      { order: { fullName: { contains: q } } },
    ]
  }
  if (filters.status) where.status = filters.status
  if (filters.method) where.method = filters.method

  const [total, rows] = await Promise.all([
    db.payment.count({ where }),
    db.payment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        order: {
          select: {
            id: true,
            status: true,
            total: true,
            sourceType: true,
            paymentTerms: true,
            poNumber: true,
            createdAt: true,
            buyer: { select: { id: true, name: true, email: true } },
            items: { select: { sellerId: true } },
          },
        },
        capturedBy: { select: { id: true, name: true } },
      },
    }),
  ])

  const sums = await db.payment.groupBy({
    by: ['status'],
    _sum: { amount: true },
    _count: { _all: true },
  })
  const totalsByStatus = Object.fromEntries(
    sums.map((s) => [s.status, { count: s._count._all, amount: Number(s._sum.amount ?? 0) }])
  )

  return {
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    totalsByStatus,
    payments: rows.map((p) => ({
      id: p.id,
      method: p.method,
      status: p.status,
      amount: Number(p.amount),
      reference: p.reference,
      dueAt: p.dueAt?.toISOString() ?? null,
      paidAt: p.paidAt?.toISOString() ?? null,
      note: p.note,
      createdAt: p.createdAt.toISOString(),
      order: {
        id: p.order.id,
        status: p.order.status,
        total: p.order.total,
        sourceType: p.order.sourceType,
        paymentTerms: p.order.paymentTerms,
        poNumber: p.order.poNumber,
        createdAt: p.order.createdAt.toISOString(),
        buyer: p.order.buyer,
        sellerCount: new Set(p.order.items.map((i) => i.sellerId)).size,
        itemCount: p.order.items.length,
      },
      capturedBy: p.capturedBy,
    })),
  }
}

export async function adminCapturePayment(adminId: string, paymentId: string, note?: string) {
  let becamePaid = false
  const result = await db.$transaction(async (tx) => {
    const settled = await succeedPayment(tx, { paymentId, capturedById: adminId, note })
    becamePaid = settled.orderBecamePaid
    return tx.payment.findUnique({
      where: { id: paymentId },
      include: { order: { include: { buyer: { select: { id: true, name: true } } } } },
    })
  })

  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'PAYMENT_CAPTURED',
    entityType: 'Payment',
    entityId: paymentId,
    summary: `Captured ${result!.method} payment of $${Number(result!.amount).toFixed(2)} for order ${result!.order.id.slice(-8).toUpperCase()}`,
    metadata: { orderId: result!.orderId, reference: result!.reference },
  })

  await emitNotification({
    userId: result!.order.buyerId,
    type: 'PAYMENT_STATUS',
    title: 'Payment confirmed',
    body: `Your ${result!.method === 'INVOICE' ? 'invoice' : 'bank transfer'} payment of $${Number(result!.amount).toFixed(2)} has been confirmed.`,
    linkView: 'orders',
    linkId: result!.orderId,
  })

  // Order-side fan-out when the capture flipped the order to PAID
  // (after the transaction commits)
  if (becamePaid) await notifyOrderPaid(result!.orderId)

  return result
}

export async function adminFailPayment(adminId: string, paymentId: string, note?: string) {
  const payment = await db.payment.findUnique({ where: { id: paymentId }, include: { order: true } })
  if (!payment) throw new PaymentServiceError('Payment not found', 404)
  if (payment.status !== 'PENDING') throw new PaymentServiceError('Only pending payments can be marked failed', 409)

  await db.payment.update({
    where: { id: paymentId },
    data: { status: 'FAILED', note: note?.slice(0, 500) ?? null },
  })

  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'PAYMENT_FAILED',
    entityType: 'Payment',
    entityId: paymentId,
    summary: `Marked payment of $${Number(payment.amount).toFixed(2)} as failed`,
    metadata: { orderId: payment.orderId, note: note ?? null },
  })

  await emitNotification({
    userId: payment.order.buyerId,
    type: 'PAYMENT_STATUS',
    title: 'Payment could not be verified',
    body: note ?? 'The platform could not verify your payment. Please check the transfer details and contact support.',
    linkView: 'orders',
    linkId: payment.orderId,
  })

  return db.payment.findUnique({ where: { id: paymentId } })
}
