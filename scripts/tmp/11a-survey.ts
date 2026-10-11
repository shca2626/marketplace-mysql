import { db } from '@/lib/db'

async function main() {
  const rules = await db.feeRule.findMany()
  console.log('FEE RULES:', rules.map(r => ({ id: r.id, event: r.event, scope: r.scopeType + ':' + r.scopeId, dim: r.dimension, value: r.value, v: r.version, active: r.isActive })))
  const orgs = await db.organization.findMany({
    where: { sellerProfile: { isNot: null } },
    select: { id: true, name: true, orgType: true, status: true },
    orderBy: { name: 'asc' },
  })
  console.log('SELLER ORGS:', orgs.map(o => `${o.name} (${o.id}, ${o.orgType}, ${o.status})`))
  const items = await db.orderItem.findMany({
    where: { payoutId: null, order: { status: { not: 'CANCELLED' }, payment: { status: 'SUCCEEDED' } } },
    select: { sellerId: true, sellerOrgId: true, price: true, quantity: true },
  })
  const bySeller = new Map<string, { org: string | null; count: number; gross: number }>()
  for (const i of items) {
    const e = bySeller.get(i.sellerId) ?? { org: i.sellerOrgId, count: 0, gross: 0 }
    e.count++; e.gross += i.price * i.quantity
    bySeller.set(i.sellerId, e)
  }
  const sellerIds = [...bySeller.keys()]
  const sellers = await db.user.findMany({ where: { id: { in: sellerIds } }, select: { id: true, name: true, storeName: true, commissionRate: true } })
  console.log('PAYOUT-ELIGIBLE SELLERS:', JSON.stringify(sellers.map(s => {
    const e = bySeller.get(s.id)!
    return { sellerId: s.id, name: s.name, store: s.storeName, override: s.commissionRate, ...e, gross: Math.round(e.gross * 100) / 100 }
  }), null, 1))
  console.log('EXISTING ASSESSMENTS:', await db.feeAssessment.count())
  console.log('SELLERS WITH commissionRate OVERRIDE:', await db.user.count({ where: { role: 'SELLER', commissionRate: { not: null } } }))
  console.log('PAYOUTS:', await db.payout.count())
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
