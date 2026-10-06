import { db } from '@/lib/db'

async function main() {
  // module definitions
  const mods = await db.moduleDefinition.findMany({ orderBy: { sortOrder: 'asc' } })
  console.log('MODULES:', mods.map((m) => `${m.key}(core=${m.core},on=${m.defaultOn})`).join(' '))
  // module activations
  const acts = await db.moduleActivation.findMany()
  console.log('ACTIVATIONS:', acts.map((a) => `${a.scopeType}:${a.scopeId || '*'}=${a.moduleKey}:${a.enabled}`).join(' ') || 'none')
  // plans
  const plans = await db.subscriptionPlan.findMany({ orderBy: { sortOrder: 'asc' } })
  for (const p of plans) console.log('PLAN', p.key, p.priceMonthly, p.modules, p.limits, 'active=', p.isActive)
  // subscriptions count + statuses
  const subs = await db.sellerSubscription.findMany({ include: { organization: { select: { name: true } }, plan: true } })
  console.log('SUBS:', subs.length, JSON.stringify(subs.reduce((a, s) => { a[s.status] = (a[s.status] ?? 0) + 1; return a }, {} as Record<string, number>)))
  for (const s of subs) console.log('  SUB', s.organization.name, s.plan.key, s.status, 'renewAt=', s.currentPeriodEnd.toISOString().slice(0, 10))
  // seller orgs with owner user emails + product counts
  const profiles = await db.sellerProfile.findMany({
    include: {
      organization: { select: { id: true, name: true } },
      owner: { select: { id: true, email: true, name: true, role: true } },
    },
  })
  for (const p of profiles) {
    const cnt = await db.product.count({ where: { seller: { id: p.ownerUserId }, status: { not: 'ARCHIVED' } } })
    console.log('  ORG', p.organization.name, p.organization.id, 'owner=', p.owner.email, p.owner.role, 'products=', cnt)
  }
  const invoices = await db.subscriptionInvoice.count()
  const fees = await db.feeAssessment.count({ where: { event: 'SUBSCRIPTION_RENEWAL' } })
  console.log('INVOICES:', invoices, 'SUB_RENEWAL fees:', fees)
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
