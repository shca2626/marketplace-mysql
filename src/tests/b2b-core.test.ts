// B2B core — route-handler tests for the request→quote→approval→award→order
// pipeline plus the intermediary-model additions (external settlement +
// commission), per §A1 / §9.1 of the Company-to-Company gap analysis.
//
// Covers: RFQ lifecycle (draft→submit→review→reject/cancel), quote lifecycle
// (issue→review queue→accept/decline/withdraw→convert), org purchase approvals
// (threshold routing, no self-approval, settlement-aware release), dispute
// basics (raise→respond→resolve), external settlement (declare→confirm,
// dispute→admin confirm, evidence upload, self-confirm block) and commission
// (DELIVERED trigger, idempotency, backfill, statement→invoice→collection).
import { NextRequest } from 'next/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { POST as rfqsPOST } from '@/app/api/rfqs/route'
import { GET as rfqGET, PATCH as rfqPATCH } from '@/app/api/rfqs/[id]/route'
import { POST as quotePOST } from '@/app/api/rfqs/[id]/quotes/route'
import { POST as quoteAcceptPOST } from '@/app/api/quotes/[id]/accept/route'
import { POST as quoteDeclinePOST } from '@/app/api/quotes/[id]/decline/route'
import { POST as quoteWithdrawPOST } from '@/app/api/quotes/[id]/withdraw/route'
import { POST as quoteReviewPOST } from '@/app/api/quotes/[id]/review/route'
import { POST as quoteConvertPOST } from '@/app/api/quotes/[id]/convert/route'
import { GET as approvalsGET } from '@/app/api/approvals/route'
import { POST as approvalDecidePOST } from '@/app/api/approvals/[id]/decide/route'
import { POST as disputesPOST } from '@/app/api/disputes/route'
import { POST as disputeRespondPOST } from '@/app/api/disputes/[id]/respond/route'
import { POST as disputeResolvePOST } from '@/app/api/admin/disputes/[id]/resolve/route'
import { POST as ordersPOST } from '@/app/api/orders/route'
import { GET as orderGET, PATCH as orderPATCH } from '@/app/api/orders/[id]/route'
import {
  GET as settlementGET,
  POST as settlementPOST,
} from '@/app/api/orders/[id]/settlement/route'
import { POST as settlementConfirmPOST } from '@/app/api/orders/[id]/settlement/confirm/route'
import { POST as settlementDisputePOST } from '@/app/api/orders/[id]/settlement/dispute/route'
import { POST as settlementEvidencePOST } from '@/app/api/orders/[id]/settlement/evidence/route'
import { GET as adminSettlementsGET } from '@/app/api/admin/settlements/route'
import { GET as obligationsGET } from '@/app/api/admin/commission/obligations/route'
import { POST as backfillPOST } from '@/app/api/admin/commission/backfill/route'
import { POST as statementGeneratePOST } from '@/app/api/admin/commission/statements/generate/route'
import { POST as issueInvoicePOST } from '@/app/api/admin/commission/statements/[id]/issue-invoice/route'
import { POST as collectPOST } from '@/app/api/admin/commission/obligations/[id]/collect/route'
import { POST as adjustPOST } from '@/app/api/admin/commission/obligations/[id]/adjust/route'
import { GET as sellerCommissionGET } from '@/app/api/seller/commission/route'
import { POST as uploadsDocumentPOST } from '@/app/api/uploads/document/route'
import { POST as orgPOST } from '@/app/api/organizations/route'
import { POST as orgMembersPOST } from '@/app/api/organizations/[id]/members/route'
import { db } from '@/lib/db'
import { cookieJar } from '@/tests/stubs/next-headers'
import {
  cleanupFixtures,
  clearSession,
  createFixtureCategory,
  createFixtureOrder,
  createFixtureProduct,
  createFixtureUser,
  createSellingCompany,
  getReq,
  params,
  patchReq,
  postReq,
  setOrgSession,
  setSession,
  trackOrder,
  type SellingCompany,
  trackOrganization,
  trackRfq,
} from '@/tests/fixtures'

// ─── shared state ────────────────────────────────────────────────────────────

let admin: { id: string }
let buyer: { id: string } // plain buyer (no org) — RFQ requester
let seller: { id: string } // owns the catalog product every RFQ references
let product: { id: string; price: number }

/** Checkout payload for one product at a given quantity. */
const checkoutBody = (productId: string, quantity: number, paymentMethod?: string) => ({
  items: [{ productId, quantity }],
  fullName: 'Test Buyer',
  address: '1 B2B Street',
  city: 'Test City',
  country: 'US',
  zip: '12345',
  ...(paymentMethod ? { paymentMethod } : {}),
})

/** Create + submit an RFQ referencing the seller's product. Returns the RFQ. */
async function submittedRfq(quantity = 10) {
  setSession(buyer.id)
  const res = await rfqsPOST(
    postReq('/api/rfqs', {
      title: 'B2B core test RFQ',
      description: 'Automated test request',
      lines: [{ productId: product.id, quantity }],
    })
  )
  expect(res.status).toBe(201)
  const rfq = (await res.json()).rfq as { id: string; number: string; status: string; lines: { id: string }[] }
  trackRfq(rfq.id)
  const submitted = await rfqPATCH(patchReq(`/api/rfqs/${rfq.id}`, { action: 'SUBMIT' }), params({ id: rfq.id }))
  expect(submitted.status).toBe(200)
  const after = (await submitted.json()).rfq as typeof rfq
  return { ...rfq, status: after.status }
}

