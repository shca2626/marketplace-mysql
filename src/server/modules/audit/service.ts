import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

/**
 * Audit trail — the platform's trust substrate.
 * Every state-changing commerce action (organization lifecycle, RFQ/quote
 * transitions, price-list mutations, coupon changes) is recorded here.
 * Audit writes must NEVER break the business flow: failures are logged
 * and swallowed.
 */

export type AuditActorType = 'USER' | 'SELLER' | 'ADMIN' | 'SYSTEM'

/**
 * SENSITIVE AUDIT ACTIONS (6.11) — actions whose audit rows MUST commit in the
 * SAME transaction as the business change (recordAuditTx), never via the
 * fire-and-forget recordAudit(). scripts/check-guards.ts parses this set as
 * the single source of truth and fails on any drift.
 */
export const SENSITIVE_AUDIT_ACTIONS = new Set([
  // RBAC + staff lifecycle
  'ROLE_ASSIGNED',
  'ROLE_REVOKED',
  'ROLE_CREATED',
  'ROLE_UPDATED',
  'ROLE_DELETED',
  'STAFF_INVITED',
  'STAFF_INVITATION_REVOKED',
  'ORG_JOINED_VIA_INVITATION',
  // money movement + settlement
  'PAYOUT_GENERATED',
  'PAYOUT_MARKED_PAID',
  'PAYOUT_REVERSED',
  'REFUND_APPROVED',
  'REFUND_COMPLETED',
  'COMMISSION_STATEMENT_GENERATED',
  'COMMISSION_INVOICE_ISSUED',
  'COMMISSION_INVOICE_VOIDED',
  // financing gate + documents
  'FINANCING_REQUEST_FORWARDED',
  'FINANCING_REQUEST_RETURNED',
  'DOCUMENT_VERIFIED',
  'DOCUMENT_REJECTED',
  'FINANCING_REQUEST_APPROVED',
  'FINANCING_REQUEST_REJECTED',
  'FINANCING_FEE_WAIVED',
  // security policy
  'MFA_POLICY_UPDATED',
  'MODULE_ENABLED',
  'MODULE_DISABLED',
  'MODULE_ACTIVATION_REMOVED',
  'SUBSCRIPTION_PLAN_UPSERTED',
  'SUBSCRIPTION_CANCELLED',
])

export interface AuditEntry {
  actorId?: string | null
  actorType: AuditActorType
  action: string // ORG_CREATED | ORG_VERIFIED | RFQ_SUBMITTED | PRICELIST_UPDATED | ...
  entityType: string // Organization | Rfq | Quote | PriceList | Coupon | CustomerGroup | ...
  entityId?: string | null
  summary?: string
  /** Any JSON-serializable object — stored as a serialized JSON string. */
  metadata?: object
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

/**
 * Transactional audit write — the SAME semantics as recordAudit but on the
 * caller's transaction client, so the audit row commits atomically with the
 * business change it describes (e.g. session termination, MFA enrollment,
 * security-console actions). Failures propagate: inside a transaction a
 * swallowed write would silently detach the audit from the change it must
 * witness.
 */
export async function recordAuditTx(
  tx: Prisma.TransactionClient,
  entry: AuditEntry
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: entry.actorId ?? null,
      actorType: entry.actorType,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      summary: entry.summary,
      metadata: entry.metadata === undefined ? undefined : JSON.stringify(entry.metadata),
    },
  })
}
