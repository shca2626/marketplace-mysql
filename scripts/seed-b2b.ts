/**
 * B2B foundation seed — idempotent.
 * - Default retail CustomerGroup (pricing pipeline fallback segment)
 * - Number sequences (RFQ / QTE)
 * - Migrates the legacy hardcoded WELCOME10 coupon into the DB (admin-managed)
 *
 * Run: DATABASE_URL="mysql://..." bun scripts/seed-b2b.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  // 1. Default customer group
  const retail = await db.customerGroup.upsert({
    where: { key: 'retail' },
    create: { key: 'retail', name: 'Retail (default)', priority: 0, isDefault: true },
    update: { isDefault: true },
  })

  // 2. Number sequences
  for (const key of ['RFQ', 'QTE']) {
    await db.sequence.upsert({ where: { key }, create: { key, value: 0 }, update: {} })
  }

  // 3. Legacy hardcoded coupon → DB row
  const coupon = await db.coupon.upsert({
    where: { code: 'WELCOME10' },
    create: {
      code: 'WELCOME10',
      description: '10% off your first order',
      percentOff: 10,
      minSubtotal: 0,
      firstOrderOnly: true,
      active: true,
    },
    update: {},
  })

  console.log('[seed-b2b] default group:', retail.key)
  console.log('[seed-b2b] sequences: RFQ, QTE ready')
  console.log('[seed-b2b] coupon migrated:', coupon.code)
}

main()
  .catch((e) => {
    console.error('[seed-b2b] FAILED', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
