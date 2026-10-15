import { db } from '../../src/lib/db'
async function main() {
  const users = await db.user.findMany({
    where: { email: { not: { contains: 'staging.invalid' } } },
    select: { email: true, name: true, role: true },
    orderBy: { createdAt: 'asc' },
    take: 30,
  })
  for (const u of users) console.log(u.role.padEnd(7), u.email.padEnd(34), u.name)
}
main().finally(() => db.$disconnect())
