import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const agrs = await db.financingAgreement.findMany({
    include: { offer: { include: { request: { select: { id: true, number: true, activityCity: true, serviceId: true, createdById: true, amountRequested: true, status: true } }, installments: { select: { id: true, installmentNo: true, dueDate: true, amount: true } } } } },
  })
  console.log('AGREEMENTS:', JSON.stringify(agrs, null, 1))
  const disbs = await db.disbursementRecord.findMany({ select: { id: true, agreementId: true, status: true, amount: true } })
  console.log('DISBURSEMENTS:', JSON.stringify(disbs))
  const pays = await db.installmentPayment.findMany({ select: { id: true, status: true, amount: true, reversalOfId: true } })
  console.log('PAYMENTS:', JSON.stringify(pays))
  const events = await db.financingEvent.findMany({ where: { type: 'DISBURSEMENT' }, select: { id: true, agreementId: true, amount: true, eventDate: true } })
  console.log('DISB EVENTS:', JSON.stringify(events))
  const reqs = await db.financingRequest.findMany({
    where: { service: { financierProfile: { organizationId: 'cmuipydpj0002oktan3aec1vw' } } },
    include: { service: { select: { name: true, amountMin: true, amountMax: true } }, createdBy: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  })
  console.log('AL-AMAL REQUESTS:', JSON.stringify(reqs.map(r => ({ id: r.id, number: r.number, status: r.status, fwd: r.forwardedAt, city: r.activityCity, amount: r.amountRequested, tenor: r.tenorRequestedMonths, cap: r.monthlyInstallmentCapacity, gType: r.guaranteeType, gStatus: r.guaranteeStatus, svc: r.service.name, svcMin: r.service.amountMin, svcMax: r.service.amountMax, applicant: r.createdBy.email })), null, 1))
}
main().finally(() => db.$disconnect())
