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
- **D-009 (2026-09, amended)** — Autonomous team mode ON. Execution model is the **STATE LOOP**
  (State → Lead decision → Worker → Result → State → …). NOT time-based.
- **D-010 (2026-09)** — Shared files are Lead-written; workers append to `worklog.md` only
  (plus their own scoped code files).
- **D-011 (2026-09, owner directive)** — Time-based heartbeat REJECTED by owner. Cron job 412062
  deleted. No timers drive development cadence, ever. Loop advances on: worker results, session
  entry, or any owner message. Persistence of loop state = files (TASK_BOARD + worklog).
- **D-012 (2026-09, owner ruling)** — Company-to-Company phase is CLOSED/complete. No C2C task
  gates the Financier module. Redundant gap-analysis file deleted. local-disk.ts kept +
  gitignore exception added (`!src/lib/storage/local-disk.ts`) so it survives host resets.
- **D-013 (2026-09, owner directive)** — Financier module may NOT start until the owner approves
  `team/FINANCIER_PLAN.md` (DP-1…DP-5). After approval, the team executes FIN-0…FIN-9 through
  the state loop WITHOUT STOPPING — owner is interrupted only for PLAYBOOK §8 escalations. *(v5
  update: task range is now FIN-0…FIN-10; DP span is DP-1…DP-28.)*
- **D-014 (2026-09, owner rulings on data design — governs the financier domain and ALL new
  domains):**
  1. **ZERO JSON.** No `Json` columns and no JSON-in-`Text` blobs in new domains. Lists become
     child tables with FKs; addresses become typed scalar columns; schedules become installment
     tables. Legacy Json columns in the commerce core (Product.images/specs/highlights/priceTiers,
     ProductVariant.options, MediaAsset.variants, RecurringRfq.lines/recipientIds,
     Organization.billingAddress, AuditLog.metadata, PlatformSetting.value, RfqSetting.value) are
     FROZEN — not extended, normalized only via a future explicit decision.
  2. **SINGLE ENTRY.** Every data point lives in exactly ONE place and is referenced everywhere
     else (competitor-validated: `fund-order.account = {id,name}`).
  3. **REUSE THE EXISTING SUBSTRATE.** Before adding any column/table, prove no existing home
     exists (Organization, User, MediaAsset, Sequence, AuditLog/Notification, RfqSetting).
     Documents link `MediaAsset` via `mediaId`; financier identity lives on `Organization`;
     NO geo lookup tables (strings — DP-16).
  Enforcement: `team/FINANCIER_SCHEMA.md` v4.0 §2 (rules R-1/R-2/R-3), §8 duplication audit;
  reflected in `team/docs/06-data-dictionary.md` (LEGACY-JSON marks) and test INV checks.

