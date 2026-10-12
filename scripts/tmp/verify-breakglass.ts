import { db } from '../../src/lib/db'
async function main() {
  const u = await db.user.findFirst({ where: { email: 'e2efin-applicant@test.vendora' }, select: { id: true, email: true, isBreakGlass: true } })
  console.log('client sees isBreakGlass:', JSON.stringify(u))
  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
