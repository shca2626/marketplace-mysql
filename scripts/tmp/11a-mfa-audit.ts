import { db } from '../../src/lib/db'
async function main() {
  const rows = await db.auditLog.findMany({
    where: { action: { startsWith: 'MFA_STEP' } },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { action: true, summary: true, metadata: true, createdAt: true },
  })
  console.log(JSON.stringify(rows, null, 1))
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
