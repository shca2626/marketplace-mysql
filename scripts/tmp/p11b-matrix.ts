import { db } from '@/lib/db'
async function main() {
  const orgOverrides = await db.moduleActivation.findMany({ where: { scopeType: 'ORG' } })
  console.log('total ORG-scope activations:', orgOverrides.length)
  for (const o of orgOverrides) console.log(' ', o.scopeId, o.moduleKey, o.enabled)
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
