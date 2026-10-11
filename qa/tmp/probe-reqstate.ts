import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const r = await db.financingRequest.findUniqueOrThrow({ where: { id: 'cmuipye1a003voktadnwdncxz' }, select: { number: true, status: true, closedAt: true } })
  const offers = await db.financingOffer.findMany({ where: { requestId: 'cmuipye1a003voktadnwdncxz' }, select: { id: true, amount: true, status: true, sentAt: true, acceptedAt: true, createdAt: true } })
  console.log('request:', r.number, r.status, 'closedAt:', r.closedAt)
  for (const o of offers) console.log('offer', o.id, o.amount, o.status, 'sent:', o.sentAt, 'accepted:', o.acceptedAt, 'created:', o.createdAt)
  const agr = await db.financingAgreement.findFirst({ where: { offerId: { in: offers.map(o => o.id) } }, select: { id: true, number: true } })
  console.log('agreement from probe offer:', agr)
}
main().finally(() => db.$disconnect())