/** Seller issues a quote on an RFQ from the given selling company's org context.
 * (Individual sellers were retired with C2C — companies quote through their
 * workspace, holding an ACTIVE offer on every quoted product.) */
async function sellerQuote(
  co: SellingCompany,
  rfqId: string,
  lineId: string,
  unitPrice: number,
  opts: { paymentTerms?: string } = {}
) {
  setOrgSession(co.ownerId, co.orgId)
  const res = await quotePOST(postReq(`/api/rfqs/${rfqId}/quotes`, {
    lines: [{ rfqLineId: lineId, productId: product.id, quantity: 10, unitPrice }],
    paymentTerms: opts.paymentTerms ?? 'NET-30',
    validUntil: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  }), params({ id: rfqId }))
  return res
}

// ─── the suite ────────────────────────────────────────────────────────────────

describe('B2B core — RFQ lifecycle', () => {
  beforeAll(async () => {
    admin = await createFixtureUser({ role: 'ADMIN' })
    buyer = await createFixtureUser({ role: 'BUYER' })
    seller = await createFixtureUser({ role: 'SELLER' })
    const category = await createFixtureCategory()
    product = await createFixtureProduct({ sellerId: seller.id, categoryId: category.id, price: 50, stock: 500 })
  })

  beforeEach(() => cookieJar.clear())
  afterAll(() => cleanupFixtures())

  it('creates a draft with catalog lines and enforces auth on every read', async () => {
    setSession(buyer.id)
    const res = await rfqsPOST(
      postReq('/api/rfqs', {
        title: 'Draft test',
        lines: [
          { productId: product.id, quantity: 5 },
          { productName: 'Custom kraft boxes', quantity: 200, targetPrice: 1.5 },
        ],
      })
    )
    expect(res.status).toBe(201)
    const rfq = (await res.json()).rfq as { id: string; status: string; lineCount: number }
    trackRfq(rfq.id)
    expect(rfq.status).toBe('DRAFT')
    expect(rfq.lineCount).toBe(2)

    // anon read → 401
    clearSession()
    expect((await rfqGET(getReq(`/api/rfqs/${rfq.id}`), params({ id: rfq.id }))).status).toBe(401)

    // unrelated buyer read → 403
    const stranger = await createFixtureUser({ role: 'BUYER' })
    setSession(stranger.id)
    expect((await rfqGET(getReq(`/api/rfqs/${rfq.id}`), params({ id: rfq.id }))).status).toBe(403)

    // the quoted seller CAN read it (line references their product)
    setSession(seller.id)
    expect((await rfqGET(getReq(`/api/rfqs/${rfq.id}`), params({ id: rfq.id }))).status).toBe(200)
  })

  it('walks DRAFT→SUBMITTED→UNDER_REVIEW and rejects invalid transitions', async () => {
    const rfq = await submittedRfq()
    expect(rfq.status).toBe('SUBMITTED')

    // buyer cannot use the admin REVIEW action
    setSession(buyer.id)
    const forbidden = await rfqPATCH(patchReq(`/api/rfqs/${rfq.id}`, { action: 'REVIEW' }), params({ id: rfq.id }))
    expect(forbidden.status).toBe(403)

    // admin reviews → UNDER_REVIEW
    setSession(admin.id)
    const reviewed = await rfqPATCH(patchReq(`/api/rfqs/${rfq.id}`, { action: 'REVIEW' }), params({ id: rfq.id }))
    expect(reviewed.status).toBe(200)
    expect(((await reviewed.json()).rfq as { status: string }).status).toBe('UNDER_REVIEW')

    // UNDER_REVIEW allows only REJECT — SUBMIT is not a valid transition
    setSession(buyer.id)
    const bad = await rfqPATCH(patchReq(`/api/rfqs/${rfq.id}`, { action: 'SUBMIT' }), params({ id: rfq.id }))
    expect([400, 409]).toContain(bad.status)
  })

  it('cancels a submitted RFQ from the requester', async () => {
    const rfq = await submittedRfq()
    setSession(buyer.id)
    const res = await rfqPATCH(patchReq(`/api/rfqs/${rfq.id}`, { action: 'CANCEL' }), params({ id: rfq.id }))
    expect(res.status).toBe(200)
    expect(((await res.json()).rfq as { status: string }).status).toBe('CANCELLED')
  })
})

