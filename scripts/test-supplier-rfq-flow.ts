// ─────────────────────────────────────────────────────────────────────────────
// FINANCING-LINKED SUPPLIER RFQ — END-TO-END FLOW TEST (Phase 8 acceptance).
//
// Proves the full golden path against the live DB with self-contained fixtures
// (deleted in finally by exact id):
//   application→RFQ linkage · gate-before-routing · accredited-supplier routing
//   · minimum supplier disclosure · quote submission (org-context) & selection
//   · selected quote ≠ financing approval (order gate on ACTIVE agreement)
//   · consent for material revisions + version history · order creation with
//   offer attribution · auditability.
// ─────────────────────────────────────────────────────────────────────────────
import { randomBytes } from 'crypto'
import { db } from '../src/lib/db'
import { userHasOrgPermission } from '../src/server/authz/evaluator'
import {
  createSupplierRfq, recordConsent, reviseSupplierRfq, supplierFinancingInbox, liveAccreditedOrgIds,
} from '../src/server/modules/rfq/supplier-financing'
import { createQuote, respondToQuote, convertQuoteToOrder, getRfq, RfqServiceError } from '../src/server/modules/rfq/service'
import { createOffer } from '../src/server/modules/catalog/service'

let passed = 0
let failed = 0
const failures: string[] = []
const SUFFIX = randomBytes(5).toString('hex')

function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; failures.push(name); console.log(`  ✗ FAIL: ${name}${detail ? ` — ${detail}` : ''}`) }
}

async function expectError(name: string, fn: () => Promise<unknown>, status: number, messageFrag?: string) {
  try {
    await fn()
    check(name, false, 'expected an error but the call succeeded')
  } catch (e) {
    const err = e as { status?: number; message?: string }
    check(name, err.status === status && (!messageFrag || (err.message ?? '').includes(messageFrag)),
      `got status=${err.status} "${err.message?.slice(0, 120)}"`)
  }
}

const fixture = {
  userIds: [] as string[],
  orgIds: [] as string[],
  rfqIds: [] as string[],
  quoteIds: [] as string[],
  offerIds: [] as string[],
  productIds: [] as string[],
  storeIds: [] as string[],
  frIds: [] as string[],
  finOfferIds: [] as string[],
  agreementIds: [] as string[],
  accreditationIds: [] as string[],
  serviceIds: [] as string[],
  financierProfileIds: [] as string[],
  orderIds: [] as string[],
}

async function mkUser(name: string) {
  const u = await db.user.create({
    data: {
      email: `sup8-${SUFFIX}-${name.toLowerCase()}@test.vendora`,
      name: `SUP8 ${name}`,
      password: 'test-only-not-usable',
      role: 'BUYER',
      status: 'ACTIVE',
    },
  })
  fixture.userIds.push(u.id)
  return u
}

async function mkOrg(name: string, orgType: string) {
  const org = await db.organization.create({
    data: { name: `SUP8 ${name}`, slug: `sup8-${SUFFIX}-${name.toLowerCase()}`, orgType, status: 'ACTIVE', verifiedAt: new Date() },
  })
  fixture.orgIds.push(org.id)
  return org
}

