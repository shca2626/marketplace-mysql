# MySQL Migration Runbook — SQLite (dev) → InfinityFree MariaDB (prod)

| Method | Status |
| --- | --- |
| **B — Automated sync (`bun run mysql:sync`)** | ✅ **PRIMARY — PROVEN, in daily use** |
| A — Direct external MySQL connection | ⛔ **BLOCKED by provider policy** (archived below for a future remote-access provider) |

Toolkit built in task **MYSQLTOOL-1**, the import bridge in **BRIDGE-1**, the
one-command automation in **SYNC-1**. The local dev server keeps running on SQLite
(`DATABASE_URL` in `.env`, file `db/custom.db`) — nothing in this runbook touches
it. Every method only ever READS SQLite and WRITES the remote MySQL/MariaDB
database.

## Toolkit map

| File | Role |
| --- | --- |
| `scripts/mysql-sync.ts` | **The one-command pipeline (`bun run mysql:sync`) — Method B.** Writes `db/mysql-sync-result.json`. |
| `src/lib/infinityfree-client.ts` | Provider quirks as code: slowAES `__test` anti-bot challenge solver, browser-UA JSON fetch helper, curl-based FTP upload. Used by `mysql:sync`. |
| `import.php` (project root, gitignored) | Token-gated PHP import bridge living on the host: schema import, resumable ≤512 KB-chunk data import, status, cleanup. Contains DB credentials — never commit. |
| `scripts/dump-sqlite-to-sql.ts` | SQLite → plain-SQL dump (`bun run mysql:dump`) → `db/vendora-mysql-data.sql` + `db/sqlite-manifest.json`. Phase 2 of the sync. |
| `prisma/schema.mysql.prisma` | The 52-model schema transpiled for MySQL (datasource reads `MYSQL_DATABASE_URL`). Used by the sync's schema phase (via `prisma migrate diff`) and by `mysql:push`. Header documents every dialect fix. |
| `src/lib/mysql-check.ts` / `scripts/mysql-check.ts` | Shared connectivity core + CLI check (`bun run mysql:check`) → `db/mysql-check-result.json`. Also powers `/api/admin/stats?mysql=1`. |
| `scripts/migrate-sqlite-to-mysql.ts` | Direct data migration (`bun run mysql:migrate`) — Method A tooling. Writes `db/mysql-migrate-result.json`. |
| `package.json` scripts | `mysql:sync`, `mysql:dump`, `mysql:check`, `mysql:migrate`, `mysql:push`. |

---

## Method B — Automated sync (PROVEN, in daily use)

### One command

```sh
bun run mysql:sync
```

**Requires nothing manual** — no IP whitelisting, no phpMyAdmin, no browser
clicking, no schema file juggling. The pipeline runs five phases end-to-end:

1. **Schema** — generates the MySQL DDL via
   `bunx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.mysql.prisma --script`,
   then post-processes it: a `SET NAMES utf8mb4;` + `SET FOREIGN_KEY_CHECKS=0;`
   preamble, a `DROP TABLE IF EXISTS \`X\`;` line for **every** table (idempotent
   re-import), and ` ENGINE=InnoDB` appended to every `CREATE TABLE` closing line
   (a line-state machine guarantees the `AddForeignKey` ALTERs are never touched).
2. **Data** — spawns `bun run mysql:dump` (SQLite → one-line `INSERT IGNORE`
   statements in FK-safe order, capped at 500 rows / ~750 KB per statement), then
   verifies the dump + `db/sqlite-manifest.json` freshness by mtime so a silently
   failed dump can never be uploaded.
3. **Upload** — FTP to `ftpupload.net` → `/htdocs/`: `import.php` (re-uploaded
   every run — self-healing), `vendora-mysql-schema.sql`,
   `vendora-mysql-data.sql`, and a **zeroed** `import-progress.txt` (every table
   was just dropped + re-created, so the data import must restart at byte 0).
4. **Import** — drives the token-gated `import.php` over **HTTPS** with a
   **browser User-Agent**, the **solved `__test` anti-bot cookie** (slowAES
   challenge, cached for the process), and **`json=1`**: the schema phase once,
   then the data phase in resumable ≤512 KB chunks (≤60 requests) until done,
   then a status read. A failing statement is surfaced verbatim.
5. **Verify** — live MySQL table counts vs the SQLite manifest: every non-empty
   table must match **exactly** (tables absent from the dump with manifest count 0
   are OK; the 2 implicit m2m tables are MySQL-only and informational). Writes
   **`db/mysql-sync-result.json`** (ranAt, mode, per-phase results, server, full
   per-table comparison, totals) even on failure. Exit code 0/1.

A failed run is simply re-runnable — `DROP` + `CREATE` + `INSERT IGNORE` make the
pipeline convergent; there is nothing to clean up between attempts.

