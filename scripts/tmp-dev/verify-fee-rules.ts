// VERIFY-1: report fee-rule states (read-only)
import { db } from '../../src/lib/db'

async function main() {
  const rules = await db.feeRule.findMany({
    select: { event: true, note: true, isActive: true, scopeType: true, value: true, dimension: true, updatedAt: true },
    orderBy: { updatedAt: 'asc' },
  })
  for (const r of rules)
    console.log(
      r.event.padEnd(22),
      r.scopeType.padEnd(10),
      `${r.dimension === 'PERCENT' ? r.value + '%' : '$' + r.value}`.padEnd(8),
      r.isActive ? 'ACTIVE  ' : 'inactive',
      '-', (r.note || '').slice(0, 60)
    )
  console.log('total:', rules.length)
}
main().finally(() => db.$disconnect())