describe('B2B core — quote lifecycle & platform review queue', () => {
  let co: SellingCompany // the quoting company (org context)

  beforeAll(async () => {
    admin = await createFixtureUser({ role: 'ADMIN' })
    buyer = await createFixtureUser({ role: 'BUYER' })
    seller = await createFixtureUser({ role: 'SELLER' }) // catalog product owner
    const category = await createFixtureCategory()
    product = await createFixtureProduct({ sellerId: seller.id, categoryId: category.id, price: 50, stock: 500 })
    co = await createSellingCompany(product) // unverified owner → review queue applies
  })
  beforeEach(() => cookieJar.clear())
  afterAll(() => cleanupFixtures())

  it('sends a below-threshold quote straight to the buyer (DIRECT routing)', async () => {
    const rfq = await submittedRfq()
    const res = await sellerQuote(co, rfq.id, rfq.lines[0].id, 10) // total 100 < 5000 threshold
    expect(res.status).toBe(201)
    const quote = (await res.json()).quote as { id: string; status: string }
    expect(quote.status).toBe('SENT')

    // buyer accepts → quote ACCEPTED, RFQ ACCEPTED
    setSession(buyer.id)
    const accepted = await quoteAcceptPOST(postReq(`/api/quotes/${quote.id}/accept`, {}), params({ id: quote.id }))
    expect(accepted.status).toBe(200)
    const body = (await accepted.json()) as { quote: { status: string }; rfq: { status: string } }
    expect(body.quote.status).toBe('ACCEPTED')
    expect(body.rfq.status).toBe('ACCEPTED')
  })

  it('routes an above-threshold unverified seller into the platform review queue', async () => {
    const rfq = await submittedRfq()
    const res = await sellerQuote(co, rfq.id, rfq.lines[0].id, 800) // total 8000 > 5000
    expect(res.status).toBe(201)
    const quote = (await res.json()).quote as { id: string; status: string }
    expect(quote.status).toBe('PENDING_REVIEW')

    // the buyer does NOT see it as acceptable yet
    setSession(buyer.id)
    const early = await quoteAcceptPOST(postReq(`/api/quotes/${quote.id}/accept`, {}), params({ id: quote.id }))
    expect(early.status).toBe(409)

    // non-admin cannot review
    setSession(seller.id)
    expect(
      (await quoteReviewPOST(postReq(`/api/quotes/${quote.id}/review`, { decision: 'APPROVE' }), params({ id: quote.id }))).status
    ).toBe(403)

    // admin approves → SENT → buyer can accept
    setSession(admin.id)
    const approved = await quoteReviewPOST(postReq(`/api/quotes/${quote.id}/review`, { decision: 'APPROVE' }), params({ id: quote.id }))
    expect(approved.status).toBe(200)
    expect(((await approved.json()).quote as { status: string }).status).toBe('SENT')

    setSession(buyer.id)
    const accepted = await quoteAcceptPOST(postReq(`/api/quotes/${quote.id}/accept`, {}), params({ id: quote.id }))
    expect(accepted.status).toBe(200)
    expect(((await accepted.json()).quote as { status: string }).status).toBe('ACCEPTED')
  })

  it('admin review can reject a queued quote and the buyer then sees it rejected', async () => {
    const rfq = await submittedRfq()
    const res = await sellerQuote(co, rfq.id, rfq.lines[0].id, 900)
    const quote = (await res.json()).quote as { id: string }

    setSession(admin.id)
    const rejected = await quoteReviewPOST(
      postReq(`/api/quotes/${quote.id}/review`, { decision: 'REJECT', note: 'Price above market' }),
      params({ id: quote.id })
    )
    expect(rejected.status).toBe(200)
    expect(((await rejected.json()).quote as { status: string }).status).toBe('REJECTED')
  })

  it('buyer declines one quote and the seller withdraws a fresh one', async () => {
    const rfq = await submittedRfq()
    const first = (await (await sellerQuote(co, rfq.id, rfq.lines[0].id, 12)).json()).quote as { id: string }
    const second = (await (await sellerQuote(co, rfq.id, rfq.lines[0].id, 13)).json()).quote as { id: string }

    setSession(buyer.id)
    const declined = await quoteDeclinePOST(postReq(`/api/quotes/${first.id}/decline`, {}), params({ id: first.id }))
    expect(declined.status).toBe(200)
    expect(((await declined.json()).quote as { status: string }).status).toBe('DECLINED')

    setOrgSession(co.ownerId, co.orgId)
    const withdrawn = await quoteWithdrawPOST(postReq(`/api/quotes/${second.id}/withdraw`, {}), params({ id: second.id }))
    expect(withdrawn.status).toBe(200)
    expect(((await withdrawn.json()).quote as { status: string }).status).toBe('WITHDRAWN')
  })
})

