'use client'

// ─────────────────────────────────────────────────────────────────────────────
// BUYER STATEMENT (Phase 10 — lastplan v5 §10.8, buyer side)
// The buyer-obligation ledger for one agreement: installment schedule with
// per-installment paid / outstanding / overdue + aging bucket, received
// payments with their allocation waterfall, reversals, and the running
// balance. Read-only for the buyer.
// Owner: Task 10-a. This stub is wired by the main session so parallel tasks
// never edit shared view files.
// ─────────────────────────────────────────────────────────────────────────────

export function BuyerStatement({ agreementId, currency }: { agreementId: string; currency: string }) {
  void agreementId
  void currency
  return null
}
