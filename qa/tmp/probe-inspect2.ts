import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const agrs = await db.financingAgreement.findMany({
    include: {
      offer: {
        include: {
          request: {
            select: {
              number: true, activityCity: true, amountRequested: true, status: true,
              service: { select: { name: true, financierProfile: { select: { organizationId: true } } } },
            },
          },
          installments: { select: { id: true, installmentNo: true, dueDate: true, amount: true }, orderBy: { installmentNo: 'asc' } },
        },
      },
    },
  })
  for (const a of agrs) {
    const sched = a.offer.installments.reduce((s, i) => s + i.amount, 0)
    console.log(a.number, a.id, a.status, a.fundingStatus, '| req:', a.offer.request.number, 'city:', a.offer.request.activityCity, '| orgId:', a.offer.request.service.financierProfile.organizationId, '| svc:', a.offer.request.service.name, '| n:', a.offer.installments.length, 'firstDue:', a.offer.installments[0]?.dueDate, 'lastDue:', a.offer.installments[a.offer.installments.length - 1]?.dueDate, 'schedTotal:', sched, 'offerAmt:', a.offer ? (await db.financingOffer.findUnique({ where: { id: a.offerId }, select: { amount: true, currency: true, tenorMonths: true } })) : null)
  }
  const limitRows = await db.underwritingLimit.count()
  const riskRows = await db.riskAssessment.count()
  const riskCfg = await db.riskConfig.count()
  console.log('UnderwritingLimit rows:', limitRows, '| RiskAssessment rows:', riskRows, '| RiskConfig rows:', riskCfg)
}
main().finally(() => db.$disconnect())
