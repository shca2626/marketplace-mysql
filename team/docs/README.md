# Vendora — Engineering Documentation Suite

> Version 1.1 · September 2026 · Audience: expert software engineers (owner-reviewed).
> These documents describe the **whole project** — the live commerce platform (EXISTING) and the
> owner-gated financier module (PLANNED, `team/FINANCIER_SCHEMA.md` v5.0). Every fact is code-grounded;
> nothing is aspirational except sections explicitly marked PLANNED.

## Reading order & map

| # | Document | What it contains | Primary sources |
|---|---|---|---|
| 01 | [Domain Model / ERD](./01-domain-model.md) | Bounded contexts, Mermaid ERDs (4 diagrams), relationship inventory, data invariants, 12 state machines, traceability chains | `prisma/schema.prisma`, FINANCIER_SCHEMA v5.0 |
| 02 | [Use Cases / User Stories](./02-use-cases-user-stories.md) | 8 actors, use-case diagram, 47 use cases (37 EXISTS / 9 PLANNED / 1 PARTIAL), 65 stories × 12 epics with Given/When/Then ACs | capability map, PLATFORM_PLAN |
| 03 | [API Contract (conventions)](./03-api-contract.md) | Error model, status codes, pagination, CSRF & rate-limit policies, 88-endpoint coverage matrix, planned financing endpoints | every `route.ts` read |
| — | [OpenAPI 3.1 spec](./openapi.yaml) | 88 existing paths / 121 operations + 14 planned paths (`x-planned: true`), cookie auth scheme, component schemas | ibid. |
| 04 | [Architecture Decision Records](./04-architecture-decision-records.md) | ADR-0001…0021: SPA routing, unified commerce core, orchestrator business model, custom auth, string enums, Sequence service, no-timer state machines, module layering, media pipeline, scoped settings, cache/limits, test strategy, polymorphic RFQ backbone, zero-JSON/single-entry/substrate-reuse financing model, frozen-offer agreements, platform verification gate, requirements engine, services-not-products, multi-financier sibling routing, universal document vault, gateway topology | DECISIONS.md D-001…D-017, DP-1…DP-28 |
| 05 | [Wireframes / Design System](./05-wireframes-design-system.md) | Tokens (oklch, radius, accent bridge), fonts, motion, dark mode, 49 primitives + composed inventory, a11y standards, ASCII wireframes for all existing surfaces + 6 planned financier surfaces (wizard IA, financier console) | `globals.css`, `src/components/**` |
| 06 | [Data Dictionary](./06-data-dictionary.md) | Enum registry (25 existing + planned v5.0 set), every field of all 32 existing models (LEGACY-JSON marks) + 18 planned models, legacy-JSON appendix | `prisma/schema.prisma`, FINANCIER_SCHEMA v5.0 |
| 07 | [Test Plan / Acceptance Criteria](./07-test-plan-acceptance-criteria.md) | Honest current state, 11 state-machine transition tables + 33 negative cases, 97 Given/When/Then ACs, invariant checks (zero-JSON, single-entry), API contract tests, NFRs, P0–P6 exit criteria | PLAYBOOK §7, verify-b2b.sh |
| 08 | [Deployment / Ops Runbook](./08-deployment-ops-runbook.md) | Topology (Caddy :81 → Next :3000), sandbox physics (double-fork, env poisoning), env vars, DB ops + 5-step recovery, observability, routine ops, P0-1…P0-9 incident matrix, launch checklists | `scripts/recovery/`, Caddyfile |
| 09 | [Security Model / Threat Model](./09-security-threat-model.md) | Trust levels, auth/session model, authz matrix, STRIDE per component (honest H/M/L), media deep-dive, secrets + rotation, PII duties (incl. planned applicant PII), money-integrity invariants, prioritized roadmap | `src/lib/auth.ts`, rate-limit, http, storage |

## Status legend
- **EXISTING** — implemented and code-grounded.
- **PARTIAL** — backbone exists; deltas listed.
- **PLANNED** — designed (FINANCIER_SCHEMA v5.0 / FINANCIER_PLAN v2.0 / PLATFORM_PLAN v3.0), owner-gated, not implemented.

## Governing rules (see ADR-0014/0017…0021 and DECISIONS.md D-014/D-015)
1. **Zero JSON** in new domains — lists are child tables, addresses are typed scalars.
2. **Single entry** — every data point has exactly one home; references everywhere else.
3. **Reuse the substrate** — Organization, User, MediaAsset, Sequence, AuditLog/Notification,
   RfqSetting. No geo lookup tables.
4. **The platform verification gate (R-4)** — no financing/accreditation request reaches a
   financier before the platform verifies all required conditions; incomplete/incorrect requests
   are returned to the applicant; financier inboxes structurally exclude un-forwarded requests
   (DP-23).
5. **Flexible requirements (R-5)** — GENERAL platform-curated + FINANCIER-specific condition
   templates, 8 typed kinds, attached per service, verified per request (DP-24).

## Known live issues surfaced by this documentation round
- **P0:** `src/lib/storage/local-disk.ts` missing from disk AND absent from git history →
  uploads/media serving broken (ops runbook P0-3 has the rebuild + commit procedure).
- Security P0s: `.env` tracked in git (rotate); login/register/order/review rate-limit policies
  defined but not wired; CSRF missing on login/orders/rfqs/product-writes (see 09 §12 roadmap).
- Test suite: no on-disk artifacts vs D-008 intent (07, risk R-1).

## Maintenance
These documents are regenerated manually from source by the autonomous team at documentation
milestones; each file records its sources. The plan stack (`team/PLATFORM_PLAN.md` v3.0 →
`team/FINANCIER_SCHEMA.md` v5.0 → `team/FINANCIER_PLAN.md` v2.0) remains the authority for
PLANNED content.