- **D-015 (2026-09, owner rulings v5 — the SERVICES/GATE model; governs the financier rebuild):**
  1. **SERVICES, NOT PRODUCTS** (DP-22): financiers offer *services* (competitor's own URL space
     `/en/services/{id}` + API field `service: {id,name}`). `FinancierService` replaces
     `FinancingProduct`; an accreditation program is a service (`serviceKind` FINANCING |
     ACCREDITATION).
  2. **THE PLATFORM VERIFICATION GATE IS THE ESSENCE OF THE PLATFORM** (DP-23): platform
     management must verify the conditions required for ANY service applicant — documents and
     eligibility criteria — BEFORE forwarding to the funder. Incomplete or incorrect requests
     must NOT be sent. Enforced structurally: gate statuses on both request types + financier
     inbox queries exclude un-forwarded requests (R-4 in FINANCIER_SCHEMA v5.0).
  3. **FLEXIBLE REQUIREMENTS ENGINE** (DP-24): GENERAL conditions (platform-curated, reused by
     multiple funders/services) + FINANCIER-specific private conditions; 8 typed kinds
     (DOCUMENT/PROFILE_FIELD/DECLARATION/TEXT/NUMBER/DATE/SELECT/MULTI_SELECT); per-service
     attachment via `ServiceRequirement`; per-request verification via `RequirementSubmission`;
     management UIs must be flexible, easy, comprehensive (admin library + financier composer).
  4. **ACCREDITATION IS A MAIN SERVICE** (DP-26): qualification & accreditation is one of the
     main services the system provides. Financiers CRUD acceptance requirements; companies
     select the funder, complete missing requirements not already in their profile, platform
     verifies + forwards when all conditions met; grant-on-request (ACCREDITED + validUntil),
     RFQ send/receive unlock, auto-pass on the funder's other services; renewal + revocation.
  5. **UNIVERSAL DOCUMENTS** (DP-27): document management for ALL users and accounts —
     `AccountDocument` vault (user + org scope), verified once, reused by every request type.
  6. **MULTI-FINANCIER ROUTING** (DP-25): qualification/financing requests go EXCLUSIVELY to one
     financier or SIMULTANEOUSLY to several — implemented as sibling requests sharing
     `multiGroupId` (one per financier's service) so each financier's own checklist stays
     well-defined; v4's open-to-matching distribution deferred (DP-28).
  7. Financier capability set (owner notes, verbatim intent): qualification & accreditation
     management · manage financing requests from individuals AND companies · manage services and
     their specific details · manage price quotations (receive quotes from approved vendors,
     relay customer quote requests — B2B mirror, ZERO new tables) · exclusive/multi routing ·
     full profile management · offer comparison and tracking · shared features · exclusive
     funder capabilities · documents management (see 5 above).
  Evidence: FINANCIER_SCHEMA.md v5.0 (§0 migration table, §2 rules R-4/R-5, §3.5–§3.13),
  FINANCIER_PLAN.md v2.0, PLATFORM_PLAN.md v3.0.
- **D-016 (2026-09)** — Plan stack REBUILT to implementation-ready on D-015: FINANCIER_SCHEMA
  v4.0 → **v5.0** (18 models), FINANCIER_PLAN v1.1 → **v2.0** (8 flows, FIN-0…FIN-10),
  PLATFORM_PLAN v2.0 → **v3.0** (P1 = services + requirements engine + gate; accreditation
  machinery moved into P1, its polish stays P5). team/docs/ suite refreshed to match (PLANNED
  sections now describe v5.0). Superseded models: FinancingProduct(±trait tables),
  FinancingRequestInvite, AccreditationProgram/Criterion, SupplierAccreditation, ApplicantDocument.
- **D-017 (2026-09, amended)** — D-011 (no timers) is SUPERSEDED for the autonomous QA/dev loop
  by the owner's latest session directive: a **webDevReview cron job every 15 minutes** drives
  continuous assessment (worklog review → agent-browser QA → autonomous bug-fix/feature work →
  worklog update). The state loop persists as the execution model; the cron is its heartbeat
  trigger, not a scheduler of business logic.
- **D-018 (2026-09-26, owner)** — **DP-1…DP-28 APPROVED** on the v5 plan stack (PLATFORM_PLAN
  v3.0 + FINANCIER_SCHEMA v5.0 + FINANCIER_PLAN v2.0). The approval explicitly carries:
  (a) DP-5 — infrastructure recovery authorized: reseed with demo data only (pre-reset data
  already lost, unrecoverable); (b) DP-6 — Flow-5 ledger is TRACK-ONLY (amends D-002 wording
  before P4). The team is authorized to run FIN-0 → FIN-10 **without stopping for further
  approvals**; the 15-min webDevReview heartbeat (D-017) drives QA/progress. Standing session
  directives recorded with this approval: (1) URL→file/path data types are the norm for all
  document/media storage — every planned doc model links `mediaId → MediaAsset`, never a
  URL-string column (verified in schema v5.0; only display-denormalized `logoUrl` follows the
  existing `User.image` pattern); (2) **ALWAYS COMMIT** — every completed task lands as a named
  git commit immediately.
