# 08 — Deployment & Ops Runbook

> Audience: operators and agents working in the Vendora sandbox.
> Status: **development environment only** (D-007). There is no production
> deployment today; everything below describes the single-node sandbox and the
> procedures to keep it healthy.
> Companion doc: `team/docs/09-security-threat-model.md` (threats, secrets,
> rotation runbook).

---

## 1. System overview & topology

```
                         ┌──────────────────────────────────────────────┐
 Browser ──HTTP:81──────▶│ Caddy gateway (repo-root ./Caddyfile)        │
                         │  • default: reverse_proxy → localhost:3000   │
                         │  • query XTransformPort=<port> → localhost:<port>
                         └───────────────┬──────────────────────────────┘
                                         │ localhost
                                         ▼
                         ┌──────────────────────────────────────────────┐
                         │ Next.js 16 App Router, `next dev -p 3000`    │
                         │ (bun run dev; stdout tee'd → ./dev.log)     │
                         │  • src/app/api/* — route handlers            │
                         │  • src/server/modules/* — business logic    │
                         │  • src/lib/storage — media pipeline (sharp)  │
                         └───────────┬───────────────────┬──────────────┘
                                     │ Prisma            │ StorageAdapter
                                     ▼                   ▼
                    ┌──────────────────────┐  ┌────────────────────────┐
                    │ MariaDB 11.8.6       │  │ local-disk driver       │
                    │ user-space, no root  │  │ ./storage/uploads/      │
                    │ /home/z/mysql        │  │ YYYY/MM/{sha8}-{rand6}. │
                    │ socket mysql.sock    │  │ {role}.webp renditions  │
                    │ DB `vendora` utf8mb4 │  └────────────────────────┘
                    └──────────────────────┘
```

Key facts:

- **Gateway.** Caddy listens on `:81` (Caddyfile at repo root). Default traffic
  is reverse-proxied to `localhost:3000` with `Host`, `X-Forwarded-For`,
  `X-Forwarded-Proto` and `X-Real-IP` preserved (Caddyfile lines 15-22).
- **Mini-services pattern.** Any request carrying the query param
  `XTransformPort=<port>` is proxied to `localhost:<port>` instead
  (Caddyfile lines 2-13). This is how side services are reached from the
  browser without extra ports: the WebSocket demo in `examples/websocket/`
  runs socket.io on port 3003 (`examples/websocket/server.ts:118`) and its
  client connects with `io('/?XTransformPort=3003')`
  (`examples/websocket/frontend.tsx:36`).
- **App.** Single Next.js process on `:3000`, started with
  `next dev -p 3000 2>&1 | tee dev.log` (`package.json` "dev" script). All
  business logic lives in `src/server/modules/*` (D-005); routes stay thin.
- **Database.** User-space MariaDB 11.8.6 (no root, no systemd) installed
  under `/home/z/mysql`, data under `/home/z/mysql-data`, config
  `/home/z/mysql/my.cnf`, unix socket `/home/z/mysql/mysql.sock`. Single
  database `vendora` (utf8mb4 / utf8mb4_unicode_ci), app user `vendora`.
  Prisma datasource: `provider = "mysql"`, `url = env("DATABASE_URL")`
  (`prisma/schema.prisma:5-8`).
- **Media storage.** `STORAGE_DRIVER=local-disk` (default,
  `src/lib/storage/index.ts:22`) writes under `storage/uploads/YYYY/MM/…`
  (observed: `storage/uploads/2026/09/8e8dac75-wyq3io.large.webp` etc.).
  Rendition files are content-addressed and immutable, which is what makes
  `/api/media` responses safely cacheable
  (`src/app/api/media/[...key]/route.ts:9-12`). Seed/legacy storefront images
  also exist under `public/uploads/products/` (static files).
  Both trees are git-tracked today (`git ls-files storage/` is non-empty), so
  they survive host resets together with the code.

## 2. Environments & constraints

There is exactly **one environment**: this sandbox. Constraints that shape
every procedure below:

