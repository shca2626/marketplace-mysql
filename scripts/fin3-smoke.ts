/**
 * FIN-3 unit-level smoke — direct service calls (routes arrive in FIN-4).
 * Exercises the whole v3 lifecycle machine + THE GATE:
 *   A. submit → checklist → gate BLOCKED w/ missing → verify all → forward →
 *      financier visibility (negative too) → open → offer create/send →
 *      accept → agreement (AGR) + SUCCESS fee + funding events + freeze guard
 *   B. RETURNED → resubmit → forward + decline/withdraw + maxOffersPerRequest cap
 *      + applicant cancel
 *   C. accreditation grant → ACCREDITATION_EXPIRING sweep (idempotent) →
 *      autoPassAccredited effect → revoke → seed-state restore
 *   D. lazy expiry sweeps: SENT offer past validUntil, request past expiresAt,
 *      accreditation request past expiresAt
 * Run: bun scripts/fin3-smoke.ts   (self-cleaning; consumes FIN/AGR sequence
 * numbers — documented side effect, values never roll back)
 */
import { PrismaClient } from '@prisma/client'
import {
  createFinancingRequest,
  submitFinancingRequest,
  resubmitFinancingRequest,
  cancelFinancingRequest,
  startPlatformReview,
  returnRequest,
  forwardRequest,
  adminGateQueue,
  financierInbox,
  financierOpenReview,
  financierDeclineRequest,
  sweepFinancing,
} from '../src/server/modules/financing/requests'
import {
  verifySubmission,
  rejectSubmission,
  waiveSubmission,
  gateStatus,
} from '../src/server/modules/financing/submissions'
import { listServiceRequirements } from '../src/server/modules/financing/conditions'
import {
  createOffer,
  sendOffer,
  withdrawOffer,
  updateOfferDraft,
  acceptOffer,
  declineOffer,
  serializeOffersForApplicant,
  serializeOffersForFinancier,
} from '../src/server/modules/financing/offers'
import {
  reportFundingStatus,
  addFinancingEvent,
  updateAgreementStatus,
} from '../src/server/modules/financing/agreements'
import {
  forwardAccreditationRequest,
  decideAccreditation,
  sweepAccreditations,
} from '../src/server/modules/financing/accreditation'
import { GateBlockedError, FinancingError } from '../src/server/modules/financing/shared'
import { resolvePanel } from '../src/server/modules/settings/service'
import { assertNotProd } from './lib/assert-not-prod'

const db = new PrismaClient()
let failures = 0
let passed = 0
const ok = (name: string, cond: boolean, extra = '') => {
  if (!cond) failures++
  else passed++
  console.log(`${cond ? '✓' : '✗ FAIL'} ${name}${extra ? ` — ${extra}` : ''}`)
}

async function expectThrow(name: string, fn: () => Promise<unknown>, status?: number) {
  let threw = false
  let caught: unknown = null
  try {
    await fn()
  } catch (err) {
    threw = true
    caught = err
  }
  const statusOk = status == null || (caught instanceof FinancingError && caught.status === status)
  ok(name, threw && statusOk, threw ? (caught instanceof Error ? caught.message : 'thrown') : 'did NOT throw')
  return caught
}

/** Build wizard answers for every answerable requirement of a service. */
function buildAnswers(
  requirements: {
    id: string
    isRequired: boolean
    template: { id: string; conditionType: string; documentType: string | null; options: { value: string }[] }
  }[],
  docs: Record<string, string>, // documentType → AccountDocument id
  overrides: Record<string, 'SKIP' | Record<string, unknown>> = {} // template id → skip | patch
): { requirementId: string; [k: string]: unknown }[] {
  const answers: { requirementId: string; [k: string]: unknown }[] = []
  for (const r of requirements) {
    const t = r.template
    if (overrides[t.id]) {
      if (overrides[t.id] === 'SKIP') continue
      answers.push({ requirementId: r.id, ...(overrides[t.id] as Record<string, unknown>) })
      continue
    }
    if (t.conditionType === 'PROFILE_FIELD') continue // auto-evaluated
    if (t.conditionType === 'DOCUMENT') {
      if (!docs[t.documentType ?? '']) continue
      answers.push({ requirementId: r.id, accountDocumentId: docs[t.documentType!] })
    } else if (t.conditionType === 'DECLARATION') {
      answers.push({ requirementId: r.id, confirmed: true })
    } else if (t.conditionType === 'DATE') {
      answers.push({ requirementId: r.id, valueDate: '2024-06-15' })
    } else if (t.conditionType === 'NUMBER') {
      answers.push({ requirementId: r.id, valueNumber: 450000 })
    } else if (t.conditionType === 'SELECT') {
      answers.push({ requirementId: r.id, valueText: t.options[t.options.length - 1]?.value })
    } else if (t.conditionType === 'MULTI_SELECT') {
      answers.push({ requirementId: r.id, valueText: t.options.map((o) => o.value).join(', ') })
    } else if (t.conditionType === 'TEXT') {
      if (r.isRequired) answers.push({ requirementId: r.id, valueText: 'Smoke answer' })
    }
  }
  return answers
}

