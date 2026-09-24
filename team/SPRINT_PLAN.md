# Vendora — Sprint Plan

> The executable backlog. Single maintainer: the LEAD.
> Execution model: STATE LOOP (no timers/cron) — PLAYBOOK §6. DoD: PLAYBOOK §7.

## PHASE — C2C: **CLOSED** (owner ruling 2026-09)
Company-to-company scope declared complete by the owner. No further C2C tasks gate the Financier
module. Hygiene observations from the 2026-09 audit are PARKED below (opportunistic only).

## PHASE — Financier Module: **AWAITING OWNER PLAN APPROVAL**
Complete plan: **`team/FINANCIER_PLAN.md`** (v1.0) — domain model (5 new models), 7 E2E flows,
surfaces (?view=financier + buyer + admin), API surface, settings, governance, tasks FIN-0…FIN-9
with DoD/dependencies/serialization, risks, non-goals, and 5 owner decision points (DP-1…DP-5).
On approval the loop runs FIN-0 → FIN-9 without stopping.

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
- **M-FIN-A** = owner approves FINANCIER_PLAN (DP-1…DP-5).
- **M-FIN-B** = FIN-0..3 backend complete (schema/services/API).
- **M-FIN-C** = FIN-4..7 surfaces complete.
- **M-FIN-D** = FIN-8 QA regression green + FIN-9 docs → Financier module SHIPPED.