async function main() {
  console.log(`\n══ FINANCING-LINKED SUPPLIER RFQ FLOW (suffix ${SUFFIX}) ══\n`)

  // ── fixtures ──
  const applicant = await mkUser('Applicant')            // company applicant
  const supplierOwner = await mkUser('SupplierOwner')    // accredited supplier company
  const supplierStaff = await mkUser('SupplierStaff')    // staff with offers.manage via custom role
  const nonAccreditedOwner = await mkUser('OtherOwner')  // non-accredited company
  const financier = await mkUser('Financier')            // financier staff (bank)

  const applicantComp = await mkOrg('ApplicantCo', 'COMPANY')
  const supplierComp = await mkOrg('SupplierCo', 'COMPANY')
  const otherComp = await mkOrg('OtherCo', 'COMPANY')
  const bank = await mkOrg('Bank', 'BANK')

  await db.organizationMember.create({ data: { organizationId: applicantComp.id, userId: applicant.id, role: 'OWNER' } })
  await db.organizationMember.create({ data: { organizationId: supplierComp.id, userId: supplierOwner.id, role: 'OWNER' } })
  await db.organizationMember.create({ data: { organizationId: supplierComp.id, userId: supplierStaff.id, role: 'VIEWER' } })
  await db.organizationMember.create({ data: { organizationId: otherComp.id, userId: nonAccreditedOwner.id, role: 'OWNER' } })
  await db.organizationMember.create({ data: { organizationId: bank.id, userId: financier.id, role: 'OWNER' } })

  // supplier staff custom role with offers.manage (assignment path)
  const staffRole = await db.role.create({
    data: {
      key: `sup8.staff.${SUFFIX}`,
      name: `SUP8 Offer Staff ${SUFFIX.slice(0, 4)}`,
      scope: 'ORG',
      isSystem: false,
      organizationId: supplierComp.id,
      permissions: { create: [{ permissionKey: 'org.offers.manage' }, { permissionKey: 'org.rfq.view' }] },
    },
  })
  await db.userRole.create({ data: { userId: supplierStaff.id, roleId: staffRole.id, organizationId: supplierComp.id } })
  check('supplier staff gains offers.manage via assigned org role', await userHasOrgPermission(supplierStaff.id, supplierComp.id, 'org.offers.manage'))

  // financier profile + service + accreditation for the supplier company
  const finProfile = await db.financierProfile.create({
    data: { organizationId: bank.id, licenseNumber: `SUP8-${SUFFIX}` },
  })
  fixture.financierProfileIds.push(finProfile.id)
  const service = await db.financierService.create({
    data: {
      financierProfileId: finProfile.id,
      serviceKind: 'FINANCING',
      category: 'WORKING_CAPITAL',
      name: `SUP8 Working Capital ${SUFFIX}`,
      status: 'ACTIVE',
      currency: 'YER',
    },
  })
  fixture.serviceIds.push(service.id)
  const accService = await db.financierService.create({
    data: {
      financierProfileId: finProfile.id,
      serviceKind: 'ACCREDITATION',
      category: 'SUPPLIER_QUALIFICATION',
      name: `SUP8 Supplier Qualification ${SUFFIX}`,
      status: 'ACTIVE',
      accreditationValidMonths: 12,
    },
  })
  fixture.serviceIds.push(accService.id)
  const accreditation = await db.accreditationRequest.create({
    data: {
      number: `ACC-SUP8-${SUFFIX}`,
      organizationId: supplierComp.id,
      submittedById: supplierOwner.id,
      serviceId: accService.id,
      status: 'ACCREDITED',
      validUntil: new Date(Date.now() + 365 * 86400 * 1000),
    },
  })
  fixture.accreditationIds.push(accreditation.id)
  check('accredited pool contains the supplier org', (await liveAccreditedOrgIds(bank.id)).includes(supplierComp.id))

  // financing request by the applicant company — GATE PASSED (forwarded)
  const fr = await db.financingRequest.create({
    data: {
      number: await nextNumberFixture('FIN'),
      organizationId: applicantComp.id,
      createdById: applicant.id,
      serviceId: service.id,
      targetType: 'WORKING_CAPITAL',
      amountRequested: 5000,
      status: 'FORWARDED_TO_FINANCIER',
      submittedAt: new Date(),
      forwardedAt: new Date(),
    },
  })
  fixture.frIds.push(fr.id)

  // a NOT-yet-gate-passed request (SUBMITTED only)
  const frEarly = await db.financingRequest.create({
    data: {
      number: await nextNumberFixture('FIN'),
      organizationId: applicantComp.id,
      createdById: applicant.id,
      serviceId: service.id,
      targetType: 'WORKING_CAPITAL',
      amountRequested: 3000,
      status: 'SUBMITTED',
      submittedAt: new Date(),
    },
  })
  fixture.frIds.push(frEarly.id)

  // catalog product + the supplier's ACTIVE offer on it
  const category = await db.category.findFirst({})
  const product = await db.product.create({
    data: {
      title: `SUP8 Pump ${SUFFIX}`,
      description: 'Flow-test product',
      price: 500,
      images: '[]',
      categoryId: category!.id,
      sellerId: supplierOwner.id,
      stock: 100,
      slug: `sup8-pump-${SUFFIX}`,
      status: 'ACTIVE',
      approvalState: 'APPROVED',
    },
  })
  fixture.productIds.push(product.id)
  const offer = await createOffer(supplierOwner.id, supplierComp.id, { productId: product.id, price: 500, stock: 80 })
  fixture.offerIds.push(offer.id)
  check('supplier offer prepared (stock 80)', offer.stock === 80)

  // ── 1. gate-before-routing ──
  console.log('── 1. Platform gate before routing ──')
  await expectError('SUBMITTED-only request CANNOT open supplier routing (gate not passed)',
    () => createSupplierRfq(applicant.id, { financingRequestId: frEarly.id, lines: [{ productId: product.id, productName: product.title, quantity: 2 }] }),
    409, 'gate must pass')
  await expectError('non-applicant cannot create the supplier RFQ',
    () => createSupplierRfq(nonAccreditedOwner.id, { financingRequestId: fr.id, lines: [{ productId: product.id, productName: product.title, quantity: 2 }] }),
    403, 'another applicant')

  // ── 2. create + routing ──
  console.log('── 2. Application → RFQ linkage & routing ──')
  const created = await createSupplierRfq(applicant.id, {
    financingRequestId: fr.id,
    lines: [{ productId: product.id, productName: product.title, quantity: 2, targetPrice: 480 }],
  })
  fixture.rfqIds.push(created.rfqId)
  check('supplier RFQ created & linked', created.number.startsWith('RFQ'))
  check('routed ONLY to accredited suppliers (1 org)', created.routedOrgCount === 1 && created.routedOrgNames.some((n) => n.includes('SUP8')))
  const rfqRow = await db.rfq.findUnique({ where: { id: created.rfqId } })
  check('RFQ stamped kind=SUPPLIER_FINANCING + financingRequestId + v1 consent',
    rfqRow?.kind === 'SUPPLIER_FINANCING' && rfqRow?.financingRequestId === fr.id && rfqRow?.version === 1 && !!rfqRow?.consentAt)

  await expectError('duplicate live supplier RFQ rejected (revise instead)',
    () => createSupplierRfq(applicant.id, { financingRequestId: fr.id, lines: [{ productId: product.id, productName: product.title, quantity: 1 }] }),
    409, 'already exists')

  // ── 3. minimum disclosure ──
  console.log('── 3. Minimum supplier disclosure ──')
  const inboxForSupplier: { id: string }[] = (await supplierFinancingInbox(supplierStaff.id, supplierComp.id)) as { id: string }[]
  check('accredited supplier staff SEES the RFQ in the inbox', inboxForSupplier.some((r) => r.id === created.rfqId))
  const inboxItem = inboxForSupplier.find((r) => r.id === created.rfqId) as Record<string, unknown> | undefined
  check('inbox payload exposes ONLY items/qty/target (no applicant identity)',
    !!inboxItem && !JSON.stringify(inboxItem).includes(applicant.email) && !JSON.stringify(inboxItem).includes('SUP8 Applicant'))
  const inboxOther = await supplierFinancingInbox(nonAccreditedOwner.id, otherComp.id)
  check('NON-accredited company sees NOTHING in the inbox', inboxOther.length === 0)
  const supplierView = await getRfq(created.rfqId, { id: supplierOwner.id, role: 'BUYER' })
  check('supplier view of the RFQ ANONYMIZES the requester',
    supplierView.requester.email === '' && supplierView.requester.name === 'Applicant')
  const applicantView = await getRfq(created.rfqId, { id: applicant.id, role: 'BUYER' })
  check('applicant view KEEPS own identity + sees quotes list', applicantView.requester.id === applicant.id)

  // ── 4. quote authorization matrix ──
  console.log('── 4. Quote authorization (org-context) ──')
  const lineInput = { lines: [{ productId: product.id, quantity: 2, unitPrice: 490 }], paymentTerms: 'NET-30' }
  const lonelyUser = await mkUser('Lonely')
  await expectError('individual (no org context) CANNOT quote',
    () => createQuote(created.rfqId, { id: lonelyUser.id, role: 'BUYER' }, lineInput, null), 403, 'organization workspace')
  await expectError('financier org CANNOT quote (institutions do not supply)',
    () => createQuote(created.rfqId, { id: financier.id, role: 'BUYER' }, lineInput, { id: bank.id, orgType: 'BANK' }), 403, 'do not supply')
  await expectError('NON-accredited company cannot quote',
    () => createQuote(created.rfqId, { id: nonAccreditedOwner.id, role: 'BUYER' }, lineInput, { id: otherComp.id, orgType: 'COMPANY' }), 403, 'accredited')
  // a company quoting a product it does NOT offer
  const product2 = await db.product.create({
    data: {
      title: `SUP8 Panel ${SUFFIX}`, description: 'other', price: 300, images: '[]', categoryId: category!.id,
      sellerId: supplierOwner.id, stock: 10, slug: `sup8-panel-${SUFFIX}`, status: 'ACTIVE', approvalState: 'APPROVED',
    },
  })
  fixture.productIds.push(product2.id)
  await expectError('company cannot quote a product it does not OFFER',
    () => createQuote(created.rfqId, { id: supplierOwner.id, role: 'BUYER' }, { lines: [{ productId: product2.id, quantity: 1, unitPrice: 300 }] }, { id: supplierComp.id, orgType: 'COMPANY' }),
    403, 'does not actively offer')

  // the applicant's own org cannot quote its own sourcing RFQ
  await expectError('applicant org cannot quote its own RFQ',
    () => createQuote(created.rfqId, { id: applicant.id, role: 'BUYER' }, lineInput, { id: applicantComp.id, orgType: 'COMPANY' }), 409, 'own request')

  const quote = await createQuote(created.rfqId, { id: supplierStaff.id, role: 'BUYER' }, lineInput, { id: supplierComp.id, orgType: 'COMPANY' })
  fixture.quoteIds.push(quote.id)
  check('accredited supplier staff quotes successfully', quote.status === 'SENT')
  check('quote carries org attribution (sellerOrgId)', (quote as unknown as { sellerOrgId: string | null }).sellerOrgId === supplierComp.id)
  await expectError('quote above the org\'s offer stock is rejected',
    () => createQuote(created.rfqId, { id: supplierOwner.id, role: 'BUYER' }, { lines: [{ productId: product.id, quantity: 999, unitPrice: 1 }] }, { id: supplierComp.id, orgType: 'COMPANY' }),
    409, 'stock')

  // ── 5. consent gate for revisions + version history ──
  console.log('── 5. Material revision & renewed consent ──')
  const revised = await reviseSupplierRfq(applicant.id, created.rfqId, {
    lines: [{ productId: product.id, productName: product.title, quantity: 3, targetPrice: 470 }],
    reason: 'Quantity increased after site survey',
  })
  fixture.rfqIds.push(revised.rfqId)
  check('revision creates v2', revised.version === 2)
  const v2 = await db.rfq.findUnique({ where: { id: revised.rfqId } })
  const v1 = await db.rfq.findUnique({ where: { id: created.rfqId } })
  check('v2 consent RESET (renewed consent required)', v2?.consentAt === null)
  check('v1 preserved (CANCELLED, kept in history)', v1?.status === 'CANCELLED')
  const inboxBefore: { id: string }[] = (await supplierFinancingInbox(supplierStaff.id, supplierComp.id)) as { id: string }[]
  check('unconsented v2 does NOT reach suppliers', !inboxBefore.some((r) => r.id === revised.rfqId))
  const consented = await recordConsent(applicant.id, revised.rfqId)
  check('applicant consents to v2', !!consented.consentAt)
  const consentedAgain = await recordConsent(applicant.id, revised.rfqId)
  check('consent is idempotent per version', consentedAgain.version === 2)
  const inboxAfter: { id: string }[] = (await supplierFinancingInbox(supplierStaff.id, supplierComp.id)) as { id: string }[]
  check('consented v2 NOW reaches suppliers', inboxAfter.some((r) => r.id === revised.rfqId))
  await expectError('non-applicant cannot consent',
    () => recordConsent(nonAccreditedOwner.id, revised.rfqId), 403, 'another applicant')

  // ── 6. selection ≠ financing approval; order gate ──
  console.log('── 6. Selected quote ≠ financing approval ──')
  const quote2 = await createQuote(revised.rfqId, { id: supplierStaff.id, role: 'BUYER' }, { lines: [{ productId: product.id, quantity: 3, unitPrice: 475 }], paymentTerms: 'NET-30' }, { id: supplierComp.id, orgType: 'COMPANY' })
  fixture.quoteIds.push(quote2.id)
  const responded = await respondToQuote(quote2.id, applicant.id, 'ACCEPT')
  check('applicant accepts the supplier quote (RFQ ACCEPTED)', responded.quote.status === 'ACCEPTED' && responded.rfq.status === 'ACCEPTED')
  await expectError('order conversion BLOCKED before the financing agreement is active',
    () => convertQuoteToOrder(quote2.id, { id: applicant.id, role: 'BUYER' }, {}),
    409, 'Financing is not finalized')
  // non-member cannot convert
  await expectError('outsider cannot convert the quote',
    () => convertQuoteToOrder(quote2.id, { id: nonAccreditedOwner.id, role: 'BUYER' }, {}), 403)

  // finalize financing: offer ACCEPTED + ACTIVE agreement
  const finOffer = await db.financingOffer.create({
    data: {
      requestId: fr.id,
      createdById: financier.id,
      amount: 5000,
      currency: 'YER',
      rateType: 'MURABAHA_ANNUAL',
      ratePercent: 12,
      tenorMonths: 12,
      status: 'ACCEPTED',
      sentAt: new Date(),
      acceptedAt: new Date(),
    },
  })
  fixture.finOfferIds.push(finOffer.id)
  const agreement = await db.financingAgreement.create({
    data: {
      number: `AGR-SUP8-${SUFFIX}`,
      offerId: finOffer.id,
      status: 'ACTIVE',
      acceptedAt: new Date(),
    },
  })
  fixture.agreementIds.push(agreement.id)

  const converted = await convertQuoteToOrder(quote2.id, { id: applicant.id, role: 'BUYER' }, { poNumber: `PO-SUP8-${SUFFIX}` })
  fixture.orderIds.push((converted as { order: { id: string } }).order.id)
  const order = (converted as { order: { id: string; status: string; items: { sellerOrgId: string | null; offerId: string | null; quantity: number }[] } }).order
  check('order created after agreement ACTIVE (status PROCESSING)', order.status === 'PROCESSING')
  check('order items carry SELLER ORG + OFFER attribution',
    order.items.length === 1 && order.items[0].sellerOrgId === supplierComp.id && order.items[0].offerId === offer.id)
  const offerAfter = await db.productOffer.findUnique({ where: { id: offer.id } })
  check('offer stock decremented by the financed order (80 → 77)', offerAfter?.stock === 77)

  // ── 7. auditability ──
  console.log('── 7. Auditability ──')
  const auditActions = await db.auditLog.findMany({
    where: { createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) }, entityId: { in: [created.rfqId, revised.rfqId, quote2.id, (converted as { order: { id: string } }).order.id] } },
    select: { action: true },
  })
  for (const [label, action] of [
    ['SUPPLIER_RFQ_CREATED audited', 'SUPPLIER_RFQ_CREATED'],
    ['SUPPLIER_RFQ_REVISED audited', 'SUPPLIER_RFQ_REVISED'],
    ['SUPPLIER_RFQ_CONSENT audited', 'SUPPLIER_RFQ_CONSENT'],
    ['QUOTE_SENT audited', 'QUOTE_SENT'],
    ['QUOTE_CONVERTED audited', 'QUOTE_CONVERTED'],
  ] as const) {
    check(label, auditActions.some((a) => a.action === action), `missing ${action} in recent audit rows`)
  }

  console.log(`\n══ SUMMARY: ${passed} passed, ${failed} failed ══\n`)
  if (failures.length) {
    console.log('Failures:')
    for (const f of failures) console.log('  - ' + f)
  }
}

