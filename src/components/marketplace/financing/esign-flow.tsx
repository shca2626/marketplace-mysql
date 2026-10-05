'use client'

// ─────────────────────────────────────────────────────────────────────────────
// E-SIGNATURE FLOW (Phase 10 — lastplan v5 §10.4, buyer side)
// The applicant-facing agreement execution: renders the ACTIVE contract
// template with placeholders filled for this agreement, demands the explicit
// consent sentence + a signature (typed/drawn image via the media pipeline),
// enforces the step-up MFA verification at signing, and records the complete
// evidence package (hash fail-closed). Returns null while an execution
// already exists or the flow is unavailable.
// Owner: Task 10-c. This stub is wired by the main session so parallel tasks
// never edit shared view files.
// ─────────────────────────────────────────────────────────────────────────────

export function EsignFlow({
  agreementId,
  agreementNumber,
  onSigned,
}: {
  agreementId: string
  agreementNumber: string
  onSigned?: () => void
}) {
  void agreementId
  void agreementNumber
  void onSigned
  return null
}
