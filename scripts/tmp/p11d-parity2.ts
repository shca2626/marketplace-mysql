import { db } from '@/lib/db'
import { simulateFee } from '@/server/modules/fees/service'
async function main() {
  // Leg 1: payout assessed under the STILL-ACTIVE PLATFORM 10% rule
  const p4 = await db.payout.findFirstOrThrow({
    where: { number: 'PY-2026-000004' },
    select: { id: true, grossAmount: true, commission: true, sellerOrgId: true, seller: { select: { sellerProfilesOwned: { select: { organization: { select: { id: true, orgType: true } } } } } } },
  })
  const o4 = p4.sellerOrgId ?? p4.seller.sellerProfilesOwned[0]?.organization.id
  const t4 = p4.seller.sellerProfilesOwned[0]?.organization.orgType
  const s4 = await simulateFee('ORDER_COMMISSION', { orgId: o4, orgType: t4 }, p4.grossAmount)
  const a4 = await db.feeAssessment.findFirstOrThrow({ where: { event: 'ORDER_COMMISSION', refType: 'PAYOUT', refId: p4.id } })
  console.log('L1 PLATFORM-10%: sim=' + s4.amount + ' payout=' + p4.commission + ' assessment=' + a4.amount + ' → ' + (s4.amount === p4.commission && p4.commission === a4.amount ? 'PARITY-OK' : 'MISMATCH'))

  // Leg 2: temporarily re-activate the retired probe rules → parity under them → restore
  const rule12 = await db.feeRule.findFirstOrThrow({ where: { event: 'ORDER_COMMISSION', scopeType: 'ORG' } })
  await db.feeRule.update({ where: { id: rule12.id }, data: { isActive: true } })
  const p3 = await db.payout.findFirstOrThrow({
    where: { number: 'PY-2026-000003' },
    select: { id: true, grossAmount: true, commission: true, sellerOrgId: true, seller: { select: { sellerProfilesOwned: { select: { organization: { select: { id: true, orgType: true } } } } } } },
  })
  const o3 = p3.sellerOrgId ?? p3.seller.sellerProfilesOwned[0]?.organization.id
  const t3 = p3.seller.sellerProfilesOwned[0]?.organization.orgType
  const s3 = await simulateFee('ORDER_COMMISSION', { orgId: o3, orgType: t3 }, p3.grossAmount)
  const a3 = await db.feeAssessment.findFirstOrThrow({ where: { event: 'ORDER_COMMISSION', refType: 'PAYOUT', refId: p3.id } })
  console.log('L2 ORG-12% reactivated: sim=' + s3.amount + ' payout=' + p3.commission + ' assessment=' + a3.amount + ' → ' + (s3.amount === p3.commission && p3.commission === a3.amount ? 'PARITY-OK' : 'MISMATCH'))
  await db.feeRule.update({ where: { id: rule12.id }, data: { isActive: false } })

  // Leg 3: FINANCING_SUCCESS under the re-activated 1.5% ORG rule
  const rule15 = await db.feeRule.findFirstOrThrow({ where: { event: 'FINANCING_SUCCESS', scopeType: 'ORG' } })
  await db.feeRule.update({ where: { id: rule15.id }, data: { isActive: true } })
  const agr = await db.feeAssessment.findFirstOrThrow({ where: { event: 'FINANCING_SUCCESS' }, orderBy: { amount: 'desc' } })
  const agrRow = await db.financingAgreement.findUniqueOrThrow({
    where: { id: agr.refId! },
    select: { offer: { select: { amount: true, request: { select: { service: { select: { financierProfile: { select: { organization: { select: { id: true, orgType: true } } } } } } } } } } },
  })
  const finOrg = agrRow.offer.request.service.financierProfile.organization
  const s2 = await simulateFee('FINANCING_SUCCESS', { orgId: finOrg.id, orgType: finOrg.orgType }, agrRow.offer.amount)
  const finFee = await db.financingFee.findFirstOrThrow({ where: { agreementId: agr.refId!, type: 'SUCCESS' } })
  console.log('L3 FIN-SUCCESS 1.5% reactivated: sim=' + s2.amount + ' financingFee=' + finFee.amount + ' assessment=' + agr.amount + ' → ' + (s2.amount === finFee.amount && finFee.amount === agr.amount ? 'PARITY-OK' : 'MISMATCH'))
  await db.feeRule.update({ where: { id: rule15.id }, data: { isActive: false } })

  // Restore verification
  const activeRules = await db.feeRule.findMany({ where: { isActive: true }, select: { event: true, scopeType: true, value: true } })
  console.log('ACTIVE RULES RESTORED:', JSON.stringify(activeRules))
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