| Constraint | Rule | Source |
|---|---|---|
| D-007 | `bun run dev` only. **NEVER `bun run build`** in this environment (it has never been part of the loop; the standalone `start` flow is untested here). `next.config.ts` `output: "standalone"` exists for a future real deployment, not for this box. | `team/DECISIONS.md:20` |
| Ports | App on `:3000`, gateway on `:81`. Mini-services pick a free local port and are reached via `XTransformPort`. | D-007, Caddyfile |
| Process physics | Every Bash command runs in a fresh `su` session; background processes started normally are **reaped** when the command ends. Only the double-fork pattern `( setsid … & )` survives across tool sessions. | `scripts/recovery/README.md:52-54` |
| Env poisoning | The tool shell injects a stale `DATABASE_URL=file:…custom.db` (SQLite). Any command that spawns Prisma or the dev server must pass the real MySQL URL **inline** (`env DATABASE_URL="mysql://…"`). | `scripts/recovery/README.md:58-59`, `scripts/db-provider.ts:77-79` |
| Host resets | The host periodically wipes `/home/z/*` **outside** `my-project`. MySQL binaries, datadir and all DB data are lost; git-committed project files survive. | `scripts/recovery/README.md:3-4` |
| TypeScript | `typescript.ignoreBuildErrors: true` in `next.config.ts` — type errors do not block anything; do not rely on a build gate. | `next.config.ts:7` |
| No CI | No CI pipeline exists; quality gates are the E2E agent-browser suites (D-008) plus manual review. | worklog |

## 3. Startup / shutdown procedures

### 3.1 Start MySQL (prerequisite)

```bash
bash /home/z/mysql/start-mysql.sh        # setsid-detached, survives the session
# verify (connectivity + database present):
/home/z/mysql/usr/bin/mariadb -u root -S /home/z/mysql/mysql.sock \
  -e "SELECT 1; SHOW DATABASES LIKE 'vendora';"
```

If `/home/z/mysql` does not exist at all, skip to the full recovery runbook in
§5.5 / `scripts/recovery/README.md` — MySQL must be restored before anything
else works.

### 3.2 Start the dev server (double-forked, env inlined)

```bash
cd /home/z/my-project
( setsid env DATABASE_URL="mysql://vendora:<password>@127.0.0.1:3306/vendora" \
    bun run dev < /dev/null > /dev/null 2>&1 & )
```

Why this exact shape:

- `( … & )` double-fork + `setsid` detaches the process so it is not reaped
  when the launching shell exits (`scripts/recovery/README.md:52-57`).
- `DATABASE_URL` inline overrides the stale SQLite URL the tool shell injects.
- stdout/stderr are redirected to `/dev/null` **here** because the `dev`
  script itself pipes through `tee dev.log` — but note that with this
  double-fork the `tee` inside `bun run dev` still writes `./dev.log`; check
  that the file grows. (If `dev.log` is not growing, `tail` it via a restart
  without the outer `/dev/null` redirect to diagnose.)

### 3.3 Verify

1. `dev.log` exists and its tail shows the Next.js ready line and no Prisma
   connection errors (read the tail only — the file grows forever).
2. `curl -s http://localhost:3000/api` returns
   `{"message":"Hello, world!"}` (`src/app/api/route.ts`).
3. Through the gateway: `curl -s http://localhost:81/` returns the storefront
   HTML.
4. Login as a seeded account and confirm the storefront loads products
   (proves DB + media serving end to end).

### 3.4 Shut down

```bash
pkill -f "next dev"      # or kill the bun/next PID found via the :3000 listener
```

MySQL is normally left running (it is setsid-detached). To stop it, use the
mariadb-admin shutdown against the socket. Neither stop procedure is part of
the normal loop — the environment expects both to stay up.

## 4. Configuration reference

### 4.1 Environment variables

