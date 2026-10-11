// ─────────────────────────────────────────────────────────────────────────────
// BACKUP DIFF — record-level before/after report for the Phase 7 data actions.
// Compares db/backups/2026-10-09T21-19-18 (before) vs 2026-10-09T21-20-19 (after).
// Pure file analysis — no DB access, no writes.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'fs'

const A = '/home/z/my-project/db/backups/2026-10-09T21-19-18'
const B = '/home/z/my-project/db/backups/2026-10-09T21-20-19'

function load(dir: string, table: string): Record<string, any>[] {
  try {
    return JSON.parse(readFileSync(`${dir}/${table}.json`, 'utf8'))
  } catch {
    return []
  }
}

function index(rows: Record<string, any>[], key = 'id'): Map<string, any> {
  return new Map(rows.map((r) => [String(r[key]), r]))
}

const report: any = {}

// ── 1. User changes ──
{
  const before = index(load(A, 'User'))
  const after = index(load(B, 'User'))
  const deleted: any[] = []
  const changed: any[] = []
  for (const [id, u] of before) {
    const a = after.get(id)
    if (!a) { deleted.push({ id, email: u.email, role: u.role }); continue }
    const diffs: any = {}
    for (const k of Object.keys(u)) if (JSON.stringify(u[k]) !== JSON.stringify(a[k])) diffs[k] = { from: u[k], to: a[k] }
    if (Object.keys(diffs).length) changed.push({ id, email: u.email, diffs })
  }
  const added = [...after.keys()].filter((id) => !before.has(id)).map((id) => ({ id, email: after.get(id).email }))
  report.users = {
    beforeCount: before.size,
    afterCount: after.size,
    deleted,
    added,
    changed,
  }
}

// ── 2. SellerProfile changes ──
{
  const before = load(A, 'SellerProfile')
  const after = load(B, 'SellerProfile')
  const bIds = new Set(before.map((r) => r.id))
  const aIds = new Set(after.map((r) => r.id))
  report.sellerProfiles = {
    beforeCount: before.length,
    afterCount: after.length,
    deleted: before.filter((r) => !aIds.has(r.id)).map((r) => ({ id: r.id, userId: r.userId, storeName: r.storeName })),
  }
}

// ── 3. Product changes ──
{
  const before = index(load(A, 'Product'))
  const after = index(load(B, 'Product'))
  const deleted: any[] = []
  const changed: any[] = []
  for (const [id, p] of before) {
    const a = after.get(id)
    if (!a) { deleted.push({ id, title: p.title, organizationId: p.organizationId, approvalState: p.approvalState }); continue }
    const diffs: any = {}
    for (const k of Object.keys(p)) if (JSON.stringify(p[k]) !== JSON.stringify(a[k])) diffs[k] = { from: p[k], to: a[k] }
    if (Object.keys(diffs).length) changed.push({ id, title: p.title, diffs })
  }
  const added = [...after.keys()].filter((id) => !before.has(id)).map((id) => ({ id, title: after.get(id).title, organizationId: after.get(id).organizationId }))
  report.products = { beforeCount: before.size, afterCount: after.size, deleted, added, changed }
}

// ── 4. ProductOffer changes ──
{
  const before = index(load(A, 'ProductOffer'))
  const after = index(load(B, 'ProductOffer'))
  const deleted: any[] = []
  const changed: any[] = []
  for (const [id, o] of before) {
    const a = after.get(id)
    if (!a) { deleted.push({ id, productId: o.productId, sellerId: o.sellerId, sellerOrgId: o.sellerOrgId, price: o.price }); continue }
    const diffs: any = {}
    for (const k of Object.keys(o)) if (JSON.stringify(o[k]) !== JSON.stringify(a[k])) diffs[k] = { from: o[k], to: a[k] }
    if (Object.keys(diffs).length) changed.push({ id, diffs })
  }
  const added = [...after.keys()].filter((id) => !before.has(id)).map((id) => {
    const o = after.get(id)
    return { id, productId: o.productId, sellerId: o.sellerId, sellerOrgId: o.sellerOrgId, storeId: o.storeId, price: o.price, status: o.status }
  })
  const addedByOrg = new Map<string, number>()
  for (const o of added) addedByOrg.set(o.sellerOrgId ?? 'null', (addedByOrg.get(o.sellerOrgId ?? 'null') ?? 0) + 1)
  report.offers = {
    beforeCount: before.size,
    afterCount: after.size,
    deletedCount: deleted.length,
    addedCount: added.length,
    addedByOrg: [...addedByOrg.entries()],
    changedCount: changed.length,
    sampleDeleted: deleted.slice(0, 5),
    sampleAdded: added.slice(0, 5),
    sampleChanged: changed.slice(0, 5),
  }
}

// ── 5. Quote changes (seller-attributed quotes detached) ──
{
  const before = index(load(A, 'Quote'))
  const after = index(load(B, 'Quote'))
  const changed: any[] = []
  const deleted: any[] = []
  for (const [id, q] of before) {
    const a = after.get(id)
    if (!a) { deleted.push({ id, rfqId: q.rfqId }); continue }
    const diffs: any = {}
    for (const k of Object.keys(q)) if (JSON.stringify(q[k]) !== JSON.stringify(a[k])) diffs[k] = { from: q[k], to: a[k] }
    if (Object.keys(diffs).length) changed.push({ id, rfqId: q.rfqId, diffs })
  }
  report.quotes = { beforeCount: before.size, afterCount: after.size, deleted, changed }
}

// ── 6. Preservation checks — tables that MUST be unchanged ──
for (const t of ['Order', 'OrderItem', 'Payout', 'FinancingRequest', 'FinancingOffer', 'FinancingAgreement', 'AccountDocument', 'AccreditationRequest', 'AuditLog']) {
  const before = load(A, t)
  const after = load(B, t)
  const bi = index(before)
  const ai = index(after)
  const lost = [...bi.keys()].filter((id) => !ai.has(id))
  const gained = [...ai.keys()].filter((id) => !bi.has(id))
  let mutated = 0
  for (const [id, row] of bi) {
    const a = ai.get(id)
    if (a && JSON.stringify(row) !== JSON.stringify(a)) mutated++
  }
  report[`preservation_${t}`] = { before: before.length, after: after.length, lost: lost.length, gained: gained.length, mutated }
}

// ── 7. Store / UserRole / Role changes ──
for (const t of ['Store', 'UserRole', 'Role', 'RolePermission', 'OrganizationMember', 'StaffInvitation']) {
  const before = load(A, t)
  const after = load(B, t)
  report[`diff_${t}`] = { before: before.length, after: after.length }
}

console.log(JSON.stringify(report, null, 2))
