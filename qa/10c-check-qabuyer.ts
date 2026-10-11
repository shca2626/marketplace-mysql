import { db } from '@/lib/db'
async function main() {
  const users = await db.user.findMany({
    where: { email: { contains: 'qa-buyer' } },
    select: { id: true, email: true, name: true, createdAt: true },
  })
  console.log(JSON.stringify(users, null, 1))
}
main().then(() => process.exit(0))
