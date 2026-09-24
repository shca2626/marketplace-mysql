# Vendora — Sprint Plan (executable backlog)

> The ACTUAL work plan. Owner: Lead maintains. Workers execute one task at a time.
> Statuses: READY / RUNNING / REVIEW / DONE / BLOCKED(gate) / DEFERRED.
> Sizes: S (<1h) / M (1-2h) / L (multi-cycle).
> **Re-baselined 2026-09 on TASK-0 output (COMPANY_TO_COMPANY_GAP_ANALYSIS.md, 157 lines).**

## PHASE 0 — Foundation
| ID | Task | Scope | Worker | Size | DoD | Status |
|---|---|---|---|---|---|---|
| TASK-0 | Generate gap analysis: 10-question C2C audit, verdicts + evidence, Sections A/B/C/D | read-only + 1 md | Recon | M | file exists, all questions evidenced | **DONE** (157 lines, worklog entry) |

## PHASE 1 — C2C Gap Closure (gate to Financier)
| ID | Task | Scope (files) | Worker | Dep | Size | DoD (acceptance criteria) | Status |
|---|---|---|---|---|---|---|---|
| TASK-1 | **A1 · LIVE DEFECT**: restore `src/lib/storage/local-disk.ts` (missing → /api/media + /api/uploads 500) | src/lib/storage/local-disk.ts ONLY | Developer | — | S | GET /api/media/<existing-key>→200 · traversal→400 · missing→404 · browser upload E2E | **DONE** (FIX-1 by lead after worker turn-budget failure; browser-upload E2E deferred to TASK-9) |
| TASK-2 | **A7**: product 404 infinite skeleton → explicit not-found state | product-view.tsx (~:390) | Developer | — | S | bad id → error state + CTA, no endless skeleton, E2E screenshot | READY |
| TASK-4 | **A6**: rate limiting + CSRF on auth/money routes (policies defined but dead) | lib/rate-limit.ts + route guards | Developer | — | S | burst → 429; normal flows unaffected; E2E | READY |
| TASK-3 | **A3**: enforce org creditLimit at checkout/quote-accept (stored but never enforced) | orders/approvals modules, checkout-view | Developer | — | M | over-limit → approval route/block; under-limit passes; E2E | READY |
| TASK-5 | Money-rails hardening: PaymentDriver abstraction + idempotency key (bank path pending D-002 ruling) | payments/service.ts | Developer | TASK-1 | M | card via driver; idempotent retries; D-002 respected | READY |
| TASK-6 | **A5**: auth hardening — email verification + password reset + auth rate limits | auth module, token model, api/auth/* | Developer | TASK-4 | M | E2E register→verify, forgot→reset→login | READY |
| TASK-7 | **A2**: wire B2B contract (tier) pricing into checkout | pricing resolver, checkout, orders | Developer | — | M | contract price applied at qty, E2E | READY |
| TASK-8 | **A8**: materialize test baseline (60/4 claim has NO on-disk artifact) then extend to RFQ/approvals/disputes/recurring/pricing/uploads/coupons/payments | test suite (new) | Dev+Tester | TASK-1..7 | L | baseline green; new suites green | READY |
| TASK-9 | Full E2E regression + whois.md refresh + re-audit all 10 gap questions | agent-browser + docs | Tester | TASK-8 | M | re-audit written; flows E2E'd with evidence | READY |

**Serialization:** TASK-1 ∥ TASK-2 (disjoint) OK. TASK-4 ∥ TASK-6 OK. Shared service/schema → serialized. One `db:push` at a time.
**Note:** TASK-0 also found: member management add-only (no remove/role-change) and OrderEvent/deliveredAt missing — parked as Phase-1 stretch items if capacity allows, else documented for Financier phase.

## BLOCKED on owner ruling (TASK-0 Section D)
| Item | Why owner must rule |
|---|---|
| **D-002 settlement tension** | Bank-transfer flow routes buyer wires *through the platform account* (operator-collector), contradicting "platform never collects buyer→vendor funds". Options: (a) amend D-002 to allow collector model, or (b) re-path to direct buyer→vendor settlement + commission invoicing. **Blocks F-0 Financier design + dispute refund execution.** |
| Dispute FULL/PARTIAL_REFUND execution | Moves real money; depends on D-002 ruling |
| `.env` tracked in git (contains DB creds) | Rotate credentials + untrack — owner notified (confirmed via `git ls-files`) |
| `db:push --accept-data-loss` as standing workflow | Destructive; Lead executes only when required, owner informed |

## PHASE 2 — Financier Module ⛔ GATE: Phase 1 DONE + D-002 ruling + owner go/no-go
> Hard model constraint (D-001/D-002): platform CONNECTS financiers (BANK/MFI/EWALLET orgs) to
> buyers' trade finance needs. It NEVER lends, never holds funds. Financing offers come FROM financier orgs.
| ID | Task | Scope | Worker | Size | DoD | Status |
|---|---|---|---|---|---|---|
| F-0 | Financier architecture design (schema, flows, surfaces) | Plan agent → Lead review | Planner | M | design approved, invariants checked | BLOCKED(gate) |
| F-1 | Financier domain schema: FinancierProfile (orgType → real entity), verification, financing products | prisma + module | Developer | M | db:push clean; CRUD + tests | BLOCKED(gate) |
| F-2 | Buyer financing request flow: attach RFQ/quote/order → financier inbox | modules + b2b views | Developer | L | E2E request→offer | BLOCKED(gate) |
| F-3 | Financier console: offers, terms, status | new view (D-004 single-route) | Developer | L | E2E offer lifecycle | BLOCKED(gate) |
| F-4 | Governance: notifications, audit, admin oversight | modules | Developer | M | audit rows on all actions | BLOCKED(gate) |
| F-5 | Financier E2E suite + whois refresh | tests + docs | Tester | M | suite green | BLOCKED(gate) |

## Milestones
- **M1** = TASK-0 done ✓ (2026-09) — plan re-baselined on real Section A.
- **M2** = Phase 1 done (TASK-1..9 DONE) + D-002 ruled → request owner go/no-go for Financier.
- **M3** = Financier shipped + full regression.
