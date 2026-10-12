/**
 * scripts/migrate-2026-10-11-intermediary-models.ts
 * Surgical additive migration — the intermediary-model tables (§8).
 *
 * WHY RAW SQL: `prisma db push` is FORBIDDEN on this database. The live DB
 * carries 51 legacy tables + extra columns from the pre-rollback implementation
 * that the checked-out schema does not declare; db push would DROP all of them.
 * This script applies ONLY the five missing CREATE TABLEs, idempotently, after
 * a fresh backup (db/backups/2026-10-11T22-18-29).
 *
 * The settlement + commission server modules and their route handlers were
 * committed without the backing Prisma models ever being declared — every
 * db.externalSettlementReference / db.commission* access crashed at runtime.
 * The models are now in prisma/schema.prisma; this migration materializes
 * them in the live DB (DDL mirrors prisma db push output on the vendora_test
 * scratch database exactly).
 *
 * Changes (additive ONLY — no DROP, no ALTER of existing tables):
 *  1. CREATE TABLE CommissionStatement
 *  2. CREATE TABLE CommissionInvoice        (FK → CommissionStatement, User)
 *  3. CREATE TABLE CommissionObligation     (FK → Order, User, CommissionStatement)
 *  4. CREATE TABLE ExternalSettlementReference (FK → Order, User ×2)
 *  5. CREATE TABLE PaymentEvidence          (FK → ExternalSettlementReference, User)
 *
 * Usage: DATABASE_URL=<mysql url> bun scripts/migrate-2026-10-11-intermediary-models.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const applied: string[] = []
const skipped: string[] = []

async function hasTable(table: string): Promise<boolean> {
  const rows = (await db.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`,
    table
  )) as { c: number }[]
  return Number(rows[0].c) > 0
}

const DDL: Array<{ table: string; sql: string }> = [
  {
    table: 'CommissionStatement',
    sql: `CREATE TABLE \`CommissionStatement\` (
  \`id\` varchar(191) NOT NULL,
  \`number\` varchar(191) NOT NULL,
  \`sellerId\` varchar(191) NOT NULL,
  \`periodStart\` datetime(3) NOT NULL,
  \`periodEnd\` datetime(3) NOT NULL,
  \`obligationCount\` int NOT NULL DEFAULT 0,
  \`baseAmount\` decimal(12,2) NOT NULL DEFAULT 0.00,
  \`amount\` decimal(12,2) NOT NULL DEFAULT 0.00,
  \`status\` varchar(191) NOT NULL DEFAULT 'OPEN',
  \`issuedAt\` datetime(3) DEFAULT NULL,
  \`note\` text,
  \`createdAt\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`updatedAt\` datetime(3) NOT NULL,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`CommissionStatement_number_key\` (\`number\`),
  KEY \`CommissionStatement_sellerId_status_idx\` (\`sellerId\`,\`status\`),
  KEY \`CommissionStatement_status_createdAt_idx\` (\`status\`,\`createdAt\`),
  CONSTRAINT \`CommissionStatement_sellerId_fkey\` FOREIGN KEY (\`sellerId\`) REFERENCES \`User\` (\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    table: 'CommissionInvoice',
    sql: `CREATE TABLE \`CommissionInvoice\` (
  \`id\` varchar(191) NOT NULL,
  \`number\` varchar(191) NOT NULL,
  \`statementId\` varchar(191) NOT NULL,
  \`sellerId\` varchar(191) NOT NULL,
  \`amount\` decimal(12,2) NOT NULL DEFAULT 0.00,
  \`status\` varchar(191) NOT NULL DEFAULT 'ISSUED',
  \`dueAt\` datetime(3) DEFAULT NULL,
  \`paidAt\` datetime(3) DEFAULT NULL,
  \`note\` text,
  \`createdAt\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`updatedAt\` datetime(3) NOT NULL,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`CommissionInvoice_number_key\` (\`number\`),
  KEY \`CommissionInvoice_statementId_idx\` (\`statementId\`),
  KEY \`CommissionInvoice_sellerId_status_idx\` (\`sellerId\`,\`status\`),
  CONSTRAINT \`CommissionInvoice_statementId_fkey\` FOREIGN KEY (\`statementId\`) REFERENCES \`CommissionStatement\` (\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`CommissionInvoice_sellerId_fkey\` FOREIGN KEY (\`sellerId\`) REFERENCES \`User\` (\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    table: 'CommissionObligation',
    sql: `CREATE TABLE \`CommissionObligation\` (
  \`id\` varchar(191) NOT NULL,
  \`orderId\` varchar(191) NOT NULL,
  \`sellerId\` varchar(191) NOT NULL,
  \`baseAmount\` decimal(12,2) NOT NULL DEFAULT 0.00,
  \`commissionRate\` double NOT NULL,
  \`amount\` decimal(12,2) NOT NULL DEFAULT 0.00,
  \`collectedAmount\` decimal(12,2) NOT NULL DEFAULT 0.00,
  \`status\` varchar(191) NOT NULL DEFAULT 'PENDING',
  \`triggerStage\` varchar(191) NOT NULL DEFAULT 'DELIVERED',
  \`statementId\` varchar(191) DEFAULT NULL,
  \`note\` text,
  \`createdAt\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`updatedAt\` datetime(3) NOT NULL,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`CommissionObligation_orderId_sellerId_key\` (\`orderId\`,\`sellerId\`),
  KEY \`CommissionObligation_sellerId_status_idx\` (\`sellerId\`,\`status\`),
  KEY \`CommissionObligation_statementId_idx\` (\`statementId\`),
  KEY \`CommissionObligation_status_createdAt_idx\` (\`status\`,\`createdAt\`),
  CONSTRAINT \`CommissionObligation_orderId_fkey\` FOREIGN KEY (\`orderId\`) REFERENCES \`Order\` (\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`CommissionObligation_sellerId_fkey\` FOREIGN KEY (\`sellerId\`) REFERENCES \`User\` (\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`CommissionObligation_statementId_fkey\` FOREIGN KEY (\`statementId\`) REFERENCES \`CommissionStatement\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    table: 'ExternalSettlementReference',
    sql: `CREATE TABLE \`ExternalSettlementReference\` (
  \`id\` varchar(191) NOT NULL,
  \`orderId\` varchar(191) NOT NULL,
  \`method\` varchar(191) NOT NULL,
  \`reference\` varchar(160) DEFAULT NULL,
  \`status\` varchar(191) NOT NULL DEFAULT 'DECLARED',
  \`declaredById\` varchar(191) NOT NULL,
  \`declaredAt\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`settledAt\` datetime(3) DEFAULT NULL,
  \`confirmedById\` varchar(191) DEFAULT NULL,
  \`confirmedAt\` datetime(3) DEFAULT NULL,
  \`note\` text,
  \`createdAt\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`updatedAt\` datetime(3) NOT NULL,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`ExternalSettlementReference_orderId_key\` (\`orderId\`),
  KEY \`ExternalSettlementReference_status_createdAt_idx\` (\`status\`,\`createdAt\`),
  KEY \`ExternalSettlementReference_declaredById_idx\` (\`declaredById\`),
  KEY \`ExternalSettlementReference_confirmedById_fkey\` (\`confirmedById\`),
  CONSTRAINT \`ExternalSettlementReference_confirmedById_fkey\` FOREIGN KEY (\`confirmedById\`) REFERENCES \`User\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`ExternalSettlementReference_declaredById_fkey\` FOREIGN KEY (\`declaredById\`) REFERENCES \`User\` (\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`ExternalSettlementReference_orderId_fkey\` FOREIGN KEY (\`orderId\`) REFERENCES \`Order\` (\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    table: 'PaymentEvidence',
    sql: `CREATE TABLE \`PaymentEvidence\` (
  \`id\` varchar(191) NOT NULL,
  \`settlementId\` varchar(191) NOT NULL,
  \`mediaKey\` varchar(191) NOT NULL,
  \`name\` varchar(191) NOT NULL,
  \`mime\` varchar(191) NOT NULL,
  \`size\` int NOT NULL,
  \`uploadedById\` varchar(191) NOT NULL,
  \`createdAt\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`PaymentEvidence_settlementId_mediaKey_key\` (\`settlementId\`,\`mediaKey\`),
  KEY \`PaymentEvidence_uploadedById_idx\` (\`uploadedById\`),
  CONSTRAINT \`PaymentEvidence_settlementId_fkey\` FOREIGN KEY (\`settlementId\`) REFERENCES \`ExternalSettlementReference\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`PaymentEvidence_uploadedById_fkey\` FOREIGN KEY (\`uploadedById\`) REFERENCES \`User\` (\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
]

async function main() {
  const url = process.env.DATABASE_URL ?? ''
  if (!url.startsWith('mysql://')) throw new Error('DATABASE_URL must be the MySQL URL (the sandbox may have injected a SQLite URL)')
  if (url.includes('/vendora_test')) throw new Error('refusing: this migration targets the LIVE defaultdb, not the scratch test db')

  // Safety: refuse if any DROP/ALTER would be involved — we only CREATE.
  for (const { table, sql } of DDL) {
    if (/\b(DROP|ALTER)\b/i.test(sql)) throw new Error(`non-additive statement for ${table} — aborting`)
    if (await hasTable(table)) {
      skipped.push(table)
      continue
    }
    await db.$executeRawUnsafe(sql)
    applied.push(table)
  }

  console.log(`intermediary-models migration: ${applied.length} created${skipped.length ? `, ${skipped.length} already present` : ''}`)
  if (applied.length) console.log('  created: ' + applied.join(', '))
  if (skipped.length) console.log('  present: ' + skipped.join(', '))

  // Verify against the schema-declared expectations
  for (const { table } of DDL) {
    if (!(await hasTable(table))) throw new Error(`post-check failed: ${table} missing`)
  }
  console.log('post-check: all five tables present ✓')
}

main()
  .catch((e) => {
    console.error('migration failed:', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
