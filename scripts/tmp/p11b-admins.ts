import { db } from '@/lib/db'
async function main() {
  const admins = await db.user.findMany({
    where: { role: 'ADMIN' },
    select: { id: true, email: true, name: true, status: true },
  })
  for (const a of admins) {
    const mfa = await db.mfaEnrollment.count({ where: { userId: a.id, confirmedAt: { not: null } } })
    const perms = await db.userRole.count({ where: { userId: a.id } })
    console.log(a.email, '| mfaConfirmed:', mfa, '| roleAssignments:', perms)
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
