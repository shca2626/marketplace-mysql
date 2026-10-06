// 11-c verification: temporarily create an ORG-scope FINANCING_SUCCESS rule for
// Al-Amal Bank + a PLATFORM default, read financierCommissionOverview, then
// DELETE both rows (FeeRule is versioned mutable config owned by 11-a's CRUD —
// we leave zero trace; no assessments reference temp rules).
import { db } from '@/lib/db'
import { financierCommissionOverview } from '@/server/modules/fees/revenue'

async function main() {
  const alamal = await db.organization.findFirst({ where: { name: 'Al-Amal Bank' }, select: { id: true } })
  if (!alamal) throw new Error('no alamal')

  const orgRule = await db.feeRule.create({
    data: { event: 'FINANCING_SUCCESS', actorType: 'FINANCIER', scopeType: 'ORG', scopeId: alamal.id, dimension: 'PERCENT', value: 1.5, precedence: 5, version: 1, note: '11-c temp verification' },
  })
  const platformRule = await db.feeRule.create({
    data: { event: 'FINANCING_SUCCESS', actorType: 'FINANCIER', scopeType: 'PLATFORM', scopeId: '', dimension: 'PERCENT', value: 2, precedence: 0, version: 1, note: '11-c temp verification' },
  })
  console.log('temp rules created:', orgRule.id, platformRule.id)

  try {
    const rows = await financierCommissionOverview({ from: null, to: null })
    for (const r of rows) {
      console.log(`${r.orgName}: rule=${r.rule ? r.rule.value + '% custom v' + r.rule.version : 'platform-default'} platformDefault=${r.platformDefault ? r.platformDefault.value + '%' : 'none'}`)
    }
  } finally {
    await db.feeRule.delete({ where: { id: orgRule.id } })
    await db.feeRule.delete({ where: { id: platformRule.id } })
    console.log('temp rules deleted (zero trace)')
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
