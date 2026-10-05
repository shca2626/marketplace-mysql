import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const reqs = await db.serviceRequirement.findMany({
    where: { serviceId: 'cmuod0ifu0013luhrltxg0vpf', isActive: true },
    select: { id: true, autoPassAccredited: true, conditionTemplate: { select: { code: true, description: true, conditionType: true, profileFieldKey: true, documentType: true } } },
  })
  console.log(JSON.stringify(reqs, null, 1))
}
main().finally(() => db.$disconnect())
