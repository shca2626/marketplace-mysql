/**
 * FIN-2/3 SELF-CHECK — exercises the financing gate end-to-end against the
 * live DB via the service layer (no HTTP, no dev-server dependency).
 *
 * Usage (mirrors the seed scripts):
 *   DATABASE_URL="mysql://vendora:VendoraDb_2025_Prod@127.0.0.1:3306/vendora" \
 *     bun scripts/verify-financing.ts
 *
 * Scenario (runs on top of seed-financier.ts data):
 *   HAPPY PATH  — create request on Al-Amal E-Loan → seedSubmissions → typed
 *                 answers (docs/number/select/multi/declaration) → submit
 *                 (PROFILE_FIELD auto-eval) → admin open → verify ×n →
 *                 gateReady → forwardRequest → financier visibility filter.
 *   BLOCKED PATH — create request, submit, open, leave items unanswered →
 *                 gateReady false → forwardRequest THROWS (409 + blocker
 *                 list) → NUMBER range guard → reject-without-note guard →
 *                 return → resubmit (verify preserved verdicts) → forward.
 * Cleans up every row it created (requests, submissions, notifications,
 * audit logs — sequences keep their increment, matching production semantics).
 */
import { PrismaClient } from '@prisma/client'
import {
  createFinancingRequest,
  submitFinancingRequest,
  adminOpenReview,
  forwardRequest,
  returnRequest,
  resubmitAfterReturn,
} from '../src/server/modules/financing/requests'
import {
  answerSubmission,
  adminVerdict,
  gateReady,
  listGateBlockers,
  type SubmissionAnswerPayload as Answer,
} from '../src/server/modules/financing/submissions'
import { listFinancierRequests } from '../src/server/modules/financing/offers'
import { requireFinancierStaff, assertRequestVisibilityForFinancier } from '../src/server/modules/financing/guards'

const db = new PrismaClient()

let passed = 0
let failed = 0

