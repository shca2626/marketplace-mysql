# Audit integrity (lastplan v5 §6.11 — A10)

The AuditLog is the platform's trust substrate. This document specifies the
atomicity discipline, the drift guards, and the DB-level tamper mitigation —
and how each is proven.

## 1. Two-tier write discipline

| Path | For | Failure behavior |
|---|---|---|
| `recordAuditTx(tx, entry)` | **Sensitive actions only** — written INSIDE the business transaction | **Throws** → the whole transaction rolls back. A sensitive change either lands WITH its audit row or does not land at all. No silent skip. |
| `recordAudit(entry)` | Non-sensitive telemetry (logins, views, ordinary commerce events) | Logged and swallowed — telemetry must never break a business flow. **Refuses sensitive actions outright (fail-closed).** |

The authoritative sensitive-action set lives in ONE place:
`SENSITIVE_AUDIT_ACTIONS` in `src/server/modules/audit/service.ts` (34 actions
at the time of writing). It mirrors the lastplan 6.7.5 enumeration:

- **Role grants & changes** — `ROLE_CREATED/UPDATED/DELETED`, `ROLE_ASSIGNED`, `ROLE_REVOKED`, `STAFF_INVITED`, `STAFF_INVITATION_REVOKED`
- **Payouts** — `PAYOUT_GENERATED`, `PAYOUT_PAID`, `PAYOUT_CANCELLED`
- **KYC & document verification** — `DOCUMENT_VERIFIED/REJECTED`, `ACCOUNT_DOCUMENT_DELETED`, `REQUIREMENT_VERIFIED/REJECTED/WAIVED`
- **Module & platform-policy changes** — `MODULE_ENABLED/DISABLED`, `MODULE_ACTIVATION_REMOVED`, `MFA_PLATFORM_POLICY_CHANGED`, `MFA_ACCOUNT_REQUIREMENT_CHANGED`, `SETTINGS_UPDATED`, `SETTINGS_OVERRIDE_DELETED`, `SETTINGS_ROLLBACK`
- **Credential administration** — `MFA_ENROLLED`, `MFA_DISABLED`, `MFA_BACKUP_CODES_REGENERATED`, `MFA_BACKUP_CODE_USED`, `MFA_ADMIN_RESET`, `USER_PASSWORD_CHANGED`, `USER_PASSWORD_RESET`, `USER_SESSIONS_REVOKED`, `SESSION_REVOKED`, `SESSIONS_REVOKED_OTHERS`

Coverage additions shipped with 6.11: self-service session revocation
(single + "other devices") now writes `SESSION_REVOKED` / `SESSIONS_REVOKED_OTHERS`
atomically with the registry update (previously un-audited).

## 2. Drift guards (three independent layers)

1. **Runtime (fail-closed):** `recordAudit()` throws `FATAL: "<ACTION>" is a
   sensitive action` if a sensitive action ever travels the swallow path.
2. **Static (guard-lint, CI):** `scripts/check-guards.ts` failure condition #6
   parses `SENSITIVE_AUDIT_ACTIONS` from the audit service source (single source
   of truth — the lint can never go stale) and scans **every** TS/TSX file
   under `src/` for `recordAudit({ … action: '<SENSITIVE>' })` patterns.
   Verified by probe: an injected violation fails the lint; removal passes.
3. **Behavioral (failure-injection):** `bun scripts/audit-atomicity.ts` —
   the six-case suite below.

## 3. Failure-injection suite (`scripts/audit-atomicity.ts`)

| Case | Proves |
|---|---|
| ATOM-01 | A poisoned audit INSERT inside a business transaction rolls the **whole** transaction back — no orphan business row, no silent skip |
| ATOM-02 | The audit row is visible on the transaction connection (same-tx write); deliberate rollback leaves **zero** rows (the suite is non-polluting) |
| ATOM-03 | `recordAudit()` refuses a sensitive action at runtime |
| ATOM-04 | A failing **non-sensitive** audit write is still swallowed (telemetry rule intact) |
| ATAM-05 | `UPDATE` on a real AuditLog row is blocked at the **database** level (SQLSTATE 45000) |
| ATAM-06 | Both append-only triggers are present (information_schema inventory) |

Last run: **6/6 passed** (dev sandbox, Aiven MySQL `mysql-marketplace-sunsolar1`).

## 4. DB-level tamper mitigation (6.11.3)

**Live control — append-only triggers.** `scripts/sql/audit-append-only.sql`
installs `AuditLog_block_update` / `AuditLog_block_delete` (BEFORE UPDATE /
BEFORE DELETE, `SIGNAL SQLSTATE '45000'` unless the per-connection session
variable `@vendora_audit_maintenance` is set). The block applies to **every**
user, including `avnadmin` — the app's own credentials cannot rewrite history.

- Re-apply after any `prisma db push` that *recreates* the AuditLog table
  (destructive schema changes only — additive pushes do not drop triggers).
  `ATAM-06` verifies presence on every suite run.
- MySQL 8 does not allow `CREATE TRIGGER` through the prepared-statement
  protocol — apply via a text-protocol client (e.g. `mysql2/promise`'s
  `query()`), not via Prisma's `$executeRawUnsafe`.

**Maintenance runbook (escape hatch).** Legitimate maintenance (e.g. seed
resets in dev, GDPR-style deletions under legal order) runs on a dedicated
connection:

```sql
SET @vendora_audit_maintenance = 1;   -- this connection only
-- … UPDATE / DELETE …
SET @vendora_audit_maintenance = NULL;
```

`scripts/seed-demo.ts` uses exactly this pattern (interactive transaction →
`SET` + `deleteMany` share one connection). Every use of the escape hatch on
a production database must be a reviewed operation with its own AuditLog entry
written from a different connection.

**Future control — restricted application role (when the app moves off
`avnadmin`, tracked for Phase 14).** MySQL privileges are additive, so a
`REVOKE` at table level cannot subtract a database-level grant. The correct
pattern is per-table grants generated from `information_schema`:

```sql
-- generate the grant list for every table EXCEPT AuditLog
SELECT CONCAT('GRANT SELECT, INSERT, UPDATE, DELETE ON `', table_name, '` TO ''vendora_app''@''%'';')
FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name <> 'AuditLog';
-- append-only for the audit trail itself
GRANT SELECT, INSERT ON `AuditLog` TO 'vendora_app'@'%';
```

Until the application runs as a dedicated user (avnadmin is the Aiven service
admin and cannot be privilege-restricted), the triggers above ARE the active
control; the grant pattern is documented here as the procedure for 14.x.

## 5. Environment notes

- The suite targets the dev/staging database only (`assertNotProd` guard,
  6.0b.8 — no production mode, no `--allow-prod` flag exists).
- See `docs/environments.md` for the script-inventory entry.
