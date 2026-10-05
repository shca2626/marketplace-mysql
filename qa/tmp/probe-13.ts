import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const r = await db.financingRequest.findUniqueOrThrow({
    where: { id: 'cmuvuaffg007anehosvpyrvpe' },
    include: { submissions: { select: { id: true, status: true } } },
  })
  console.log(r.number, 'status:', r.status, '| submittedAt:', r.submittedAt)
  for (const s of r.submissions) console.log(' sub', s.id, s.status)
}
main().finally(() => db.$disconnect())
