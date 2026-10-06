import { db } from '@/lib/db'
async function main() {
  const mods = await db.moduleDefinition.findMany({ select: { key: true, domain: true, core: true, defaultOn: true }, orderBy: { sortOrder: 'asc' } })
  console.log('MODULES:', JSON.stringify(mods, null, 1))
  const sellers = await db.user.findMany({ where: { commissionRate: { not: null } }, select: { id: true, storeName: true, commissionRate: true, sellerProfilesOwned: { select: { organizationId: true } } } })
  console.log('COMMISSION_OVERRIDES:', JSON.stringify(sellers))
  const orgs = await db.sellerProfile.findMany({ select: { organizationId: true, organization: { select: { id: true, name: true, orgType: true } } }, take: 50 })
  console.log('SELLER_ORGS:', JSON.stringify(orgs.map(o => ({ id: o.organization.id, name: o.organization.name, type: o.organization.type }))))
  const payoutsCfg = await db.platformSetting.findUnique({ where: { key: 'payouts' } })
  console.log('PAYOUTS_CFG:', payoutsCfg?.value ?? 'DEFAULT_10')
  const payoutAgg = await db.payout.aggregate({ _count: true, _sum: { commission: true } })
  console.log('PAYOUT_AGG:', JSON.stringify(payoutAgg))
  const feeAgg = await db.financingFee.aggregate({ _count: true, _sum: { amount: true } })
  console.log('FINFEE_AGG:', JSON.stringify(feeAgg))
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
