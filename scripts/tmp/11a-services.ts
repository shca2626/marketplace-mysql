import { db } from '@/lib/db'
async function main() {
  const services = await db.financierService.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true, currency: true, amountMin: true, amountMax: true, financierProfile: { select: { organizationId: true, organization: { select: { name: true } } } } },
    orderBy: { createdAt: 'asc' },
  })
  for (const s of services) console.log(s.id, s.name, `${s.amountMin}-${s.amountMax} ${s.currency}`, s.financierProfile.organization.name, s.financierProfile.organizationId)
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
