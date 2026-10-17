import { db } from '@/lib/db'
async function main() {
  const rows = await db.$queryRawUnsafe<{ tableName: string }[]>(
    "SELECT tableName FROM (SELECT TABLE_NAME as tableName FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()) t WHERE tableName LIKE '%follow%' OR tableName LIKE '%referral%' OR tableName LIKE '%job%' OR tableName LIKE '%Job%' OR tableName LIKE '%Company%' OR tableName LIKE '%Referral%'"
  )
  console.log('matching tables:', rows.map(r => r.tableName))
  const followCount = await db.companyFollow.count().catch(e => 'ERR: ' + e.message)
  console.log('companyFollow count:', followCount)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) }).finally(() => void db.$disconnect())
