// Task 11-b E2E — the §11.2.5 CEILING PROOF resolver.
// Usage: bun scripts/tmp/p11b-ceiling.ts <orgId>
import { db } from '@/lib/db'
import { resolveModuleState } from '@/server/modules/modules/service'
import { invalidateModuleCache } from '@/server/modules/modules/service'

async function main() {
  const orgId = process.argv[2]
  if (!orgId) { console.error('orgId required'); process.exit(1) }
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { name: true, orgType: true } })
  if (!org) { console.error('org not found'); process.exit(1) }
  invalidateModuleCache() // never read a cached matrix for the proof
  const state = await resolveModuleState({ orgId, orgType: org.orgType })
  const keys = ['rfq', 'reviews', 'insights', 'compare', 'b2b-orgs', 'solutions']
  console.log(`ORG ${org.name} (${org.orgType})`)
  for (const k of keys) console.log(`  ${k}=${state[k]}`)
  // any ORG-scope activation rows on this org?
  const orgOverrides = await db.moduleActivation.findMany({ where: { scopeType: 'ORG', scopeId: orgId } })
  console.log(`  org-override rows: ${orgOverrides.length}${orgOverrides.length ? ' → ' + orgOverrides.map((o) => `${o.moduleKey}:${o.enabled}`).join(', ') : ''}`)
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