| Variable | Purpose | Semantics / risk |
|---|---|---|
| `DATABASE_URL` | Prisma datasource URL (MySQL). | **Poisoned by the tool shell** (stale `file:…custom.db`) — always inline the real value when spawning Prisma or the dev server. Changing it changes which DB the app hits; there is no migration guard at runtime. |
| `AUTH_SECRET` | HMAC key for session cookies. | Must be ≥ 32 chars; in production a missing/short value **throws at module load** (fail-fast, `src/lib/auth.ts:10-21`). Dev falls back to the constant `vendora-dev-secret` (`src/lib/auth.ts:9`). Rotating it invalidates every session (stateless tokens are signed with it). |
| `STORAGE_DRIVER` | Storage adapter selection. | Only `local-disk` is registered; an unknown value throws on first `getStorage()` call (`src/lib/storage/index.ts:22-24`). Defaults to `local-disk`. |
| `PAYMENT_DRIVER` | Payment surface control. | `manual` disables the simulated CARD method everywhere (`src/server/modules/payments/service.ts:81`, `src/app/api/payments/methods/route.ts:5`). Any other value (including unset) leaves CARD on the **simulated** gateway. |
| `NODE_ENV` | Dev/prod switch. | `production` turns on `secure` cookies (`src/lib/auth.ts:108`) and the AUTH_SECRET fail-fast check. This sandbox always runs dev. |

### 4.2 `.env` is tracked in git — treat all values as exposed

