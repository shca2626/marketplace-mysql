// SPONSOR-1 E2E cleanup: remove the fixture chain (placement → ledger row →
// product proposal → fixture admin). Audit rows stand (they ARE the trail).
import { db } from '../../src/lib/db'

async function main() {
  // 1. Fixture placements (any created during E2E) + their ledger rows
  const placements = await db.sponsoredPlacement.findMany({
    where: { product: { title: { startsWith: 'SPONSOR E2E' } } },
    select: { id: true, feeAssessmentId: true },
  })
  for (const p of placements) {
    if (p.feeAssessmentId) {
      await db.feeAssessment.deleteMany({ where: { id: p.feeAssessmentId } })
      await db.feeAssessment.deleteMany({ where: { reversalOfId: p.feeAssessmentId } })
    }
    await db.sponsoredPlacement.delete({ where: { id: p.id } })
  }
  console.log('placements removed:', placements.length)

  // 2. The fixture product proposal (org-owned, E2E-titled)
  const products = await db.product.findMany({
    where: { title: { startsWith: 'SPONSOR E2E' } },
    select: { id: true },
  })
  if (products.length) await db.product.deleteMany({ where: { id: { in: products.map((p) => p.id) } } })
  console.log('fixture products removed:', products.length)

  // 3. Fixture super-admin
  const admin = await db.user.findUnique({ where: { email: 'p45.admin@vendora.test' } })
  if (admin) {
    await db.userRole.deleteMany({ where: { userId: admin.id } })
    await db.sessionRegistry.deleteMany({ where: { userId: admin.id } })
    await db.notification.deleteMany({ where: { userId: admin.id } })
    await db.user.delete({ where: { id: admin.id } })
    console.log('fixture admin removed')
  } else console.log('fixture admin already gone')

  // 4. Final state report
  const [remaining, totalProducts] = await Promise.all([
    db.sponsoredPlacement.count(),
    db.product.count(),
  ])
  console.log('FINAL — placements:', remaining, '| products:', totalProducts)
}
main().finally(() => db.$disconnect())
