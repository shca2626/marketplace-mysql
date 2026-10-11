import { db } from '@/lib/db'

async function main() {
  const orgs = await db.organization.findMany({
    where: { orgType: { in: ['BANK', 'MFI', 'EWALLET'] } },
    select: { id: true, name: true, orgType: true, status: true, financierProfile: { select: { id: true } } },
  })
  console.log('FINANCIER ORGS:', JSON.stringify(orgs, null, 1))

  for (const o of orgs) {
    const members = await db.organizationMember.findMany({
      where: { organizationId: o.id, role: { in: ['OWNER', 'ADMIN'] } },
      select: { userId: true, role: true, user: { select: { email: true, name: true } } },
    })
    console.log('STAFF of', o.name, JSON.stringify(members))
  }

  const requests = await db.financingRequest.findMany({
    where: { status: { in: ['FORWARDED_TO_FINANCIER', 'UNDER_FINANCIER_REVIEW', 'OFFERED'] }, forwardedAt: { not: null } },
    select: {
      id: true, number: true, status: true, createdById: true,
      createdBy: { select: { email: true, name: true } },
      service: {
        select: {
          name: true,
          financierProfile: { select: { organizationId: true, organization: { select: { name: true } } } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })
  console.log('FORWARDED REQUESTS:', JSON.stringify(requests, null, 1))

  const agreements = await db.financingAgreement.findMany({
    select: {
      id: true, number: true, status: true,
      offer: {
        select: {
          requestId: true,
          request: {
            select: {
              number: true, createdById: true,
              service: { select: { financierProfile: { select: { organizationId: true, organization: { select: { name: true } } } } } },
            },
          },
        },
      },
    },
  })
  console.log('AGREEMENTS:', JSON.stringify(agreements, null, 1))

  console.log('templates:', await db.financingContractTemplate.count())
  console.log('certs:', await db.shariaCertification.count())
  console.log('executions:', await db.eSignatureExecution.count())

  const buyer = await db.user.findUnique({
    where: { email: 'demo@vendora.com' },
    select: { id: true, email: true, name: true, mfaEnrollment: { select: { id: true, confirmedAt: true } } },
  })
  console.log('BUYER:', JSON.stringify(buyer))
  const qab = await db.user.findUnique({
    where: { email: 'qa-buyer1@vendora.com' },
    select: { id: true, email: true, name: true, mfaEnrollment: { select: { id: true, confirmedAt: true } } },
  })
  console.log('QA-BUYER1:', JSON.stringify(qab))
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
