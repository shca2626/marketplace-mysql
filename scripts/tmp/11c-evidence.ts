// 11-c E2E evidence — synthetic ORDER_COMMISSION assessment for the EXISTING
// legacy payout (PY-2026-000002, $65.80 commission), written through the real
// service spine with explicitRule=null + legacyAmount (the zero-change
// migration path). This proves the reconciliation engine nets to 0.00 against
// the payout's own commission. The row is then REVERSED via the admin API in
// the E2E (leaving both rows — they net to zero and demonstrate the append-only
// reversal mechanics). Documented in worklog Task 11-c.
//
//   bun scripts/tmp/11c-evidence.ts [create]
import { db } from '@/lib/db'
import { assessFee } from '@/server/modules/fees/service'

async function main() {
  const mode = process.argv[2] ?? 'create'
  if (mode !== 'create') {
    console.log('unknown mode', mode)
    process.exit(1)
  }

  const payout = await db.payout.findUnique({ where: { number: 'PY-2026-000002' } })
  if (!payout) throw new Error('PY-2026-000002 not found')
  console.log(
    `payout ${payout.number} status=${payout.status} gross=${payout.grossAmount} commissionRate=${payout.commissionRate}% commission=${payout.commission} ${payout.currency} org=${payout.sellerOrgId}`
  )

  const assessment = await assessFee(
    {
      event: 'ORDER_COMMISSION',
      actorType: 'SELLER',
      actorOrgId: payout.sellerOrgId,
      ctx: { orgId: payout.sellerOrgId, orgType: 'COMPANY' },
      baseAmount: payout.grossAmount,
      currency: payout.currency,
      fxRateToUsd: 1,
      calcInputs: {
        legacyAmount: payout.commission,
        note: '11-c E2E synthetic reconciliation evidence for pre-Phase-11 payout (rule snapshot skipped deliberately)',
        itemCount: payout.itemCount,
      },
      idempotencyKey: `ORDER_COMMISSION:payout:${payout.number}`,
      refType: 'PAYOUT',
      refId: payout.id,
    },
    db,
    null // explicitRule=null → no rule resolution, legacyAmount carries the exact payout commission
  )
  console.log('ASSESSED:', JSON.stringify(assessment, null, 1))
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
