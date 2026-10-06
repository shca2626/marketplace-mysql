import { db } from '@/lib/db'
import { resolveModuleState } from '@/server/modules/modules/service'
import { resolveFeeRuleChain, simulateFee } from '@/server/modules/fees/service'
import { getEffectiveSubscription } from '@/server/modules/subscriptions/service'

async function main() {
  // 1. Ceiling: grandfathered PRO org must keep all modules
  const org = await db.sellerProfile.findFirstOrThrow({
    where: { organization: { name: { contains: 'HelioMount' } } },
    select: { organizationId: true, organization: { select: { orgType: true, name: true } } },
  })
  const state = await resolveModuleState({ orgId: org.organizationId, orgType: org.organization.orgType })
  console.log('PRO ORG MODULES:', JSON.stringify(state))
  const sub = await getEffectiveSubscription(org.organizationId)
  console.log('SUB:', sub?.status, sub?.planKey, 'renewAt', sub?.currentPeriodEnd)

  // 2. Fee engine: commission simulation for the org
  const sim = await simulateFee('ORDER_COMMISSION', { orgId: org.organizationId, orgType: org.organization.orgType }, 1000)
  console.log('SIM ORDER_COMMISSION 1000 →', sim.amount, 'from', sim.resolution.resolvedFrom, 'chain:', JSON.stringify(sim.resolution.chain.map(c => `${c.scopeType}:${c.hit ? c.value : '—'}`)))

  // 3. Non-seller org (bank) must be unaffected by ceiling
  const bank = await db.organization.findFirst({ where: { orgType: 'BANK' }, select: { id: true, orgType: true } })
  if (bank) {
    const bankState = await resolveModuleState({ orgId: bank.id, orgType: 'BANK' })
    console.log('BANK MODULES (unaffected):', JSON.stringify(bankState))
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
