/**
 * scripts/migrate-2026-10-09-multistore-offers.ts
 * Surgical additive migration — Phase 1–3 foundations.
 *
 * WHY RAW SQL: `prisma db push` is FORBIDDEN on this database. The live DB
 * carries 51 legacy tables + extra columns from the pre-rollback implementation
 * that the checked-out schema does not declare; db push would DROP all of them.
 * This script applies ONLY additive changes, idempotently, after a backup.
 *
 * Changes:
 *  1. CREATE TABLE Store (multi-store; belongs to a company)
 *  2. Product: + organizationId (FK), + approvalState (default APPROVED)
 *  3. ProductOffer: + storeId (FK → Store)
 *  4. Rfq: + kind, financingRequestId, version, consentAt, supersededById
 *  5. UserRole: + storeId (default ''), unique widened to include storeId
 *  6. Role: + organizationId (default '') + index (org-owned custom roles)
 *  7. Data repair: two NULL-email QA users get placeholder emails
 *
 * Usage: DATABASE_URL=<mysql url> bun scripts/migrate-2026-10-09-multistore-offers.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const applied: string[] = []

async function hasColumn(table: string, column: string): Promise<boolean> {
  const rows = (await db.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    table,
    column
  )) as { c: number }[]
  return Number(rows[0].c) > 0
}

async function hasTable(table: string): Promise<boolean> {
  const rows = (await db.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`,
    table
  )) as { c: number }[]
  return Number(rows[0].c) > 0
}

async function hasIndex(table: string, index: string): Promise<boolean> {
  const rows = (await db.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
    table,
    index
  )) as { c: number }[]
  return Number(rows[0].c) > 0
}

async function ddl(sql: string, label: string) {
  await db.$executeRawUnsafe(sql)
  applied.push(label)
}

async function main() {
  // ── 1. Store table ──────────────────────────────────────────────────────
  if (!(await hasTable('Store'))) {
    await ddl(
      `CREATE TABLE \`Store\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`organizationId\` VARCHAR(191) NOT NULL,
        \`name\` VARCHAR(191) NOT NULL,
        \`slug\` VARCHAR(191) NOT NULL,
        \`description\` TEXT NULL,
        \`logoUrl\` VARCHAR(191) NULL,
        \`city\` VARCHAR(191) NULL,
        \`phone\` VARCHAR(191) NULL,
        \`isActive\` BOOLEAN NOT NULL DEFAULT true,
        \`isDefault\` BOOLEAN NOT NULL DEFAULT false,
        \`isArchived\` BOOLEAN NOT NULL DEFAULT false,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`Store_slug_key\` (\`slug\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      'CREATE TABLE Store'
    )
  }
  if (!(await hasIndex('Store', 'Store_organizationId_isActive_idx'))) {
    await ddl(
      `CREATE INDEX \`Store_organizationId_isActive_idx\` ON \`Store\`(\`organizationId\`, \`isActive\`)`,
      'Store idx org+active'
    )
  }
  if (!(await hasIndex('Store', 'Store_organizationId_isDefault_idx'))) {
    await ddl(
      `CREATE INDEX \`Store_organizationId_isDefault_idx\` ON \`Store\`(\`organizationId\`, \`isDefault\`)`,
      'Store idx org+default'
    )
  }
  if (!(await hasIndex('Store', 'Store_organizationId_fkey'))) {
    await ddl(
      `ALTER TABLE \`Store\` ADD CONSTRAINT \`Store_organizationId_fkey\` FOREIGN KEY (\`organizationId\`) REFERENCES \`Organization\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
      'Store FK → Organization'
    )
  }

  // ── 2. Product: organization + approval state ────────────────────────────
  if (!(await hasColumn('Product', 'organizationId'))) {
    await ddl(`ALTER TABLE \`Product\` ADD COLUMN \`organizationId\` VARCHAR(191) NULL`, 'Product.organizationId')
  }
  if (!(await hasColumn('Product', 'approvalState'))) {
    await ddl(
      `ALTER TABLE \`Product\` ADD COLUMN \`approvalState\` VARCHAR(191) NOT NULL DEFAULT 'APPROVED'`,
      'Product.approvalState (default APPROVED — live catalog unaffected)'
    )
  }
  if (!(await hasIndex('Product', 'Product_organizationId_approvalState_idx'))) {
    await ddl(
      `CREATE INDEX \`Product_organizationId_approvalState_idx\` ON \`Product\`(\`organizationId\`, \`approvalState\`)`,
      'Product idx org+approval'
    )
  }
  if (!(await hasIndex('Product', 'Product_approvalState_status_idx'))) {
    await ddl(
      `CREATE INDEX \`Product_approvalState_status_idx\` ON \`Product\`(\`approvalState\`, \`status\`)`,
      'Product idx approval+status'
    )
  }
  if (!(await hasIndex('Product', 'Product_organizationId_fkey'))) {
    await ddl(
      `ALTER TABLE \`Product\` ADD CONSTRAINT \`Product_organizationId_fkey\` FOREIGN KEY (\`organizationId\`) REFERENCES \`Organization\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE`,
      'Product FK → Organization'
    )
  }

  // ── 3. ProductOffer: store attribution ──────────────────────────────────
  if (!(await hasColumn('ProductOffer', 'storeId'))) {
    await ddl(`ALTER TABLE \`ProductOffer\` ADD COLUMN \`storeId\` VARCHAR(191) NULL`, 'ProductOffer.storeId')
  }
  if (!(await hasIndex('ProductOffer', 'ProductOffer_storeId_idx'))) {
    await ddl(`CREATE INDEX \`ProductOffer_storeId_idx\` ON \`ProductOffer\`(\`storeId\`)`, 'ProductOffer idx store')
  }
  if (!(await hasIndex('ProductOffer', 'ProductOffer_storeId_fkey'))) {
    await ddl(
      `ALTER TABLE \`ProductOffer\` ADD CONSTRAINT \`ProductOffer_storeId_fkey\` FOREIGN KEY (\`storeId\`) REFERENCES \`Store\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE`,
      'ProductOffer FK → Store'
    )
  }

  // ── 4. Rfq: financing-linked supplier RFQ fields ────────────────────────
  if (!(await hasColumn('Rfq', 'kind'))) {
    await ddl(
      `ALTER TABLE \`Rfq\` ADD COLUMN \`kind\` VARCHAR(191) NOT NULL DEFAULT 'PROCUREMENT'`,
      'Rfq.kind (PROCUREMENT | SUPPLIER_FINANCING)'
    )
  }
  if (!(await hasColumn('Rfq', 'financingRequestId'))) {
    await ddl(`ALTER TABLE \`Rfq\` ADD COLUMN \`financingRequestId\` VARCHAR(191) NULL`, 'Rfq.financingRequestId (loose)')
  }
  if (!(await hasColumn('Rfq', 'version'))) {
    await ddl(`ALTER TABLE \`Rfq\` ADD COLUMN \`version\` INT NOT NULL DEFAULT 1`, 'Rfq.version')
  }
  if (!(await hasColumn('Rfq', 'consentAt'))) {
    await ddl(`ALTER TABLE \`Rfq\` ADD COLUMN \`consentAt\` DATETIME(3) NULL`, 'Rfq.consentAt')
  }
  if (!(await hasColumn('Rfq', 'supersededById'))) {
    await ddl(`ALTER TABLE \`Rfq\` ADD COLUMN \`supersededById\` VARCHAR(191) NULL`, 'Rfq.supersededById (loose)')
  }
  if (!(await hasIndex('Rfq', 'Rfq_financingRequestId_idx'))) {
    await ddl(`CREATE INDEX \`Rfq_financingRequestId_idx\` ON \`Rfq\`(\`financingRequestId\`)`, 'Rfq idx financingRequest')
  }
  if (!(await hasIndex('Rfq', 'Rfq_kind_status_idx'))) {
    await ddl(`CREATE INDEX \`Rfq_kind_status_idx\` ON \`Rfq\`(\`kind\`, \`status\`)`, 'Rfq idx kind+status')
  }

  // ── 5. UserRole: store-scoped assignments ───────────────────────────────
  if (!(await hasColumn('UserRole', 'storeId'))) {
    await ddl(`ALTER TABLE \`UserRole\` ADD COLUMN \`storeId\` VARCHAR(191) NOT NULL DEFAULT ''`, 'UserRole.storeId')
  }
  if (await hasIndex('UserRole', 'UserRole_userId_roleId_organizationId_key')) {
    await ddl(
      `ALTER TABLE \`UserRole\` DROP INDEX \`UserRole_userId_roleId_organizationId_key\``,
      'UserRole: drop old 3-col unique'
    )
  }
  if (!(await hasIndex('UserRole', 'UserRole_userId_roleId_organizationId_storeId_key'))) {
    await ddl(
      `ALTER TABLE \`UserRole\` ADD UNIQUE INDEX \`UserRole_userId_roleId_organizationId_storeId_key\`(\`userId\`, \`roleId\`, \`organizationId\`, \`storeId\`)`,
      'UserRole: new 4-col unique (store-scoped assignments)'
    )
  }

  // ── 6. Role: org-owned custom roles ─────────────────────────────────────
  if (!(await hasColumn('Role', 'organizationId'))) {
    await ddl(`ALTER TABLE \`Role\` ADD COLUMN \`organizationId\` VARCHAR(191) NOT NULL DEFAULT ''`, 'Role.organizationId')
  }
  if (!(await hasIndex('Role', 'Role_organizationId_idx'))) {
    await ddl(`CREATE INDEX \`Role_organizationId_idx\` ON \`Role\`(\`organizationId\`)`, 'Role idx organization')
  }

  // ── 7. Data repair: NULL-email users ────────────────────────────────────
  const fixed = await db.$executeRawUnsafe(
    `UPDATE User SET email = CONCAT('qa-', LOWER(REPLACE(name, ' ', '-')), '-', LEFT(id, 6), '@placeholder.vendora') WHERE email IS NULL`
  )
  if (fixed > 0) applied.push(`repaired ${fixed} NULL-email user(s) with placeholder addresses`)

  console.log('=== MIGRATION COMPLETE ===')
  for (const a of applied) console.log(' ✓', a)
  if (applied.length === 0) console.log(' (nothing to do — already applied)')
}

main()
  .catch((e) => {
    console.error('MIGRATION FAILED:', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