async function main() {
assertNotProd() // Phase 6 (6.0b.8/B1): fail-closed — no production mode, ever
  // ── fixtures ──
  const admin = await db.user.findFirst({ where: { role: 'ADMIN' } })
  const demo = await db.user.findUnique({ where: { email: 'demo@vendora.com' } })
  const amalAdmin = await db.user.findUnique({ where: { email: 'alamal.admin@vendora.com' } })
  const kuraimiAdmin = await db.user.findUnique({ where: { email: 'kuraimi.admin@vendora.com' } })
  const amalOrg = await db.organization.findUnique({ where: { slug: 'al-amal-bank' } })
  const kuraimiOrg = await db.organization.findUnique({ where: { slug: 'al-kuraimi-mfi' } })
  const acme = await db.organization.findUnique({ where: { slug: 'acme-trading-co' } })
  const amalWC = await db.financierService.findFirst({ where: { name: 'Working Capital Advance' } })
  const kuraimiIF = await db.financierService.findFirst({ where: { name: 'Invoice Financing' } })
  const kuraimiAcc = await db.financierService.findFirst({ where: { name: 'Vendor Approval Program' } })
  const acc1 = await db.accreditationRequest.findFirst({ where: { number: 'ACC-2026-000001' } })
  if (!admin || !demo || !amalAdmin || !kuraimiAdmin || !amalOrg || !kuraimiOrg || !acme || !amalWC || !kuraimiIF || !kuraimiAcc || !acc1) {
    throw new Error('seed data missing')
  }
  const doc = async (documentType: string) =>
    db.accountDocument.findFirst({ where: { documentType }, orderBy: { createdAt: 'asc' } })
  const docs: Record<string, string> = {}
  for (const t of ['NATIONAL_ID', 'BANK_STATEMENT', 'COMMERCIAL_REG', 'TAX_CARD', 'FINANCIAL_STATEMENT']) {
    const d = await doc(t)
    if (d) docs[t] = d.id
  }

  console.log('── Flow A: financing happy path — gate → forward → offer → accept → agreement + fee')

  // A1. create (org-scoped, kuraimi Invoice Financing)
  const a1 = await createFinancingRequest(demo.id, {
    serviceId: kuraimiIF.id,
    organizationId: acme.id,
    targetType: 'WORKING_CAPITAL',
    activityName: 'Acme smoke flow',
    activityCity: "Sana'a",
    amountRequested: 5_000_000,
    currency: 'YER',
    tenorRequestedMonths: 3,
    guaranteeType: 'COMMERCIAL',
    guaranteeStatus: 'AVAILABLE',
  })
  ok('A1 request drafted (FIN number, DRAFT)', a1.status === 'DRAFT' && /^FIN-2026-\d{6}$/.test(a1.number), a1.number)

  // A2. amount range guards
  await expectThrow('A2a under-min create rejected', () =>
    createFinancingRequest(demo.id, { serviceId: kuraimiIF.id, amountRequested: 50_000 })
  )
  await expectThrow('A2b over-max create rejected', () =>
    createFinancingRequest(demo.id, { serviceId: kuraimiIF.id, amountRequested: 90_000_000 })
  )

  // A3. submit with wizard answers → checklist generated (6 items, all SUBMITTED)
  const kuraimiReqs = await listServiceRequirements(kuraimiIF.id)
  const expectedAgrSeq = await db.sequence.findUnique({ where: { key: 'AGR' } })
  const expectedAgr = `AGR-${new Date().getFullYear()}-${String((expectedAgrSeq?.value ?? 0) + 1).padStart(6, '0')}`
  const a3 = await submitFinancingRequest(demo.id, a1.id, {
    consent: true,
    answers: buildAnswers(kuraimiReqs, docs),
  })
  ok('A3a submit → SUBMITTED + consent + expiry stamped', a3.status === 'SUBMITTED' && a3.consentAt !== null && a3.expiresAt !== null)
  ok('A3b checklist generated for every requirement', a3.submissions.length === kuraimiReqs.length, `${a3.submissions.length}/${kuraimiReqs.length}`)
  ok('A3c typed answers landed SUBMITTED', a3.submissions.every((s) => s.status === 'SUBMITTED'))
  await expectThrow('A3d resubmit while SUBMITTED blocked (409)', () =>
    resubmitFinancingRequest(demo.id, a1.id), 409
  )

  // A4. gate queue + open review
  const queue = await adminGateQueue({ search: 'Acme smoke flow' })
  ok('A4a gate queue finds the SUBMITTED request', queue.requests.some((r) => r.id === a1.id), `total=${queue.total}`)
  const opened = await startPlatformReview(admin.id, a1.id)
  ok('A4b admin opens → UNDER_PLATFORM_REVIEW', opened.status === 'UNDER_PLATFORM_REVIEW' && opened.platformReviewedAt !== null)

  // A5. THE GATE — forward BLOCKED with the missing items (422)
  const blocked = await expectThrow('A5 forward BLOCKED (GateBlockedError)', () => forwardRequest(admin.id, a1.id)) as GateBlockedError
  ok('A5a blocked w/ missing-items payload', blocked instanceof GateBlockedError && blocked.missing.length === 6, `${(blocked as GateBlockedError)?.missing?.length} missing`)
  ok('A5b missing items carry title+status', blocked.missing.every((m) => m.title && m.status === 'SUBMITTED'))
  const gateBefore = await gateStatus('FINANCING', a1.id)
  ok('A5c gate status canForward=false', !gateBefore.canForward && gateBefore.verified === 0)

  // A6. verify every item → forward OK
  for (const s of a3.submissions) await verifySubmission(admin.id, s.id, 'Smoke verify')
  const gateAfter = await gateStatus('FINANCING', a1.id)
  ok('A6a all items verified, gate canForward=true', gateAfter.canForward && gateAfter.verified === 6 && gateAfter.missing.length === 0)
  const forwarded = await forwardRequest(admin.id, a1.id)
  ok('A6b forward → FORWARDED_TO_FINANCIER + forwardedAt', forwarded.status === 'FORWARDED_TO_FINANCIER' && forwarded.forwardedAt !== null)
  const frReceived = await db.notification.findFirst({
    where: { userId: kuraimiAdmin.id, type: 'FINANCING_REQUEST_RECEIVED', linkId: a1.id },
  })
  ok('A6c financier staff notified (FINANCING_REQUEST_RECEIVED)', !!frReceived)
  const applicantForwarded = await db.notification.findFirst({
    where: { userId: demo.id, type: 'PLATFORM_FORWARDED_REQUEST', linkId: a1.id },
  })
  ok('A6d applicant notified (PLATFORM_FORWARDED_REQUEST)', !!applicantForwarded)

  // A7. financier visibility — R-4 structural exclusion
  const kuraimiBox = await financierInbox(kuraimiOrg.id)
  const amalBox = await financierInbox(amalOrg.id)
  ok('A7a kuraimi inbox lists the forwarded request', kuraimiBox.requests.some((r) => r.id === a1.id), `total=${kuraimiBox.total}`)
  ok('A7b amal inbox does NOT list it (org scope)', !amalBox.requests.some((r) => r.id === a1.id))
  // A7c (TENANT-AUDIT follow-up): seed rows drift over live runs — probe with a
  // FRESH draft so the pre-forward invisibility assertion is deterministic.
  const fr1 = await createFinancingRequest(demo.id, {
    serviceId: kuraimiIF.id,
    organizationId: acme.id,
    targetType: 'WORKING_CAPITAL',
    amountRequested: 500_000,
  })
  const kuraimiBox2 = await financierInbox(kuraimiOrg.id)
  const amalBox2 = await financierInbox(amalOrg.id)
  ok('A7c pre-forward request invisible to EVERY inbox', !kuraimiBox2.requests.some((r) => r.id === fr1.id) && !amalBox2.requests.some((r) => r.id === fr1.id))

  // A8. financier opens → review → offer
  const a8 = await financierOpenReview(kuraimiAdmin.id, a1.id)
  ok('A8a financier opens → UNDER_FINANCIER_REVIEW', a8.status === 'UNDER_FINANCIER_REVIEW')
  const offerDraft = await createOffer(kuraimiAdmin.id, {
    requestId: a1.id,
    amount: 5_000_000,
    tenorMonths: 3,
    rateType: 'FIXED_ANNUAL',
    ratePercent: 16,
    collateralRequired: 'COMMERCIAL',
    installments: [
      { installmentNo: 1, dueDate: new Date(Date.now() + 30 * 86_400_000).toISOString(), amount: 1_750_000 },
      { installmentNo: 2, dueDate: new Date(Date.now() + 60 * 86_400_000).toISOString(), amount: 1_750_000 },
      { installmentNo: 3, dueDate: new Date(Date.now() + 90 * 86_400_000).toISOString(), amount: 1_750_000 },
    ],
  })
  ok('A8b offer drafted w/ 3 installments', offerDraft.status === 'DRAFT' && offerDraft.installments.length === 3)
  const applicantOffers = await serializeOffersForApplicant(a1.id)
  ok('A8c DRAFT offers invisible to the applicant', applicantOffers.length === 0)
  const sent = await sendOffer(kuraimiAdmin.id, offerDraft.id)
  ok('A8d send → SENT + validUntil default +14d', sent.status === 'SENT' && sent.sentAt !== null && sent.validUntil !== null)
  const requestNow = await db.financingRequest.findUniqueOrThrow({ where: { id: a1.id } })
  ok('A8e request → OFFERED', requestNow.status === 'OFFERED')
  const offerReceived = await db.notification.findFirst({ where: { userId: demo.id, type: 'OFFER_RECEIVED', linkId: a1.id } })
  ok('A8f applicant notified (OFFER_RECEIVED)', !!offerReceived)
  // A8g (TENANT-AUDIT F-08): uniform 404 — foreign-institution staff cannot
  // distinguish "exists but not mine" from "does not exist".
  await expectThrow('A8g amal staff cannot offer on kuraimi request (404 uniform)', () =>
    createOffer(amalAdmin.id, { requestId: a1.id, amount: 1_000_000, tenorMonths: 1 }), 404
  )

  // A9. accept → agreement + SUCCESS fee
  await expectThrow('A9a non-applicant cannot accept (403)', () => acceptOffer(amalAdmin.id, sent.id), 403)
  const accepted = await acceptOffer(demo.id, sent.id)
  ok('A9b offer ACCEPTED, agreement minted', accepted.offer.status === 'ACCEPTED' && !!accepted.agreementId)
  // TENANT-AUDIT OFFER_ACCEPT: the direct-acceptance path returns a non-null
  // agreementId (typed string | null for the approval-routed branch).
  if (!accepted.agreementId) throw new Error('A9b direct acceptance must mint an agreement')
  const agreement = await db.financingAgreement.findUniqueOrThrow({
    where: { id: accepted.agreementId },
    include: { fees: true },
  })
  const feesPanel = await resolvePanel('financingFees')
  const feePercent = Number(feesPanel.financierSuccessPercent) || 0
  ok(`A9c agreement number ${expectedAgr} (next in the AGR sequence)`, agreement.number === expectedAgr, agreement.number)
  ok('A9d SUCCESS fee accrued w/ snapshot percent', agreement.fees.length === 1 && agreement.fees[0].type === 'SUCCESS' && agreement.fees[0].status === 'ACCRUED')
  ok(
    'A9e fee math = amount × financingFees.financierSuccessPercent',
    Math.abs(agreement.fees[0].amount - 5_000_000 * (feePercent / 100)) < 0.01 &&
      Math.abs(agreement.fees[0].percentApplied - feePercent) < 1e-9,
    `${agreement.fees[0].amount} @ ${agreement.fees[0].percentApplied}%`
  )
  const acceptedRequest = await db.financingRequest.findUniqueOrThrow({ where: { id: a1.id } })
  ok('A9f request → ACCEPTED + closedAt', acceptedRequest.status === 'ACCEPTED' && acceptedRequest.closedAt !== null)
  const feeAccruedNote = await db.notification.findFirst({ where: { type: 'FEE_ACCRUED', linkId: agreement.id } })
  ok('A9g admins notified (FEE_ACCRUED)', !!feeAccruedNote)

  // A10. funding reports (track-only ledger — D-002) + freeze
  await expectThrow('A10a funding order skips REPORTED_FUNDED (409)', () =>
    reportFundingStatus(kuraimiAdmin.id, agreement.id, { fundingStatus: 'REPORTED_SETTLED', event: { type: 'REPAYMENT', amount: 100 } }), 409
  )
  const funded = await reportFundingStatus(kuraimiAdmin.id, agreement.id, {
    fundingStatus: 'REPORTED_FUNDED',
    event: { type: 'DISBURSEMENT', amount: 5_000_000, note: 'Disbursed to Acme account' },
  })
  ok('A10b funding → REPORTED_FUNDED + event row', funded.fundingStatus === 'REPORTED_FUNDED' && funded.events.some((e) => e.type === 'DISBURSEMENT'))
  const settled = await reportFundingStatus(kuraimiAdmin.id, agreement.id, {
    fundingStatus: 'REPORTED_SETTLED',
    event: { type: 'EARLY_SETTLEMENT', amount: 5_200_000, note: 'Early settlement' },
  })
  ok('A10c settled → REPORTED_SETTLED + event', settled.fundingStatus === 'REPORTED_SETTLED' && settled.events.some((e) => e.type === 'EARLY_SETTLEMENT'))
  const extra = await addFinancingEvent(kuraimiAdmin.id, agreement.id, { type: 'REPAYMENT', amount: 1_700_000 })
  ok('A10d extra event appended (track-only ledger)', extra.events.filter((e) => e.type === 'REPAYMENT').length === 1)
  const done = await updateAgreementStatus(kuraimiAdmin.id, agreement.id, 'COMPLETED')
  ok('A10e agreement status → COMPLETED', done.status === 'COMPLETED')
  await expectThrow('A10f frozen offer cannot be edited (DP-20, 409)', () => updateOfferDraft(kuraimiAdmin.id, sent.id, { amount: 1 }), 409)
  await expectThrow('A10g applicant cannot report funding (403)', () =>
    reportFundingStatus(demo.id, agreement.id, { fundingStatus: 'REPORTED_FUNDED', event: { type: 'DISBURSEMENT', amount: 1 } }), 403
  )

  console.log('── Flow B: RETURNED → resubmit → forward + decline/withdraw + offer cap + cancel')

  // B1. individual request on Amal WC (9-item checklist showcase)
  const amalReqs = await listServiceRequirements(amalWC.id)
  const b1 = await createFinancingRequest(demo.id, {
    serviceId: amalWC.id,
    organizationId: null,
    targetType: 'WORKING_CAPITAL',
    amountRequested: 2_500_000,
  })
  const b1s = await submitFinancingRequest(demo.id, b1.id, {
    consent: true,
    answers: buildAnswers(amalReqs, docs), // tPlan (optional TEXT) answered too
  })
  ok('B1a checklist has 9 items', b1s.submissions.length === 9, `${b1s.submissions.length}`)
  const phoneItem = b1s.submissions.find((s) => s.requirement.template.conditionType === 'PROFILE_FIELD')
  ok('B1b PROFILE_FIELD phone auto-evaluated', phoneItem?.status === 'SUBMITTED' && phoneItem?.decisionNote === 'auto-evaluated')
  await startPlatformReview(admin.id, b1.id)

  // B2. one item rejected → return → resubmit
  const revenueSub = b1s.submissions.find((s) => s.requirement.template.code === 'REV')!
  await rejectSubmission(admin.id, revenueSub.id, 'Suspicious revenue — please correct')
  const ret = await returnRequest(admin.id, b1.id, 'Revenue figure needs correction before we can forward.')
  ok('B2a return → RETURNED_FOR_COMPLETION w/ reason', ret.status === 'RETURNED_FOR_COMPLETION' && !!ret.returnedReason?.includes('Revenue'))
  const returnedNote = await db.notification.findFirst({ where: { userId: demo.id, type: 'PLATFORM_RETURNED_REQUEST', linkId: b1.id } })
  ok('B2b applicant notified (PLATFORM_RETURNED_REQUEST)', !!returnedNote)
  const b2 = await resubmitFinancingRequest(demo.id, b1.id, {
    answers: [{ requirementId: revenueSub.requirement.id, valueNumber: 500000 }],
  })
  ok('B2c resubmit → back to UNDER_PLATFORM_REVIEW', b2.status === 'UNDER_PLATFORM_REVIEW' && b2.returnedReason === null)
  const refreshedRevenue = b2.submissions.find((s) => s.id === revenueSub.id)
  ok('B2d rejected item re-supplied → SUBMITTED', refreshedRevenue?.status === 'SUBMITTED' && refreshedRevenue?.valueNumber === 500000)

  // B3. verify all required + waive the optional plan item → forward
  for (const s of b2.submissions) {
    if (s.status === 'SUBMITTED') await verifySubmission(admin.id, s.id)
    else if (s.status === 'PENDING') await waiveSubmission(admin.id, s.id, 'Optional — not needed for this application')
  }
  const planSub = b2.submissions.find((s) => s.requirement.template.code === 'PLAN')
  const planFresh = planSub
    ? await db.requirementSubmission.findUniqueOrThrow({ where: { id: planSub.id } })
    : null
  ok('B3a optional item waived w/ note', planFresh?.status === 'WAIVED' && !!planFresh?.decisionNote)
  const b3 = await forwardRequest(admin.id, b1.id)
  ok('B3b forward passes (verified+waived mix)', b3.status === 'FORWARDED_TO_FINANCIER' && b3.gate.canForward)

  // B4. offer decline (applicant) + withdraw (financier → request falls back)
  await financierOpenReview(amalAdmin.id, b1.id)
  const bo1 = await createOffer(amalAdmin.id, { requestId: b1.id, amount: 2_000_000, tenorMonths: 12, send: true })
  ok('B4a offer sent → request OFFERED', bo1.status === 'SENT')
  const declined = await declineOffer(demo.id, bo1.id)
  ok('B4b applicant declines offer', declined.status === 'DECLINED' && declined.declinedAt !== null)
  const bo2 = await createOffer(amalAdmin.id, { requestId: b1.id, amount: 2_400_000, tenorMonths: 12, send: true })
  const withdrawn = await withdrawOffer(amalAdmin.id, bo2.id)
  ok('B4c withdraw → WITHDRAWN', withdrawn.status === 'WITHDRAWN' && withdrawn.withdrawnAt !== null)
  const b4Request = await db.financingRequest.findUniqueOrThrow({ where: { id: b1.id } })
  ok('B4d no SENT offers left → request back to UNDER_FINANCIER_REVIEW', b4Request.status === 'UNDER_FINANCIER_REVIEW')

  // B5. maxOffersPerRequest cap (default 5)
  for (let i = 3; i <= 5; i++) {
    await createOffer(amalAdmin.id, { requestId: b1.id, amount: 2_100_000, tenorMonths: 12 })
  }
  await expectThrow('B5 offer cap enforced (409)', () =>
    createOffer(amalAdmin.id, { requestId: b1.id, amount: 1_000_000, tenorMonths: 6 }), 409
  )

  // B6. applicant cancel — pre-forward only
  const b6 = await createFinancingRequest(demo.id, { serviceId: amalWC.id, amountRequested: 900_000, targetType: 'WORKING_CAPITAL' })
  const cancelled = await cancelFinancingRequest(demo.id, b6.id)
  ok('B6a draft cancelled by applicant', cancelled.status === 'CANCELLED' && cancelled.closedAt !== null)
  await expectThrow('B6b forwarded request cannot be cancelled (409)', () => cancelFinancingRequest(demo.id, b1.id), 409)

  // B7. financier decline w/ note
  const b7 = await financierDeclineRequest(amalAdmin.id, b1.id, 'Exposure limit reached this quarter.')
  ok('B7 financier declines → DECLINED', b7.status === 'DECLINED')

  console.log('── Flow C: accreditation grant → autoPass → revoke (restores ACC-1 seed state)')

  // C1. finish the gate on ACC-2026-000001 and forward
  const acc1Subs = await db.requirementSubmission.findMany({
    where: { accreditationRequestId: acc1.id },
    include: { serviceRequirement: { include: { conditionTemplate: true } } },
  })
  for (const s of acc1Subs.filter((x) => x.status === 'SUBMITTED')) {
    await verifySubmission(admin.id, s.id, 'Smoke verify')
  }
  const c1 = await forwardAccreditationRequest(admin.id, acc1.id)
  ok('C1 accreditation forwarded', c1.status === 'FORWARDED_TO_FINANCIER' && c1.forwardedAt !== null)
  const accReceived = await db.notification.findFirst({ where: { userId: amalAdmin.id, type: 'ACCREDITATION_RECEIVED', linkId: acc1.id } })
  ok('C1b financier notified (ACCREDITATION_RECEIVED)', !!accReceived)

  // C2. financier review + grant
  await decideAccreditation(amalAdmin.id, acc1.id, { action: 'REVIEW_START' })
  const granted = await decideAccreditation(amalAdmin.id, acc1.id, { action: 'GRANT' })
  ok('C2a grant → ACCREDITED + stamps', granted.status === 'ACCREDITED' && granted.accreditedAt !== null && granted.validUntil !== null)
  ok('C2b validUntil = service.accreditationValidMonths (12 → ~360d)', granted.validUntil !== null && new Date(granted.validUntil).getTime() > Date.now() + 330 * 86_400_000)
  const grantNote = await db.notification.findFirst({ where: { type: 'ACCREDITATION_GRANTED', linkId: acc1.id } })
  ok('C2c org members notified (ACCREDITATION_GRANTED)', !!grantNote)

  // C3. ACCREDITATION_EXPIRING sweep — 7-day window, idempotent
  await db.accreditationRequest.update({
    where: { id: acc1.id },
    data: { validUntil: new Date(Date.now() + 3 * 86_400_000) },
  })
  await sweepAccreditations()
  const expiringCount = await db.notification.count({ where: { type: 'ACCREDITATION_EXPIRING', linkId: acc1.id } })
  ok('C3a expiring reminder sent inside the 7-day window', expiringCount >= 1, `${expiringCount}`)
  await sweepAccreditations()
  const expiringCount2 = await db.notification.count({ where: { type: 'ACCREDITATION_EXPIRING', linkId: acc1.id } })
  ok('C3b reminder idempotent (no duplicates on re-sweep)', expiringCount2 === expiringCount)

  // C4. autoPassAccredited — a new Amal WC request by Acme auto-verifies financials
  const c4 = await createFinancingRequest(demo.id, {
    serviceId: amalWC.id,
    organizationId: acme.id, // the accredited org
    targetType: 'WORKING_CAPITAL',
    amountRequested: 3_000_000,
  })
  const c4s = await submitFinancingRequest(demo.id, c4.id, {
    consent: true,
    answers: buildAnswers(amalReqs, docs, {
      // leave the FINANCIAL_STATEMENT item un-answered — autoPass must cover it
      [amalReqs.find((r) => r.autoPassAccredited)!.template.id]: 'SKIP',
    }),
  })
  const autoPassed = c4s.submissions.find((s) => s.requirement.autoPassAccredited)
  ok('C4a autoPassAccredited item system-VERIFIED', autoPassed?.status === 'VERIFIED' && autoPassed?.verifiedById === null)
  ok('C4b auto-pass note recorded', autoPassed?.decisionNote === 'auto-passed via live accreditation')
  const autoGate = await gateStatus('FINANCING', c4.id)
  ok('C4c gate missing shrinks to the un-answered items only', autoGate.missing.every((m) => m.submissionId !== autoPassed?.id))

  // C5. revoke (financier, reason required)
  await expectThrow('C5a revoke without reason rejected', () => decideAccreditation(amalAdmin.id, acc1.id, { action: 'REVOKE' }))
  const revoked = await decideAccreditation(amalAdmin.id, acc1.id, { action: 'REVOKE', note: 'Smoke revocation — restore follows' })
  ok('C5b revoke → REVOKED w/ reason', revoked.status === 'REVOKED' && revoked.revocationReason !== null)
  const revokeNote = await db.notification.findFirst({ where: { type: 'ACCREDITATION_REVOKED', linkId: acc1.id } })
  ok('C5c org notified (ACCREDITATION_REVOKED)', !!revokeNote)

  console.log('── Flow D: lazy expiry sweeps')

  // D1. SENT offer past validUntil → EXPIRED
  const d1 = await db.financingRequest.create({
    data: {
      number: `SMOKE-D1-${Date.now()}`, createdById: demo.id, serviceId: kuraimiIF.id,
      targetType: 'WORKING_CAPITAL', amountRequested: 1_000_000, status: 'FORWARDED_TO_FINANCIER',
      forwardedAt: new Date(), expiresAt: new Date(Date.now() + 30 * 86_400_000),
    },
  })
  const d1offer = await db.financingOffer.create({
    data: { requestId: d1.id, createdById: kuraimiAdmin.id, amount: 900_000, tenorMonths: 2, status: 'SENT', sentAt: new Date(), validUntil: new Date(Date.now() - 86_400_000) },
  })
  await sweepFinancing()
  const d1after = await db.financingOffer.findUniqueOrThrow({ where: { id: d1offer.id } })
  ok('D1 offer past validUntil → EXPIRED', d1after.status === 'EXPIRED')

  // D2. request past expiresAt → EXPIRED
  const d2 = await db.financingRequest.create({
    data: {
      number: `SMOKE-D2-${Date.now()}`, createdById: demo.id, serviceId: kuraimiIF.id,
      targetType: 'WORKING_CAPITAL', amountRequested: 1_000_000, status: 'SUBMITTED',
      submittedAt: new Date(), expiresAt: new Date(Date.now() - 86_400_000),
    },
  })
  await sweepFinancing()
  const d2after = await db.financingRequest.findUniqueOrThrow({ where: { id: d2.id } })
  ok('D2 request past expiresAt → EXPIRED (pre-terminal sweep)', d2after.status === 'EXPIRED' && d2after.closedAt !== null)

  // D3. accreditation request past expiresAt → EXPIRED
  const d3 = await db.accreditationRequest.create({
    data: {
      number: `SMOKE-D3-${Date.now()}`, organizationId: acme.id, submittedById: demo.id,
      serviceId: kuraimiAcc.id, status: 'SUBMITTED', submittedAt: new Date(),
      expiresAt: new Date(Date.now() - 86_400_000),
    },
  })
  await sweepAccreditations()
  const d3after = await db.accreditationRequest.findUniqueOrThrow({ where: { id: d3.id } })
  ok('D3 accreditation request past expiresAt → EXPIRED', d3after.status === 'EXPIRED')

  // ── cleanup: throwaway rows gone, ACC-1 seed state restored ──
  console.log('── cleanup')
  const linkIds = [a1.id, agreement.id, b1.id, b6.id, c4.id, acc1.id, sent.id]
  await db.notification.deleteMany({ where: { linkId: { in: linkIds } } })
  await db.financingAgreement.delete({ where: { id: agreement.id } }) // cascades fee + events
  for (const rid of [a1.id, b1.id, b6.id, c4.id, d1.id, d2.id, fr1.id]) {
    await db.financingRequest.delete({ where: { id: rid } }) // cascades submissions + offers
  }
  await db.accreditationRequest.delete({ where: { id: d3.id } })
  // restore ACC-1 to its seeded mid-gate state (history of the grant lives in AuditLog — DP-15)
  await db.accreditationRequest.update({
    where: { id: acc1.id },
    data: {
      status: 'UNDER_PLATFORM_REVIEW', forwardedAt: null, decidedById: null, decidedAt: null,
      decisionNote: null, accreditedAt: null, validUntil: null, revokedById: null, revokedAt: null,
      revocationReason: null, platformReviewedById: null, platformReviewedAt: null,
    },
  })
  const acc1finSub = acc1Subs.find((s) => s.status === 'SUBMITTED') // the financial statement we verified
  if (acc1finSub) {
    await db.requirementSubmission.update({
      where: { id: acc1finSub.id },
      data: { status: 'SUBMITTED', verifiedAt: null, verifiedById: null, decisionNote: null },
    })
  }
  const acc1Restored = await db.accreditationRequest.findUniqueOrThrow({ where: { id: acc1.id } })
  ok('cleanup ACC-1 restored to mid-gate seed state', acc1Restored.status === 'UNDER_PLATFORM_REVIEW' && acc1Restored.validUntil === null && acc1Restored.forwardedAt === null)
  const leftovers = await db.financingRequest.count({ where: { number: { startsWith: 'SMOKE-' } } })
  ok('cleanup throwaway requests removed', leftovers === 0)

  console.log(`\nFIN-3 SMOKE: ${failures === 0 ? `ALL PASS (${passed} checks)` : `${failures} FAILURES of ${passed + failures}`}`)
  if (failures > 0) process.exitCode = 1
}

main()
  .catch((err) => {
    console.error('fin3-smoke crashed:', err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