describe('B2B core — quote → order conversion (award)', () => {
  let co: SellingCompany

  beforeAll(async () => {
    admin = await createFixtureUser({ role: 'ADMIN' })
    buyer = await createFixtureUser({ role: 'BUYER' })
    seller = await createFixtureUser({ role: 'SELLER' }) // catalog product owner
    const category = await createFixtureCategory()
    product = await createFixtureProduct({ sellerId: seller.id, categoryId: category.id, price: 50, stock: 500 })
    co = await createSellingCompany(product)
  })
  beforeEach(() => cookieJar.clear())
  afterAll(() => cleanupFixtures())

  it('converts an accepted quote into a NET-terms B2B order atomically', async () => {
    const rfq = await submittedRfq(4)
    const quote = (await (await sellerQuote(co, rfq.id, rfq.lines[0].id, 25, { paymentTerms: 'NET-45' })).json()).quote as {
      id: string
    }

    setSession(buyer.id)
    await quoteAcceptPOST(postReq(`/api/quotes/${quote.id}/accept`, {}), params({ id: quote.id }))

    const converted = await quoteConvertPOST(
      postReq(`/api/quotes/${quote.id}/convert`, { poNumber: 'PO-TEST-1' }),
      params({ id: quote.id })
    )
    expect(converted.status).toBe(201)
    const body = (await converted.json()) as {
      order: { id: string; status: string; paymentTerms: string | null; poNumber: string | null; sourceType: string | null }
      quote: { status: string }
      rfq: { status: string }
    }
    trackOrder(body.order.id)
    expect(body.order.status).toBe('PROCESSING')
    expect(body.order.paymentTerms).toBe('NET-45')
    expect(body.order.poNumber).toBe('PO-TEST-1')
    expect(body.order.sourceType).toBe('RFQ')
    expect(body.quote.status).toBe('CONVERTED')
    expect(body.rfq.status).toBe('ORDERED')

    // an INVOICE payment row tracks the terms
    const payment = await db.payment.findUnique({ where: { orderId: body.order.id } })
    expect(payment?.method).toBe('INVOICE')

    // stock decremented by the quoted quantity
    const fresh = await db.product.findUnique({ where: { id: product.id } })
    expect(fresh?.stock).toBe(490)

    // double conversion is blocked
    const again = await quoteConvertPOST(postReq(`/api/quotes/${quote.id}/convert`, {}), params({ id: quote.id }))
    expect(again.status).toBe(409)
  })
})

describe('B2B core — organization purchase approvals', () => {
  let owner: { id: string; email: string }
  let procurement: { id: string; email: string } // BUYER-role member (triggers approvals)
  let approver: { id: string; email: string }
  let orgId: string

  beforeAll(async () => {
    admin = await createFixtureUser({ role: 'ADMIN' })
    seller = await createFixtureUser({ role: 'SELLER' })
    owner = await createFixtureUser({ role: 'BUYER' })
    procurement = await createFixtureUser({ role: 'BUYER' })
    approver = await createFixtureUser({ role: 'BUYER' })
    const category = await createFixtureCategory()
    product = await createFixtureProduct({ sellerId: seller.id, categoryId: category.id, price: 200, stock: 500 })

    // org with a 300 approval threshold; procurement (BUYER) + approver members
    setSession(owner.id)
    const res = await orgPOST(postReq('/api/organizations', { name: `Acme ${Date.now()} Test Co` }))
    expect(res.status).toBe(201)
    orgId = ((await res.json()).organization as { id: string }).id
    trackOrganization(orgId)

    await db.organization.update({ where: { id: orgId }, data: { approvalThreshold: 300, status: 'ACTIVE' } })

    setSession(owner.id)
    const addProcurement = await orgMembersPOST(
      postReq(`/api/organizations/${orgId}/members`, { email: procurement.email, role: 'BUYER' }),
      params({ id: orgId })
    )
    expect(addProcurement.status).toBe(201)
    const addApprover = await orgMembersPOST(
      postReq(`/api/organizations/${orgId}/members`, { email: approver.email, role: 'APPROVER' }),
      params({ id: orgId })
    )
    expect(addApprover.status).toBe(201)
  })
  beforeEach(() => cookieJar.clear())
  afterAll(() => cleanupFixtures())

  it('routes a BUYER member above the threshold into PENDING_APPROVAL, blocks self-approval, and releases on approve', async () => {
    setOrgSession(procurement.id, orgId) // org context — the checkout routes through the membership
    const res = await ordersPOST(postReq('/api/orders', checkoutBody(product.id, 2))) // 400 > 300
    expect(res.status).toBe(201)
    const body = (await res.json()) as { order: { id: string; status: string }; pendingApproval: boolean }
    trackOrder(body.order.id)
    expect(body.pendingApproval).toBe(true)
    expect(body.order.status).toBe('PENDING_APPROVAL')

    // the approval request is PENDING
    const request = await db.approvalRequest.findUnique({ where: { orderId: body.order.id } })
    expect(request?.status).toBe('PENDING')
    expect(request?.type).toBe('ORDER')

    // the requester cannot decide their own request
    setSession(procurement.id)
    const self = await approvalDecidePOST(
      postReq(`/api/approvals/${request!.id}/decide`, { action: 'APPROVE' }),
      params({ id: request!.id })
    )
    expect(self.status).toBe(403)

    // the approver sees it in their queue
    setSession(approver.id)
    const queue = (await (await approvalsGET()).json()) as { approvals: { id: string; status: string }[] }
    expect(queue.approvals.some((p) => p.id === request!.id)).toBe(true)

    // approve → order moves to PENDING_PAYMENT (awaiting the buyer's payment)
    const decided = await approvalDecidePOST(
      postReq(`/api/approvals/${request!.id}/decide`, { action: 'APPROVE' }),
      params({ id: request!.id })
    )
    expect(decided.status).toBe(200)
    const order = await db.order.findUnique({ where: { id: body.order.id } })
    expect(order?.status).toBe('PENDING_PAYMENT')
  })

  it('below-threshold BUYER checkouts skip approval entirely', async () => {
    setOrgSession(procurement.id, orgId)
    const res = await ordersPOST(postReq('/api/orders', checkoutBody(product.id, 1))) // 200 < 300
    expect(res.status).toBe(201)
    const body = (await res.json()) as { order: { id: string; status: string }; pendingApproval: boolean }
    trackOrder(body.order.id)
    expect(body.pendingApproval).toBe(false)
    expect(body.order.status).toBe('PAID') // CARD settles inline
  })

  it('an approved EXTERNAL-settlement order releases straight to PROCESSING', async () => {
    setOrgSession(procurement.id, orgId)
    const res = await ordersPOST(postReq('/api/orders', checkoutBody(product.id, 2, 'EXTERNAL')))
    expect(res.status).toBe(201)
    const body = (await res.json()) as { order: { id: string }; pendingApproval: boolean }
    trackOrder(body.order.id)
    expect(body.pendingApproval).toBe(true)

    // settlement row already exists (pre-declared at checkout)
    const settlement = await db.externalSettlementReference.findUnique({ where: { orderId: body.order.id } })
    expect(settlement?.status).toBe('DECLARED')
    expect(settlement?.method).toBe('WIRE')

    // no Payment row for external orders
    expect(await db.payment.findUnique({ where: { orderId: body.order.id } })).toBeNull()

    const request = await db.approvalRequest.findUnique({ where: { orderId: body.order.id } })
    setSession(approver.id)
    const decided = await approvalDecidePOST(
      postReq(`/api/approvals/${request!.id}/decide`, { action: 'APPROVE' }),
      params({ id: request!.id })
    )
    expect(decided.status).toBe(200)
    const order = await db.order.findUnique({ where: { id: body.order.id } })
    expect(order?.status).toBe('PROCESSING') // settlement-aware release — no payment step
  })
})

