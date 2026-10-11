import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const rates = await db.exchangeRate.findMany({ orderBy: { validFrom: 'desc' }, take: 15, select: { baseCode: true, quoteCode: true, rate: true, validFrom: true, source: true } })
  console.log('RATES:', JSON.stringify(rates, null, 1))
  const agr = await db.financingAgreement.findMany({ select: { id: true, number: true, status: true, fundingStatus: true, offerId: true }, take: 5 })
  console.log('AGREEMENTS:', JSON.stringify(agr, null, 1))
  const currencies = await db.currency.findMany({ select: { code: true } })
  console.log('CURRENCIES:', currencies.map(c => c.code).join(','))
}
main().finally(() => db.$disconnect())
