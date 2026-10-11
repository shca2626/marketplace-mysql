import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const agrs = await db.financingAgreement.findMany({
    select: {
      id: true, number: true,
      offer: { select: { id: true, requestId: true, status: true, amount: true, currency: true, installments: { select: { installmentNo: true, dueDate: true, amount: true } } ,
        request: { select: { number: true, status: true, createdById: true, serviceId: true, submissions: { select: { id: true, status: true } } } } } },
    },
    orderBy: { createdAt: 'asc' },
  })
  console.log(JSON.stringify(agrs, null, 1))
}
main().finally(() => db.$disconnect())
