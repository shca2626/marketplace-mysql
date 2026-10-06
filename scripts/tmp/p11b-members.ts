import { db } from '@/lib/db'
async function main() {
  const orgId = 'cmupyeohj0003ndxmr62q7eha'
  const members = await db.organizationMember.findMany({
    where: { organizationId: orgId },
    include: { user: { select: { email: true } } },
  })
  for (const m of members) console.log(`${m.id} ${m.role} ${m.user.email}`)
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
