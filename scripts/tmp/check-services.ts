import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const services = await db.financierService.findMany({
    where: { serviceKind: 'FINANCING', status: 'ACTIVE' },
    select: { id: true, name: true, currency: true, amountMin: true, amountMax: true, financierProfile: { select: { organization: { select: { name: true } } } } },
    take: 10,
  })
  console.log('FINANCING SERVICES:', JSON.stringify(services, null, 1))
  const reqs = await db.serviceRequirement.findMany({ select: { id: true, conditionTemplateId: true, serviceId: true, isActive: true, autoPassAccredited: true }, take: 30 })
  console.log('REQUIREMENTS:', JSON.stringify(reqs, null, 1))
  // check demo user id
  const demo = await db.user.findUnique({ where: { email: 'demo@vendora.com' }, select: { id: true, name: true } })
  console.log('DEMO:', demo)
  const alamal = await db.user.findUnique({ where: { email: 'alamal.admin@vendora.com' }, select: { id: true, name: true } })
  console.log('ALAMAL:', alamal)
}
main().finally(() => db.$disconnect())