### Flags

| Flag | Effect |
| --- | --- |
| `--status-only` | status + verification only (no schema/data push); tolerates a missing manifest with a warning |
| `--skip-data` | schema only — verification degrades to a table presence check |

### Verified result (latest full run)

- **52/52 tables in sync · 685 rows · MariaDB 11.4.13** (at `sql301.byet.org`) · **~18 s** end-to-end.
- `_UserCustomerGroups` / `_OrganizationCustomerGroups` sit on MySQL with 0 rows **by design** (implicit m2m tables, not in the dump registry).
- Machine-readable report: `db/mysql-sync-result.json` (per-table comparison included).

### InfinityFree caveats (already baked into the pipeline)

- **curl/wget User-Agents are TLS-dropped at the edge** — every HTTPS call uses a browser UA. (`?json=1` still forces JSON output regardless of UA, so machine callers get JSON through the browser-UA requirement.)
- **Images with real image bytes serve fine** from `htdocs/storage/` (public URLs `https://yusr.site.je/storage/<file>`), but **fake-image-content files get auto-chmodded 000 — permanently** (permanent edge-cached 403, unrecoverable). Never upload anything that is not a genuine image; the app's storage driver validates extension + magic bytes before any FTP touch.
- **30-day edge cache** — 200/403 responses are cached for 30 days: file names must never be reused (uploads use unique `ts-rand` names).
- **MyISAM 1000-byte index limit** — long utf8mb4 columns blow past it, so ` ENGINE=InnoDB` is enforced on every `CREATE TABLE` by the sync's post-processing.
- **External MySQL is refused by policy regardless of the Remote MySQL whitelist** — that is exactly why Method B tunnels through PHP-on-their-host instead of a direct connection. See Method A.

### When to run it — STANDING RULE

Run `bun run mysql:sync` **after ANY Prisma schema change and after ANY seed /
data change**. This is now a standing rule for **all future dev rounds and the
15-min autonomous cron**: any round that edits `prisma/schema.prisma` (and its
`prisma/schema.mysql.prisma` twin), reseeds, or otherwise changes `db/custom.db`
must end with `bun run mysql:sync` and a green `db/mysql-sync-result.json`
(52/52 tables matching).

---

## Method A — Direct external MySQL — ⛔ BLOCKED BY PROVIDER POLICY

> **Do not attempt this against InfinityFree.** The free tier refuses MySQL
> connections from outside their hosting, **regardless of the Remote MySQL
> whitelist**: the server answers the TCP + MySQL handshake
> (`sql301.byet.org` / `185.27.134.24`) and then fails auth
> (`ER_ACCESS_DENIED_ERROR`) for every external client IP. InfinityFree staff
> (forum): *"You cannot connect to a free hosting MySQL database from outside
> your hosting account."* `sql301.infinityfree.com` itself has **no public DNS
> record**. The steps below are archived for a future provider that genuinely
> allows remote MySQL (Aiven free tier, Railway, a small VPS…) — with such a
> provider they work as written.

### The endpoint problem (read first)

`.env` contains `MYSQL_HOST=sql301.infinityfree.com` and a
`MYSQL_DATABASE_URL` using that hostname — **`sql301.infinityfree.com` has no
public DNS record** and will never connect from outside. The same InfinityFree
MySQL server is reachable at:

1. `sql301.byet.org` (the byet.org alias — resolves publicly)
2. `185.27.134.24` (its IP)

Both scripts therefore try, **in order**: `$MYSQL_HOST` (only if it resolves),
then `sql301.byet.org`, then `185.27.134.24`, and report which endpoint worked.
`prisma db push` cannot do that (it reads a plain URL), so step 2 below
overrides `MYSQL_DATABASE_URL` inline with the byet.org host.

> Permanent fix (recommended once verified): edit `.env` to
> `MYSQL_HOST=sql301.byet.org` and change the host inside
> `MYSQL_DATABASE_URL` to `sql301.byet.org`. `.env` is gitignored; the
> running dev server is unaffected (it only reads `DATABASE_URL`).

### The DATABASE_URL injection caveat

The host shell auto-injects a **SQLite** `DATABASE_URL` as a real environment
variable, which overrides `.env` for any Prisma command that reads it.
`schema.mysql.prisma` deliberately reads **`MYSQL_DATABASE_URL`**, so the
auto-injection cannot hurt it — but any command you write against
`prisma/schema.prisma` (the SQLite one) still sees the injected value, which is
what you want for dev. If you ever need to point a command at MySQL through
`DATABASE_URL`, you must set it explicitly inline, e.g.:

```sh
DATABASE_URL="mysql://if0_43035558:325631NMB@sql301.byet.org:3306/if0_43035558_yusr_marketplace" npx prisma db push --schema prisma/schema.mysql.prisma --skip-generate
```

