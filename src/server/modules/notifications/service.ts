import { db } from '@/lib/db'

/**
 * NOTIFICATIONS — server-side event feed for the bell.
 *
 * Order events remain client-derived (NotificationsBell reads /api/orders);
 * this service covers everything the order list can't see: RFQ lifecycle
 * events (quotes received/accepted/declined/withdrawn/converted, status
 * changes), negotiation messages, and B2B approval queue events.
 *
 * Emission is best-effort: a notification failure must NEVER break the
 * business action that triggered it (create/accept/convert…), so every
 * emit helper swallows errors and logs.
 */

export type NotificationType =
  | 'RFQ_SUBMITTED_SELLER' // seller: a new RFQ references your products
  | 'RFQ_QUOTE_RECEIVED' // buyer: a seller sent you a quote
  | 'RFQ_QUOTE_ACCEPTED' // seller: buyer accepted your quote
  | 'RFQ_QUOTE_DECLINED' // seller: buyer declined your quote
  | 'RFQ_QUOTE_WITHDRAWN' // buyer: a seller withdrew their quote
  | 'RFQ_QUOTE_CONVERTED' // seller: accepted quote turned into an order
  | 'RFQ_STATUS' // buyer: RFQ moved (under review / rejected / expired)
  | 'RFQ_MESSAGE' // thread participant: new message
  | 'RFQ_QUOTE_REVIEW' // admin: a quote is held in the routing review queue
  | 'RFQ_QUOTE_REJECTED' // seller: platform review declined the quote
  | 'APPROVAL_REQUESTED' // org approvers: purchase needs approval
  | 'APPROVAL_DECIDED' // requester: your purchase was approved/rerejected
  | 'RFQ_DISPUTE' // seller: a buyer raised a dispute on your order
  | 'RFQ_DISPUTE_STATUS' // buyer: your dispute moved (responded / resolved / escalated)
  | 'RECURRING_PREVIEW' // buyer: your recurring RFQ publishes soon
  | 'RECURRING_PUBLISHED' // buyer: a recurring run was published
  | 'RECURRING_PAUSED' // buyer: schedule auto-paused (empty cycles) or skipped
  | 'VENDOR_STATUS' // seller: platform verified / suspended / reactivated your account
  | 'PAYMENT_STATUS' // buyer: payment captured, failed or awaiting confirmation
  | 'PAYOUT_STATUS' // seller: a payout was created or marked paid

export interface EmitInput {
  userId: string
  type: NotificationType
  title: string
  body?: string | null
  linkView: 'rfq' | 'orders' | 'business' | 'seller' | 'disputes' | 'admin'
  linkId?: string | null
}

/** Fire-and-forget create — never throws to the caller. */
export async function emitNotification(input: EmitInput): Promise<void> {
  try {
    await db.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title.slice(0, 160),
        body: input.body?.slice(0, 400) || null,
        linkView: input.linkView,
        linkId: input.linkId?.slice(0, 64) || null,
      },
    })
  } catch (err) {
    console.error('[notifications] emit failed:', input.type, err instanceof Error ? err.message : err)
  }
}

/** Same as emitNotification but accepts a transaction client. */
export async function emitNotificationTx(
  tx: { notification: { create: (args: unknown) => Promise<unknown> } },
  input: EmitInput
): Promise<void> {
  try {
    await tx.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title.slice(0, 160),
        body: input.body?.slice(0, 400) || null,
        linkView: input.linkView,
        linkId: input.linkId?.slice(0, 64) || null,
      },
    })
  } catch (err) {
    console.error('[notifications] emit(tx) failed:', input.type, err instanceof Error ? err.message : err)
  }
}

/** Fan out to many recipients (callers dedupe ids). */
export async function emitNotifications(inputs: EmitInput[]): Promise<void> {
  await Promise.all(inputs.map((i) => emitNotification(i)))
}

export interface NotificationDTO {
  id: string
  type: string
  title: string
  body: string | null
  linkView: string
  linkId: string | null
  readAt: string | null
  createdAt: string
}

export async function listNotifications(
  userId: string,
  limit = 20
): Promise<{ notifications: NotificationDTO[]; unreadCount: number }> {
  const [rows, unreadCount] = await Promise.all([
    db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 50),
    }),
    db.notification.count({ where: { userId, readAt: null } }),
  ])
  return {
    notifications: rows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      linkView: n.linkView,
      linkId: n.linkId,
      readAt: n.readAt ? n.readAt.toISOString() : null,
      createdAt: n.createdAt.toISOString(),
    })),
    unreadCount,
  }
}

export async function markNotificationRead(userId: string, id: string): Promise<void> {
  await db.notification.updateMany({ where: { id, userId }, data: { readAt: new Date() } })
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await db.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } })
}
