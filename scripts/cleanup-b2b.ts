/** Reset B2B test data (keeps the retail group, WELCOME10 coupon and audit trail). */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  await db.quote.deleteMany({})
  await db.rfq.deleteMany({})
  await db.priceList.deleteMany({})
  await db.organization.deleteMany({})
  await db.customerGroup.deleteMany({ where: { isDefault: false } })
  await db.coupon.deleteMany({ where: { code: { not: 'WELCOME10' } } })
  await db.user.deleteMany({ where: { email: { startsWith: 'b2b-verify-' } } })
  await db.sequence.update({ where: { key: 'RFQ' }, data: { value: 0 } }).catch(() => {})
  await db.sequence.update({ where: { key: 'QTE' }, data: { value: 0 } }).catch(() => {})
  console.log('[cleanup-b2b] test data reset')
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
