/**
 * scripts/audit-compensatory-2026-10-11.ts — COMPENSATORY audit entries.
 *
 * The Phase 7 cleanup (commit 9e317d3) and the QA-data turnover runs modified
 * live data WITHOUT writing audit rows. This script records the documented
 * actions RETROSPECTIVELY: every row carries a REAL current timestamp and an
 * explicit RETROSPECTIVE marker — nothing is backdated and no original action
 * timestamps are forged. Evidence source: db/backups/2026-10-09T21-20-19
 * (pre-implementation) vs live-DB queries performed 2026-10-11 during the
 * verification session.
 *
 * Usage: DATABASE_URL=<mysql url> bun scripts/audit-compensatory-2026-10-11.ts
 */
import { db } from '../src/lib/db'

const RETROSPECTIVE_NOTE =
  'RETROSPECTIVE COMPENSATORY RECORD: no audit row was written when the action ran; recorded during the 2026-10-11 verification session from backup-vs-live evidence. Timestamps in metadata are the original action dates (approximate where derived from commits); this row itself is created now.'

async function main() {
  const now = new Date()

  await db.auditLog.create({
    data: {
      actorId: null,
      actorType: 'SYSTEM',
      action: 'COMPENSATORY_RECORD',
      entityType: 'DataReconciliation',
      entityId: 'phase7-seller-disposition',
      summary: 'Phase 7 individual-seller disposition (commit 9e317d3, executed ~2026-10-09): 16 SELLER-role users → 2 DELETED + 14 DEMOTED to BUYER. Correction: the commit message claimed 1 delete / 15 demotions; evidence shows the NULL-email "Seller Intent Tester" (given a placeholder email by the multistore migration) also matched the artifact pattern and was deleted in the same run.',
      metadata: JSON.stringify(        {
        retrospective: true,
        recordedAt: now.toISOString(),
        originalActionDate: '2026-10-09',
        evidence: 'db/backups/2026-10-09T21-20-19/User.json vs live User table 2026-10-11',
        deleted: [
          { id: 'cmurabkps0000maa9xpcjisem', email: 'stab8-1790965001@test.vendora', reason: 'QA artifact email pattern' },
          { id: 'cmux7h3xa002mq0h247rzayky', email: '(was NULL → placeholder)', reason: 'NULL-email QA user; placeholder matched artifact pattern' },
        ],
        demotedToBuyer: [
          'cmuimbo860001okn0wu3ei0r7', 'cmuimbo870002okn0pxi0ttdo', 'cmuimbo880003okn0no72os14',
          'cmuimbo880004okn0yx6ojy3y', 'cmuimbo8a0005okn0bec6d2u4', 'cmumw8caf0000nfll9rk7d4vm',
          'cmupxyoji0000ndzn6lhe7our', 'cmurlsdro000hmava9404al67', 'cmurmtuh40006mas0r5zasjyc',
          'cmurn63vp0007ma57djfli0j8', 'cmuruxda3000cmarojs2dn033', 'cmuruyklc000imaroanxkkuah',
          'cmurv2i1j001omaro95fa0rby', 'cmuu6dba90003lwipjmy9z6wz',
        ],
        note: RETROSPECTIVE_NOTE,
       }),    },
  })

  await db.auditLog.create({
    data: {
      actorId: null,
      actorType: 'SYSTEM',
      action: 'COMPENSATORY_RECORD',
      entityType: 'DataReconciliation',
      entityId: 'null-email-repairs',
      summary: 'NULL-email data repair (migrate-2026-10-09-multistore-offers.ts): both affected users verified with before/after values. cmux4a8og (Kamal Bankowner): NULL → qa-kamal-bankowner-cmux4a@placeholder.vendora (still ACTIVE BUYER). cmux7h3xa (Seller Intent Tester): NULL → placeholder → user subsequently deleted by the Phase 7 cleanup.',
      metadata: JSON.stringify(        {
        retrospective: true,
        recordedAt: now.toISOString(),
        originalActionDate: '2026-10-09',
        fixes: [
          { userId: 'cmux4a8og000rq01jgdgat36y', before: null, after: 'qa-kamal-bankowner-cmux4a@placeholder.vendora', currentState: 'ACTIVE BUYER' },
          { userId: 'cmux7h3xa002mq0h247rzayky', before: null, after: '(placeholder)', currentState: 'deleted in Phase 7 cleanup' },
        ],
        note: RETROSPECTIVE_NOTE,
       }),    },
  })

  await db.auditLog.create({
    data: {
      actorId: null,
      actorType: 'SYSTEM',
      action: 'COMPENSATORY_RECORD',
      entityType: 'DataReconciliation',
      entityId: 'test-product-deletions',
      summary: 'Test-product deletions since the pre-implementation backup: 8 products removed (7 attributed to the Phase 7 cleanup of unreferenced test products per commit 9e317d3; 1 further test artifact from the later catalog-moderation QA session). All 8 are test artifacts by title; order/quote-referenced products were protected by the cleanup script.',
      metadata: JSON.stringify(        {
        retrospective: true,
        recordedAt: now.toISOString(),
        originalActionDates: ['2026-10-09', '2026-10-11'],
        deleted: [
          { id: 'cmumx77fj0025nfeh41p9ncnb', title: 'PowerCell 51.2V 100Ah LiFePO4 Server Rack Battery' },
          { id: 'cmumx77g3002nnfehm7hnc6pw', title: 'PowerMate 2000W Pure Sine Inverter 12V' },
          { id: 'cmumx77ge0035nfehrh3aq0r7', title: 'StreetBeam 60W All-in-One Solar Street Light' },
          { id: 'cmurn6ktn000gma578kksvnzr', title: 'Tawfiq Test Panel 100W' },
          { id: 'cmurssx110003maf8doejtrqh', title: 'Test Panel Queue Check 550W' },
          { id: 'cmuruz6n7000wmaro1whirl6e', title: 'Gate A Test Inverter 5kW' },
          { id: 'cmurv2iu9001qmaro9i6zgg4p', title: 'test2' },
          { id: 'cmurv2mcl001tmaroyui5dlzc', title: 'Gate D Widget 3000W same thing' },
        ],
        addedSinceBackup: ['Acme Heavy-Duty Battery Bank 5kWh (catalog QA)', 'E2EFIN Solar Pump (financing E2E fixture)'],
        note: RETROSPECTIVE_NOTE,
       }),    },
  })

  await db.auditLog.create({
    data: {
      actorId: null,
      actorType: 'SYSTEM',
      action: 'COMPENSATORY_RECORD',
      entityType: 'DataReconciliation',
      entityId: 'qa-data-turnover',
      summary: 'QA-test data turnover since the pre-implementation backup: 11 QA orders (Oct-6 checkout QA runs + 1 Oct-2 test order) and 15 QA financing requests (Oct-2/6 gate/wizard QA) were removed by seed/cleanup script re-runs (seed-financing.ts wipes-and-rebuilds the financier domain; idempotent). No business/retail orders were affected; remaining 25 orders and 22 financing requests are seed/demo/E2E-evidence data.',
      metadata: JSON.stringify(        {
        retrospective: true,
        recordedAt: now.toISOString(),
        originalActionDates: ['2026-10-09', '2026-10-11'],
        removedQaOrders: 11,
        removedQaFinancingRequests: 15,
        evidence: 'db/backups/2026-10-09T21-20-19/{Order,FinancingRequest}.json vs live counts 2026-10-11 (25 orders / 22 financing requests)',
        preserved: { payouts: '5 → 5', disputes: '0 → 0', auditTrail: '1755 → 2651 rows (append-only growth)' },
        note: RETROSPECTIVE_NOTE,
       }),    },
  })

  await db.auditLog.create({
    data: {
      actorId: null,
      actorType: 'SYSTEM',
      action: 'COMPENSATORY_RECORD',
      entityType: 'DataReconciliation',
      entityId: 'phase7-offer-reseed',
      summary: 'Phase 7 company-offer reseed (commit 9e317d3): 38 offers verified created in the Oct-9 Phase-7 execution window via the createOffer application service across 9 company orgs (commit message says 40 across 10 — window-boundary attribution; the 10th org and exact count derive from current live state). Current live state: 41 offers — 40 org-attributed across 10 orgs + 1 legacy personal offer (cmuvreh9d, seller4@vendora.com) retained with protected history by design.',
      metadata: JSON.stringify(        {
        retrospective: true,
        recordedAt: now.toISOString(),
        originalActionDate: '2026-10-09',
        currentOffersByOrg: { total: 41, orgAttributed: 40, orgs: 10, personalRetained: 1 },
        note: RETROSPECTIVE_NOTE,
       }),    },
  })

  console.log('5 compensatory audit rows written (real timestamps, retrospective marker set)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
