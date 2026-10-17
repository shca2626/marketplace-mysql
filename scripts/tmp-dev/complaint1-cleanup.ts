// COMPLAINT-1 E2E cleanup: remove the browser-test complaints + notifications
// + the p45.* fixture super-admin. Audit rows stay (append-only trail).
import { db } from '../../src/lib/db'

async function main() {
  const complaints = await db.complaint.findMany({
    select: { id: true, number: true, subject: true },
  })
  console.log('complaints found:', complaints.length)

  // The E2E set: filed by maya against LumaRay + the API guard-test complaint
  const maya = await db.user.findUnique({ where: { email: 'maya@example.com' }, select: { id: true } })
  const e2e = complaints.filter(
    (c) => c.subject === 'Garden light set arrived with two dead units' || c.subject === 'Duplicate guard test'
  )
  if (maya) {
    const extra = await db.complaint.findMany({ where: { raisedById: maya.id }, select: { id: true } })
    for (const x of extra) if (!e2e.some((c) => c.id === x.id)) e2e.push(x)
  }

  for (const c of e2e) {
    const n = await db.notification.deleteMany({ where: { OR: [{ linkId: c.id }, { linkId: null, type: 'COMPLAINT_STATUS' }] } })
    await db.complaint.delete({ where: { id: c.id } })
    console.log('deleted', c.number, '(notifications:', n.count, ')')
  }

  const leftover = await db.complaint.count()
  console.log('complaints remaining:', leftover)

  const admin = await db.user.findUnique({ where: { email: 'p45.admin@vendora.test' }, select: { id: true } })
  if (admin) {
    await db.notification.deleteMany({ where: { userId: admin.id } })
    await db.userRole.deleteMany({ where: { userId: admin.id } })
    await db.user.delete({ where: { id: admin.id } })
    console.log('deleted fixture admin p45.admin@vendora.test')
  }
  console.log('cleanup done')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
