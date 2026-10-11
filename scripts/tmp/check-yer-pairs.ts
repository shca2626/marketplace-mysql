import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const rates = await db.exchangeRate.findMany({ where: { baseCode: 'YER' }, select: { quoteCode: true }, distinct: ['quoteCode'] })
  console.log('YER quotes:', rates.map(r => r.quoteCode).join(','))
}
main().finally(() => db.$disconnect())
