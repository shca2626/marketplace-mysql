import { db } from '@/lib/db'
async function main() {
  const admins = await db.user.findMany({ where: { role: 'ADMIN' }, select: { email: true, name: true } })
  console.log(JSON.stringify(admins))
}
main().then(() => process.exit(0))
