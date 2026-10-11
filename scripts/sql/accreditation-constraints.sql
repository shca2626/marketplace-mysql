-- ─────────────────────────────────────────────────────────────────────────────
-- ACCREDITATION REQUEST — STATUS CHECK + DB-DERIVED ACTIVE KEY
-- (lastplan v5 §7.8.1–7.8.3 / A17, C2, R7, B4)
--
-- Two database-level guarantees that the application layer can never
-- undermine:
--   1. chk_AccreditationRequest_status — AccreditationRequest.status may only
--      hold the documented lifecycle values; an invalid value is REJECTED BY
--      THE DATABASE (it can never produce a wrong activeKey and slip past
--      the unique index).
--   2. AccreditationRequest_activeKey_insert / _update triggers — activeKey
--      is DERIVED IN THE DATABASE (1 while status ∈ ACTIVE_SET, else NULL).
--      The marker can never disagree with status, and the unique index
--      AccreditationRequest_serviceId_organizationId_activeKey_key keeps
--      at most one LIVE request per program/org while terminal rows
--      (activeKey NULL, unlimited multiple NULLs) retain full history.
--
-- ACTIVE_SET (lastplan 7.8.3, complete):
--   DRAFT, SUBMITTED, UNDER_PLATFORM_REVIEW, RETURNED_FOR_COMPLETION,
--   FORWARDED_TO_FINANCIER, UNDER_FINANCIER_REVIEW, ACCREDITED
-- Terminal: REJECTED, EXPIRED, REVOKED, CANCELLED (+ ARCHIVED once adopted —
-- deliberately NOT in this CHECK yet; adding it is a reviewed migration).
-- DRAFT and RETURNED_FOR_COMPLETION block a second application BY DESIGN.
--
-- Re-run scripts/apply-accreditation-constraints.ts after any `prisma db
-- push` that recreates the AccreditationRequest table (destructive schema
-- changes only) — the CHECK constraint and the triggers are not modeled by
-- Prisma and must be re-applied. The applier verifies presence + behavior.
--
-- Apply:  bun scripts/apply-accreditation-constraints.ts
--   (MySQL 8.4 note: CREATE TRIGGER fails through the prepared-statement
--    protocol — the applier uses the mysql2 text protocol, like
--    scripts/sql/audit-append-only.sql. Statements are separated by the
--    `-- >>> STATEMENT` marker; execution ORDER MATTERS: the CHECK is added
--    BEFORE the trigger re-derivation runs, and the triggers exist BEFORE
--    the UPDATE re-derives existing rows.)
-- ─────────────────────────────────────────────────────────────────────────────

-- >>> STATEMENT
-- (1) drop the CHECK if it already exists (idempotent re-apply)
SET @has_check = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'AccreditationRequest'
    AND CONSTRAINT_NAME = 'chk_AccreditationRequest_status'
    AND CONSTRAINT_TYPE = 'CHECK'
)

-- >>> STATEMENT
SET @ddl = IF(@has_check > 0,
  'ALTER TABLE `AccreditationRequest` DROP CONSTRAINT `chk_AccreditationRequest_status`',
  'SELECT ''chk_AccreditationRequest_status not present — nothing to drop'' AS info')

-- >>> STATEMENT
PREPARE drop_stmt FROM @ddl

-- >>> STATEMENT
EXECUTE drop_stmt

-- >>> STATEMENT
DEALLOCATE PREPARE drop_stmt

-- >>> STATEMENT
-- (2) the status CHECK — the documented lifecycle, database-enforced
ALTER TABLE `AccreditationRequest`
  ADD CONSTRAINT `chk_AccreditationRequest_status`
  CHECK (`status` IN (
    'DRAFT',
    'SUBMITTED',
    'UNDER_PLATFORM_REVIEW',
    'RETURNED_FOR_COMPLETION',
    'FORWARDED_TO_FINANCIER',
    'UNDER_FINANCIER_REVIEW',
    'ACCREDITED',
    'REJECTED',
    'EXPIRED',
    'REVOKED',
    'CANCELLED'
  ))

-- >>> STATEMENT
-- (3) the DB-derived active key — BEFORE INSERT
DROP TRIGGER IF EXISTS `AccreditationRequest_activeKey_insert`

-- >>> STATEMENT
CREATE TRIGGER `AccreditationRequest_activeKey_insert`
BEFORE INSERT ON `AccreditationRequest`
FOR EACH ROW
BEGIN
  SET NEW.activeKey = (
    CASE WHEN NEW.status IN (
      'DRAFT',
      'SUBMITTED',
      'UNDER_PLATFORM_REVIEW',
      'RETURNED_FOR_COMPLETION',
      'FORWARDED_TO_FINANCIER',
      'UNDER_FINANCIER_REVIEW',
      'ACCREDITED'
    ) THEN 1 ELSE NULL END
  );
END

-- >>> STATEMENT
-- (4) the DB-derived active key — BEFORE UPDATE
DROP TRIGGER IF EXISTS `AccreditationRequest_activeKey_update`

-- >>> STATEMENT
CREATE TRIGGER `AccreditationRequest_activeKey_update`
BEFORE UPDATE ON `AccreditationRequest`
FOR EACH ROW
BEGIN
  SET NEW.activeKey = (
    CASE WHEN NEW.status IN (
      'DRAFT',
      'SUBMITTED',
      'UNDER_PLATFORM_REVIEW',
      'RETURNED_FOR_COMPLETION',
      'FORWARDED_TO_FINANCIER',
      'UNDER_FINANCIER_REVIEW',
      'ACCREDITED'
    ) THEN 1 ELSE NULL END
  );
END

-- >>> STATEMENT
-- (5) re-derive existing rows — the update trigger computes activeKey
--     in-database for every row (the CHECK added in step 2 guarantees every
--     existing status value is a member of the constrained set)
UPDATE `AccreditationRequest` SET `status` = `status`