`--skip-generate` is **required**: without it, `prisma db push` regenerates the
Prisma client and would clobber the SQLite client in `node_modules/@prisma/client`
that the running dev server uses. (`schema.mysql.prisma` also pins a custom
generator `output` as a second safety net.)

### Commands, in order (Method A, archived)

#### Step 0 — prerequisites

- Remote MySQL is **enabled** in the provider's client area (MySQL → Remote
  MySQL) — done by the account owner.
- `.env` contains the `MYSQL_*` block (it does).
- You know this machine's public IP — if auth fails, it must be whitelisted
  in the same Remote MySQL panel.

#### Step 1 — connectivity check

```sh
bun run mysql:check
```

Read the report: which endpoint won, `VERSION()` (expect MariaDB ~10.x),
`DATABASE()`, `CURRENT_USER()`, `character_set_server`, table count,
`max_allowed_packet`, `wait_timeout`. Full JSON lands in
`db/mysql-check-result.json` (so shell-less sessions can read it too).

Failure decoding:

| Error | Meaning | Fix |
| --- | --- | --- |
| `ER_ACCESS_DENIED_ERROR` (1045) | Server answered, refused this client. The message embeds `'user'@'<client IP>'`. | Add that exact IP to the Remote MySQL whitelist in the provider panel, then retry. On InfinityFree this does NOT help — provider policy blocks all external clients. |
| `ER_HOST_NOT_PRIVILEGED` (1130) | Host not allowed to connect. | Same — whitelist the client IP. |
| `ENOTFOUND` on every host | DNS/network issue. | Check outbound network; try the IP endpoint. |
| `CHECK_TIMEOUT` | Chain too slow. | Retry; report says which endpoints were tried. |

Exit code `0` = reachable + authenticated. Do not proceed until this passes.

#### Step 2 — push the MySQL schema (creates the 52 tables)

> `prisma db push` creates TABLES, not the database — `if0_43035558_yusr_marketplace`
> must already exist (it does: created via the hosting panel).

```sh
MYSQL_DATABASE_URL="mysql://if0_43035558:325631NMB@sql301.byet.org:3306/if0_43035558_yusr_marketplace" \
  bun run mysql:push
```

(`bun run` auto-loads `.env`, so `$MYSQL_DATABASE_URL` inside the script
expands; the inline var overrides the unresolvable `.env` host. Once `.env` is
fixed to byet.org, plain `bun run mysql:push` works.)

Success looks like: the generated SQL DDL scrolls past (52 `CREATE TABLE`
statements), then `🚀 Your database is now in sync with your schema.` This runs
`prisma db push --schema prisma/schema.mysql.prisma --skip-generate`.

If the DDL fails on `DEFAULT` for a `TEXT` column (`Product.images`), the
server predates MariaDB 10.2 — check `VERSION()` from step 1, then remove that
one `@default("[]")` and re-push (the data migration supplies values anyway).

#### Step 3 — re-check

```sh
bun run mysql:check
```

`tables in schema: 52` now. (0 = push didn't land; >52 = leftovers from an
older attempt — see Rollback.)

#### Step 4 — dry-run the data migration (recommended)

```sh
bun run mysql:migrate --dry-run      # bun forwards flags after the script name
# equivalent, runs the file directly:
bun scripts/migrate-sqlite-to-mysql.ts --dry-run
```

Prints, per table, the SQLite row count in FK-safe order — no writes. Confirm
the numbers look sane, then:

#### Step 5 — migrate the data

```sh
bun run mysql:migrate
```

- Reads via the EXISTING generated `@prisma/client` (SQLite). Never generates a
  client, never writes SQLite.
- Orders tables topologically from the live `information_schema` FK graph
  (fallback: the FK-safe model order embedded in the script).
- Batched `INSERT IGNORE` (500 rows/batch) — idempotent; re-runs skip rows that
  already exist. Duplicate keys do NOT fail the run.
- Writes `db/mysql-migrate-result.json` (per-table rows, batches, durations,
  warnings, endpoint, order strategy).
- Filter with `--tables=User,Category,Product` for partial migrations — beware
  FK parents must be included for children to insert.

Success looks like: per-table `✓ <Table> <N> rows · k batch(es) · N inserted`
lines and a summary `Migration complete: 52 tables · N source rows · N
inserted · endpoint sql301.byet.org · order information_schema-topological`.

