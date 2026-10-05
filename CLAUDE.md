# CLAUDE.md — Vendora Agent Operating Protocol

> **CANONICAL. Every agent (main session, subagent, cron worker) reads this file FIRST,
> before touching anything.** It is committed to GitHub, so it survives sandbox rebuilds.
> The project owner has ratified these rules — violating any of them wastes effort,
> time, and tokens, and has already caused one total work-loss incident (Oct 5).

---

## THE 5 LAWS (owner-mandated, non-negotiable)

### Law 1 — MySQL (Aiven) ALWAYS. Never SQLite. Never hardcoded.
- The one-and-only database is the **Aiven MySQL** instance configured by `DATABASE_URL` in `.env`.
- SQLite is forbidden in every context: app runtime, scripts, Prisma commands, mini-services.
- **Shell poison footgun:** the sandbox supervisor exports a SQLite `DATABASE_URL`
  (`file:…/custom.db`) into spawned shells, and process env **shadows** `.env`.
  - App code is already immune: `src/lib/db.ts` restores the `.env` URL at import time.
  - For any **CLI / bun script / prisma command**, either run `bash scripts/with-env.sh <cmd>`
    or manually `export DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-)`.
  - All `db:*` / `mysql:check` package scripts are already wrapped with `with-env.sh`.
- If `.env` is missing or clobbered → **`bash scripts/bootstrap.sh`** recovers it
  automatically from git history (the URL lives in old commits; see `scripts/bootstrap.sh`).
  Never "hunt" for it manually again.

### Law 2 — Migrate against MySQL (Aiven) after E2E, BEFORE delivering.
- Workflow for every feature: implement → **E2E test** (agent-browser + curl) →
  `bun run db:push` (schema drift to Aiven; verify `in sync`) → only then report done.
- Never hand off with unpushed schema drift; never deliver without E2E evidence.

### Law 3 — Always push to GitHub after every completed task.
- `git add -A && git commit -m "…"` → `git push origin main`.
- Remote: `github.com/shca2626/marketplace-mysql`. **Unpushed work = lost work** —
  the Oct 5 rebuild destroyed an entire session's output because it was never pushed.

### Law 4 — Lost anything → restore from GitHub + Aiven MySQL. NEVER rebuild.
- Sandbox rebuilt / files missing / "regenerating client" confusion:
  1. `git fetch && git reset --hard origin/main` (or fresh clone),
  2. `bash scripts/bootstrap.sh` (env → prisma client → DB check → dev server :3000 → WA bridge :3031),
  3. Done. **Data lives in Aiven MySQL — it is always online and NEVER lost.**
     Do **not** re-seed, re-create, or "repair" data that exists; check with
     `bun run mysql:check` / `bun run db:status` first.
- `prisma generate` is only ever needed once after a fresh clone (bootstrap does it
  only when the client is missing). Do not regenerate reflexively.
- `bun run db:reset` is **refused** unless `CONFIRM_DB_RESET=yes` is exported — the
  Aiven dataset must never be wiped (that's the point of Law 4).

### Law 5 — Preserve effort, time, tokens.
- **Read `/home/z/my-project/worklog.md` BEFORE working** — it is committed to git and
  survives rebuilds; it is the project's memory. Never redo what's already delivered.
- Check `git log --oneline -10` for the latest state before planning.
- **Append your section to worklog.md when done** (template at the top of that file),
  then commit + push it with the rest.
- Delegate parallelizable work to subagents with explicit Task IDs and do-not-touch lists.
- Close agent-browser sessions when done (3.9 GB box, no swap — OOM kills next-server).

---

## ENVIRONMENT FACTS

| Item | Value |
|---|---|
| Stack | Next.js 16 App Router, React 19, TypeScript, Tailwind 4, shadcn/ui (NY), lucide |
| DB | Aiven MySQL via `.env` `DATABASE_URL` (102+ tables) — `import { db } from '@/lib/db'` |
| App | `bun run dev` on **:3000** (never `bun run build`; never other ports) |
| WhatsApp bridge | `mini-services/whatsapp-service` on **:3031** (`bun --hot index.ts`, token `X-Internal-Token: vendora-internal`) |
| Cross-service calls | relative URLs only, other ports via `?XTransformPort=<port>` (Caddy gateway) |
| Route guard | every new API route must be registered in `scripts/audit/route-classification.json` → `bun run guard:lint` |
| Auth guards | `requireUser() / requireAdmin(perm) / requireAdminAny([...])` in `src/server/guards.ts` |
| Theme | warm navy / gold / stone / emerald — **BLUE & INDIGO ARE FORBIDDEN** in UI |
| Dynamic data | **no hardcoded values that can change** — currency rates come from the live-rate
  engine (`/api/settings/currency` + `ExchangeRate` history, admin pins in the Currencies & FX
  console); fees, discounts, anything volatile → DB/config, never a constant |
| Dev server restart | `(nohup env DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)" bun run dev > /dev/null 2>&1 &)` — plain `setsid` procs are reaped between tool calls, this subshell pattern survives |
| `.env` | git-ignored on purpose (public repo) — recovered by bootstrap from git history |

## COMMAND CHEAT SHEET

```bash
bash scripts/bootstrap.sh            # ← RUN THIS FIRST, EVERY SESSION (idempotent, self-healing)
bun run mysql:check                  # Aiven connectivity + table count (with-env wrapped)
bun run db:status                     # schema drift status
bun run db:push                       # apply schema to Aiven (with-env wrapped)
bun run lint                          # eslint + guard-lint (routes must be registered)
bun run authz:negative                # negative-authz regression suite
# WhatsApp bridge (if :3031 down):  cd mini-services/whatsapp-service && \
#   (nohup env DATABASE_URL="$(grep '^DATABASE_URL=' ../../.env | cut -d= -f2-)" bun run dev >/dev/null 2>&1 &)
```

## SESSION START CHECKLIST (every agent, every time)

1. `cd /home/z/my-project && bash scripts/bootstrap.sh` — fixes env, client, services automatically.
2. Read the tail of `worklog.md` + `git log --oneline -5` — know what's already done.
3. Work → E2E → `bun run db:push` → `git add -A && git commit && git push` → append worklog → push again if worklog changed.

*Owner quote: "dont lose the previous implemented successful tasks, dont lose the efforts and time and tokens."*
