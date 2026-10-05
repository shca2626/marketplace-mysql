import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'

/**
 * Audit trail — the platform's trust substrate.
 * Every state-changing commerce action (organization lifecycle, RFQ/quote
 * transitions, price-list mutations, coupon changes) is recorded here.
 *
 * Two tiers (lastplan v5 §6.11 — audit atomicity & coverage):
 *
 * 1. `recordAuditTx(tx, entry)` — THE ONLY path for a SENSITIVE action.
 *    It writes on the caller's Prisma transaction and THROWS on failure, so
 *    the business change and its audit row commit (or roll back) together.
 *    A sensitive change can never silently skip its audit row.
 *
 * 2. `recordAudit(entry)` — non-sensitive telemetry only (logins, views,
 *    ordinary commerce events). Failures are logged and swallowed: the
 *    business flow must never break because a telemetry row could not be
 *    written. It REFUSES sensitive actions outright (fail-closed) so a new
 *    call site can never route a privileged mutation through the swallow
 *    path by accident — `scripts/check-guards.ts` lints for the same drift
 *    statically, and `scripts/audit-atomicity.ts` proves the behavior.
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

/**
 * The actions whose business change and audit row MUST be atomic (6.11).
 * Mirrors the lastplan v5 6.7.5 step-up enumeration plus the security
 * events that mutate privileged state:
 *   • role grants & changes      • payout generation / mark-paid / cancel
 *   • KYC & document verification • module & platform-policy changes
 *   • credential administration  • session revocation
 * Update `scripts/check-guards.ts` (audit-lint rule) whenever this set grows.
 */
export const SENSITIVE_AUDIT_ACTIONS: ReadonlySet<string> = new Set([
  // RBAC — role grants & changes (6.7.5)
  'ROLE_CREATED',
  'ROLE_UPDATED',
  'ROLE_DELETED',
  'ROLE_ASSIGNED',
  'ROLE_REVOKED',
  'STAFF_INVITED',
  'STAFF_INVITATION_REVOKED',
  // Payouts — generation / approval / mark-paid (6.7.5)
  'PAYOUT_GENERATED',
  'PAYOUT_PAID',
  'PAYOUT_CANCELLED',
  // KYC & document verification (6.7.5)
  'DOCUMENT_VERIFIED',
  'DOCUMENT_REJECTED',
  'ACCOUNT_DOCUMENT_DELETED',
  'REQUIREMENT_VERIFIED',
  'REQUIREMENT_REJECTED',
  'REQUIREMENT_WAIVED',
  // Module & platform-policy changes (6.7.5)
  'MODULE_ENABLED',
  'MODULE_DISABLED',
  'MODULE_ACTIVATION_REMOVED',
  'MFA_PLATFORM_POLICY_CHANGED',
  'MFA_ACCOUNT_REQUIREMENT_CHANGED',
  'SETTINGS_UPDATED',
  'SETTINGS_OVERRIDE_DELETED',
  'SETTINGS_ROLLBACK',
  // Credential administration (6.7.5)
  'MFA_ENROLLED',
  'MFA_DISABLED',
  'MFA_BACKUP_CODES_REGENERATED',
  'MFA_BACKUP_CODE_USED',
  'MFA_ADMIN_RESET',
  'USER_PASSWORD_CHANGED',
  'USER_PASSWORD_RESET',
  'USER_SESSIONS_REVOKED',
  'SESSION_REVOKED',
  'SESSIONS_REVOKED_OTHERS',
])

export function isSensitiveAuditAction(action: string): boolean {
  return SENSITIVE_AUDIT_ACTIONS.has(action)
}

function toAuditData(entry: AuditEntry): Prisma.AuditLogCreateInput {
  return {
    actorId: entry.actorId ?? null,
    actorType: entry.actorType,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    summary: entry.summary,
    // JSON-in-text: metadata is stored as a serialized JSON string.
    metadata: entry.metadata === undefined ? undefined : JSON.stringify(entry.metadata),
  }
}

/**
 * Transactional audit write — the ONLY path for sensitive actions (6.11).
 * No try/catch on purpose: a failure propagates and rolls back the caller's
 * business transaction. A sensitive change either lands WITH its audit row
 * or does not land at all.
 */
export async function recordAuditTx(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({ data: toAuditData(entry) })
}

/**
 * Fire-and-forget audit write for NON-SENSITIVE telemetry. Audit writes on
 * this path must never break the business flow: failures are logged and
 * swallowed. Sensitive actions are refused — see the module comment.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  if (isSensitiveAuditAction(entry.action)) {
    throw new Error(
      `[audit] FATAL: "${entry.action}" is a sensitive action (6.11) — it must be written with ` +
        `recordAuditTx() INSIDE the business transaction so the change and its audit row are atomic. ` +
        `Refusing the non-atomic path.`
    )
  }
  try {
    await db.auditLog.create({ data: toAuditData(entry) })
  } catch (err) {
    console.error('[audit] write failed:', entry.action, err)
  }
}
