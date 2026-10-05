import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const rates = await db.exchangeRate.findMany({ where: { OR: [{ baseCode: 'YER' }, { quoteCode: 'USD', baseCode: 'YER' }] }, orderBy: { validFrom: 'desc' }, select: { baseCode: true, quoteCode: true, rate: true, validFrom: true, source: true } })
  console.log('YER-based rates:', JSON.stringify(rates, null, 1))
  const d = await db.disbursementRecord.findUnique({ where: { agreementId: 'cmuvu9l7x006inehoc6839sqs' }, select: { id: true, status: true, currency: true, amount: true, fxRate: true, exchangeRateId: true, rail: true, reference: true } })
  console.log('disb:', JSON.stringify(d))
  const agr = await db.financingAgreement.findUnique({ where: { id: 'cmuvu9l7x006inehoc6839sqs' }, select: { fundingStatus: true, offer: { select: { currency: true, amount: true } } } })
  console.log('agr:', JSON.stringify(agr))
}
main().finally(() => db.$disconnect())
