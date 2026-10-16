// VERIFY-2: post-cleanup live-data sanity (read-only) — real seed data must be intact
import { db } from '../../src/lib/db'

async function main() {
  const [users, orgs, companies, banks, profiles, services, prods, offers, orders, fixtures] =
    await Promise.all([
      db.user.count(),
      db.organization.count(),
      db.organization.count({ where: { orgType: 'COMPANY' } }),
      db.organization.count({ where: { orgType: { in: ['BANK', 'MFI', 'EWALLET'] } } }),
      db.financierProfile.count(),
      db.financierService.count(),
      db.product.count(),
      db.productOffer.count(),
      db.order.count(),
      db.user.count({ where: { email: { endsWith: '@vendora.test' } } }),
    ])
  console.log('users:', users, '| orgs:', orgs, '(COMPANY:', companies, '/ financing:', banks + ')')
  console.log('financierProfiles:', profiles, '| financierServices:', services)
  console.log('products:', prods, '| offers:', offers, '| orders:', orders)
  console.log('leftover @vendora.test fixtures:', fixtures)
}
main().finally(() => db.$disconnect())
