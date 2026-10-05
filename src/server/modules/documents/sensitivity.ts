// ─────────────────────────────────────────────────────────────────────────────
// Document sensitivity matrix — 6.8 (A11).
// Sensitivity classes × role → ONE tested resolver (access.ts), negative tests
// per class in scripts/negative-authz-suite.ts (vault cases).
//
// The class is DERIVED from the document type (deterministic, no stored
// column to drift): KYC identity evidence and financial evidence are the
// most restricted; org-registration documents are visible to active org
// members; nothing in the vault is PUBLIC (the class exists so future
// explicitly-public document kinds — e.g. marketing collateral — must be
// added here deliberately, never by default).
//
// FAIL-SAFE: unknown/unspecced document types resolve to the MOST
// restrictive class (SENSITIVE_IDENTITY) — a new type is private until the
// matrix is consciously amended (mirrors 6.6.2's default-to-vault ingest).
// ─────────────────────────────────────────────────────────────────────────────

export type DocumentSensitivity =
  | 'PUBLIC'
  | 'ORG_INTERNAL'
  | 'SENSITIVE_IDENTITY'
  | 'SENSITIVE_FINANCIAL'

const MATRIX: Record<string, DocumentSensitivity> = {
  // Identity evidence — owner + platform reviewers only. Org members NEVER
  // see another member's personal ID (member-vs-identity-doc denial, 6.10).
  NATIONAL_ID: 'SENSITIVE_IDENTITY',
  PASSPORT: 'SENSITIVE_IDENTITY',
  RESIDENCE_PERMIT: 'SENSITIVE_IDENTITY',
  PROOF_OF_ADDRESS: 'SENSITIVE_IDENTITY',

  // Financial evidence — owner + platform reviewers only (and the financier
  // reviewing an application the document backs).
  BANK_STATEMENT: 'SENSITIVE_FINANCIAL',
  FINANCIAL_STATEMENT: 'SENSITIVE_FINANCIAL',
  TAX_CARD: 'SENSITIVE_FINANCIAL',

  // Org registration / business documents — active org members may view
  // (these back the org's KYC gate, members share responsibility for them).
  COMMERCIAL_REG: 'ORG_INTERNAL',
  BUSINESS_LICENSE: 'ORG_INTERNAL',
  GUARANTEE_DOC: 'ORG_INTERNAL',
  FEASIBILITY_STUDY: 'ORG_INTERNAL',
  PROJECT_FILE: 'ORG_INTERNAL',
  INVOICE: 'ORG_INTERNAL',
  PURCHASE_ORDER: 'ORG_INTERNAL',
  OTHER: 'ORG_INTERNAL',
}

export function documentSensitivity(documentType: string): DocumentSensitivity {
  return MATRIX[documentType] ?? 'SENSITIVE_IDENTITY'
}

export const SENSITIVITY_LABELS: Record<DocumentSensitivity, string> = {
  PUBLIC: 'Public',
  ORG_INTERNAL: 'Organization members',
  SENSITIVE_IDENTITY: 'Identity — restricted',
  SENSITIVE_FINANCIAL: 'Financial — restricted',
}

/** Short per-class description used by the UI (admin queue, vault hints). */
export const SENSITIVITY_HINTS: Record<DocumentSensitivity, string> = {
  PUBLIC: 'Visible to anyone with the link',
  ORG_INTERNAL: 'You and active members of the organization',
  SENSITIVE_IDENTITY: 'Only you and platform reviewers',
  SENSITIVE_FINANCIAL: 'Only you, platform reviewers, and financiers reviewing your application',
}
