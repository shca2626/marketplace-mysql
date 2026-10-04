/**
 * FIN-2 unit-level smoke — direct service calls (routes arrive in FIN-4).
 * Exercises: composer visibility/attach/detach, vault upload→verify,
 * submission state machine incl. PROFILE_FIELD auto-eval + autoPass.
 * Run: bun scripts/fin2-smoke.ts   (read-only assertions; wipes nothing)
 */
import { PrismaClient } from '@prisma/client'
import sharp from 'sharp'
import { processImageUpload } from '../src/lib/storage/image-pipeline'
import {
  listVisibleConditionTemplates,
  attachServiceRequirement,
  detachServiceRequirement,
  createConditionTemplate,
} from '../src/server/modules/financing/conditions'
import {
  createAccountDocument,
  verifyAccountDocument,
  listAccountDocuments,
} from '../src/server/modules/financing/documents'
import { assertNotProd } from './lib/assert-not-prod'
import {
  evaluateProfileField,
  generateChecklist,
  applyChecklistAnswers,
  gateStatus,
} from '../src/server/modules/financing/submissions'

const db = new PrismaClient()
let failures = 0
const ok = (name: string, cond: boolean, extra = '') => {
  if (!cond) failures++
  console.log(`${cond ? '✓' : '✗ FAIL'} ${name}${extra ? ` — ${extra}` : ''}`)
}

