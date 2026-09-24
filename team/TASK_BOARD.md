# Vendora Task Board

> Live status only. The PLAN lives in `team/SPRINT_PLAN.md` + `team/FINANCIER_PLAN.md`.
> Single writer: the LEAD. Execution model: STATE LOOP — no timers, no cron.

## In Progress
| Task ID | Owner | Summary |
|---|---|---|
| (none — loop idle) | — | — |

## Review
| Task ID | Summary | Reviewer | Verdict |
|---|---|---|---|

## Done
| Task ID | Summary | Evidence |
|---|---|---|
| TEAM-SETUP | Team infra + state-loop model + sprint plan | team/*.md + worklog |
| TASK-1 / FIX-1 | local-disk.ts restored + gitignore exception `!src/lib/storage/local-disk.ts` | worklog FIX-1; media 200, traversal 404 |
| RECON-FIN | Financier code recon (14 fact sections + gotchas) | worklog LOOP-3 |
| CLEANUP | COMPANY_TO_COMPANY_GAP_ANALYSIS.md deleted (owner directive) | worklog LOOP-3 |

## Gate — BLOCKED on owner
| Item | Why |
|---|---|
| **PLATFORM PLAN APPROVAL** — `team/PLATFORM_PLAN.md` v2.0 (big picture, 6 flows, phases P0–P6, decision points DP-1…DP-9); FINANCIER_PLAN.md = Phase-1 detail | Owner must approve before P0/FIN-0 dispatches. After approval: team runs all phases without stopping. |
| DP-5 especially: DB recovery approval | MySQL datadir wiped by host reset; runbook reseed = demo data only (old data already lost) |
| DP-6: Flow-5 track-only-ledger ruling (needed before P4 only) | Amends D-002 wording |

## After approval — queue
FIN-0 infra recovery (lead) → FIN-1 schema → FIN-2 services → FIN-3 API → FIN-4 financier console → FIN-5 buyer surfaces → FIN-6 admin tab → FIN-7 governance → FIN-8 QA regression → FIN-9 docs.
