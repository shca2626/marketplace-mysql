import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const reqs = await db.serviceRequirement.findMany({
    where: { serviceId: 'cmuipydq3001bokta5oej27jg' },
    include: { conditionTemplate: { select: { title: true, conditionType: true, profileFieldKey: true } } },
    orderBy: { displayOrder: 'asc' },
  })
  for (const r of reqs) {
    console.log(r.id, '|', r.conditionTemplate.conditionType, '|', JSON.stringify(r.conditionTemplate.title), '| req:', r.isRequired, '| key:', r.conditionTemplate.profileFieldKey)
  }
  const demoDocs = await db.accountDocument.findMany({
    where: { userId: 'cmuimbo980006okn0cu0tdngk' },
    select: { id: true, documentType: true, status: true },
  })
  console.log('DEMO DOCS:', JSON.stringify(demoDocs))
}
main().finally(() => db.$disconnect())