async function main() {
assertNotProd() // Phase 6 (6.0b.8/B1): fail-closed — no production mode, ever
  const admin = await db.user.findFirst({ where: { role: 'ADMIN' } })
  const demo = await db.user.findUnique({ where: { email: 'demo@vendora.com' } })
  const amalAdmin = await db.user.findUnique({ where: { email: 'alamal.admin@vendora.com' } })
  const amalOrg = await db.organization.findUnique({ where: { slug: 'al-amal-bank' } })
  const amalWC = await db.financierService.findFirst({
    where: { name: 'Working Capital Advance' },
  })
  if (!admin || !demo || !amalAdmin || !amalOrg || !amalWC) throw new Error('seed data missing')

  // ── 1. Composer visibility: GENERAL active + own FINANCIER ──
  const visibleToAmal = await listVisibleConditionTemplates(amalAdmin.id, 'BUYER')
  const generalCount = visibleToAmal.filter((t) => t.scope === 'GENERAL' && t.isActive).length
  const privateCount = visibleToAmal.filter((t) => t.scope === 'FINANCIER').length
  ok('composer sees GENERAL active templates', generalCount >= 11, `${generalCount} general`)
  ok('composer sees own FINANCIER templates', privateCount >= 1, `${privateCount} private`)
  const kuraimiPrivateLeak = visibleToAmal.some((t) => t.title.includes('Al-Kuraimi account'))
  ok('no cross-financier leak in composer', !kuraimiPrivateLeak)

  // ── 2. Create private template + attach + cap guard + detach ──
  const tmpl = await createConditionTemplate(
    { id: amalAdmin.id, role: 'BUYER' },
    {
      scope: 'FINANCIER',
      conditionType: 'SELECT',
      title: 'Smoke test — preferred branch',
      options: ['Head Office', 'Aden Branch'],
    }
  )
  ok('private SELECT template created with options', tmpl.options.length === 2)
  const attached = await attachServiceRequirement(amalAdmin.id, {
    serviceId: amalWC.id,
    conditionTemplateId: tmpl.id,
    isRequired: false,
    displayOrder: 99,
  })
  ok('requirement attached (optional, order 99)', attached.displayOrder === 99 && !attached.isRequired)
  // cross-financier attach must fail
  const kuraimiIF = await db.financierService.findFirst({ where: { name: 'Invoice Financing' } })
  const kuraimiAdmin = await db.user.findUnique({ where: { email: 'kuraimi.admin@vendora.com' } })
  let blocked = false
  try {
    await attachServiceRequirement(kuraimiAdmin!.id, {
      serviceId: kuraimiIF!.id,
      conditionTemplateId: tmpl.id,
    })
  } catch {
    blocked = true
  }
  ok('kuraimi cannot attach amal private condition', blocked)
  await detachServiceRequirement(amalAdmin.id, attached.id)
  const afterDetach = await db.serviceRequirement.findUnique({ where: { id: attached.id } })
  ok('detach is soft (isActive=false, row kept)', afterDetach !== null && !afterDetach.isActive)
  // admin cannot be blocked from GENERAL management but financier cannot edit GENERAL
  const generalT = visibleToAmal.find((t) => t.scope === 'GENERAL')!
  let finBlocked = false
  try {
    await createConditionTemplate({ id: amalAdmin.id, role: 'BUYER' }, {
      scope: 'GENERAL', conditionType: 'TEXT', title: 'should fail',
    })
  } catch {
    finBlocked = true
  }
  ok('financier staff cannot create GENERAL templates', finBlocked)
  void generalT

  // ── 3. Vault upload → verify once ──
  const png = await sharp(
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#7a5a3a"/></svg>')
  ).png().toBuffer()
  const doc = await createAccountDocument(demo.id, {
    file: { buffer: png, originalName: 'smoke-proof.png' },
    documentType: 'PROOF_OF_ADDRESS',
    title: 'FIN-2 smoke proof of address',
  })
  ok('vault upload through media pipeline (PENDING)', doc.status === 'PENDING' && !!doc.media.urls.medium)
  const verified = await verifyAccountDocument(admin.id, doc.id, 'Looks legit')
  ok('platform verify stamps reviewer + note', verified.status === 'VERIFIED' && verified.reviewedAt !== null)
  let reverifyBlocked = false
  try {
    await verifyAccountDocument(admin.id, doc.id)
  } catch {
    reverifyBlocked = true
  }
  ok('verify ONCE — second verify rejected', reverifyBlocked)
  const mine = await listAccountDocuments(demo.id, { documentType: 'PROOF_OF_ADDRESS' })
  ok('vault list by documentType finds it', mine.some((d) => d.id === doc.id))

  // ── 4. Submission state machine: checklist gen + PROFILE_FIELD auto-eval ──
  // (borrow amal WC requirements on a throwaway draft request, then delete it)
  const draft = await db.financingRequest.create({
    data: {
      number: `SMOKE-${Date.now()}`,
      createdById: demo.id,
      organizationId: null,
      serviceId: amalWC.id,
      targetType: 'WORKING_CAPITAL',
      amountRequested: 100000,
      status: 'DRAFT',
    },
  })
  const checklist = await generateChecklist('FINANCING', draft.id, amalWC.id, amalOrg.id, {
    applicantUserId: demo.id,
    organizationId: null,
  })
  ok('checklist generated for every active requirement', checklist.length >= 8, `${checklist.length} items`)
  const phoneItem = checklist.find((s) => s.requirement.template.conditionType === 'PROFILE_FIELD')
  ok('PROFILE_FIELD phone auto-evaluated → SUBMITTED', phoneItem?.status === 'SUBMITTED' && phoneItem?.decisionNote === 'auto-evaluated')
  const yearsItem = checklist.find((s) => s.requirement.template.code === 'YRS')
  ok('SELECT item starts PENDING', yearsItem?.status === 'PENDING')

  // typed answer: NUMBER against bounds
  const revenueItem = checklist.find((s) => s.requirement.template.code === 'REV')
  await applyChecklistAnswers('FINANCING', draft.id, [
    { conditionTemplateId: revenueItem!.requirement.template.id, valueNumber: 450000 },
    { conditionTemplateId: yearsItem!.requirement.template.id, valueText: '3–5 years' },
    { conditionTemplateId: phoneItem!.requirement.template.id, valueText: 'hack' }, // must be skipped (auto-eval)
  ], { userId: demo.id, organizationId: null })
  const refreshed = await db.requirementSubmission.findMany({
    where: { financingRequestId: draft.id },
    include: { serviceRequirement: { include: { conditionTemplate: true } } },
  })
  const rev = refreshed.find((s) => s.serviceRequirement.conditionTemplate.code === 'REV')
  const yrs = refreshed.find((s) => s.serviceRequirement.conditionTemplate.code === 'YRS')
  ok('NUMBER answer accepted in-bounds', rev?.status === 'SUBMITTED' && rev?.valueNumber === 450000)
  ok('SELECT answer validated against option rows', yrs?.status === 'SUBMITTED' && yrs?.valueText === '3–5 years')
  let badSelect = false
  try {
    await applyChecklistAnswers('FINANCING', draft.id, [
      { conditionTemplateId: yrs!.serviceRequirement.conditionTemplateId, valueText: 'Nonsense' },
    ], { userId: demo.id, organizationId: null })
  } catch {
    badSelect = true
  }
  ok('invalid SELECT choice rejected', badSelect)
  const gate = await gateStatus('FINANCING', draft.id)
  ok('gate status reports missing required items', gate.missing.length >= 4, `${gate.missing.length} missing; canForward=${gate.canForward}`)

  // evaluateProfileField on a non-profile item is a no-op
  const noOp = await evaluateProfileField(rev!.id)
  ok('evaluateProfileField ignores non-PROFILE items', noOp === 'PENDING')

  // cleanup the throwaway draft
  await db.requirementSubmission.deleteMany({ where: { financingRequestId: draft.id } })
  await db.financingRequest.delete({ where: { id: draft.id } })
  await db.serviceRequirement.deleteMany({ where: { conditionTemplateId: tmpl.id } })
  await db.conditionOption.deleteMany({ where: { conditionTemplateId: tmpl.id } })
  await db.conditionTemplate.delete({ where: { id: tmpl.id } })
  await db.accountDocument.delete({ where: { id: doc.id } })
  await db.mediaAsset.deleteMany({ where: { sha256: (await processImageUpload(png)).sha256 } })

  console.log(failures === 0 ? '\nFIN-2 SMOKE: ALL PASS' : `\nFIN-2 SMOKE: ${failures} FAILURES`)
  if (failures > 0) process.exitCode = 1
}

main()
  .catch((err) => {
    console.error('fin2-smoke crashed:', err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