Verified: `git ls-files` lists `.env` even though `.gitignore` has `.env*`
(it was committed before the ignore rule; ignore rules do not untrack).
The file currently holds `DATABASE_URL` (mysql://… with password) and
`AUTH_SECRET` (see `scripts/recovery/README.md:48`).

**Rotation runbook** (also in the threat model §7):

1. Generate a new `AUTH_SECRET`: `openssl rand -hex 32`.
2. Change the DB password:
   `/home/z/mysql/usr/bin/mariadb -u root -S /home/z/mysql/mysql.sock -e
   "SET PASSWORD FOR 'vendora'@'127.0.0.1' = PASSWORD('<new>'); SET PASSWORD
   FOR 'vendora'@'localhost' = PASSWORD('<new>'); FLUSH PRIVILEGES;"`
3. Rewrite `.env` locally with the new values (never echo them into the
   worklog or docs).
4. Untrack the file: `git rm --cached .env && git commit -m "SEC: untrack
   .env"` (the `.gitignore` rule already covers it). Optionally add a
   `.env.example` with names only — recommended, see threat model §7.
5. Restart MySQL-dependent processes with the new inline
   `DATABASE_URL`; all users must log in again (AUTH_SECRET change).
6. Treat the old DB password and AUTH_SECRET as compromised — the git history
   still contains them; history rewrite is optional and out of scope here.

## 5. Database operations

### 5.1 Schema changes

```
edit prisma/schema.prisma
bun run db:generate      # prisma generate — refresh @prisma/client types
bun run db:push          # prisma db push --accept-data-loss
```

**Warning — `db:push` is destructive.** The script is defined as
`prisma db push --accept-data-loss` (`package.json:10`): Prisma will apply
destructive schema changes (dropped columns/tables, type narrowing) **without
asking**, and data in the path of the change is lost. House rules:

- Additive changes (new nullable columns, new models, new indexes) are safe
  to push.
- For any change that touches existing populated columns, prefer
  `bun run db:migrate` (`prisma migrate dev`), which generates a reviewable
  migration file — or export the table first.
- Nobody runs `db:reset` (migrate reset) casually: it wipes the database.

### 5.2 Seeding

| Script | Command | Contents |
|---|---|---|
| `scripts/seed-demo.ts` | `bun run db:seed` | Full-system demo seed (B2C + B2B) — the one used by recovery. |
| `scripts/seed-b2b.ts` | `bun run db:seed:b2b` | B2B-specific organizations/RFQs. |
| `prisma/seed.ts` | (prisma seed) | Original minimal seed (kept for reference). |

`scripts/add-admin.ts` exists for creating an admin account;
`scripts/seed-settings.ts` seeds platform settings. Remember the env rule:
run these with the inline `DATABASE_URL` if the shell's value is stale.

### 5.3 Provider flip (MySQL ⇄ SQLite)

`bun run scripts/db-provider.ts <mysql|sqlite>` rewrites
`prisma/schema.prisma`'s provider, strips MySQL native types when going to
SQLite, swaps `.env` `APP_DATABASE_URL` + `DB_PROVIDER`, and regenerates the
client (`scripts/db-provider.ts`). The dev server must be restarted
afterwards. **Data does not follow**: the SQLite snapshot is frozen — rows
created while on MySQL exist only in MySQL (script header, lines 17-19).
This is an emergency rollback path, not a sync tool.

### 5.4 Backup

What actually holds state:

| Artifact | Location | Backup action |
|---|---|---|
| MariaDB data | `/home/z/mysql-data/` | Copy the whole directory while MySQL is stopped (cold copy). There is no `mysqldump` step in the current runbook — everything is reproducible from schema + seeds, so dumps are optional. |
| Uploaded media renditions | `storage/uploads/` | Currently **git-tracked** — a commit is the backup. If that ever changes, copy the tree. |
| Secrets | `.env` | Copy out-of-band (and see §4.2 — it should stop being tracked). |
| Code + tracked assets | the git repo | `git commit` / push; this is the primary restore source (survives host resets, `scripts/recovery/README.md:4`). |

### 5.5 Restore (full environment recovery)

Reproduce from `scripts/recovery/README.md` (files in `scripts/recovery/`:
`README.md`, `my.cnf`, `recover-all.sh`, `download-one.sh`,
`start-mysql.sh.txt`). The host wiped `/home/z/*` outside `my-project`;
MySQL is gone. Five steps:

**1 — Download the MariaDB 11.8.6 bintar via parallel range requests.**
A single connection is throttled to ~140 KB/s; 14 chunks with 7 parallel
workers saturate ~2 MB/s. Pin the sha256.

```bash
mkdir -p /home/z/mysql-dl && cd /home/z/mysql-dl
URL="https://archive.mariadb.org/mariadb-11.8.6/bintar-linux-systemd-x86_64/mariadb-11.8.6-linux-systemd-x86_64.tar.gz"
TOTAL=433584725  N=14  CHUNK=$((TOTAL/N + 1))
: > jobs.txt
for i in $(seq 0 $((N-1))); do
  start=$((i*CHUNK)); end=$((start+CHUNK-1)); [ $end -ge $TOTAL ] && end=$((TOTAL-1))
  echo "$i $start $end" >> jobs.txt
done
xargs -a jobs.txt -L1 -P7 bash download-one.sh
cat $(ls part* | sort) > mariadb-11.8.6-linux-systemd-x86_64.tar.gz
sha256sum mariadb-11.8.6-linux-systemd-x86_64.tar.gz
# expect: 9367b26f63a7f4936acf914a987d15f37e2449ef568552b70d3c4ffa48896f8b
```

**2 — Extract + initialize** (config from `scripts/recovery/my.cnf`):

```bash
mkdir -p /home/z/mysql /home/z/mysql-data /home/z/mysql-tmp
tar -xzf mariadb-11.8.6-linux-systemd-x86_64.tar.gz -C /home/z/mysql
mv /home/z/mysql/mariadb-11.8.6-linux-systemd-x86_64 /home/z/mysql/usr
cp my.cnf /home/z/mysql/my.cnf
cd /home/z/mysql/usr
export LD_LIBRARY_PATH=/home/z/mysql/usr/lib:/home/z/mysql/usr/lib/x86_64-linux-gnu
./scripts/mysql_install_db --defaults-file=/home/z/mysql/my.cnf \
  --datadir=/home/z/mysql-data --auth-root-authentication-method=normal --skip-test-db
```

**3 — Start + secure.** Recreate `/home/z/mysql/start-mysql.sh` from the
committed template `scripts/recovery/start-mysql.sh.txt`, then set the root
password and create the app database/user (utf8mb4):

```bash
bash /home/z/mysql/start-mysql.sh
M="/home/z/mysql/usr/bin/mariadb -u root -S /home/z/mysql/mysql.sock"
$M -e "SET PASSWORD FOR 'root'@'localhost' = PASSWORD('<root-pw>');"
$M -e "CREATE DATABASE IF NOT EXISTS vendora CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
       CREATE USER IF NOT EXISTS 'vendora'@'127.0.0.1' IDENTIFIED BY '<db-pw>';
       CREATE USER IF NOT EXISTS 'vendora'@'localhost' IDENTIFIED BY '<db-pw>';
       GRANT ALL PRIVILEGES ON vendora.* TO 'vendora'@'127.0.0.1';
       GRANT ALL PRIVILEGES ON vendora.* TO 'vendora'@'localhost'; FLUSH PRIVILEGES;"
```

**4 — Schema + demo data** (from `/home/z/my-project`, real values from
`.env`):

```bash
set -a; . ./.env; set +a
bun run db:push
bun run db:seed
```

**5 — Start the dev server** (double-fork, inline `DATABASE_URL` — §3.2).

`scripts/recovery/recover-all.sh` automates steps 4-5 and parts of the
flow; the README is the canonical, current procedure.

### 5.6 Restore verification

1. `curl -s http://localhost:3000/api` → `{"message":"Hello, world!"}`.
2. `dev.log` tail: no `Can't reach database server` / Prisma errors.
3. Storefront loads seeded products; a product image request returns `200`
   with `Cache-Control: immutable` (media pipeline alive).
4. Log in with a seeded demo account (seed output / `scripts/add-admin.ts`
   if a fresh admin is needed); check the RFQ list renders.
5. Record the recovery in `worklog.md`.

## 6. Observability

- **`dev.log`** (repo root) is the only runtime log — created by the `dev`
  script's `| tee dev.log` while the server runs. It does not exist while the
  server is down (its absence is itself a signal). Read the **tail only**;
  it grows unboundedly. Grep targets:
  - Prisma/driver failures — `error`, `Can't reach database server`,
    `P1001`.
  - Route handler 500s — `error` next to a URL; route handlers also
    `console.error` with context (e.g. `login error`, `upload error`).
  - React **hydration mismatch** warnings — `Hydration failed`,
    `did not match` — treat as UI bugs, not noise.
- **AuditLog** (DB table, admin console "Audit" tab) is the business audit
  trail: `actorId/actorType (USER|SELLER|ADMIN|SYSTEM)/action/entityType/
  entityId/summary/metadata Json` (`prisma/schema.prisma:660-674`). Payout
  generation, vendor lifecycle, settings changes, etc. call `recordAudit`
  (`src/server/modules/audit/service.ts`; consumers include payouts,
  vendors, payments, rfq, disputes, settings, price-lists, coupons,
  approvals, customer-groups services).
- **`screenshots/`** convention: each feature/QA task keeps a numbered
  folder of browser screenshots as evidence (e.g. `upload1/`,
  `restore2/`, `5b/`, `enforce1/`, `history/qa-r10-*`). New tasks follow
  `<task>-seq-description.png`.
- **Alerting: none.** No metrics, no uptime checks. Availability is enforced
  by whoever is driving the loop noticing a dead endpoint.

## 7. Routine ops tasks

### 7.1 Payout generation & mark-paid (admin)

1. Admin console → Payouts tab. Configure commission via the payouts config
   (platform default percent, 0–90, zod-validated —
   `src/server/modules/payouts/service.ts:46-57`; per-vendor override lives
   on `User.commissionRate`).
2. Preview per seller: unsettled items where the order's payment is
   `SUCCEEDED`, order not `CANCELLED`, `OrderItem.payoutId IS NULL`
   (`previewPayout`, service lines 75-111).
3. Generate: creates one `Payout` row (`PY-…` number from the Sequence
   service) inside a transaction that re-selects and stamps the items
   (`generatePayout`, service lines 113+). Status starts `PENDING`.
4. Mark-paid (admin route `…/payouts/[id]/mark-paid`) sets `PAID` + `paidAt`;
   `…/cancel` is the reverse. The platform moves no money (D-002) — the
   payout row is the record of an external settlement.

### 7.2 Dispute escalation watch

- Disputes flow `OPEN → SELLER_RESPONDED → ESCALATED → RESOLVED/CLOSED`
   (`src/server/modules/rfq/disputes.ts:37`). Admins should watch the
   disputes tab for rows sitting in `ESCALATED`.
- The verification panel's `autoSuspendAfterDisputes` threshold auto-revokes
   seller verification (sets `verifiedAt = null`) once open disputes pass the
   configured count (`disputes.ts:423-430`) — check the sellers list for
   silently un-verified vendors after dispute spikes.

### 7.3 Media cleanup

Deleting an uploaded asset is blocked with **409** while it is referenced by
any product (`images`/variant `image` JSON) or appears in past order item
snapshots (`src/app/api/uploads/[id]/route.ts:27-47`). Only the owner or an
ADMIN may delete (403 otherwise). Practical consequence: cleanup of orphaned
media is a manual, reference-checked operation — there is no bulk GC job.
`scripts/cleanup-uploads.ts` exists for targeted sweeps.

### 7.4 Settings rollback

RFQ settings changes are append-only: every field mutation is a `SettingChange`
row; rollback restores `oldValue` and is itself logged (`rollbackOfId`
chain, `prisma/schema.prisma:727-745`). Procedure: admin console → RFQ
Settings → history dialog → rollback. Values are cached for 120 s
(`src/server/modules/settings/service.ts`, `ttlMs: 120_000`) — expect up to
two minutes before a rollback is visible everywhere.

## 8. Incident playbooks (P0 matrix)

| # | Symptom | Likely cause | Procedure |
|---|---|---|---|
| P0-1 | `dev.log` absent / `:3000` connection refused | Dev server not running (reaped or crashed) | §3.2 restart (MySQL must be up first). Check the `dev.log` tail of the previous incarnation if it rolled over for a crash reason. |
| P0-2 | Prisma `Can't reach database server at "127.0.0.1:3306"` in `dev.log` | MySQL down or wiped | §5.5 full recovery runbook (if `/home/z/mysql` is gone) or `bash /home/z/mysql/start-mysql.sh` + password/DB check (if only stopped). |
| P0-3 | Uploads/media serving broken; module-not-found for `./local-disk` | **Known P0:** `src/lib/storage/local-disk.ts` missing from disk after an environment reset — `src/lib/storage/index.ts:2` imports it. **Verified 2026-09: the file is NOT in git history** (`git log -- src/lib/storage/local-disk.ts` is empty — the `.gitignore` exception at line 45 was added but the file was never committed), so `git checkout` CANNOT restore it. | Rebuild the adapter against its contracts: `StorageAdapter` interface (`src/lib/storage/types.ts`), the key scheme `{YYYY/MM}/{sha256[0..8]}-{6 rand}` + rendition roles thumb/medium/large/full (`src/lib/storage/index.ts:36-50`), and the callers in `api/uploads` / `api/media/[...key]` (containment: keys must be validated against traversal — reject `..`, absolute paths, and any key escaping the storage root; `exists`/`absolutePath` per `types.ts`). Then **commit it immediately** (`git add -f src/lib/storage/local-disk.ts` + commit) so the exception at `.gitignore:45` finally has a tracked file to protect. Until then, uploads/media are DOWN. |
| P0-4 | Prisma uses SQLite / errors about `file:…custom.db` | Stale `DATABASE_URL` injected by the tool shell | Inline the real MySQL `DATABASE_URL` on every command that spawns Prisma or the server (§2, §3.2). |
| P0-5 | Upload returns `413` | File > 8 MB (`UPLOAD_LIMITS.maxBytes`, `src/lib/storage/image-pipeline.ts:15`) | Not a bug. Re-encode or pick a smaller source; the limit is policy. |
| P0-6 | Upload returns `415` | Magic-byte sniff failed — not JPEG/PNG/GIF/WEBP bytes (`sniffImageMime`, `image-pipeline.ts:26-41`) | Not a bug. The declared Content-Type is never trusted; supply a real image. |
| P0-7 | Upload returns `422` | Every file in the batch failed processing (route returns 422 when zero assets stored, `src/app/api/uploads/route.ts:92-95`) | Read the per-file `errors[]` in the response body; map entries to 413/415/400 causes. |
| P0-8 | Upload returns `400` | No file / not multipart / > 6 files per request (`uploads/route.ts:37-41`) | Client-side fix; check the media tab request payload. |
| P0-9 | Hydration mismatch warnings flood `dev.log` | Server/client render divergence (usually a browser-extension-modified DOM or a time/random value in render) | Reproduce with the specific page from the screenshots convention; fix the component; do not ignore. |

## 9. Release / deploy notes

- **Single-node reality.** One box, one dev process, one MySQL, one Caddy. The
  in-memory caches (`src/lib/cache.ts`, TTL 5 min, tagged; the rate-limit
  buckets; the settings 120 s cache) are all single-process by design.
- **Deployment model: git.** A "release" is a commit on the main branch of
  this checkout. There is no CI, no registry, no staging. The standalone
  output (`next build` + `bun .next/standalone/server.js`) is defined in
  `package.json` "build"/"start" for a future real host but is **not
  exercised** here (D-007).
- **Commit convention:** `<TASK-ID>: description` — e.g. `PLATFORM-1: …`,
  `QA-R8: …`, `DASH-2: …` (from `git log --oneline`). Some commits land with
  bare UUID subjects (tool-driven sessions); prefer the TASK-ID form.
- **Shared-file rule (D-010):** `team/*.md` shared state files are
  Lead-written; workers append to `worklog.md` only. Keep this doc's edits
  within that agreement.
- **Definition of done includes E2E:** agent-browser suites (D-008, baseline
  60 tests / 4 files) plus the screenshot evidence convention in §6.

## 10. Runbook checklist template for future modules

Copy this block into the module plan and fill it in before launch:

```
Module: <name>                     Task ID: <TASK-ID>
[ ] Schema: prisma/schema.prisma edited; additive-only review done
[ ] bun run db:generate            (client types refreshed)
[ ] bun run db:push                (destructive-diff check: additive only?)
[ ] Seed script updated + run       (bun run db:seed / dedicated seeder)
[ ] Auth guards: requireUser / requireAdmin / role checks on new routes
[ ] Org-scope: membership enforced in every service query (D-005 module)
[ ] CSRF: assertSameOrigin on every new POST/PUT/PATCH/DELETE route
[ ] Rate limit: policy added to RATE_LIMITS + wired via enforceRateLimit
[ ] Validation: zod schema at the route boundary; Prisma for all queries
[ ] Audit: recordAudit on every state transition worth reviewing
[ ] Settings: RfqSetting panel + SettingChange history + rollback tested
[ ] Recovery: does this module need anything beyond db:push+seed? (if yes,
      extend scripts/recovery/README.md)
[ ] E2E: agent-browser suite + screenshots/<task>/ evidence
[ ] worklog.md appended; commit as "<TASK-ID>: description"
```

### Financier module launch checklist (from `team/FINANCIER_SCHEMA.md` v4.0
and `team/FINANCIER_PLAN.md` — module not yet built, this is the pre-flight)

```
[ ] Financier domain models pushed (db:generate + db:push, additive)
[ ] User applicant columns + AccountDocument vault live (PII columns nullable)
[ ] Seed financiers (bun run db:seed extension or dedicated seeder)
[ ] RfqSetting: financing panels configured (platform scope first)
[ ] Payouts-style admin surfaces: fee ACCRUED → INVOICED → PAID transitions
[ ] FinancingEvent ledger is TRACK-ONLY (D-002: no money on platform)
[ ] Consent evidence: consentAt captured on wizard submit
[ ] Document access control: financier staff see KYC docs only for requests
    routed to them; admin override; verification statuses + reviewer recorded
[ ] Wizard E2E verified via agent-browser (3-step flow) + screenshots
[ ] PII review against team/docs/09-security-threat-model.md §8
      (minimization, retention proposal, Arabic-market users note)
```
