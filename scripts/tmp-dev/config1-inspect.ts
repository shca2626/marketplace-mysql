// CONFIG-1 E2E support: inspect + fixture setup for the workflow-config session.
// Read-only inspection first; actions printed for the operator.
import { db } from '../../src/lib/db'

async function main() {
  const profiles = await db.financierProfile.count()
  const services = await db.financierService.count()
  const reqs = await db.serviceRequirement.count()
  const finOrgs = await db.organization.count({ where: { orgType: { in: ['BANK', 'MFI', 'EWALLET'] } } })
  console.log('financierProfiles:', profiles, '| services:', services, '| serviceRequirements:', reqs, '| financier orgs:', finOrgs)

  const sample = await db.serviceRequirement.findFirst({
    include: {
      service: { select: { id: true, name: true, financierProfile: { select: { organization: { select: { name: true, orgType: true, status: true } } } } } },
    },
  })
  if (sample) {
    console.log('sample requirement ->', sample.service.name, 'on', sample.service.financierProfile.organization.name, `(${sample.service.financierProfile.organization.orgType}/${sample.service.financierProfile.organization.status})`)
  } else {
    console.log('no service requirements found')
  }
  await db.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