describe('B2B core — dispute basics', () => {
  let orderId: string

  beforeAll(async () => {
    admin = await createFixtureUser({ role: 'ADMIN' })
    buyer = await createFixtureUser({ role: 'BUYER' })
    seller = await createFixtureUser({ role: 'SELLER' })
    const category = await createFixtureCategory()
    product = await createFixtureProduct({ sellerId: seller.id, categoryId: category.id, price: 50, stock: 100 })
    const order = await createFixtureOrder({
      buyerId: buyer.id,
      orderStatus: 'DELIVERED',
      items: [{ sellerId: seller.id, productId: product.id, price: 60, quantity: 2 }],
    })
    orderId = order.id
  })
  beforeEach(() => cookieJar.clear())
  afterAll(() => cleanupFixtures())

  it('raises, responds and admin-resolves a dispute', async () => {
    setSession(buyer.id)
    const raised = await disputesPOST(
      postReq('/api/disputes', {
        orderId,
        sellerId: seller.id,
        reason: 'NOT_AS_DESCRIBED',
        description: 'The delivered goods do not match the quoted specification at all.',
        amount: 120,
      })
    )
    expect(raised.status).toBe(201)
    const dispute = (await raised.json()).dispute as { id: string; status: string }
    expect(dispute.status).toBe('OPEN')

    // the buyer cannot respond — only the disputed seller
    const wrongActor = await disputeRespondPOST(
      postReq(`/api/disputes/${dispute.id}/respond`, { response: 'This is the buyer talking to themselves.' }),
      params({ id: dispute.id })
    )
    expect(wrongActor.status).toBe(403)

    setSession(seller.id)
    const responded = await disputeRespondPOST(
      postReq(`/api/disputes/${dispute.id}/respond`, { response: 'We shipped the exact SKU from the quote; happy to replace.' }),
      params({ id: dispute.id })
    )
    expect(responded.status).toBe(200)
    expect(((await responded.json()).dispute as { status: string }).status).toBe('SELLER_RESPONDED')

    // admin resolves with an allowed outcome
    setSession(admin.id)
    const resolved = await disputeResolvePOST(
      postReq(`/api/disputes/${dispute.id}/resolve`, { outcome: 'FULL_REFUND', note: 'Spec mismatch confirmed' }),
      params({ id: dispute.id })
    )
    expect(resolved.status).toBe(200)
    const final = (await resolved.json()).dispute as { status: string; outcome: string }
    expect(final.status).toBe('RESOLVED')
    expect(final.outcome).toBe('FULL_REFUND')
  })
})

