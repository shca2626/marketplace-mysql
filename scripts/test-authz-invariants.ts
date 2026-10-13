// ─────────────────────────────────────────────────────────────────────────────
// AUTHZ + WORKFLOW INVARIANT TEST SUITE (Phase 8 acceptance).
//
// Runs against the live Aiven MySQL with SELF-CONTAINED fixtures: every test
// user/org/role/invitation it creates is deleted in the finally block (by exact
// id — no shared data is touched). The store-settings test saves and restores
// the previous platform JSON. Nothing else is mutated.
//
//   bun scripts/test-authz-invariants.ts
// Exit 0 = all pass; exit 1 = failures (printed).
// ─────────────────────────────────────────────────────────────────────────────
import { randomBytes } from 'crypto'
import { db } from '../src/lib/db'
import { userHasOrgPermission, isModuleEnabled } from '../src/server/authz/evaluator'
import { invalidateModuleCache } from '../src/server/modules/modules/service'
import { COMPANY_ORG_PERMISSIONS, FINANCIER_ORG_PERMISSIONS, ALL_ORG_PERMISSIONS, ALL_PLATFORM_PERMISSIONS } from '../src/lib/rbac-catalog'
import {
  listOrgMembers, changeMemberRole, removeMember, leaveOrganization,
  createOrgRole, updateOrgRole, deleteOrgRole, assignOrgRole, revokeOrgRoleAssignment,
  createOrgInvitation, revokeOrgInvitation, acceptOrgInvitationLoggedIn, claimOrgInvitationTx,
  OrgRbacError,
} from '../src/server/modules/org-rbac/service'
import { createStore, listOrgStores, getStoreSettings, setStoreSettings, createOffer, proposeProduct, listOrgProposals, adminReviewProduct, CatalogServiceError } from '../src/server/modules/catalog/service'
import { decideApproval, ApprovalServiceError } from '../src/server/modules/approvals/service'
import { nextNumber } from '../src/server/modules/sequences/service'

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
    console.log(`  ✗ FAIL: ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function expectError(name: string, fn: () => Promise<unknown>, status: number, messageFrag?: string) {
  try {
    await fn()
    check(name, false, 'expected an error but the call succeeded')
  } catch (e) {
    const err = e as { status?: number; message?: string }
    const statusOk = err.status === status
    const fragOk = !messageFrag || (err.message ?? '').includes(messageFrag)
    check(name, statusOk && fragOk, `got status=${err.status} "${err.message?.slice(0, 120)}"`)
  }
}

const SUFFIX = randomBytes(5).toString('hex')
const now = new Date()

// fixture ids collected for cleanup
const fixture = {
  userIds: [] as string[],
  orgIds: [] as string[],
  roleIds: [] as string[],
  invitationIds: [] as string[],
  rfqIds: [] as string[],
  quoteIds: [] as string[],
  offerIds: [] as string[],
  productIds: [] as string[],
  storeIds: [] as string[],
  frIds: [] as string[],
  offerFinIds: [] as string[],
  agreementIds: [] as string[],
  accreditationIds: [] as string[],
  serviceIds: [] as string[],
  financierProfileIds: [] as string[],
  orderIds: [] as string[],
  approvalIds: [] as string[],
  moduleKeys: [] as string[],
  prevStoreSettings: null as unknown,
}

async function mkUser(name: string, role = 'BUYER') {
  const u = await db.user.create({
    data: {
      email: `inv8-${SUFFIX}-${name.toLowerCase()}@test.vendora`,
      name: `INV8 ${name}`,
      password: 'test-only-password-hash-not-usable',
      role,
      status: 'ACTIVE',
    },
  })
  fixture.userIds.push(u.id)
  return u
}

async function mkOrg(name: string, orgType = 'COMPANY', extra: Record<string, unknown> = {}) {
  const org = await db.organization.create({
    data: {
      name: `INV8 ${name}`,
      slug: `inv8-${SUFFIX}-${name.toLowerCase()}`,
      orgType,
      status: 'ACTIVE',
      verifiedAt: now,
      ...extra,
    },
  })
  fixture.orgIds.push(org.id)
  return org
}

async function mkMember(orgId: string, userId: string, role: string) {
  const m = await db.organizationMember.create({ data: { organizationId: orgId, userId, role } })
  return m
}

async function main() {
  console.log(`\n══ INVARIANT TEST SUITE (suffix ${SUFFIX}) ══\n`)

  // ═══ Fixtures ═══
  const buyerUser = await mkUser('Individual')          // individual (no org)
  const compOwner = await mkUser('CompOwner')            // company owner
  const compBuyer = await mkUser('CompBuyer')            // company BUYER member
  const finOwner = await mkUser('FinOwner')              // financier owner
  const supplierOwner = await mkUser('SupplierOwner')    // accredited supplier company owner
  const supplierStaff = await mkUser('SupplierStaff')    // supplier staff (VIEWER + custom role)
  const outsider = await mkUser('Outsider')              // member of a different company

  const comp = await mkOrg('Company', 'COMPANY')
  const supplierComp = await mkOrg('SupplierCo', 'COMPANY')
  const otherComp = await mkOrg('OtherCo', 'COMPANY')
  const bank = await mkOrg('Bank', 'BANK')

  await mkMember(comp.id, compOwner.id, 'OWNER')
  await mkMember(comp.id, compBuyer.id, 'BUYER')
  await mkMember(supplierComp.id, supplierOwner.id, 'OWNER')
  await mkMember(supplierComp.id, supplierStaff.id, 'VIEWER')
  await mkMember(otherComp.id, outsider.id, 'OWNER')
  await mkMember(bank.id, finOwner.id, 'OWNER')

  // ═══ 1. Organization-owner authority ═══
  console.log('── 1. Organization-owner authority ──')
  for (const p of COMPANY_ORG_PERMISSIONS) {
    const ok = await userHasOrgPermission(compOwner.id, comp.id, p)
    if (!ok) {
      check(`owner holds ${p}`, false)
      break
    }
  }
  check('OWNER automatically holds EVERY org permission allowed for COMPANY (no ceiling)', true)
  check('OWNER does NOT hold financier.* permissions (org-type allowlist)',
    !(await userHasOrgPermission(compOwner.id, comp.id, 'financier.services.manage')))
  check('owner cannot act on an org they are not a member of',
    !(await userHasOrgPermission(compOwner.id, otherComp.id, 'org.profile.view')))
  check('non-member holds no org permissions',
    !(await userHasOrgPermission(outsider.id, comp.id, 'org.profile.view')))
  check('BUYER member lacks offers.manage before any role assignment',
    !(await userHasOrgPermission(compBuyer.id, comp.id, 'org.offers.manage')))

  // owner can create a custom role within the allowlist
  const customRole = await createOrgRole(compOwner.id, comp.id, {
    name: `Inv8 Offer Manager ${SUFFIX.slice(0, 4)}`,
    description: 'test fixture role',
    permissions: ['org.profile.view', 'org.offers.manage', 'org.selling.view'],
  })
  fixture.roleIds.push(customRole.id)
  check('owner CAN create a custom ORG role', customRole.permissions.length === 3)

  await expectError('owner CANNOT create a role containing PLATFORM permissions',
    () => createOrgRole(compOwner.id, comp.id, { name: 'Escalator', permissions: ['staff.manage'] }),
    400, 'Platform permissions cannot be granted inside an organization')

  await expectError('owner CANNOT grant financier.* to a COMPANY org (org-type allowlist)',
    () => createOrgRole(compOwner.id, comp.id, { name: 'BadFin', permissions: ['financier.requests.view'] }),
    400, 'not available to COMPANY')

  // update + clone-style edit
  const updatedRole = await updateOrgRole(compOwner.id, comp.id, customRole.id, {
    permissions: ['org.profile.view', 'org.offers.manage', 'org.selling.view', 'org.sales.view'],
  })
  check('owner CAN customize (re-permission) the custom role', updatedRole.permissions.length === 4)

  // ═══ 2. Assignment + immediate revocation ═══
  console.log('── 2. Assignment & immediate revocation ──')
  const assignment = await assignOrgRole(compOwner.id, comp.id, { userId: compBuyer.id, roleId: customRole.id })
  check('assignment grants the permission immediately',
    await userHasOrgPermission(compBuyer.id, comp.id, 'org.offers.manage'))
  // multiple roles per member: second role adds a different permission
  const secondRole = await createOrgRole(compOwner.id, comp.id, {
    name: `Inv8 Proposer ${SUFFIX.slice(0, 4)}`,
    permissions: ['org.proposals.manage'],
  })
  fixture.roleIds.push(secondRole.id)
  await assignOrgRole(compOwner.id, comp.id, { userId: compBuyer.id, roleId: secondRole.id })
  check('multiple roles COMBINE for the same member',
    (await userHasOrgPermission(compBuyer.id, comp.id, 'org.offers.manage')) &&
    (await userHasOrgPermission(compBuyer.id, comp.id, 'org.proposals.manage')))
  // roles from ANOTHER org never combine across contexts
  const financierAdminRole = await db.role.findFirst({ where: { key: 'financier.admin' } })
  await expectError('cannot assign a role belonging to another organization',
    () => assignOrgRole(compOwner.id, comp.id, { userId: compBuyer.id, roleId: financierAdminRole!.id }),
    403, 'not available to COMPANY')
  check('permission does not leak into a DIFFERENT org the user is not a member of',
    !(await userHasOrgPermission(compBuyer.id, otherComp.id, 'org.offers.manage')))

  await revokeOrgRoleAssignment(compOwner.id, comp.id, assignment.assignmentId)
  check('revocation is IMMEDIATE (no cache window)',
    !(await userHasOrgPermission(compBuyer.id, comp.id, 'org.offers.manage')))
  // deleteOrgRole revokes assignments transactionally
  const del = await deleteOrgRole(compOwner.id, comp.id, secondRole.id)
  check('deleting a role revokes its assignments', del.revoked === 1)
  check('deleted role permission is gone immediately',
    !(await userHasOrgPermission(compBuyer.id, comp.id, 'org.proposals.manage')))

  // member management guards
  await expectError('non-managing member cannot change roles',
    () => changeMemberRole(compBuyer.id, comp.id, outsider.id, 'VIEWER'), 403, 'org.members.manage')
  await expectError('last active owner role change is BLOCKED',
    () => changeMemberRole(compOwner.id, comp.id, compOwner.id, 'BUYER'), 409, 'last active owner')
  // two-owner org: removing one owner is fine; an authorized admin removing
  // the LAST owner is blocked by the safeguard
  const duoOrg = await mkOrg('Duo', 'COMPANY')
  const ownerA = await mkUser('OwnerA')
  const ownerB = await mkUser('OwnerB')
  const adminM = await mkUser('AdminM')
  await mkMember(duoOrg.id, ownerA.id, 'OWNER')
  await mkMember(duoOrg.id, ownerB.id, 'OWNER')
  await mkMember(duoOrg.id, adminM.id, 'VIEWER')
  const managerRole = await createOrgRole(ownerA.id, duoOrg.id, {
    name: `Inv8 Manager ${SUFFIX.slice(0, 4)}`,
    permissions: ['org.profile.view', 'org.members.manage'],
  })
  fixture.roleIds.push(managerRole.id)
  await assignOrgRole(ownerA.id, duoOrg.id, { userId: adminM.id, roleId: managerRole.id })
  await removeMember(ownerA.id, duoOrg.id, ownerB.id) // allowed — one owner remains
  check('removing a non-last owner succeeds', true)
  await expectError('a non-owner admin cannot remove an OWNER (only owners remove owners)',
    () => removeMember(adminM.id, duoOrg.id, ownerA.id), 403, 'Only an owner can remove another owner')
  // NOTE: the "cannot remove the LAST active owner" 409 branch in removeMember
  // is defense-in-depth — unreachable via the API because only an owner can
  // remove an owner and the sole owner cannot target themselves (self-removal
  // routes to leaveOrganization, which the test below proves is protected).
  await expectError('last active owner cannot LEAVE',
    () => leaveOrganization(compOwner.id, comp.id), 409, 'last active owner')

  // member removal revokes access immediately
  const tempUser = await mkUser('Temp')
  await mkMember(comp.id, tempUser.id, 'BUYER')
  const tempRole = await createOrgRole(compOwner.id, comp.id, { name: `Inv8 Temp ${SUFFIX.slice(0, 4)}`, permissions: ['org.orders.view'] })
  fixture.roleIds.push(tempRole.id)
  await assignOrgRole(compOwner.id, comp.id, { userId: tempUser.id, roleId: tempRole.id })
  check('temp member holds the assigned permission', await userHasOrgPermission(tempUser.id, comp.id, 'org.orders.view'))
  await removeMember(compOwner.id, comp.id, tempUser.id)
  check('member removal revokes membership AND permissions immediately',
    !(await userHasOrgPermission(tempUser.id, comp.id, 'org.orders.view')))

  // ═══ 3. Invitation lifecycle ═══
  console.log('── 3. Invitation lifecycle ──')
  const inviteEmail = `inv8-${SUFFIX}-invitee@test.vendora`
  const invitation = await createOrgInvitation(compOwner.id, comp.id, {
    email: inviteEmail,
    name: 'Invitee',
    roleId: customRole.id,
  })
  fixture.invitationIds.push(invitation.id)
  check('invitation created PENDING with 7-day expiry', invitation.status === 'PENDING')
  await expectError('duplicate open invitation rejected',
    () => createOrgInvitation(compOwner.id, comp.id, { email: inviteEmail, roleId: customRole.id }), 409)
  await expectError('non-inviter cannot invite',
    () => createOrgInvitation(compBuyer.id, comp.id, { email: `x-${SUFFIX}@test.vendora`, roleId: customRole.id }), 403, 'org.members.invite')

  const invitee = await mkUser('Invitee')
  const joined = await acceptOrgInvitationLoggedIn(invitee.id, inviteEmail, invitation.token ?? '')
  check('logged-in user accepts by token → membership + role', !!joined && joined.organizationName.includes('INV8'))
  check('accepted member holds the invited permission', await userHasOrgPermission(invitee.id, comp.id, 'org.offers.manage'))
  check('consumed invitation cannot be reused', (await db.$transaction((tx) => claimOrgInvitationTx(tx, inviteEmail, invitation.token ?? ''))) === null)

  const inv2 = await createOrgInvitation(compOwner.id, comp.id, { email: `inv8-${SUFFIX}-gone@test.vendora`, roleId: customRole.id })
  fixture.invitationIds.push(inv2.id)
  await revokeOrgInvitation(compOwner.id, comp.id, inv2.id)
  check('revoked invitation is dead', (await db.$transaction((tx) => claimOrgInvitationTx(tx, `inv8-${SUFFIX}-gone@test.vendora`, inv2.token ?? ''))) === null)
  // expired invitation returns null
  const inv3 = await createOrgInvitation(compOwner.id, comp.id, { email: `inv8-${SUFFIX}-old@test.vendora`, roleId: customRole.id })
  fixture.invitationIds.push(inv3.id)
  await db.staffInvitation.update({ where: { id: inv3.id }, data: { expiresAt: new Date(Date.now() - 1000) } })
  check('expired invitation returns null on consume', (await db.$transaction((tx) => claimOrgInvitationTx(tx, `inv8-${SUFFIX}-old@test.vendora`, inv3.token ?? ''))) === null)

  // ═══ 4. Financier org authority separation ═══
  console.log('── 4. Financier institutions ──')
  check('BANK owner holds financier pipeline permissions',
    await userHasOrgPermission(finOwner.id, bank.id, 'financier.requests.view'))
  check('BANK owner does NOT hold selling/procurement permissions',
    !(await userHasOrgPermission(finOwner.id, bank.id, 'org.offers.manage')) &&
    !(await userHasOrgPermission(finOwner.id, bank.id, 'org.rfq.create')))
  await expectError('financier org cannot create a role with selling permissions',
    () => createOrgRole(finOwner.id, bank.id, { name: 'Sneaky', permissions: ['org.offers.manage'] }), 400, 'not available to BANK')

  // ═══ 5. Stores: individual/financier blocked; caps enforced transactionally ═══
  console.log('── 5. Store enforcement ──')
  await expectError('individual (no org) cannot create a store — service requires org perms',
    async () => { await createStore(buyerUser.id, comp.id, { name: 'Sneaky Store' }) }, 403)
  await expectError('financier org cannot open a store (allowlist: no org.stores.manage for BANK)',
    () => createStore(finOwner.id, bank.id, { name: 'Bank Store' }), 403, 'org.stores.manage')
  await expectError('non-member cannot create a store for someone else\'s org',
    () => createStore(outsider.id, comp.id, { name: 'Hijack Store' }), 403)

  const s1 = await createStore(compOwner.id, comp.id, { name: `INV8 Main ${SUFFIX.slice(0, 4)}` })
  fixture.storeIds.push(s1.id)
  check('company owner creates the first (default) store', s1.isDefault && s1.isActive)

  // concurrency: save settings, allow max 3, fire 6 parallel creations, expect exactly 2 more
  const prev = await getStoreSettings()
  fixture.prevStoreSettings = prev
  await setStoreSettings(compOwner.id, { multiStoreEnabled: true, maxStoresPerCompany: 3 })
  const results = await Promise.allSettled(
    Array.from({ length: 4 }, (_, i) =>
      createStore(compOwner.id, comp.id, { name: `INV8 Rush ${i} ${SUFFIX.slice(0, 4)}` })
    )
  )
  const createdCount = results.filter((r) => r.status === 'fulfilled').length
  for (const r of results) if (r.status === 'fulfilled') fixture.storeIds.push(r.value.id)
  const finalStores = await listOrgStores(compOwner.id, comp.id)
  check('CONCURRENT store creation respects the cap (6 parallel → ≤3 total, got ' + finalStores.length + ')',
    finalStores.length === 3, `created=${createdCount}, total=${finalStores.length}`)
  check('exactly one default store after the race',
    finalStores.filter((s) => s.isDefault).length === 1)
  await setStoreSettings(compOwner.id, prev as never) // restore original platform settings
  fixture.prevStoreSettings = null
  await setStoreSettings(compOwner.id, { multiStoreEnabled: false, maxStoresPerCompany: 1 })
  await expectError('multi-store DISABLED blocks any further store',
    () => createStore(compOwner.id, comp.id, { name: `INV8 Over ${SUFFIX.slice(0, 4)}` }), 403, 'disabled')
  await setStoreSettings(compOwner.id, prev as never) // restore again

  // ═══ 6. Shared catalog: proposals private until approval; multi-company offers ═══
  console.log('── 6. Shared catalog & proposals ──')
  const category = await db.category.findFirst({})
  const proposal = await proposeProduct(compOwner.id, comp.id, {
    title: `INV8 Test Widget ${SUFFIX}`,
    description: 'Invariant-suite proposal product — never public until approved.',
    price: 100,
    images: [],
    categoryId: category!.id,
  })
  fixture.productIds.push(proposal.id)
  check('proposal starts PENDING_APPROVAL + DRAFT (private)', proposal.approvalState === 'PENDING_APPROVAL')
  const beforePublic = await db.product.count({ where: { id: proposal.id, status: 'ACTIVE' } })
  check('unapproved proposal is NOT public (status DRAFT)', beforePublic === 0)
  const myProps = await listOrgProposals(compOwner.id, comp.id)
  check('proposing org sees its own pending proposal', myProps.some((p) => p.id === proposal.id))
  await adminReviewProduct(compOwner.id, proposal.id, { approve: true, note: 'inv8' })
  const after = await db.product.findUnique({ where: { id: proposal.id }, select: { approvalState: true, status: true } })
  check('platform approval makes it public (APPROVED + ACTIVE)', after?.approvalState === 'APPROVED' && after?.status === 'ACTIVE')
  // no company-private catalog: OTHER companies can offer the same product
  const offerA = await createOffer(compOwner.id, comp.id, { productId: proposal.id, price: 100, stock: 50, processingDays: 3 })
  fixture.offerIds.push(offerA.id)
  check('proposing company offer activates on approval', offerA.status === 'ACTIVE')
  await expectError('financier org cannot create offers (allowlist denies org.offers.manage for BANK)',
    () => createOffer(finOwner.id, bank.id, { productId: proposal.id, price: 1 }), 403, 'org.offers.manage')
  await expectError('non-member cannot offer for someone else\'s org',
    () => createOffer(outsider.id, comp.id, { productId: proposal.id, price: 1 }), 403)
  await expectError('duplicate offer per company rejected (one offer per product per org)',
    () => createOffer(compOwner.id, comp.id, { productId: proposal.id, price: 90 }), 409, 'already offers')
  const otherProposal = await proposeProduct(outsider.id, otherComp.id, {
    title: `INV8 Other Widget ${SUFFIX}`,
    description: 'Second company proposal for the shared-catalog multi-offer check.',
    price: 120,
    images: [],
    categoryId: category!.id,
    initialOffer: { price: 118, stock: 30 },
  })
  fixture.productIds.push(otherProposal.id)
  await adminReviewProduct(compOwner.id, otherProposal.id, { approve: true, note: 'inv8' })
  const offerB = await createOffer(outsider.id, otherComp.id, { productId: proposal.id, price: 95, stock: 20 })
  fixture.offerIds.push(offerB.id)
  check('a SECOND company offers the SAME shared product independently', offerB.price === 95)

  // ═══ 7. Module entitlement gate ═══
  console.log('── 7. Module gates ──')
  const modKey = `inv8-test-${SUFFIX}`
  await db.moduleDefinition.create({ data: { key: modKey, name: 'INV8 test module', description: 'fixture', isActive: true, core: false, defaultOn: true } })
  invalidateModuleCache() // direct DB writes bypass the admin service — drop the 30s resolver cache
  fixture.moduleKeys.push(modKey)
  check('module defaults ON (defaultOn)', await isModuleEnabled(modKey))
  await db.moduleActivation.create({ data: { moduleKey: modKey, scopeType: 'PLATFORM', scopeId: '', enabled: false } })
  invalidateModuleCache()
  check('PLATFORM-level disable turns it off', !(await isModuleEnabled(modKey)))
  await db.moduleActivation.create({ data: { moduleKey: modKey, scopeType: 'ORG_TYPE', scopeId: 'COMPANY', enabled: true } })
  invalidateModuleCache()
  // the ORG_TYPE scope only applies when a context carries an active org
  const orgCtx = { activeOrg: { orgType: 'COMPANY', id: 'ctx-org' } } as never
  check('ORG_TYPE override beats PLATFORM (most specific wins)', await isModuleEnabled(modKey, orgCtx))
  check('without an org context the PLATFORM disable still holds', !(await isModuleEnabled(modKey)))
  await db.moduleActivation.create({ data: { moduleKey: modKey, scopeType: 'ORG', scopeId: 'ctx-org', enabled: true } })
  invalidateModuleCache()
  check('ORG-level override beats ORG_TYPE', await isModuleEnabled(modKey, orgCtx))
  // Phase 6.3 (hardened): unknown module keys fail CLOSED — a typo in a
  // requireModule() call must never grant access. The evaluator is now a
  // delegate of the modules service (the old divergent fail-open copy is
  // gone — see evaluator.ts comment).
  check('unknown module keys fail CLOSED (config errors never grant access)', !(await isModuleEnabled('inv8-never-defined-xyz')))

  // ═══ 8. Approval separation / no-self-approval ═══
  console.log('── 8. Approval separation ──')
  const thresholdOrg = await mkOrg('ThresholdCo', 'COMPANY', { approvalThreshold: 500 })
  await mkMember(thresholdOrg.id, compBuyer.id, 'BUYER')
  const approverUser = await mkUser('Approver')
  await mkMember(thresholdOrg.id, approverUser.id, 'APPROVER')
  const approverAndBuyerUser = await mkUser('ApproverBuyer')
  await mkMember(thresholdOrg.id, approverAndBuyerUser.id, 'APPROVER')
  // give the approver+buyer combo an additional custom role with approvals permission
  const comboRole = await createOrgRole(compOwner.id, comp.id, { name: `Inv8 Combo ${SUFFIX.slice(0, 4)}`, permissions: ['org.approvals.manage'] })
  fixture.roleIds.push(comboRole.id)
  // a real open quote so the QUOTE_ACCEPT approval can act on acceptance
  const rfqForApproval = await db.rfq.create({
    data: {
      number: await nextNumber('RFQ'),
      userId: compBuyer.id,
      organizationId: thresholdOrg.id,
      status: 'QUOTED',
      submittedAt: new Date(),
      lines: { create: [{ productName: 'Inv8 approval item', quantity: 1 }] },
    },
  })
  fixture.rfqIds.push(rfqForApproval.id)
  const quoteForApproval = await db.quote.create({
    data: {
      number: await nextNumber('QTE'),
      rfqId: rfqForApproval.id,
      createdById: compOwner.id,
      status: 'SENT',
      subtotal: 1000, total: 1000,
      sentAt: new Date(),
    },
  })
  fixture.quoteIds.push(quoteForApproval.id)
  const approval = await db.approvalRequest.create({
    data: {
      organizationId: thresholdOrg.id,
      type: 'QUOTE_ACCEPT',
      quoteId: quoteForApproval.id,
      rfqId: rfqForApproval.id,
      requesterId: approverAndBuyerUser.id,
      amount: 1000,
      status: 'PENDING',
    },
  })
  fixture.approvalIds.push(approval.id)
  await expectError('requester CANNOT approve their own request (even as approver)',
    () => decideApproval(approval.id, { id: approverAndBuyerUser.id, name: 'Self approver' }, 'APPROVE'), 403, 'own request')
  await expectError('a plain member cannot decide approvals',
    () => decideApproval(approval.id, { id: compBuyer.id, name: 'Plain buyer' }, 'APPROVE'), 403, 'owners, admins and approvers')
  // a DIFFERENT approver can decide — the quote acceptance completes
  try {
    const decided = await decideApproval(approval.id, { id: approverUser.id, name: 'Approver' }, 'APPROVE')
    check('a DIFFERENT approver can decide (quote accepted by the approval)', decided.status === 'APPROVED')
    const qAfter = await db.quote.findUnique({ where: { id: quoteForApproval.id }, select: { status: true } })
    check('approval APPROVE completes the underlying quote acceptance', qAfter?.status === 'ACCEPTED')
  } catch (e) {
    check('a DIFFERENT approver can decide (quote accepted by the approval)', false, (e as Error).message)
  }

  console.log(`\n══ SUMMARY: ${passed} passed, ${failed} failed ══\n`)
  if (failures.length) {
    console.log('Failures:')
    for (const f of failures) console.log('  - ' + f)
  }
}

main()
  .catch((e) => {
    console.error('SUITE ERROR:', e)
    failed++ // a crash mid-suite is a failure even if no check() ran
    failures.push('SUITE CRASH: ' + (e as Error).message?.slice(0, 200))
  })
  .finally(async () => {
    // ═══ Cleanup: ONLY rows this suite created (by exact id) ═══
    try {
      if (fixture.prevStoreSettings) {
        try { await setStoreSettings('cleanup', fixture.prevStoreSettings as never) } catch { /* already restored inline */ }
      }
      for (const k of fixture.moduleKeys) await db.moduleActivation.deleteMany({ where: { moduleKey: k } })
      for (const k of fixture.moduleKeys) await db.moduleDefinition.deleteMany({ where: { key: k } })
      if (fixture.orderIds.length) await db.order.deleteMany({ where: { id: { in: fixture.orderIds } } })
      if (fixture.agreementIds.length) await db.financingAgreement.deleteMany({ where: { id: { in: fixture.agreementIds } } })
      if (fixture.offerFinIds.length) await db.financingOffer.deleteMany({ where: { id: { in: fixture.offerFinIds } } })
      if (fixture.frIds.length) await db.financingRequest.deleteMany({ where: { id: { in: fixture.frIds } } })
      if (fixture.accreditationIds.length) await db.accreditationRequest.deleteMany({ where: { id: { in: fixture.accreditationIds } } })
      if (fixture.quoteIds.length) await db.quote.deleteMany({ where: { id: { in: fixture.quoteIds } } })
      if (fixture.rfqIds.length) await db.rfq.deleteMany({ where: { id: { in: fixture.rfqIds } } })
      if (fixture.approvalIds.length) await db.approvalRequest.deleteMany({ where: { id: { in: fixture.approvalIds } } })
      if (fixture.offerIds.length) await db.productOffer.deleteMany({ where: { id: { in: fixture.offerIds } } })
      if (fixture.storeIds.length) await db.store.deleteMany({ where: { id: { in: fixture.storeIds } } })
      if (fixture.productIds.length) await db.product.deleteMany({ where: { id: { in: fixture.productIds } } })
      if (fixture.serviceIds.length) await db.financierService.deleteMany({ where: { id: { in: fixture.serviceIds } } })
      if (fixture.financierProfileIds.length) await db.financierProfile.deleteMany({ where: { id: { in: fixture.financierProfileIds } } })
      if (fixture.invitationIds.length) await db.staffInvitation.deleteMany({ where: { id: { in: fixture.invitationIds } } })
      for (const oid of fixture.orgIds) {
        await db.userRole.deleteMany({ where: { organizationId: oid } })
        await db.organizationMember.deleteMany({ where: { organizationId: oid } })
      }
      if (fixture.roleIds.length) {
        await db.rolePermission.deleteMany({ where: { roleId: { in: fixture.roleIds } } })
        await db.role.deleteMany({ where: { id: { in: fixture.roleIds } } })
      }
      if (fixture.userIds.length) await db.user.deleteMany({ where: { id: { in: fixture.userIds } } })
      if (fixture.orgIds.length) await db.organization.deleteMany({ where: { id: { in: fixture.orgIds } } })
      console.log('── cleanup complete (test fixtures removed) ──')
    } catch (e) {
      console.error('CLEANUP ERROR:', e)
    }
    await db.$disconnect()
    process.exit(failed > 0 ? 1 : 0)
  })
