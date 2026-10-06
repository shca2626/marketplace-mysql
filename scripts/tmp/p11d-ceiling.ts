import { db } from '@/lib/db'
import { resolveModuleState } from '@/server/modules/modules/service'
import { simulateFee } from '@/server/modules/fees/service'
async function main() {
  // CEILING SPOT-CHECK: pick the org 11-b used (QA Solar Trading Co) — currently PRO ACTIVE.
  const org = await db.organization.findFirstOrThrow({ where: { name: { contains: 'QA Solar Trading' } }, select: { id: true, orgType: true, name: true } })
  const before = await resolveModuleState({ orgId: org.id, orgType: org.orgType })
  console.log('PRO ACTIVE →', JSON.stringify(Object.entries(before).filter(([,v])=>v).map(([k])=>k)))

  // Downgrade to free via the service, verify clamp, restore.
  const { forceDowngrade, subscribeOrg } = await import('@/server/modules/subscriptions/service')
  await forceDowngrade(org.id)
  const downgraded = await resolveModuleState({ orgId: org.id, orgType: org.orgType })
  const gated = ['rfq','reviews','insights','compare','b2b-orgs','solutions']
  console.log('DOWNGRADED → gated modules:', JSON.stringify(Object.fromEntries(gated.map(k => [k, downgraded[k]]))))
  const nonGated = ['financing-hub','financier-console','marketplace']
  console.log('DOWNGRADED → non-gated unaffected:', JSON.stringify(Object.fromEntries(nonGated.map(k => [k, downgraded[k]]))))

  await subscribeOrg(org.id, 'pro', { complimentary: true })
  const restored = await resolveModuleState({ orgId: org.id, orgType: org.orgType })
  console.log('RESTORED PRO →', JSON.stringify(Object.entries(restored).filter(([,v])=>v).map(([k])=>k)))

  // SIMULATOR PARITY (acceptance gate leg 3): subscription renewal for this org
  const sim = await simulateFee('SUBSCRIPTION_RENEWAL', { orgId: org.id }, 99)
  console.log('SIM SUBSCRIPTION_RENEWAL 99 →', sim.amount, '(invoice amount IS the revenue — legacy path)')
  const sub = await db.sellerSubscription.findUnique({ where: { organizationId: org.id }, select: { status: true, plan: { select: { key: true } } } })
  console.log('FINAL SUB STATE:', sub?.status, sub?.plan.key)
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
