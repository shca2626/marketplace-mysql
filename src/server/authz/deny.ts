// ─────────────────────────────────────────────────────────────────────────────
// AUTHZ — typed denial reasons (Phase 1).
// Every authorization failure carries one of these codes so API consumers,
// tests and audit tooling can assert WHY access was denied, not just that it
// was. Deny-by-default: anything not explicitly allowed resolves to a deny.
// ─────────────────────────────────────────────────────────────────────────────

export const DENY_REASONS = [
  'UNAUTHENTICATED',
  'ACCOUNT_SUSPENDED',
  'INVALID_CONTEXT',
  'NO_MEMBERSHIP',
  'ORG_SUSPENDED',
  'ORG_NOT_VERIFIED',
  'PERMISSION_NOT_FOR_ORG_TYPE',
  'MISSING_PERMISSION',
  'STORE_OUT_OF_SCOPE',
  'TENANT_MISMATCH',
  'RESOURCE_NOT_FOUND',
  'MODULE_DISABLED',
  'SELLING_NOT_ALLOWED',
  'ACCREDITATION_REQUIRED',
  'WORKFLOW_STATE',
  'SELF_ACTION_FORBIDDEN',
  'UNKNOWN_PERMISSION',
] as const

export type DenyReason = (typeof DENY_REASONS)[number]

export interface DenyDetail {
  reason: DenyReason
  message: string
  /** HTTP status for the route guard response. */
  status: number
}

export function deny(reason: DenyReason, message: string, status = 403): DenyDetail {
  return { reason, message, status }
}
