// Surgical additive migration: restore User.isBreakGlass (lost with unpushed commits).
import { db } from '../../src/lib/db'
async function main() {
  const cols = await db.$queryRawUnsafe<[{ COLUMN_NAME: string }]>('SHOW COLUMNS FROM `User`')
  if (cols.some(c => c.COLUMN_NAME === 'isBreakGlass')) {
    console.log('isBreakGlass already present — nothing to do')
  } else {
    await db.$executeRawUnsafe('ALTER TABLE `User` ADD COLUMN `isBreakGlass` BOOLEAN NOT NULL DEFAULT false')
    console.log('isBreakGlass column added')
  }
  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
