import { db } from '@/lib/db'
async function main() {
  const admin = await db.user.findUnique({ where: { email: 'qa-admin@vendora.local' }, select: { id: true, email: true, role: true, mfaRequired: true } })
  console.log('admin:', JSON.stringify(admin))
  const enr = await db.mfaEnrollment.findMany({ where: { userId: admin?.id }, select: { id: true, confirmedAt: true } })
  console.log('enrollments:', JSON.stringify(enr))
  const buyer = await db.user.findFirst({ where: { email: 'demo@vendora.com' }, select: { id: true, email: true, role: true } })
  console.log('buyer:', JSON.stringify(buyer))
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
