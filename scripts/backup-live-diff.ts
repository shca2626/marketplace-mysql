// ─────────────────────────────────────────────────────────────────────────────
// BACKUP ↔ LIVE DIFF — reconstructs the record-level before/after report for
// the Phase 7 data actions, because both existing backups (21-19-18, 21-20-19)
// turned out to be PRE-change snapshots of identical content.
//   before = db/backups/2026-10-09T21-19-18  (last full snapshot before cleanup)
//   after  = live MySQL (read-only)
// Also identifies records created AFTER the backup by later E2E work so they
// are not misattributed to the cleanup.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'fs'
import { db } from '../src/lib/db'

const A = '/home/z/my-project/db/backups/2026-10-09T21-19-18'

function loadBak(table: string): Record<string, any>[] {
  try {
    return JSON.parse(readFileSync(`${A}/${table}.json`, 'utf8'))
  } catch {
    return []
  }
}

async function main() {
  const report: any = {}

  // ── Users ──
  const bakUsers = new Map(loadBak('User').map((u) => [u.id, u]))
  const liveUsers = await db.user.findMany({})
  const liveUserIds = new Set(liveUsers.map((u) => u.id))
  const deletedUsers: any[] = []
  for (const [id, u] of bakUsers) {
    if (!liveUserIds.has(id)) deletedUsers.push({ id, email: u.email, name: u.name, role: u.role, createdAt: u.createdAt })
  }
  const roleDemotions: any[] = []
  const emailRepairs: any[] = []
  const otherChanges: any[] = []
  for (const u of liveUsers) {
    const b = bakUsers.get(u.id)
    if (!b) continue
    if (b.role !== u.role) {
      roleDemotions.push({ id: u.id, email: u.email, from: b.role, to: u.role })
    }
    if (b.email !== u.email) {
      emailRepairs.push({ id: u.id, name: u.name, from: b.email, to: u.email })
    }
    for (const k of ['status', 'name']) {
      if ((b as any)[k] !== (u as any)[k]) otherChanges.push({ id: u.id, email: u.email, field: k, from: (b as any)[k], to: (u as any)[k] })
    }
  }
  report.users = { backupCount: bakUsers.size, liveCount: liveUsers.length, deletedUsers, roleDemotions, emailRepairs, otherChanges }

  // ── SellerProfiles ──
  const bakSp = loadBak('SellerProfile')
  const liveSp = await db.sellerProfile.findMany({})
  report.sellerProfiles = { backupCount: bakSp.length, liveCount: liveSp.length }

  // ── Products ──
  const bakProducts = new Map(loadBak('Product').map((p) => [p.id, p]))
  const liveProducts = await db.product.findMany({})
  const liveProductIds = new Set(liveProducts.map((p) => p.id))
  const deletedProducts: any[] = []
  for (const [id, p] of bakProducts) {
    if (!liveProductIds.has(id)) deletedProducts.push({ id, title: p.title, organizationId: p.organizationId, status: p.status, approvalState: p.approvalState, createdAt: p.createdAt })
  }
  const addedProducts = liveProducts.filter((p) => !bakProducts.has(p.id)).map((p) => ({ id: p.id, title: p.title, createdAt: p.createdAt }))
  report.products = { backupCount: bakProducts.size, liveCount: liveProducts.length, deletedProducts, addedProducts }

  // ── ProductOffers ──
  const bakOffers = new Map(loadBak('ProductOffer').map((o) => [o.id, o]))
  const liveOffers = await db.productOffer.findMany({})
  const deletedOffers = liveOffers.length // count those from backup that disappeared
  const goneOffers: any[] = []
  for (const [id, o] of bakOffers) {
    if (!liveOffers.some((l) => l.id === id)) goneOffers.push({ id, productId: o.productId, sellerId: o.sellerId, sellerOrgId: o.sellerOrgId, price: o.price })
  }
  const newOffers = liveOffers.filter((l) => !bakOffers.has(l.id))
  const byOrg = new Map<string, number>()
  for (const o of newOffers) byOrg.set(o.sellerOrgId ?? 'null', (byOrg.get(o.sellerOrgId ?? 'null') ?? 0) + 1)
  report.offers = {
    backupCount: bakOffers.size,
    liveCount: liveOffers.length,
    deletedFromBackup: goneOffers.length,
    goneSample: goneOffers.slice(0, 5),
    createdAfterBackup: newOffers.length,
    createdByOrg: [...byOrg.entries()],
    createdByDate: newOffers.length
      ? newOffers.reduce((acc: Record<string, number>, o) => { const d = o.createdAt.toISOString().slice(0, 13); acc[d] = (acc[d] ?? 0) + 1; return acc }, {})
      : {},
  }

  // ── Quotes ──
  const bakQuotes = new Map(loadBak('Quote').map((q) => [q.id, q]))
  const liveQuotes = await db.quote.findMany({})
  const quoteChanges: any[] = []
  for (const q of liveQuotes) {
    const b = bakQuotes.get(q.id)
    if (!b) continue
    if (b.sellerId !== q.sellerId || b.status !== q.status) quoteChanges.push({ id: q.id, sellerIdFrom: b.sellerId, sellerIdTo: q.sellerId, statusFrom: b.status, statusTo: q.status })
  }
  report.quotes = { backupCount: bakQuotes.size, liveCount: liveQuotes.length, changes: quoteChanges }

  // ── Preservation: orders / payouts / financing ──
  const bakOrders = new Map(loadBak('Order').map((o) => [o.id, o]))
  const liveOrders = await db.order.findMany({})
  const lostOrders = [...bakOrders.keys()].filter((id) => !liveOrders.some((o) => o.id === id))
  const newOrders = liveOrders.filter((o) => !bakOrders.has(o.id)).map((o) => ({ id: o.id, poNumber: o.poNumber, createdAt: o.createdAt, total: o.total }))
  report.orders = { backupCount: bakOrders.size, liveCount: liveOrders.length, lostFromBackup: lostOrders, createdAfterBackup: newOrders }

  const bakPayouts = new Set(loadBak('Payout').map((p) => p.id))
  const livePayouts = await db.payout.findMany({})
  report.payouts = { backupCount: bakPayouts.size, liveCount: livePayouts.length, lost: [...bakPayouts].filter((id) => !livePayouts.some((p) => p.id === id)) }

  for (const [label, modelName, dbKey] of [
    ['financingRequests', 'FinancingRequest', 'financingRequest'],
    ['financingOffers', 'FinancingOffer', 'financingOffer'],
    ['financingAgreements', 'FinancingAgreement', 'financingAgreement'],
    ['accountDocuments', 'AccountDocument', 'accountDocument'],
    ['auditLogs', 'AuditLog', 'auditLog'],
  ] as const) {
    const bak = new Set(loadBak(modelName).map((r) => r.id))
    const bakCount = loadBak(modelName).length
    const liveIds: { id: string }[] = await (db as any)[dbKey].findMany({ select: { id: true } })
    const lost = [...bak].filter((id) => !liveIds.some((l) => l.id === id))
    report[label] = { backupCount: bakCount, liveCount: liveIds.length, lostCount: lost.length }
  }

  // ── Deleted users' dependency audit: orders/payouts/docs referencing the deleted user ──
  for (const du of deletedUsers) {
    const orders = await db.order.count({ where: { buyerId: du.id } })
    const payouts = await db.payout.count({ where: { sellerId: du.id } })
    const docs = await db.accountDocument.count({ where: { userId: du.id } })
    const frs = await db.financingRequest.count({ where: { createdById: du.id } })
    const rfqs = await db.rfq.count({ where: { userId: du.id } })
    const orgM = await db.organizationMember.count({ where: { userId: du.id } })
    report[`deletedUser_${du.id.slice(0, 8)}_deps`] = { email: du.email, orders, payouts, docs, financingRequests: frs, rfqs, orgMemberships: orgM }
  }

  // ── Deleted products' dependency audit ──
  for (const dp of deletedProducts) {
    const orderItems = await db.orderItem.count({ where: { productId: dp.id } })
    const offers = await db.productOffer.count({ where: { productId: dp.id } })
    const rfqLines = await db.rfqLine.count({ where: { productId: dp.id } })
    const quoteLines = await db.quoteLine.count({ where: { productId: dp.id } })
    report[`deletedProduct_${dp.id.slice(0, 8)}_deps`] = { title: dp.title, orderItems, offers, rfqLines, quoteLines }
  }

  console.log(JSON.stringify(report, null, 2))
}

main()
  .catch((e) => {
    console.error('DIFF FAILED:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
