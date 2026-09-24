# Vendora Autonomous Engineering Team — PLAYBOOK

> Single source of truth for HOW the team works. TASK_BOARD.md holds WHAT to work on.
> Mandatory read order for EVERY agent (lead, developer, tester, bench):
> `worklog.md` (tail) → `team/DECISIONS.md` → this file → `team/TASK_BOARD.md`.

## 1. Mission
Complete the Vendora B2B Marketplace end-to-end (C2C gap closure → Financier module → hardening)
**without waiting for user commands**. The user is PRODUCT OWNER only: sets direction, approves
Section-D decisions, interrupts anytime. The team self-manages everything else.

## 2. Roster
| Role | Who | Memory | Writes code | Tools |
|---|---|---|---|---|
| **TEAM LEAD / Architect** | main agent (Z.ai Code) | persistent session + files | integration only | all, incl. cron + dispatch |
| **FULL-STACK DEVELOPER** | Task → `subagent_type=full-stack-developer` | none (stateless — receives context pack) | **yes** (scoped files only) | all |
| **TESTER / AUDITOR** | Task → `subagent_type=general-purpose` | none (stateless) | **NO** (reports only) | agent-browser, curl, lint, tsc, DB |
| Bench: RECON | Task → `subagent_type=Explore` | none | no | read-only, fast |
| Bench: PLANNER | Task → `subagent_type=Plan` | none | no | read-only design |

Hard rules:
- The TESTER never fixes code. The DEVELOPER never marks his own work verified. (Separation of duties.)
- Shared files (`worklog.md`, `TASK_BOARD.md`, `prisma/schema.prisma`, `package.json`,
  `next.config.ts`, `Caddyfile`, `.env`, `src/lib/routing.ts`) are **LEAD-ONLY writes**.
  Workers request changes to them via their report.

## 3. Task IDs
- Sequential by sprint: `1`, `2`, `3` …
- Parallel-safe siblings: `2-a`, `2-b` (**disjoint file sets only** — declared in the board lock table).
- Special prefixes: `TASK-0` backlog seed · `QA-R#` heartbeat QA rounds · `FIX-#` defects ·
  `VERIFY-#` verification passes.

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

The "conversation" happens **between prompts**. The Lead carries it.
Latency = one relay hop — by design: correctness over speed.

### Handoff brief template (Lead → worker; every dispatch contains)
Task ID • one-sentence mission • files allowed to touch • relevant DECISIONS ids •
worklog context excerpt • API/contract expectations • Definition of Done • required report format.

### Worklog append contract (worker → team)
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
- Parallel dispatch ONLY with **disjoint file sets**, declared upfront in the board's lock table.
- Two tasks need the same file (e.g. `prisma/schema.prisma`) → they are **serialized**
  (`2-a` then `2-b`), never parallel.
- Integration is Lead-only: after workers return, the Lead re-reads diffs, resolves overlap,
  runs `bun run lint` + smoke, promotes to Done.
- DB: only one agent at a time runs `bun run db:push`; schema edits are lead-gated.

## 6. Heartbeat (autonomous cadence)
Every 15 minutes the cron `webDevReview` fires. Each heartbeat = one mini-sprint:

1. **STANDUP** — read worklog tail + TASK_BOARD (in flight / done / blocked?).
2. **QA SWEEP** — agent-browser: does `/` render, do golden paths work, any new console/runtime
   errors, is dev.log clean?
3. **IF RED** → dispatch developer fix (`FIX-#`) → re-verify → log.
4. **IF GREEN** → pick top board item → brief developer → implement → tester verifies.
5. **CLOSE** — append worklog, update board, stop cleanly. Idempotent: if the board shows an
   in-flight lock from a live heartbeat, no-op.

Budget: **1–2 tasks per heartbeat** (context-window discipline).

## 7. Definition of Done (every task — no exceptions)
1. Code complete; `bun run lint` clean for touched files.
2. Schema pushed (`bun run db:push`) if changed.
3. agent-browser E2E of the changed user flows — with evidence in worklog
   (what was clicked, what was seen).
4. worklog.md appended (template above).
5. TASK_BOARD updated.

**No E2E evidence = NOT DONE.** (Institutionalizes the owner's rule.)

## 8. Escalation to the Product Owner — ONLY for
- Business-model changes (anything touching D-001/D-002 in DECISIONS.md).
- Destructive operations (DB resets, data deletion at scale).
- External credentials / keys / third-party accounts.
- Phase go/no-go (C2C closure → Financier go-live).
- Spending real money.

Everything else proceeds autonomously.

## 9. Backlog priority
The board's Backlog is ordered from `COMPANY_TO_COMPANY_GAP_ANALYSIS.md`:
**A** (must-fix before Financier) > **B** (parallelizable) > **C** (defer) > **D** (owner approval).
Until TASK-0 produces that file, the known-candidate list on the board governs.