// Sequence helper — uses the app's own sequence service (transactional)
import { nextNumber } from '../src/server/modules/sequences/service'
async function nextNumberFixture(prefix: 'RFQ' | 'QTE' | 'DSP' | 'PY' | 'FIN' | 'AGR' | 'ACC' | 'CS' | 'CIV') {
  return nextNumber(prefix)
}

main()
  .catch((e) => {
    console.error('SUITE ERROR:', e)
    failed++ // a crash mid-suite is a failure even if no check() ran
    failures.push('SUITE CRASH: ' + (e as Error).message?.slice(0, 200))
  })
  .finally(async () => {
    try {
      if (fixture.orderIds.length) await db.order.deleteMany({ where: { id: { in: fixture.orderIds } } })
      if (fixture.agreementIds.length) await db.financingAgreement.deleteMany({ where: { id: { in: fixture.agreementIds } } })
      if (fixture.finOfferIds.length) await db.financingOffer.deleteMany({ where: { id: { in: fixture.finOfferIds } } })
      if (fixture.frIds.length) await db.financingRequest.deleteMany({ where: { id: { in: fixture.frIds } } })
      if (fixture.quoteIds.length) await db.quote.deleteMany({ where: { id: { in: fixture.quoteIds } } })
      if (fixture.rfqIds.length) await db.rfq.deleteMany({ where: { id: { in: fixture.rfqIds } } })
      if (fixture.offerIds.length) await db.productOffer.deleteMany({ where: { id: { in: fixture.offerIds } } })
      if (fixture.accreditationIds.length) await db.accreditationRequest.deleteMany({ where: { id: { in: fixture.accreditationIds } } })
      if (fixture.serviceIds.length) await db.financierService.deleteMany({ where: { id: { in: fixture.serviceIds } } })
      if (fixture.financierProfileIds.length) await db.financierProfile.deleteMany({ where: { id: { in: fixture.financierProfileIds } } })
      if (fixture.productIds.length) await db.product.deleteMany({ where: { id: { in: fixture.productIds } } })
      for (const oid of fixture.orgIds) {
        await db.userRole.deleteMany({ where: { organizationId: oid } })
        await db.organizationMember.deleteMany({ where: { organizationId: oid } })
      }
      await db.role.deleteMany({ where: { key: { startsWith: `sup8.staff.` } } })
      if (fixture.userIds.length) await db.user.deleteMany({ where: { id: { in: fixture.userIds } } })
      if (fixture.orgIds.length) await db.organization.deleteMany({ where: { id: { in: fixture.orgIds } } })
      console.log('── cleanup complete (test fixtures removed) ──')
    } catch (e) {
      console.error('CLEANUP ERROR:', e)
    }
    await db.$disconnect()
    process.exit(failed > 0 ? 1 : 0)
  })
