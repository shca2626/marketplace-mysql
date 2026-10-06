import { db } from '@/lib/db'
async function main() {
  const admins = await db.user.findMany({
    where: { email: { in: ['admin@vendora.com', 'qa-admin@vendora.local'] } },
    select: { id: true, email: true, role: true, status: true },
  })
  console.log(JSON.stringify(admins, null, 1))
  const buyer = await db.user.findUnique({ where: { email: 'demo@vendora.com' }, select: { id: true, email: true, status: true } })
  console.log('BUYER:', JSON.stringify(buyer))
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
