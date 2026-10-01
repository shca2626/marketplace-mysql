import { db } from '@/lib/db'

/**
 * Audit trail — the platform's trust substrate.
 * Every state-changing commerce action (organization lifecycle, RFQ/quote
 * transitions, price-list mutations, coupon changes) is recorded here.
 * Audit writes must NEVER break the business flow: failures are logged
 * and swallowed.
 */

export type AuditActorType = 'USER' | 'SELLER' | 'ADMIN' | 'SYSTEM'

export interface AuditEntry {
  actorId?: string | null
  actorType: AuditActorType
  action: string // ORG_CREATED | ORG_VERIFIED | RFQ_SUBMITTED | PRICELIST_UPDATED | ...
  entityType: string // Organization | Rfq | Quote | PriceList | Coupon | CustomerGroup | ...
  entityId?: string | null
  summary?: string
  metadata?: Record<string, unknown>
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        actorType: entry.actorType,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        summary: entry.summary,
        // JSON-in-text: metadata is stored as a serialized JSON string.
        metadata: entry.metadata === undefined ? undefined : JSON.stringify(entry.metadata),
      },
    })
  } catch (err) {
    console.error('[audit] write failed:', entry.action, err)
  }
}
