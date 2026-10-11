-- ─────────────────────────────────────────────────────────────────────────────
-- AUDITLOG APPEND-ONLY TRIGGERS (lastplan v5 §6.11.3 — A10)
--
-- DB-level tamper mitigation: UPDATE and DELETE on AuditLog are refused by
-- the database itself, for every user (including avnadmin / the app user).
-- The AuditLog is the platform's trust substrate — history does not change.
--
-- Maintenance escape hatch (deliberate, per-connection, audited operation):
--   SET @vendora_audit_maintenance = 1;   -- on THIS connection only
--   UPDATE/DELETE …                       -- allowed for this connection
--   SET @vendora_audit_maintenance = NULL;
-- Documented in docs/audit-integrity.md §"Maintenance runbook".
--
-- Re-run this file after any `prisma db push` that recreates the AuditLog
-- table (destructive schema changes only) — `scripts/audit-atomicity.ts`
-- (ATAM-06) verifies presence on every run.
--
-- Apply:  mysql --host … --user avnadmin -p defaultdb < scripts/sql/audit-append-only.sql
-- ─────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS AuditLog_block_update;
CREATE TRIGGER AuditLog_block_update BEFORE UPDATE ON AuditLog
FOR EACH ROW
BEGIN
  IF @vendora_audit_maintenance IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'AuditLog is append-only (lastplan 6.11) — SET @vendora_audit_maintenance=1 on a maintenance connection to override';
  END IF;
END;

DROP TRIGGER IF EXISTS AuditLog_block_delete;
CREATE TRIGGER AuditLog_block_delete BEFORE DELETE ON AuditLog
FOR EACH ROW
BEGIN
  IF @vendora_audit_maintenance IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'AuditLog is append-only (lastplan 6.11) — SET @vendora_audit_maintenance=1 on a maintenance connection to override';
  END IF;
END;
