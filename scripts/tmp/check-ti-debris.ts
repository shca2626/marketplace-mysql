import { db } from '../../src/lib/db'
async function main() {
  const users = await db.user.findMany({ where: { email: { contains: 'ti-' } }, select: { id: true, email: true } })
  console.log('TI-prefixed users left:', users.length, JSON.stringify(users.map(u => u.email).slice(0, 10)))
  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
