import { db } from '../../src/lib/db'
async function main() {
  const rows = await db.feeAssessment.findMany({ select: { event: true, amount: true, idempotencyKey: true, actorType: true, refType: true, status: true, assessedAt: true }, orderBy: { assessedAt: 'asc' } })
  for (const r of rows) console.log(`${r.assessedAt.toISOString()} ${r.event} ${r.amount} ${r.actorType} ${r.refType} [${r.idempotencyKey.slice(0, 50)}] ${r.status}`)
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
