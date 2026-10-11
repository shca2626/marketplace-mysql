import { db } from '../../src/lib/db'
async function main() {
  const rows = await db.auditLog.findMany({ where: { entityType: 'FeeRule' }, orderBy: { createdAt: 'asc' }, select: { action: true, summary: true, createdAt: true } })
  for (const r of rows) console.log(`${r.createdAt.toISOString()} ${r.action} — ${r.summary}`)
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
