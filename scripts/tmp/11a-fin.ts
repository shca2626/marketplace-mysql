import { db } from '@/lib/db'
import { resolvePanel } from '@/server/modules/settings/service'
async function main() {
  const panel = await resolvePanel('financingFees')
  console.log('financingFees panel:', JSON.stringify(panel))
  const orgs = await db.organization.findMany({ where: { orgType: { in: ['BANK', 'MFI'] } }, select: { id: true, name: true, orgType: true } })
  console.log('FINANCIER-ISH ORGS:', orgs)
  const requests = await db.financingRequest.findMany({
    where: { status: { in: ['FORWARDED_TO_FINANCIER', 'UNDER_FINANCIER_REVIEW', 'OFFERED'] } },
    select: { id: true, number: true, status: true, service: { select: { name: true, financierProfile: { select: { organizationId: true } } } } },
    take: 10,
  })
  console.log('OPEN REQUESTS:', JSON.stringify(requests, null, 1))
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
