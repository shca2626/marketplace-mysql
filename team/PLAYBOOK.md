# Vendora Autonomous Engineering Team — PLAYBOOK

> Single source of truth for HOW the team works. SPRINT_PLAN.md holds WHAT to work on.
> Mandatory read order for EVERY agent (lead, developer, tester, bench):
> `worklog.md` (tail) → `team/DECISIONS.md` → this file → `team/TASK_BOARD.md`.

## 1. Mission
Complete the Vendora B2B Marketplace end-to-end (C2C gap closure → Financier module → hardening)
**without waiting for manual user commands**. The user is PRODUCT OWNER only: sets direction,
approves Section-D decisions, interrupts anytime. The team self-manages everything else.

## 2. Roster
| Role | Who | Memory | Writes code | Tools |
|---|---|---|---|---|
| **TEAM LEAD / Architect** | main agent (Z.ai Code) | persistent session + files | integration only | all, incl. dispatch |
| **FULL-STACK DEVELOPER** | Task → `subagent_type=full-stack-developer` | none (stateless — receives context pack) | **yes** (scoped files only) | all |
| **TESTER / AUDITOR** | Task → `subagent_type=general-purpose` | none (stateless) | **NO** (reports only) | agent-browser, curl, lint, tsc, DB |
| Bench: PLAN/RECON | Task → `subagent_type=Explore` or `Plan` | none | no | read-only |

Hard rules:
- The TESTER never fixes code. The DEVELOPER never marks his own work verified. (Separation of duties.)
- Shared files (`worklog.md`, `TASK_BOARD.md`, `SPRINT_PLAN.md`, `prisma/schema.prisma`,
  `package.json`, `next.config.ts`, `Caddyfile`, `.env`, `src/lib/routing.ts`) are **LEAD-ONLY writes**.
  Workers request changes to them via their report.

## 3. Task IDs
- Sequential: `1`, `2`, `3` … · parallel-safe siblings: `2-a`, `2-b` (**disjoint file sets only**).
- Prefixes: `TASK-0` backlog seed · `QA-R#` QA rounds · `FIX-#` defects · `VERIFY-#` verification ·
  `LOOP-#` lead state-machine turns · `F-#` Financier-phase tasks.

## 4. Communication protocol (how stateless agents "converse")
Sub-agents physically cannot message each other. All communication is
**store-and-forward through files, relayed by the Lead**:

```
Developer A finishes ──appends──▶ worklog.md
                                      │ (Lead reads, distills)
Tester B's prompt ◀──context pack─────┘
Tester B appends verdict ──▶ worklog.md
                                      │ (Lead reads, decides)
Developer C's next brief ◀──fix brief─┘
```

Every dispatch is a **complete handoff brief**: Task ID • mission • files allowed to touch •
relevant DECISIONS ids • worklog context excerpt • API/contract expectations •
Definition of Done • required report format. If a brief would be ambiguous, the Lead splits
the task smaller — sub-agents cannot ask questions mid-run.

Worklog append contract (worker → team):
```
---
Task ID: <id>
Agent: <role>
Task: <one line>
Work Log:
- <steps with file:line evidence>
Stage Summary:
- <results / verdicts / open questions for the Lead>
```

## 5. Consistency guarantee (file-edit serialization)
- Parallel dispatch ONLY with **disjoint file sets**, declared in the board's lock table.
- Two tasks need the same file → **serialized** (`2-a` then `2-b`), never parallel.
- DB: one agent at a time runs `bun run db:push`; schema edits are lead-gated.
- Integration is Lead-only: re-read diffs, resolve overlap, lint + smoke, promote to Done.

## 6. Execution model — STATE LOOP (no timers, no cron)

> Owner decision 2026-09: time-based heartbeat REJECTED. The team runs on **state, not clock**.

```
STATE ──▶ LEAD DECISION ──▶ WORKER ──▶ RESULT ──▶ NEW STATE ──▶ LEAD DECISION ──▶ ...
```

**Trigger to enter the loop (never time):**
1. A worker result arrives (sub-agent returns) → immediately evaluate + dispatch next.
2. Session entry / any owner message → re-enter at STATE assessment.
3. The Lead chains as many iterations as its context budget safely allows per turn.

**Each iteration:**
1. **ASSESS STATE** — TASK_BOARD + worklog tail (+ quick QA sweep when code just changed).
2. **DECIDE** — pick top READY task. Mutations/bugs first, then plan order.
3. **DISPATCH** — worker gets the full handoff brief (§4).
4. **RESULT** — worker appends to worklog, returns report.

**Transition rules on result:**
| Verdict | Lead action |
|---|---|
| **PASS / DONE** | mark task DONE on board → select next READY task |
| **FAIL / BUG** | create `FIX-#` task → developer fixes → re-test |
| **BLOCKED** | dispatch PLAN/RECON for missing information, or escalate to owner if §8 |

**HALT conditions (clean stop, state persisted in files):**
- (a) BLOCKED awaiting owner (§8 escalation),
- (b) lead context budget low → persist state, report exactly where the loop stands,
- (c) all READY tasks DONE → report to owner.

**Resume:** any message / new session reads `TASK_BOARD.md` + worklog tail and re-enters
the loop exactly where it stopped. The files ARE the team's continuity.

## 7. Definition of Done (every task — no exceptions)
1. Code complete; `bun run lint` clean for touched files.
2. Schema pushed (`bun run db:push`) if changed.
3. agent-browser E2E of the changed user flows — evidence in worklog.
4. worklog.md appended. 5. TASK_BOARD / SPRINT_PLAN updated.

**No E2E evidence = NOT DONE.**

## 8. Escalation to the Product Owner — ONLY for
- Business-model changes (touching D-001/D-002).
- Destructive operations (DB resets, data deletion at scale).
- External credentials / keys / third-party accounts.
- Phase go/no-go (e.g. C2C closure → Financier start).
- Spending real money.

## 9. Backlog source of truth
`team/SPRINT_PLAN.md` — ordered, concrete, with scope/DoD/dependencies.
TASK_BOARD.md holds live status only. `COMPANY_TO_COMPANY_GAP_ANALYSIS.md` Section A/B/C/D
refines the plan after TASK-0.

## 10. Environment runbook (learned FIX-1 — every worker must know)
- **Background processes**: each Bash tool command is a fresh `su` session; children are reaped
  at command boundary (setsid/nohup/disown do NOT save them). The pattern that survives:
  **double-fork** `( ( cmd & ) & )` — the orphan re-parents to init and persists.
- **Dev server restart**: `cd /home/z/my-project && ( ( DATABASE_URL="mysql://vendora:VendoraDb_2025_Prod@127.0.0.1:3306/vendora" AUTH_SECRET="<≥32 chars>" bun run dev >> dev.log 2>&1 & ) & )`
  — AUTH_SECRET is NOT in .env (fail-fast if missing). Never `bun run build`. Port 3000 only.
- **Worker briefs**: keep browser-E2E OUT of small fix tasks (turn-budget killer — a 200-turn
  worker died on it). Browser verification belongs to QA-dedicated tasks (TASK-9, QA-R#).
- **Read dev.log tail** after any server-affecting change: `/home/z/my-project/dev.log`.
