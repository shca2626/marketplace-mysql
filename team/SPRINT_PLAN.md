# Vendora — Sprint Plan

> The executable backlog. Single maintainer: the LEAD.
> Execution model: STATE LOOP (PLAYBOOK §6) + 15-min webDevReview heartbeat (D-017). DoD: PLAYBOOK §7.

## PHASE — C2C: **CLOSED** (owner ruling 2026-09)
Company-to-company scope declared complete by the owner. No further C2C tasks gate the Financier
module. Hygiene observations from the 2026-09 audit are PARKED below (opportunistic only).

## PHASE — Financier Module: **APPROVED — EXECUTING (FIN-0 → FIN-10, D-018, 2026-09-26)**
Complete plan stack (rebuilt 2026-09 on the owner's v5 rulings — see DECISIONS D-015):
- **`team/FINANCIER_SCHEMA.md` v5.0** — 18 models, ZERO Json: FinancierService (services not
  products, serviceKind FINANCING|ACCREDITATION), the REQUIREMENTS ENGINE (ConditionTemplate
  GENERAL+FINANCIER, ConditionOption, ServiceRequirement, RequirementSubmission), THE PLATFORM
  VERIFICATION GATE (status machines + inbox-exclusion), universal AccountDocument +
  RequestAttachment, FinancingRequest v3 (service-scoped + multiGroupId siblings),
  AccreditationRequest (MAIN service — grant-on-request, RFQ unlock, auto-pass),
  offers/installments/agreement/events/fees.
- **`team/FINANCIER_PLAN.md` v2.0** — 8 E2E flows (gate = flow #4, the heart), surfaces
  (financier console w/ requirements composer · applicant wizard w/ checklist · admin gate
  console), API surface (§6), settings (6 panels), tasks FIN-0…FIN-10 with DoD/dependencies/
  serialization, risks, non-goals, DP-1…DP-28 checklist.
Owner approved 2026-09-26 (DP-1…DP-28 — DECISIONS D-018, milestone M-FIN-A ✓). The loop runs
FIN-0 → FIN-10 without stopping.

## Parked hygiene backlog (does NOT gate anything; opportunistic)
| Item | Source | Note |
|---|---|---|
| Product 404 infinite skeleton | audit | product-view.tsx ~390 |
| Rate limiting on auth/money routes | audit | policies defined but dead |
| Email verification / password reset | audit | auth hardening |
| `typescript.ignoreBuildErrors: true` | audit | eliminate after tsc clean |
| `.env` tracked in git | audit | rotate creds + untrack (owner decision) |
| creditLimit enforcement | audit | may resurface inside Financier flows (DP adjacent) |
| Test baseline materialization | audit | no on-disk test artifact exists today |

## Milestones
- **M-C2C** ✓ closed by owner.
- **M-FIN-A** ✓ (2026-09-26) — owner approved the v5 plan stack (DP-1…DP-28 — DECISIONS D-018).
- **M-FIN-B** = FIN-0..4 backend complete (schema, requirements engine + vault, gate lifecycles, API).
- **M-FIN-C** = FIN-5..7 surfaces complete (financier console, applicant wizard, admin gate console).
- **M-FIN-D** = FIN-8..10 governance + QA green + docs → Financier module SHIPPED.
