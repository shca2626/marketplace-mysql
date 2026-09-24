# Vendora — Decision Record & Invariants

> EVERY agent MUST read this before designing anything.
> Violating an invariant = automatic rejection by the Lead.

## Business-model invariants (owner-set, non-negotiable)
- **D-001 — Third-party orchestrator.** Platform registers/verifies parties, curates the governed
  catalog, receives RFQs, matches suppliers, governs quotes, runs approval/award/PO/fulfillment,
  connects financiers, charges commission on successful trades, handles disputes/compliance/audit.
  It NEVER holds inventory and is NEVER merchant of record.
- **D-002 — Settlement is external.** The platform never collects buyer→vendor funds, never lends,
  never runs wallets. Commission on success; payout = Σgross − commission
  (vendor override or PlatformSetting `payouts`, 0–90%, zod-validated).
- **D-003 — NO SaaS multi-tenancy.** No tenantId anywhere, no platform-of-platforms, one operator.

## Architecture invariants
- **D-004** — Single-page SPA: only route is `/` (+ `?view=` parsed by `src/lib/routing.ts`). No new routes.
- **D-005** — Business logic lives in `src/server/modules/*`. Routes stay thin.
- **D-006** — Atomic business sequences via Sequence service (RFX/QTE/PY/DSP); never client-side counters.
- **D-007** — Dev on :3000, Caddy :81. `bun run dev` only; never `bun run build`.
- **D-008** — E2E via agent-browser is part of DoD. Baseline: 60 tests / 4 files
  (smoke 3 · vendor-lifecycle 25 · commission-payouts 12 · catalog-moderation 20).

## Working agreements
- **D-009 (2026-09)** — Autonomous team mode ON: 15-min webDevReview heartbeat; user = product owner
  (escalation list in PLAYBOOK §8).
- **D-010 (2026-09)** — Shared files are Lead-written; workers append to `worklog.md` only
  (plus their own scoped code files).