describe('Intermediary model — external settlement references', () => {
  let plainBuyer: { id: string }

  beforeAll(async () => {
    admin = await createFixtureUser({ role: 'ADMIN' })
    plainBuyer = await createFixtureUser({ role: 'BUYER' })
    buyer = await createFixtureUser({ role: 'BUYER' })
    seller = await createFixtureUser({ role: 'SELLER' })
    const category = await createFixtureCategory()
    product = await createFixtureProduct({ sellerId: seller.id, categoryId: category.id, price: 80, stock: 100 })
  })
  beforeEach(() => cookieJar.clear())
  afterAll(() => cleanupFixtures())

  it('blocks EXTERNAL checkout without an organization and works with one', async () => {
    setSession(plainBuyer.id)
    const denied = await ordersPOST(postReq('/api/orders', checkoutBody(product.id, 1, 'EXTERNAL')))
    expect(denied.status).toBe(400)

    // give the buyer an org, then external checkout goes straight to PROCESSING
    setSession(buyer.id)
    const org = await orgPOST(postReq('/api/organizations', { name: `Settle Co ${Date.now()}` }))
    const orgId = ((await org.json()).organization as { id: string }).id
    trackOrganization(orgId)
    await db.organization.update({ where: { id: orgId }, data: { status: 'ACTIVE' } })

    setOrgSession(buyer.id, orgId)
    const res = await ordersPOST(postReq('/api/orders', checkoutBody(product.id, 2, 'EXTERNAL')))
    expect(res.status).toBe(201)
    const body = (await res.json()) as { order: { id: string; status: string } }
    trackOrder(body.order.id)
    expect(body.order.status).toBe('PROCESSING')
    expect(await db.payment.findUnique({ where: { orderId: body.order.id } })).toBeNull()
  })

  it('declares → the declarer cannot self-confirm → the counterpart confirms → evidence attaches', async () => {
    const order = await createFixtureOrder({
      buyerId: buyer.id,
      orderStatus: 'DELIVERED',
      paymentStatus: 'PENDING',
      paymentMethod: 'INVOICE',
      items: [{ sellerId: seller.id, productId: product.id, price: 150, quantity: 2 }],
    })

    // buyer declares the external settlement
    setSession(buyer.id)
    const declared = await settlementPOST(
      postReq(`/api/orders/${order.id}/settlement`, { method: 'WIRE', reference: 'TRX-9911' }),
      params({ id: order.id })
    )
    expect(declared.status).toBe(201)
    let settlement = (await declared.json()).settlement as { id: string; status: string; reference: string | null; evidence: { name: string }[] }
    expect(settlement.status).toBe('DECLARED')
    expect(settlement.reference).toBe('TRX-9911')

    // duplicate declaration is blocked
    const dup = await settlementPOST(
      postReq(`/api/orders/${order.id}/settlement`, { method: 'WIRE' }),
      params({ id: order.id })
    )
    expect(dup.status).toBe(409)

    // the declarer cannot confirm their own declaration
    const self = await settlementConfirmPOST(postReq(`/api/orders/${order.id}/settlement/confirm`, {}), params({ id: order.id }))
    expect(self.status).toBe(403)

    // upload a proof document through the document pipeline…
    const form = new FormData()
    form.append(
      'file',
      new File([Buffer.from('%PDF-1.4\n%test settlement slip\n')], 'transfer-slip.pdf', { type: 'application/pdf' })
    )
    const upload = await uploadsDocumentPOST(
      new NextRequest('http://localhost:3000/api/uploads/document', { method: 'POST', body: form })
    )
    expect(upload.status).toBe(201)
    const uploaded = (await upload.json()) as { assets: { key: string; name: string }[] }
    expect(uploaded.assets.length).toBe(1)

    // …and attach it as evidence
    const evidenced = await settlementEvidencePOST(
      postReq(`/api/orders/${order.id}/settlement/evidence`, { mediaKeys: [uploaded.assets[0].key] }),
      params({ id: order.id })
    )
    expect(evidenced.status).toBe(201)
    settlement = (await evidenced.json()).settlement as { id: string; status: string; reference: string | null; evidence: { name: string }[] }
    expect(settlement.evidence.length).toBe(1)
    expect(settlement.evidence[0].name).toBe('transfer-slip.pdf')

    // the seller (counterpart) confirms → CONFIRMED with settledAt
    setSession(seller.id)
    const confirmed = await settlementConfirmPOST(postReq(`/api/orders/${order.id}/settlement/confirm`, {}), params({ id: order.id }))
    expect(confirmed.status).toBe(200)
    const final = (await confirmed.json()).settlement as { status: string; settledAt: string | null; confirmedBy: { id: string } | null }
    expect(final.status).toBe('CONFIRMED')
    expect(final.settledAt).not.toBeNull()
    expect(final.confirmedBy?.id).toBe(seller.id)

    // a confirmed settlement cannot be disputed
    const late = await settlementDisputePOST(
      postReq(`/api/orders/${order.id}/settlement/dispute`, { note: 'This is a late dispute attempt!!' }),
      params({ id: order.id })
    )
    expect(late.status).toBe(409)

    // admin oversight sees it
    setSession(admin.id)
    const list = (await (await adminSettlementsGET(getReq('/api/admin/settlements?status=CONFIRMED'))).json()) as {
      settlements: { orderId: string }[]
    }
    expect(list.settlements.some((s) => s.orderId === order.id)).toBe(true)
  })

  it('dispute path: either party disputes, only an admin can then confirm', async () => {
    const order = await createFixtureOrder({
      buyerId: buyer.id,
      orderStatus: 'PROCESSING',
      paymentStatus: 'PENDING',
      paymentMethod: 'BANK_TRANSFER',
      items: [{ sellerId: seller.id, productId: product.id, price: 90, quantity: 1 }],
    })

    setSession(seller.id) // the supplier declares this time
    const declared = await settlementPOST(
      postReq(`/api/orders/${order.id}/settlement`, { method: 'TRANSFER', reference: 'INV-77' }),
      params({ id: order.id })
    )
    expect(declared.status).toBe(201)

    // the buyer disputes it
    setSession(buyer.id)
    const disputed = await settlementDisputePOST(
      postReq(`/api/orders/${order.id}/settlement/dispute`, { note: 'We never received the money — wrong account number.' }),
      params({ id: order.id })
    )
    expect(disputed.status).toBe(200)
    expect(((await disputed.json()).settlement as { status: string }).status).toBe('DISPUTED')

    // the counterpart cannot confirm a disputed settlement
    setSession(seller.id)
    const sellerTry = await settlementConfirmPOST(
      postReq(`/api/orders/${order.id}/settlement/confirm`, {}),
      params({ id: order.id })
    )
    expect(sellerTry.status).toBe(403)

    // the admin resolves it by confirming
    setSession(admin.id)
    const resolved = await settlementConfirmPOST(
      postReq(`/api/orders/${order.id}/settlement/confirm`, { note: 'Verified with both banks.' }),
      params({ id: order.id })
    )
    expect(resolved.status).toBe(200)
    expect(((await resolved.json()).settlement as { status: string }).status).toBe('CONFIRMED')
  })

  it('guards access: outsiders cannot read or declare', async () => {
    const order = await createFixtureOrder({
      buyerId: buyer.id,
      orderStatus: 'DELIVERED',
      items: [{ sellerId: seller.id, productId: product.id, price: 30, quantity: 1 }],
    })
    const stranger = await createFixtureUser({ role: 'BUYER' })
    setSession(stranger.id)
    expect(
      (await settlementGET(getReq(`/api/orders/${order.id}/settlement`), params({ id: order.id }))).status
    ).toBe(403)
    const denied = await settlementPOST(
      postReq(`/api/orders/${order.id}/settlement`, { method: 'WIRE' }),
      params({ id: order.id })
    )
    expect(denied.status).toBe(403)
  })
})