Failure modes worth knowing:

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Data too long for column` | A value exceeds `VARCHAR(191)` on a field we kept short. | Promote that column to `@db.Text` in `schema.mysql.prisma`, re-run `mysql:push`, re-run migration. |
| FK constraint error on a table | Source rows reference a parent that failed to migrate. | Fix the parent's error first; the run stops at the first failure by design. |
| `ER_DBACCESS_DENIED_ERROR` | User lacks privileges. | Provider panel → reassign DB user. |

#### Step 6 — verify

```sh
bun run mysql:check
```

Or, signed in as an ADMIN in the app: `GET /api/admin/stats?mysql=1` (same
diagnostics, JSON, 30s cap, 10 calls/10 min per admin). The migration result
JSON also carries a target-side row count per table (`targetRows`) you can
diff against SQLite counts.

---

## Rollback story

There is nothing to roll back on the SQLite side — it is opened read-only and
`db/custom.db` is never modified. The dev server never left SQLite. To undo the
MySQL side:

- **Method B (primary):** re-run `bun run mysql:sync` — the `DROP TABLE IF
  EXISTS` preamble recreates everything; the pipeline is convergent by design.
  Or delete the tables via the hosting panel's phpMyAdmin.
- **Method A tooling (remote providers):** drop everything via phpMyAdmin, or
  `MYSQL_DATABASE_URL="mysql://…@sql301.byet.org:3306/…" npx prisma db push --force-reset --schema prisma/schema.mysql.prisma --skip-generate`
  (**destroys the remote DB only**).
- Re-migrate any time: Method B is one command; Method A is step 2 (no-op when
  in sync) + step 5 (idempotent).

## Switching the app to MySQL later (Phase 3)

The generated Prisma client is **provider-bound**: a client generated from the
SQLite schema cannot talk to MySQL. When you decide to switch:

1. Replace `prisma/schema.prisma` with the MySQL dialect version (i.e. make
   `schema.mysql.prisma` the canonical schema — keep git history).
2. Point `DATABASE_URL` in `.env` at the MySQL server
   (`mysql://if0_43035558:…@sql301.byet.org:3306/if0_43035558_yusr_marketplace`).
3. `npx prisma generate` (regenerates `@prisma/client` for MySQL — stop the dev
   server first, restart after).
4. The toolkit's `MYSQL_*` vars keep working unchanged.
5. Caveat: the app must then run somewhere that can reach the MySQL server —
   not on the InfinityFree free tier (PHP-only hosting, no Node.js; external
   MySQL clients refused — see Method A). Until the app is re-hosted, SQLite
   stays the dev/runtime DB and `mysql:sync` keeps the remote copy current.

## InfinityFree-specific warnings

- **No external MySQL by policy**: the Remote MySQL whitelist does NOT help —
  see Method A. All MySQL access happens through PHP on their host
  (Method B) or their phpMyAdmin panel.
- **No Node.js hosting on their free tier**: the app itself must run elsewhere
  (see worklog PRODENV-1); only the database and static files live on
  InfinityFree.
- **Edge behavior**: curl/wget UAs TLS-dropped (always browser UA); 30-day
  cache of 200/403 responses (never reuse filenames); fake-image-content files
  auto-chmodded 000 permanently (real images serve fine from `htdocs/storage/`).
- **Hostnames**: `sql301.infinityfree.com` does not resolve publicly. Use
  `sql301.byet.org` (or `185.27.134.24`) everywhere outside their panel.
- **Quota**: ~400 MB per database. The demo dataset is tiny, but watch it if you
  import media metadata blobs; `AuditLog.metadata` / `PlatformSetting.value` /
  `RfqSetting.value` are `MEDIUMTEXT` (16 MB each).
- **MariaDB quirks**: server is MariaDB (verified 11.4.13), not MySQL — Prisma
  prints a "MariaDB is not officially supported" warning; it is safe to ignore
  for this workload. `JSON` is a `LONGTEXT` alias on MariaDB (our schema has
  zero `Json` columns — JSON is stored in String columns by design). `TEXT
  DEFAULT` requires MariaDB ≥ 10.2. Charset is utf8mb4; connection forces
  `UTF8MB4_UNICODE_CI`. MyISAM's 1000-byte index limit is why every table is
  forced to `ENGINE=InnoDB`.
- **Free tier limits**: `max_allowed_packet` / `wait_timeout` are reported by
  `mysql:check` — the sync keeps statements ≤512 KB and batches capped at 500
  rows to stay well under the limits.

## `schema.mysql.prisma` deviations from `schema.prisma` (all additive)

1. `@db.Text` / `@db.MediumText` on long-content String columns (the header of
   the file lists the rule; every annotation is commented inline).
2. **22 single-column `@@index` additions** marked `MYSQL-FK-INDEX` — MySQL
   requires every FK column to be the leftmost column of an index and Prisma
   rejects the schema otherwise (SQLite relies on implicit FK indexes). Indexes
   only; no relation/default/unique was changed.
3. Generator `output` pinned to `node_modules/.prisma/client-mysql` so an
   accidental `prisma generate` can never clobber the live SQLite client.
