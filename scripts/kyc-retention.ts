// ─────────────────────────────────────────────────────────────────────────────
// KYC PROVIDER RETENTION JOB (Phase 12.4 — docs/kyc-provider.md §4/§5).
//
// Prunes per the documented retention schedule:
//   • KycWebhookEvent rows older than 180 days          (receive log)
//   • CLOSED KycCase rows older than 365 days           (APPROVED / REJECTED /
//     CANCELLED — the transmitted payload lives on the case, so it is
//     retained exactly as long as the case itself)
// The underlying AccountDocument + vault media follow the EXISTING platform
// vault retention — this job never touches them.
//
// Usage (always through with-env — Law 1, Aiven MySQL only):
//   bash scripts/with-env.sh bun scripts/kyc-retention.ts            # dry-run
//   bash scripts/with-env.sh bun scripts/kyc-retention.ts --execute  # prune + audit
// ─────────────────────────────────────────────────────────────────────────────
import { db } from '@/lib/db'
import { recordAudit } from '@/server/modules/audit/service'

const WEBHOOK_EVENT_RETENTION_DAYS = 180
const CLOSED_CASE_RETENTION_DAYS = 365
const CLOSED_CASE_STATUSES = ['APPROVED', 'REJECTED', 'CANCELLED']

async function main() {
  const execute = process.argv.includes('--execute')
  const eventCutoff = new Date(Date.now() - WEBHOOK_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const caseCutoff = new Date(Date.now() - CLOSED_CASE_RETENTION_DAYS * 24 * 60 * 60 * 1000)

  const staleEvents = await db.kycWebhookEvent.count({ where: { receivedAt: { lt: eventCutoff } } })
  const staleCases = await db.kycCase.count({
    where: { status: { in: CLOSED_CASE_STATUSES }, updatedAt: { lt: caseCutoff } },
  })

  console.log('KYC provider retention schedule')
  console.log(`  webhook events older than ${WEBHOOK_EVENT_RETENTION_DAYS}d : ${staleEvents} row(s)`)
  console.log(`  closed cases older than ${CLOSED_CASE_RETENTION_DAYS}d    : ${staleCases} row(s)`)

  if (!execute) {
    console.log('  (dry-run — nothing deleted; pass --execute to prune)')
    return
  }

  const deletedEvents = await db.kycWebhookEvent.deleteMany({ where: { receivedAt: { lt: eventCutoff } } })
  const deletedCases = await db.kycCase.deleteMany({
    where: { status: { in: CLOSED_CASE_STATUSES }, updatedAt: { lt: caseCutoff } },
  })

  await recordAudit({
    actorType: 'SYSTEM',
    action: 'KYC_RETENTION_PRUNED',
    entityType: 'KycRetentionJob',
    entityId: 'kyc-retention',
    summary: `retention job pruned ${deletedEvents.count} webhook event(s) + ${deletedCases.count} closed case(s)`,
    metadata: {
      webhookEventDays: WEBHOOK_EVENT_RETENTION_DAYS,
      closedCaseDays: CLOSED_CASE_RETENTION_DAYS,
      deletedEvents: deletedEvents.count,
      deletedCases: deletedCases.count,
    },
  })

  console.log(`  EXECUTED: deleted ${deletedEvents.count} webhook event(s), ${deletedCases.count} closed case(s) — audited as KYC_RETENTION_PRUNED`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('kyc-retention failed:', err)
    process.exit(1)
  })
