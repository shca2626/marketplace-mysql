# MySQL Migration Runbook — SQLite (dev) → InfinityFree MariaDB (prod)

Toolkit built in task **MYSQLTOOL-1**. The local dev server keeps running on
SQLite (`DATABASE_URL` in `.env`, file `db/custom.db`) — nothing in this runbook
touches it. Every step below only ever READS SQLite and WRITES the remote
MySQL/MariaDB database.

## Toolkit map

| File | Role |
| --- | --- |
| `prisma/schema.mysql.prisma` | The 52-model schema transpiled for MySQL (datasource reads `MYSQL_DATABASE_URL`). Used by `mysql:push` ONLY. Header documents every dialect fix. |
| `src/lib/mysql-check.ts` | Shared connectivity core: endpoint fallback chain, mysql2 connection, server diagnostics. Used by the CLI script, the migration script, and `/api/admin/stats?mysql=1`. |
| `scripts/mysql-check.ts` | CLI connectivity check (`bun run mysql:check`). Writes `db/mysql-check-result.json`. |
| `scripts/migrate-sqlite-to-mysql.ts` | Data migration (`bun run mysql:migrate`). Writes `db/mysql-migrate-result.json`. |
| `package.json` scripts | `mysql:check`, `mysql:migrate`, `mysql:push`. |
| `GET /api/admin/stats?mysql=1` | Admin-guarded in-app diagnostics (same check, 30s timeout, own rate-limit bucket). |

## The endpoint problem (read first)

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

## The DATABASE_URL injection caveat

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

## Commands, in order

### Step 0 — prerequisites

- Remote MySQL is **enabled** in the InfinityFree client area (MySQL → Remote
  MySQL) — done by the account owner.
- `.env` contains the `MYSQL_*` block (it does).
- You know this machine's public IP — if auth fails, it must be whitelisted
  in the same Remote MySQL panel.

### Step 1 — connectivity check

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
| `ER_ACCESS_DENIED_ERROR` (1045) | Server answered, refused this client. The message embeds `'user'@'<client IP>'`. | Add that exact IP to the Remote MySQL whitelist in the InfinityFree panel, then retry. |
| `ER_HOST_NOT_PRIVILEGED` (1130) | Host not allowed to connect. | Same — whitelist the client IP. |
| `ENOTFOUND` on every host | DNS/network issue. | Check outbound network; try the IP endpoint. |
| `CHECK_TIMEOUT` | Chain too slow. | Retry; report says which endpoints were tried. |

Exit code `0` = reachable + authenticated. Do not proceed until this passes.

### Step 2 — push the MySQL schema (creates the 52 tables)

> `prisma db push` creates TABLES, not the database — `if0_43035558_yusr_marketplace`
> must already exist (it does: created via the InfinityFree panel).

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

### Step 3 — re-check

```sh
bun run mysql:check
```

`tables in schema: 52` now. (0 = push didn't land; >52 = leftovers from an
older attempt — see Rollback.)

### Step 4 — dry-run the data migration (recommended)

```sh
bun run mysql:migrate --dry-run      # bun forwards flags after the script name
# equivalent, runs the file directly:
bun scripts/migrate-sqlite-to-mysql.ts --dry-run
```

Prints, per table, the SQLite row count in FK-safe order — no writes. Confirm
the numbers look sane, then:

### Step 5 — migrate the data

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
| `ER_DBACCESS_DENIED_ERROR` | User lacks privileges. | InfinityFree panel → reassign DB user. |

### Step 6 — verify

```sh
bun run mysql:check
```

Or, signed in as an ADMIN in the app: `GET /api/admin/stats?mysql=1` (same
diagnostics, JSON, 30s cap, 10 calls/10 min per admin). The migration result
JSON also carries a target-side row count per table (`targetRows`) you can
diff against SQLite counts.

## Rollback story

There is nothing to roll back on the SQLite side — it is opened read-only and
`db/custom.db` is never modified. The dev server never left SQLite. To undo the
MySQL side:

- Drop everything: InfinityFree phpMyAdmin → select the database → drop all
  tables, or `MYSQL_DATABASE_URL="mysql://…@sql301.byet.org:3306/…" npx prisma db push --force-reset --schema prisma/schema.mysql.prisma --skip-generate`
  (**destroys the remote DB only**).
- Re-migrate any time: step 2 (no-op when in sync) + step 5 (idempotent).

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

## InfinityFree-specific warnings

- **Client IP whitelist**: Remote MySQL must include THIS machine's public IP —
  the error message tells you the exact IP. Home/office IPs change; re-whitelist
  when auth suddenly fails again.
- **Hostnames**: `sql301.infinityfree.com` does not resolve publicly. Use
  `sql301.byet.org` (or `185.27.134.24`) everywhere outside their panel.
- **Quota**: ~400 MB per database. The demo dataset is tiny, but watch it if you
  import media metadata blobs; `AuditLog.metadata` / `PlatformSetting.value` /
  `RfqSetting.value` are `MEDIUMTEXT` (16 MB each).
- **MariaDB quirks**: server is MariaDB ~10.x, not MySQL — Prisma prints a
  "MariaDB is not officially supported" warning; it is safe to ignore for this
  workload. `JSON` is a `LONGTEXT` alias on MariaDB (our schema has zero `Json`
  columns — JSON is stored in String columns by design). `TEXT DEFAULT`
  requires MariaDB ≥ 10.2. Charset is utf8mb4; connection forces
  `UTF8MB4_UNICODE_CI`.
- **Free tier limits**: `max_allowed_packet` / `wait_timeout` are reported by
  `mysql:check` — batches are capped at 500 rows to stay well under the packet
  limit; long-running jobs must finish within `wait_timeout` (the one-shot
  migration does).
- **No Node.js hosting on their free tier**: the app itself must run elsewhere
  (see worklog PRODENV-1); only the database is intended to live on InfinityFree.

## `schema.mysql.prisma` deviations from `schema.prisma` (all additive)

1. `@db.Text` / `@db.MediumText` on long-content String columns (the header of
   the file lists the rule; every annotation is commented inline).
2. **22 single-column `@@index` additions** marked `MYSQL-FK-INDEX` — MySQL
   requires every FK column to be the leftmost column of an index and Prisma
   rejects the schema otherwise (SQLite relies on implicit FK indexes). Indexes
   only; no relation/default/unique was changed.
3. Generator `output` pinned to `node_modules/.prisma/client-mysql` so an
   accidental `prisma generate` can never clobber the live SQLite client.
