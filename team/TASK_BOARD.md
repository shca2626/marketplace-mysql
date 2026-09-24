# Vendora Task Board

> Live status only. The PLAN (scope/DoD/deps) lives in `team/SPRINT_PLAN.md`.
> Single writer: the LEAD. Execution model: STATE LOOP — no timers, no cron.

## In Progress
| Task ID | Owner | Summary |
|---|---|---|
| (none — loop idle, awaiting next entry) | — | — |

## Review
| Task ID | Summary | Reviewer | Verdict |
|---|---|---|---|

## Done
| Task ID | Summary | Evidence |
|---|---|---|
| TASK-1 / FIX-1 | local-disk.ts restored (traversal-proof, atomic writes, fail-closed); media pipeline live again | worklog FIX-1: media 200/webp/immutable, traversal 404, roundtrip+HTTP proof, lint clean |
| TASK-0 | COMPANY_TO_COMPANY_GAP_ANALYSIS.md (157 lines, 10 verdicts, A/B/C/D) | worklog TASK-0 entry + file on disk |
| TEAM-SETUP | Team infra + state-loop model + sprint plan | team/*.md + worklog LOOP-1 |

## Next READY (top of queue, post TASK-1)
1. TASK-2 (product 404 skeleton, S)
2. TASK-4 (rate limiting + CSRF, S)
3. TASK-3 (creditLimit enforcement, M)

## Blocked (needs owner)
| Item | Why |
|---|---|
| **D-002 settlement ruling** — bank wires route through platform account | Owner must amend D-002 or direct re-path; blocks F-0 + dispute refunds |
| `.env` tracked in git (DB creds) | Rotate + untrack |
| PHASE 2 (F-0..F-5) | Phase gate: Phase 1 complete + owner go/no-go |
