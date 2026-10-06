import { db } from '@/lib/db'
import { resolvePanel } from '@/server/modules/settings/service'
async function main() {
  const panel = await resolvePanel('financingFees')
  console.log('financingFees panel:', JSON.stringify(panel))
  const alamal = await db.user.findUnique({ where: { email: 'alamal.admin@vendora.com' }, select: { id: true, memberships: { select: { organizationId: true, organization: { select: { name: true, orgType: true } } } } } })
  console.log('alamal admin:', JSON.stringify(alamal, null, 1))
  const finRules = await db.feeRule.findMany({ where: { event: 'FINANCING_SUCCESS' } })
  console.log('FINANCING_SUCCESS rules existing:', finRules.length)
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
