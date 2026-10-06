import { db } from '@/lib/db'
async function main() {
  // which orgs have financier profiles?
  const profiles = await db.financierProfile.findMany({ select: { id: true, organizationId: true } })
  const orgIds = [...new Set(profiles.map(p => p.organizationId))]
  const orgs = await db.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true, orgType: true } })
  console.log('FINANCIER ORGS:', JSON.stringify(orgs, null, 1))
  // agreements for the success fees + their numbers
  const fees = await db.financingFee.findMany({ where: { type: 'SUCCESS' }, select: { agreementId: true, amount: true, status: true } })
  const agrIds = [...new Set(fees.map(f => f.agreementId))]
  const agrs = await db.financingAgreement.findMany({ where: { id: { in: agrIds } }, select: { id: true, number: true } })
  console.log('AGREEMENTS:', JSON.stringify(agrs, null, 1))
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
