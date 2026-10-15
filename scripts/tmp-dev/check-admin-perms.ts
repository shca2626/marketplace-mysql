import { db } from '../../src/lib/db'
async function main() {
  const u = await db.user.findUnique({ where: { email: 'p45.admin@vendora.test' }, include: { roleAssignments: { include: { role: { include: { permissions: { select: { permissionKey: true } } } } } } } })
  console.log('user role:', u?.role)
  console.log('assignments:', u?.roleAssignments.map((r) => r.role.key))
  const perms = new Set(u?.roleAssignments.flatMap((r) => r.role.permissions.map((p) => p.permissionKey)) ?? [])
  console.log('payments.capture held:', perms.has('payments.capture'), '| total perms:', perms.size)
}
main().finally(() => db.$disconnect())
