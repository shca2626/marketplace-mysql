// Task 10-b deterministic analytics probe (run against live Aiven MySQL).
// Phases: inspect | insert | assert-state | cleanup
//   inspect  — show AGR-2026-000002 installment + agreement facts
//   insert   — CONFIRMED DisbursementRecord(50,000) + past-due installment +
//              partial payment+allocation (records everything for cleanup)
//   cleanup   — removes every inserted row and restores the original due date
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const AGR2 = 'cmuiutbz20001ok0ftbfq7pkf' // AGR-2026-000002 (Al-Kuraimi, ACTIVE, REPORTED_FUNDED)
const KURAIMI_ADMIN = 'cmuipydph0001okta7q5kme0s' // Salma Al-Kuraimi (recordedById / queuedById)

async function main() {
  const phase = process.argv[2] ?? 'inspect'
  const agreement = await db.financingAgreement.findUniqueOrThrow({
    where: { id: AGR2 },
    include: { offer: { include: { installments: { orderBy: { installmentNo: 'asc' } } } } },
  })
  const inst1 = agreement.offer.installments[0]

  if (phase === 'inspect') {
    console.log('AGR', agreement.number, agreement.status, agreement.fundingStatus)
    console.log('installments:', agreement.offer.installments.map((i) => `${i.installmentNo}:${i.id}:${i.dueDate.toISOString().slice(0, 10)}:${i.amount}`).join(' | '))
    return
  }

  if (phase === 'insert') {
    const dueDate = new Date(Date.now() - 40 * 86_400_000) // 40 days ago → D31_60 bucket
    // 1. CONFIRMED DisbursementRecord (50,000)
    const disb = await db.disbursementRecord.create({
      data: {
        agreementId: AGR2,
        status: 'CONFIRMED',
        currency: 'YER',
        amount: 50_000,
        rail: 'BANK',
        reference: 'PROBE-10B-50K',
        queuedById: KURAIMI_ADMIN,
        confirmedAt: new Date(),
        confirmedById: KURAIMI_ADMIN,
        note: 'Task 10-b E2E deterministic probe — cleanup by reference PROBE-10B-*',
      },
    })
    // 2. Push installment 1 into the past (store original due date in the note-less way:
    //    we restore it from the constants printed here)
    const originalDue = inst1.dueDate
    await db.financingOfferInstallment.update({ where: { id: inst1.id }, data: { dueDate } })
    // 3. OPEN InstallmentPayment covering part of the installment (500k of 1.25M)
    const payment = await db.installmentPayment.create({
      data: {
        agreementId: AGR2,
        receivedAt: new Date(Date.now() - 5 * 86_400_000),
        channel: 'BANK_TRANSFER',
        reference: 'PROBE-10B-PAY-500K',
        amount: 500_000,
        currency: 'YER',
        status: 'PARTIALLY_ALLOCATED',
        note: 'Task 10-b E2E probe payment',
        recordedById: KURAIMI_ADMIN,
      },
    })
    const allocation = await db.installmentAllocation.create({
      data: { paymentId: payment.id, installmentId: inst1.id, amount: 500_000 },
    })
    console.log(
      JSON.stringify({
        disbursedRecordId: disb.id,
        paymentId: payment.id,
        allocationId: allocation.id,
        installmentId: inst1.id,
        originalDueDate: originalDue.toISOString(),
        newDueDate: dueDate.toISOString(),
        scheduled: inst1.amount,
        allocated: 500_000,
        expectedOutstandingInst1: inst1.amount - 500_000,
      })
    )
    return
  }

  if (phase === 'cleanup') {
    // Remove by the probe references; restore the installment due date.
    const payments = await db.installmentPayment.findMany({ where: { reference: 'PROBE-10B-PAY-500K' } })
    for (const p of payments) {
      await db.installmentAllocation.deleteMany({ where: { paymentId: p.id } })
      await db.installmentPayment.delete({ where: { id: p.id } })
    }
    const disbs = await db.disbursementRecord.findMany({ where: { reference: 'PROBE-10B-50K' } })
    for (const d of disbs) await db.disbursementRecord.delete({ where: { id: d.id } })
    // restore installment 1's due date (2026-10-26T12:00:00.000Z per inspect)
    await db.financingOfferInstallment.update({
      where: { id: inst1.id },
      data: { dueDate: new Date('2026-10-26T12:00:00.000Z') },
    })
    console.log('cleaned:', payments.length, 'payment(s),', disbs.length, 'disbursement record(s); installment due date restored')
    return
  }

  throw new Error(`unknown phase ${phase}`)
}

main().finally(() => db.$disconnect())
