import { db } from '@/lib/db'
async function main() {
  const rev = await db.feeAssessment.findFirst({ where: { status: 'REVERSAL' }, select: { id: true, idempotencyKey: true, reversalReason: true, reversalOfId: true, amount: true } })
  console.log('REVERSAL:', JSON.stringify(rev))
  const applied = await db.feeAssessment.findMany({ where: { event: 'ORDER_COMMISSION', status: 'APPLIED', ruleId: { not: null } }, select: { idempotencyKey: true, ruleVersion: true, ruleSnapshot: true, amount: true } })
  console.log('HOOK_APPLIED_WITH_RULE:', JSON.stringify(applied, null, 1))
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
