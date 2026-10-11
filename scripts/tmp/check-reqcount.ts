import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const services = await db.financierService.findMany({
    where: { serviceKind: 'FINANCING', status: 'ACTIVE' },
    select: { id: true, name: true, currency: true, amountMin: true, amountMax: true, financierProfile: { select: { organizationId: true, organization: { select: { name: true } } } }, _count: { select: { requirements: { where: { isActive: true } } } } },
  })
  for (const s of services) console.log(s.id, '|', s.name, '|', s.financierProfile.organization.name, '| reqs:', s._count.requirements, '| range:', s.amountMin, '-', s.amountMax, s.currency)
}
main().finally(() => db.$disconnect())