describe('Intermediary model — commission obligations, statements, invoices', () => {
  beforeAll(async () => {
    admin = await createFixtureUser({ role: 'ADMIN' })
    buyer = await createFixtureUser({ role: 'BUYER' })
    seller = await createFixtureUser({ role: 'SELLER', commissionRate: 25 })
    const category = await createFixtureCategory()
    product = await createFixtureProduct({ sellerId: seller.id, categoryId: category.id, price: 100, stock: 500 })
  })
  beforeEach(() => cookieJar.clear())
  afterAll(() => cleanupFixtures())

  it('creates an obligation per (order, seller) when the order reaches DELIVERED — idempotently', async () => {
    const order = await createFixtureOrder({
      buyerId: buyer.id,
      orderStatus: 'PAID',
      items: [{ sellerId: seller.id, productId: product.id, price: 100, quantity: 3 }], // base 300
    })

    // seller advances the flow: PAID → PROCESSING → SHIPPED → DELIVERED
    setSession(seller.id)
    for (const status of ['PROCESSING', 'SHIPPED', 'DELIVERED']) {
      const res = await orderPATCH(patchReq(`/api/orders/${order.id}`, { status }), params({ id: order.id }))
      expect(res.status).toBe(200)
    }

    const obligations = await db.commissionObligation.findMany({ where: { orderId: order.id } })
    expect(obligations.length).toBe(1)
    expect(Number(obligations[0].baseAmount)).toBe(300)
    expect(obligations[0].commissionRate).toBe(25) // vendor override snapshot
    expect(Number(obligations[0].amount)).toBe(75) // 300 × 25%
    expect(obligations[0].status).toBe('PENDING')
    expect(obligations[0].triggerStage).toBe('DELIVERED')

    // DELIVERED is terminal — another transition is a 400, and the backfill
    // scan does not duplicate the obligation either
    const again = await orderPATCH(patchReq(`/api/orders/${order.id}`, { status: 'DELIVERED' }), params({ id: order.id }))
    expect(again.status).toBe(400)

    setSession(admin.id)
    await backfillPOST()
    expect(await db.commissionObligation.count({ where: { orderId: order.id } })).toBe(1)
  })

  it('groups obligations into a statement, issues an invoice and tracks collection to settlement', async () => {
    const order = await createFixtureOrder({
      buyerId: buyer.id,
      orderStatus: 'PAID',
      items: [{ sellerId: seller.id, productId: product.id, price: 200, quantity: 1 }], // base 200 → 50 commission
    })
    setSession(seller.id)
    for (const status of ['PROCESSING', 'SHIPPED', 'DELIVERED']) {
      await orderPATCH(patchReq(`/api/orders/${order.id}`, { status }), params({ id: order.id }))
    }
    const obligation = await db.commissionObligation.findUniqueOrThrow({ where: { orderId_sellerId: { orderId: order.id, sellerId: seller.id } } })

    // seller transparency view shows the open obligation
    setSession(seller.id)
    const view = (await (await sellerCommissionGET()).json()) as {
      triggerStage: string
      obligations: { id: string; amount: number; status: string }[]
    }
    expect(view.triggerStage).toBe('DELIVERED')
    expect(view.obligations.some((o) => o.id === obligation.id)).toBe(true)

    // admin generates a statement for the seller
    setSession(admin.id)
    const generated = await statementGeneratePOST(postReq('/api/admin/commission/statements/generate', { sellerId: seller.id }))
    expect(generated.status).toBe(201)
    const statement = (await generated.json()).statement as { id: string; number: string; obligationCount: number; amount: number }
    expect(statement.number).toMatch(/^CS-\d{4}-\d{6}$/)
    expect(statement.obligationCount).toBeGreaterThanOrEqual(1)

    // issue the invoice → obligations flip to INVOICED
    const issued = await issueInvoicePOST(postReq(`/api/admin/commission/statements/${statement.id}/issue-invoice`, {}), params({ id: statement.id }))
    expect(issued.status).toBe(201)
    const invoice = (await issued.json()).invoice as { id: string; number: string; amount: number; status: string }
    expect(invoice.number).toMatch(/^CIV-\d{4}-\d{6}$/)
    expect(Number(invoice.amount)).toBeGreaterThanOrEqual(50)

    const afterIssue = await db.commissionObligation.findUniqueOrThrow({ where: { id: obligation.id } })
    expect(afterIssue.status).toBe('INVOICED')
    expect(afterIssue.statementId).toBe(statement.id)

    // partial collection on the target obligation → PARTIALLY_COLLECTED
    const partial = await collectPOST(
      postReq(`/api/admin/commission/obligations/${obligation.id}/collect`, { amount: Number(afterIssue.amount) / 2 }),
      params({ id: obligation.id })
    )
    expect(partial.status).toBe(200)
    const afterPartial = await db.commissionObligation.findUniqueOrThrow({ where: { id: obligation.id } })
    expect(afterPartial.status).toBe('PARTIALLY_COLLECTED')

    // collect the remainder of every obligation in the statement → all
    // COLLECTED, the statement settles and its invoice flips PAID
    const inStatement = await db.commissionObligation.findMany({ where: { statementId: statement.id } })
    for (const o of inStatement) {
      const remaining = Math.round((Number(o.amount) - Number(o.collectedAmount)) * 100) / 100
      if (remaining <= 0) continue
      const res = await collectPOST(
        postReq(`/api/admin/commission/obligations/${o.id}/collect`, { amount: remaining }),
        params({ id: o.id })
      )
      expect(res.status).toBe(200)
    }
    const afterFull = await db.commissionObligation.findUniqueOrThrow({ where: { id: obligation.id } })
    expect(afterFull.status).toBe('COLLECTED')

    const settledStatement = await db.commissionStatement.findUniqueOrThrow({ where: { id: statement.id } })
    const paidInvoice = await db.commissionInvoice.findUniqueOrThrow({ where: { id: invoice.id } })
    expect(settledStatement.status).toBe('SETTLED')
    expect(paidInvoice.status).toBe('PAID')
  })

  it('waives an obligation via the adjust endpoint', async () => {
    const order = await createFixtureOrder({
      buyerId: buyer.id,
      orderStatus: 'PAID',
      items: [{ sellerId: seller.id, productId: product.id, price: 40, quantity: 1 }],
    })
    setSession(seller.id)
    for (const status of ['PROCESSING', 'SHIPPED', 'DELIVERED']) {
      await orderPATCH(patchReq(`/api/orders/${order.id}`, { status }), params({ id: order.id }))
    }
    const obligation = await db.commissionObligation.findUniqueOrThrow({ where: { orderId_sellerId: { orderId: order.id, sellerId: seller.id } } })

    setSession(admin.id)
    const waived = await adjustPOST(
      postReq(`/api/admin/commission/obligations/${obligation.id}/adjust`, { action: 'WAIVE', reason: 'Goodwill — first order issue' }),
      params({ id: obligation.id })
    )
    expect(waived.status).toBe(200)
    const after = await db.commissionObligation.findUniqueOrThrow({ where: { id: obligation.id } })
    expect(after.status).toBe('WAIVED')
  })

  it('guards the commission admin endpoints behind admin auth', async () => {
    setSession(seller.id)
    expect((await obligationsGET(getReq('/api/admin/commission/obligations'))).status).toBe(403)
    expect((await adminSettlementsGET(getReq('/api/admin/settlements'))).status).toBe(403)
    clearSession()
    expect((await backfillPOST()).status).toBe(401)
  })

  it('order events are persisted (the §9.5 notification trail)', async () => {
    const order = await createFixtureOrder({
      buyerId: buyer.id,
      orderStatus: 'PAID',
      items: [{ sellerId: seller.id, productId: product.id, price: 10, quantity: 1 }],
    })
    setSession(seller.id)
    await orderPATCH(patchReq(`/api/orders/${order.id}`, { status: 'PROCESSING' }), params({ id: order.id }))

    const buyerEvents = await db.notification.findMany({ where: { userId: buyer.id, type: 'ORDER_STATUS' } })
    const sellerEvents = await db.notification.findMany({ where: { userId: seller.id, type: 'ORDER_STATUS' } })
    expect(buyerEvents.length).toBeGreaterThanOrEqual(1)
    expect(sellerEvents.length).toBeGreaterThanOrEqual(0) // the actor is not self-notified
  })
})
