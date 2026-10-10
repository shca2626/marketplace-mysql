// ─────────────────────────────────────────────────────────────────────────────
// PHASE-8 VERIFICATION — READ-ONLY audit of the live database against the
// claims made in commits 2e80a1d / 9e317d3 / 3e05303.
// This script NEVER writes to the database. Run with the MySQL DATABASE_URL.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from '../src/lib/db'

async function main() {
  const out: Record<string, unknown> = {}

  // ── users ──
  const usersByRole = await db.user.groupBy({ by: ['role'], _count: { _all: true } })
  out.usersByRole = usersByRole.map((r) => ({ role: r.role, count: r._count._all }))
  out.usersTotal = await db.user.count()
  out.sellerProfiles = await db.sellerProfile.count()
  const sellers = await db.user.findMany({ where: { role: 'SELLER' }, select: { id: true, email: true } })
  out.usersWithSellerRole = sellers.length
  out.usersWithSellerRoleEmails = sellers.map((s) => s.email)

  // ── organizations ──
  const orgsByType = await db.organization.groupBy({ by: ['orgType', 'status'], _count: { _all: true } })
  out.orgsByTypeStatus = orgsByType.map((o) => ({ orgType: o.orgType, status: o.status, count: o._count._all }))
  out.memberships = await db.organizationMember.count()
  const membersByRole = await db.organizationMember.groupBy({ by: ['role'], _count: { _all: true } })
  out.membersByRole = membersByRole.map((m) => ({ role: m.role, count: m._count._all }))

  // ── catalog ──
  out.productsTotal = await db.product.count()
  const productsByApproval = await db.product.groupBy({ by: ['approvalState'], _count: { _all: true } })
  out.productsByApprovalState = productsByApproval.map((p) => ({ state: p.approvalState, count: p._count._all }))
  const productsByOrg = await db.product.groupBy({ by: ['organizationId'], _count: { _all: true } })
  out.productsByOrg = productsByOrg.map((p) => ({ orgId: p.organizationId, count: p._count._all }))

  // ── offers ──
  out.offersTotal = await db.productOffer.count()
  const offersByOrg = await db.productOffer.groupBy({ by: ['sellerOrgId'], _count: { _all: true } })
  out.offersBySellerOrg = offersByOrg.map((o) => ({ sellerOrgId: o.sellerOrgId, count: o._count._all }))
  const offersByStore = await db.productOffer.groupBy({ by: ['storeId'], _count: { _all: true } })
  out.offersByStore = offersByStore.map((o) => ({ storeId: o.storeId, count: o._count._all }))
  const offersByStatus = await db.productOffer.groupBy({ by: ['status'], _count: { _all: true } })
  out.offersByStatus = offersByStatus.map((o) => ({ status: o.status, count: o._count._all }))
  // offers on shared products by distinct orgs (shared catalog proof)
  const sharedProducts = await db.productOffer.groupBy({ by: ['productId'], _count: { _all: true } })
  out.productsOffered = sharedProducts.length
  const multi = sharedProducts.filter((p) => p._count._all > 1)
  const multiDetail = []
  for (const p of multi.slice(0, 5)) {
    const offers = await db.productOffer.findMany({ where: { productId: p.productId }, select: { sellerOrgId: true, storeId: true, price: true } })
    multiDetail.push({ productId: p.productId, offers })
  }
  out.multiOrgProducts = multi.length
  out.multiOrgDetail = multiDetail

  // ── stores ──
  out.storesTotal = await db.store.count()
  const storesByOrg = await db.store.groupBy({ by: ['organizationId'], _count: { _all: true } })
  out.storesByOrg = storesByOrg.map((s) => ({ orgId: s.organizationId, count: s._count._all }))

  // ── RBAC ──
  out.rolesTotal = await db.role.count()
  const rolesByScope = await db.role.groupBy({ by: ['scope', 'isSystem'], _count: { _all: true } })
  out.rolesByScope = rolesByScope.map((r) => ({ scope: r.scope, isSystem: r.isSystem, count: r._count._all }))
  out.permissionsTotal = await db.permission.count()
  out.rolePermissionsTotal = await db.rolePermission.count()
  const assignments = await db.userRole.findMany({ select: { organizationId: true, storeId: true } })
  out.assignmentsPlatform = assignments.filter((a) => a.organizationId === '').length
  out.assignmentsOrg = assignments.filter((a) => a.organizationId !== '').length
  out.assignmentsStoreScoped = assignments.filter((a) => a.storeId !== '').length
  out.invitationsTotal = await db.staffInvitation.count()
  const invByStatus = await db.staffInvitation.groupBy({ by: ['status'], _count: { _all: true } })
  out.invitationsByStatus = invByStatus.map((i) => ({ status: i.status, count: i._count._all }))
  out.moduleDefinitions = await db.moduleDefinition.count()
  out.moduleActivations = await db.moduleActivation.count()

  // ── RFQ / financing ──
  const rfqByKind = await db.rfq.groupBy({ by: ['kind', 'status'], _count: { _all: true } })
  out.rfqByKindStatus = rfqByKind.map((r) => ({ kind: r.kind, status: r.status, count: r._count._all }))
  const supplierRfqs = await db.rfq.findMany({
    where: { kind: 'SUPPLIER_FINANCING' },
    select: { id: true, financingRequestId: true, version: true, consentAt: true, supersededById: true, status: true },
  })
  out.supplierFinancingRfqs = supplierRfqs
  out.rfqsTotal = await db.rfq.count()
  out.quotesTotal = await db.quote.count()
  out.financingRequests = await db.financingRequest.count()
  out.financingOffers = await db.financingOffer.count()
  out.financingAgreements = await db.financingAgreement.count()

  // ── commerce preservation ──
  out.ordersTotal = await db.order.count()
  out.orderItemsTotal = await db.orderItem.count()
  out.payoutsTotal = await db.payout.count()
  out.accreditations = await db.accreditationRequest.count()
  out.accountDocuments = await db.accountDocument.count()
  out.auditLogsTotal = await db.auditLog.count()

  // ── audit trail of the phase actions ──
  const phaseActions = await db.auditLog.findMany({
    where: {
      action: {
        in: [
          'AUTHZ_DENIED', 'ORG_MEMBER_ROLE_CHANGED', 'ORG_MEMBER_REMOVED', 'ORG_MEMBER_LEFT',
          'ORG_ROLE_CREATED', 'ORG_ROLE_UPDATED', 'ORG_ROLE_DELETED', 'ORG_ROLE_ASSIGNED',
          'ORG_ROLE_REVOKED', 'ORG_MEMBER_INVITED', 'ORG_INVITATION_REVOKED', 'ORG_INVITATION_ACCEPTED',
          'USER_EMAIL_REPAIRED', 'SELLER_DEMOTED', 'SELLER_DATA_CLEANED', 'USER_DELETED',
          'PRODUCT_DELETED', 'OFFERS_RESEEDED', 'TEST_DATA_CLEANUP', 'DATA_MIGRATION',
        ],
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 60,
    select: { action: true, summary: true, createdAt: true, entityId: true },
  })
  out.phaseAuditActions = phaseActions
  const auditByAction = await db.auditLog.groupBy({ by: ['action'], _count: { _all: true }, where: { action: { startsWith: 'ORG_' } } })
  out.orgAuditCounts = auditByAction.map((a) => ({ action: a.action, count: a._count._all }))
  const recentAudit = await db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 12, select: { action: true, summary: true, createdAt: true } })
  out.recentAudit = recentAudit

  // ── offer→order attribution ──
  const orderItemsByOffer = await db.orderItem.groupBy({ by: ['offerId'], _count: { _all: true } })
  out.orderItemsWithOffer = orderItemsByOffer.filter((o) => o.offerId).length
  out.orderItemsWithoutOffer = orderItemsByOffer.filter((o) => !o.offerId).length
  const orderItemsBySellerOrg = await db.orderItem.groupBy({ by: ['sellerOrgId'], _count: { _all: true } })
  out.orderItemsBySellerOrg = orderItemsBySellerOrg.map((o) => ({ sellerOrgId: o.sellerOrgId, count: o._count._all }))

  console.log(JSON.stringify(out, null, 2))
}

main()
  .catch((e) => {
    console.error('VERIFY FAILED:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
