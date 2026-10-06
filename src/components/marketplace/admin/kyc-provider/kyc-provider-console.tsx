'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN · KYC PROVIDER CONSOLE — Phase 12.4 (lastplan v5 §12).
//
// Pills:
//   • "Routing"      — per document type: MANUAL | PROVIDER |
//                      PROVIDER_THEN_MANUAL + adapter + timeout (admin-
//                      customizable, the 12.4 requirement)
//   • "Case Queue"   — provider cases by state incl. the MANUAL_QUEUE and
//                      PROVIDER_ERROR rows (failure semantics made visible)
//   • "Webhook Log"  — every delivery: signature validity, replay flags,
//                      event-id idempotency evidence
// Stub — filled by task 12-a.
// ─────────────────────────────────────────────────────────────────────────────

export function KycProviderConsole() {
  return (
    <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
      KYC provider routing, case queue and webhook log — arriving shortly.
    </div>
  )
}
