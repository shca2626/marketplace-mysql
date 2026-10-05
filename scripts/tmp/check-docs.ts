import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const docs = await db.accountDocument.findMany({
    where: { userId: 'cmuimbo980006okn0cu0tdngk' },
    select: { id: true, documentType: true, status: true },
  })
  console.log('DEMO DOCS:', JSON.stringify(docs, null, 1))
  // Kuraimi Micro Business Growth Facility (2 reqs) conditions:
  const reqs = await db.serviceRequirement.findMany({
    where: { serviceId: 'cmuod0ig70027luhrbefhlpn0', isActive: true },
    select: { id: true, isRequired: true, autoPassAccredited: true, conditionTemplate: { select: { code: true, conditionType: true, profileFieldKey: true, documentType: true } } },
  })
  console.log('MBGF REQS:', JSON.stringify(reqs, null, 1))
}
main().finally(() => db.$disconnect())
