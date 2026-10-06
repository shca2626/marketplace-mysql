import { db } from '@/lib/db'
import { simulateFee } from '@/server/modules/fees/service'
async function main() {
  // 1. ORDER_COMMISSION parity
  const payout = await db.payout.findFirstOrThrow({
    where: { number: 'PY-2026-000003' },
    select: { id: true, grossAmount: true, commission: true, sellerOrgId: true, seller: { select: { sellerProfilesOwned: { select: { organization: { select: { id: true, orgType: true } } } } } } },
  })
  const orgId = payout.sellerOrgId ?? payout.seller.sellerProfilesOwned[0]?.organization.id
  const orgType = payout.seller.sellerProfilesOwned[0]?.organization.orgType
  const sim1 = await simulateFee('ORDER_COMMISSION', { orgId, orgType }, payout.grossAmount)
  const assess1 = await db.feeAssessment.findFirstOrThrow({ where: { event: 'ORDER_COMMISSION', refType: 'PAYOUT', refId: payout.id } })
  console.log('ORDER_COMMISSION: sim=' + sim1.amount + ' payout=' + payout.commission + ' assessment=' + assess1.amount + ' → ' + (sim1.amount === payout.commission && payout.commission === assess1.amount ? 'PARITY-OK' : 'MISMATCH'))

  // 2. FINANCING_SUCCESS — mirror the hook's org resolution (request.service.financierProfile.organization)
  const agr = await db.feeAssessment.findFirstOrThrow({ where: { event: 'FINANCING_SUCCESS' }, orderBy: { amount: 'desc' } })
  const agrRow = await db.financingAgreement.findUniqueOrThrow({
    where: { id: agr.refId! },
    select: { offer: { select: { amount: true, currency: true, request: { select: { service: { select: { financierProfile: { select: { organization: { select: { id: true, orgType: true } } } } } } } } } } },
  })
  const finOrg = agrRow.offer.request.service.financierProfile.organization
  const sim2 = await simulateFee('FINANCING_SUCCESS', { orgId: finOrg.id, orgType: finOrg.orgType }, agrRow.offer.amount)
  console.log('FINANCING_SUCCESS: sim(now)=' + sim2.amount + ' assessment(at time)=' + agr.amount + ' snapshot=' + (agr.ruleSnapshot ?? 'legacy'))
  console.log('  (1.5% ORG rule retired post-E2E — sim resolves the 0.75% legacy fallback now; the assessment snapshot preserves the applied-at-time rule)')

  // 3. SUBSCRIPTION_RENEWAL parity
  const sim3 = await simulateFee('SUBSCRIPTION_RENEWAL', {}, 99)
  const applied = await db.feeAssessment.findMany({ where: { event: 'SUBSCRIPTION_RENEWAL', status: 'APPLIED' }, select: { amount: true } })
  const amounts = [...new Set(applied.map(a => a.amount))]
  console.log('SUBSCRIPTION_RENEWAL: sim(99)=' + sim3.amount + ' applied distinct amounts=' + JSON.stringify(amounts) + ' → ' + (sim3.amount === 99 && amounts.every(a => [19, 49, 99].includes(a)) ? 'PARITY-OK (invoice amounts land as-is)' : 'CHECK'))

  // 4. Idempotency + snapshot spot-check
  const dupes = await db.feeAssessment.groupBy({ by: ['idempotencyKey'], _count: true, having: { idempotencyKey: { _count: { gt: 1 } } } })
  console.log('DUPES BY IDEMPOTENCY KEY:', dupes.length === 0 ? 'NONE-OK' : JSON.stringify(dupes))
  const withSnapshot = await db.feeAssessment.count({ where: { ruleId: { not: null }, ruleSnapshot: { not: null } } })
  const withRule = await db.feeAssessment.count({ where: { ruleId: { not: null } } })
  console.log('SNAPSHOT COVERAGE: ' + withSnapshot + '/' + withRule + ' rule-driven assessments have snapshots')
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
