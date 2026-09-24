# Vendora Task Board

> Working state of the autonomous team. **Single writer: the LEAD.**
> Read `team/PLAYBOOK.md` first. Statuses change only through the Lead.

## In Progress
| Task ID | Owner | Summary | Files locked |
|---|---|---|---|
| (none) | — | — | — |

## Review
| Task ID | Summary | Reviewer | Verdict |
|---|---|---|---|

## Done
| Task ID | Summary | Evidence |
|---|---|---|
| TEAM-SETUP | Autonomous-team infra stood up: playbook + board + decisions + 15-min webDevReview heartbeat | this file + worklog tail + cron job |

## Backlog (ordered — top first)
| # | ID | Item | Source |
|---|---|---|---|
| 1 | TASK-0 | Generate `COMPANY_TO_COMPANY_GAP_ANALYSIS.md` (read-only gap analysis: 10-question code audit, COMPLETE/PARTIAL/UI-DEMO-ONLY/NOT-FOUND/UNKNOWN classification, closing Sections A/B/C/D). **Confirmed missing on disk.** | owner directive |
| 2 | … | Seed items from gap-analysis **Section A** (must-fix before Financier) | TASK-0 output |
| 3 | … | Seed items from **Section B** (parallelizable) | TASK-0 output |

Known candidates pending TASK-0 confirmation (from whois.md audit, P1=4/P2=8/P3=5):
- Financier domain module — orgType BANK/MFI/EWALLET exist only as settings-scope keys today
- CARD payment is an inline simulation → gateway abstraction
- Organization creditLimit stored but never enforced at checkout
- Auth hardening: email verification / password reset / MFA
- Rate limiting beyond `/api/media`
- `typescript.ignoreBuildErrors: true` — eliminate
- Single-process in-memory cache/limiter
- Product detail 404 → infinite skeleton (`product-view.tsx:390`)
- Test coverage: RFQ chain, approvals, disputes, recurring, pricing, uploads, coupons (0 each; baseline 60/4)

## File Locks
| File / resource | Holder | Task ID | Released |
|---|---|---|---|
| `prisma/schema.prisma` | LEAD-gated | — | — |
| `worklog.md` / `TASK_BOARD.md` | LEAD-gated | — | — |

## Blocked (needs owner)
| Item | Why |
|---|---|
| (to be seeded from gap-analysis Section D after TASK-0) | owner approval required |
