import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const req = await db.financingRequest.findUnique({
    where: { id: 'cmuipye1a003voktadnwdncxz' },
    include: {
      submissions: { include: { serviceRequirement: { select: { displayOrder: true, isRequired: true, conditionTemplate: { select: { title: true, conditionType: true, scope: true } } } } } },
    },
  })
  console.log('FIN-2026-000001 status:', req?.status)
  for (const s of req?.submissions ?? []) {
    console.log(`- [${s.status}] ${s.serviceRequirement.conditionTemplate.conditionType} "${s.serviceRequirement.conditionTemplate.title}" req=${s.serviceRequirement.isRequired} value="${s.valueText?.slice(0, 40) ?? ''}" doc=${s.accountDocumentId ?? '-'}`)
  }
  const svcs = await db.financierService.findMany({ where: { financierProfile: { organizationId: 'cmuipydpj0002oktan3aec1vw' } }, select: { id: true, name: true, status: true, serviceKind: true } })
  console.log('AL-AMAL SERVICES:', JSON.stringify(svcs))
}
main().finally(() => db.$disconnect())