function check(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed++
    console.log(`  ✅ ${label}`)
  } else {
    failed++
    console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

async function expectThrows(
  label: string,
  fn: () => Promise<unknown>,
  status?: number
): Promise<{ message: string; status: number } | null> {
  try {
    await fn()
    check(label, false, 'did NOT throw')
    return null
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status_ = (err as { status?: number }).status ?? 0
    check(label, status === undefined || status_ === status, `status=${status_} message="${message.slice(0, 140)}"`)
    return { message, status: status_ }
  }
}

async function main() {
  console.log('🔧 FIN-2/3 financing services self-check\n')

  // ── Fixtures from the seeds ──
  const [adminUser, demoUser, amalUser, kuraimiUser] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { email: 'admin@vendora.com' } }),
    db.user.findUniqueOrThrow({ where: { email: 'demo@vendora.com' } }),
    db.user.findUniqueOrThrow({ where: { email: 'financier1@vendora.com' } }),
    db.user.findUniqueOrThrow({ where: { email: 'financier2@vendora.com' } }),
  ])
  const acme = await db.organization.findFirstOrThrow({ where: { name: { contains: 'Acme' } } })
  const eLoan = await db.financierService.findFirstOrThrow({
    where: { name: { contains: 'E-Loan' }, serviceKind: 'FINANCING' },
  })
  const documents = await db.accountDocument.findMany({
    where: { OR: [{ userId: demoUser.id }, { organizationId: acme.id }], isActive: true },
  })
  const docByType = new Map<string, string>()
  for (const d of documents) if (!docByType.has(d.documentType)) docByType.set(d.documentType, d.id)

  const admin = { id: adminUser.id, role: 'ADMIN' }
  const demo = { id: demoUser.id, role: 'BUYER' }
  const amalStaff = await requireFinancierStaff({ id: amalUser.id })
  const kuraimiStaff = await requireFinancierStaff({ id: kuraimiUser.id })
  if (!amalStaff || !kuraimiStaff) throw new Error('Financier staff fixtures missing — run db:seed:financier first')
  check(
    'financier staff contexts resolve (Al-Amal OWNER + Al-Kuraimi OWNER)',
    amalStaff.profile.id !== kuraimiStaff.profile.id
  )

  const createdRequestIds: string[] = []

  // ═══════════════════════════════ HAPPY PATH ═══════════════════════════════
  console.log('\n▶ HAPPY PATH — full gate walk on Al-Amal E-Loan')

  const created = await createFinancingRequest({
    user: demo,
    payload: {
      serviceId: eLoan.id,
      organizationId: acme.id,
      targetType: 'WORKING_CAPITAL',
      activityStatus: 'EXISTING',
      activityName: 'Self-check trading activity',
      activityCity: "Sana'a",
      activityCategory: 'INVESTMENT',
      amountRequested: 500000,
      currency: 'YER',
      purpose: 'FIN-2/3 self-check request (auto-cleanup)',
      tenorRequestedMonths: 12,
      guaranteeType: 'PERSONAL_GUARANTEE',
      guaranteeStatus: 'AVAILABLE',
    },
  })
  createdRequestIds.push(created.id)
  check(
    'create → DRAFT with FIN number',
    created.status === 'DRAFT' && /^FIN-\d{4}-\d{6}$/.test(created.number),
    created.number
  )

  let submissions = await db.requirementSubmission.findMany({
    where: { financingRequestId: created.id },
    include: { serviceRequirement: { include: { conditionTemplate: true } } },
    orderBy: { createdAt: 'asc' },
  })
  const requiredCount = submissions.filter((s) => s.serviceRequirement.isRequired).length
  check(
    `seedSubmissions created the checklist (${submissions.length} rows, ${requiredCount} required)`,
    submissions.length > 0
  )
  check('every seeded submission is PENDING', submissions.every((s) => s.status === 'PENDING'))

  // Typed answers per conditionType (documents reused from the vault — R-2)
  const answered = new Set<string>()
  for (const s of submissions) {
    const t = s.serviceRequirement.conditionTemplate
    const answer: Answer = {}
    switch (t.conditionType) {
      case 'DOCUMENT': {
        const docId = docByType.get(t.documentType ?? '')
        if (!docId) continue
        answer.accountDocumentId = docId
        break
      }
      case 'PROFILE_FIELD':
        continue // auto-evaluated at submit
      case 'DECLARATION':
        answer.valueText = 'CONFIRMED'
        break
      case 'NUMBER':
        answer.valueNumber = 6
        break
      case 'DATE':
        answer.valueDate = new Date('2024-03-01')
        break
      case 'SELECT':
        answer.valueText = "Sana'a"
        break
      case 'MULTI_SELECT':
        answer.valueText = 'Retail & Trade; Technology'
        break
      default:
        answer.valueText = 'Self-check answer'
    }
    await answerSubmission({ user: demo, submissionId: s.id, answer })
    answered.add(s.id)
  }
  submissions = await db.requirementSubmission.findMany({
    where: { financingRequestId: created.id },
    include: { serviceRequirement: { include: { conditionTemplate: true } } },
  })
  check(
    `typed answers accepted (${answered.size} submitted, PROFILE_FIELD left for auto-eval)`,
    submissions.filter((s) => s.status === 'SUBMITTED').length === answered.size
  )

  const submitResult = await submitFinancingRequest({ user: demo, requestId: created.id })
  check('submit → SUBMITTED (consent stamped)', submitResult.status === 'SUBMITTED')
  const autoEvaluated = await db.requirementSubmission.findMany({
    where: { financingRequestId: created.id, status: 'VERIFIED', verifiedById: null },
    include: { serviceRequirement: { include: { conditionTemplate: true } } },
  })
  check(
    `PROFILE_FIELD auto-eval verified ${autoEvaluated.length} item(s) with the system stamp (verifiedById=null)`,
    autoEvaluated.length >= 1 &&
      autoEvaluated.every((s) => s.serviceRequirement.conditionTemplate.conditionType === 'PROFILE_FIELD')
  )

  await adminOpenReview({ admin, requestId: created.id })
  const opened = await db.financingRequest.findUniqueOrThrow({ where: { id: created.id } })
  check(
    'adminOpenReview → UNDER_PLATFORM_REVIEW (platformReviewedBy stamped)',
    opened.status === 'UNDER_PLATFORM_REVIEW' && opened.platformReviewedById === adminUser.id
  )

  const pending = await db.requirementSubmission.findMany({
    where: { financingRequestId: created.id, status: 'SUBMITTED' },
  })
  for (const s of pending) {
    await adminVerdict({ admin, submissionId: s.id, payload: { verdict: 'verify' } })
  }
  check(`adminVerdict verify ×${pending.length} → all VERIFIED`, pending.length > 0)

  const readyHappy = await gateReady(db, 'FINANCING_REQUEST', created.id)
  const blockersHappy = await listGateBlockers(db, 'FINANCING_REQUEST', created.id)
  check(
    `gateReady true after full verification (${blockersHappy.length} blockers)`,
    readyHappy && blockersHappy.length === 0
  )

  const forwardResult = await forwardRequest({ admin, requestId: created.id })
  const forwarded = await db.financingRequest.findUniqueOrThrow({ where: { id: created.id } })
  check(
    'forwardRequest → FORWARDED_TO_FINANCIER (forwardedAt stamped)',
    forwardResult.status === 'FORWARDED_TO_FINANCIER' && forwarded.forwardedAt !== null
  )

  // Financier visibility (R-4): Al-Amal sees it, Al-Kuraimi does NOT
  const amalInbox = await listFinancierRequests(amalStaff)
  const kuraimiInbox = await listFinancierRequests(kuraimiStaff)
  check('financier inbox (Al-Amal) lists the forwarded request', amalInbox.some((r) => r.id === created.id))
  check('financier inbox (Al-Kuraimi) does NOT list it (ownership filter)', !kuraimiInbox.some((r) => r.id === created.id))
  let guardHolds = false
  try {
    assertRequestVisibilityForFinancier(
      { status: 'SUBMITTED', serviceId: eLoan.id, service: { financierProfileId: amalStaff.profile.id } },
      amalStaff.profile
    )
  } catch {
    guardHolds = true
  }
  check('assertRequestVisibilityForFinancier THROWS for a SUBMITTED request (R-4)', guardHolds)

  // ═══════════════════════════════ BLOCKED PATH ═════════════════════════════
  console.log('\n▶ BLOCKED PATH — incomplete request must NOT pass the gate')

  const blocked = await createFinancingRequest({
    user: demo,
    payload: {
      serviceId: eLoan.id,
      organizationId: acme.id,
      targetType: 'WORKING_CAPITAL',
      activityCity: "Sana'a",
      amountRequested: 300000,
      currency: 'YER',
      purpose: 'FIN-2/3 blocked-path self-check (auto-cleanup)',
    },
  })
  createdRequestIds.push(blocked.id)

  // Answer only the declarations (plus the NUMBER item for the guard tests) —
  // everything else stays PENDING. Answers are only editable in DRAFT, so the
  // range-guard test runs HERE, before submit.
  const blockedSubs = await db.requirementSubmission.findMany({
    where: { financingRequestId: blocked.id },
    include: { serviceRequirement: { include: { conditionTemplate: true } } },
    orderBy: { createdAt: 'asc' },
  })
  let answeredCount = 0
  for (const s of blockedSubs) {
    if (s.serviceRequirement.conditionTemplate.conditionType === 'DECLARATION') {
      await answerSubmission({ user: demo, submissionId: s.id, answer: { valueText: 'CONFIRMED' } })
      answeredCount++
    }
  }
  check(`answered only ${answeredCount} declaration(s), rest left PENDING`, answeredCount >= 1)

  const numberItem = blockedSubs.find((s) => s.serviceRequirement.conditionTemplate.conditionType === 'NUMBER')
  if (numberItem) {
    await expectThrows(
      'NUMBER answer outside validationMax (999 > 50) THROWS',
      () => answerSubmission({ user: demo, submissionId: numberItem.id, answer: { valueNumber: 999 } })
    )
    await answerSubmission({ user: demo, submissionId: numberItem.id, answer: { valueNumber: 12 } })
  }

  // R-4 negative: a SUBMITTED request is invisible to the financier inbox
  await submitFinancingRequest({ user: demo, requestId: blocked.id })
  const inboxBeforeForward = await listFinancierRequests(amalStaff)
  check(
    'SUBMITTED request NOT in the financier inbox (the gate is structural)',
    !inboxBeforeForward.some((r) => r.id === blocked.id)
  )

  await adminOpenReview({ admin, requestId: blocked.id })
  const readyBlocked = await gateReady(db, 'FINANCING_REQUEST', blocked.id)
  const blockersBlocked = await listGateBlockers(db, 'FINANCING_REQUEST', blocked.id)
  check(
    `gateReady FALSE with ${blockersBlocked.length} blocking item(s)`,
    !readyBlocked && blockersBlocked.length > 0
  )

  const thrown = await expectThrows(
    'forwardRequest THROWS (409) while items are missing',
    () => forwardRequest({ admin, requestId: blocked.id }),
    409
  )
  check('the 409 lists the blocking item titles', !!thrown && blockersBlocked.every((b) => thrown.message.includes(b.title)))
  const stillUnderReview = await db.financingRequest.findUniqueOrThrow({ where: { id: blocked.id } })
  check('request stays UNDER_PLATFORM_REVIEW after the blocked forward', stillUnderReview.status === 'UNDER_PLATFORM_REVIEW')

  // Verdict guards while under review (verdicts need SUBMITTED answers)
  if (numberItem) {
    await expectThrows(
      'adminVerdict reject without a note THROWS (400)',
      () => adminVerdict({ admin, submissionId: numberItem.id, payload: { verdict: 'reject' } }),
      400
    )
    await adminVerdict({ admin, submissionId: numberItem.id, payload: { verdict: 'reject', note: 'Needs audited statements' } })
    const rejectedRow = await db.requirementSubmission.findUniqueOrThrow({ where: { id: numberItem.id } })
    check(
      'reject with note → REJECTED + decisionNote stored',
      rejectedRow.status === 'REJECTED' && rejectedRow.decisionNote === 'Needs audited statements'
    )
  }

  // Verify ONE declaration — its verdict must survive the return/resubmit cycle
  const declaration = blockedSubs.find((s) => s.serviceRequirement.conditionTemplate.conditionType === 'DECLARATION')
  if (declaration) {
    await adminVerdict({ admin, submissionId: declaration.id, payload: { verdict: 'verify' } })
  }

  const returned = await returnRequest({ admin, requestId: blocked.id, reason: 'Self-check: missing checklist items' })
  check('returnRequest → RETURNED_FOR_COMPLETION', returned.status === 'RETURNED_FOR_COMPLETION')

  // Complete every PENDING/REJECTED item (VERIFIED items stay untouched)
  const beforeResubmit = await db.requirementSubmission.findMany({
    where: { financingRequestId: blocked.id },
    include: { serviceRequirement: { include: { conditionTemplate: true } } },
  })
  for (const s of beforeResubmit) {
    if (s.status === 'VERIFIED' || s.status === 'WAIVED' || s.status === 'SUBMITTED') continue
    const t = s.serviceRequirement.conditionTemplate
    const answer: Answer = {}
    switch (t.conditionType) {
      case 'DOCUMENT': {
        const docId = docByType.get(t.documentType ?? '')
        if (!docId) continue
        answer.accountDocumentId = docId
        break
      }
      case 'PROFILE_FIELD':
        continue
      case 'NUMBER':
        answer.valueNumber = 7
        break
      case 'DATE':
        answer.valueDate = new Date('2023-06-15')
        break
      case 'SELECT':
        answer.valueText = "Sana'a"
        break
      case 'MULTI_SELECT':
        answer.valueText = 'Retail & Trade'
        break
      default:
        answer.valueText = 'CONFIRMED'
    }
    await answerSubmission({ user: demo, submissionId: s.id, answer })
  }

  const resubmitted = await resubmitAfterReturn({ user: demo, requestId: blocked.id })
  check('resubmitAfterReturn → UNDER_PLATFORM_REVIEW (straight back per §5.1)', resubmitted.status === 'UNDER_PLATFORM_REVIEW')
  const preserved = await db.requirementSubmission.findMany({
    where: { financingRequestId: blocked.id, status: 'VERIFIED', verifiedById: adminUser.id },
  })
  check(
    'previously-VERIFIED item kept its verdict through the resubmission',
    preserved.some((p) => p.id === declaration?.id)
  )

  // Complete the gate: verify every remaining SUBMITTED item, then forward
  const remaining = await db.requirementSubmission.findMany({
    where: { financingRequestId: blocked.id, status: 'SUBMITTED' },
  })
  for (const s of remaining) {
    await adminVerdict({ admin, submissionId: s.id, payload: { verdict: 'verify' } })
  }
  const readyAfterFix = await gateReady(db, 'FINANCING_REQUEST', blocked.id)
  check(`after fixing everything gateReady flips to ${readyAfterFix}`, readyAfterFix)
  const forwardFixed = await forwardRequest({ admin, requestId: blocked.id })
  check('the once-blocked request now forwards', forwardFixed.status === 'FORWARDED_TO_FINANCIER')

  // ═══════════════════════════════ CLEANUP ═════════════════════════════════
  console.log('\n🧹 Cleaning up self-check data…')
  const deletedSubs = await db.requirementSubmission.deleteMany({
    where: { financingRequestId: { in: createdRequestIds } },
  })
  const deletedNotifications = await db.notification.deleteMany({
    where: { linkId: { in: createdRequestIds } },
  })
  const deletedAudit = await db.auditLog.deleteMany({
    where: { entityId: { in: createdRequestIds } },
  })
  const deletedRequests = await db.financingRequest.deleteMany({
    where: { id: { in: createdRequestIds } },
  })
  console.log(
    `   removed: ${deletedRequests.count} request(s), ${deletedSubs.count} submission(s), ${deletedNotifications.count} notification(s), ${deletedAudit.count} audit row(s)`
  )
  const leftover = await db.financingRequest.count({ where: { id: { in: createdRequestIds } } })
  check('cleanup complete — zero test requests remain', leftover === 0)

  console.log(`\n${'═'.repeat(60)}\nRESULT: ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exit(1)
}

main()
  .catch((e) => {
    console.error('SELF-CHECK CRASHED:', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
