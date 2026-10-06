// ─────────────────────────────────────────────────────────────────────────────
// Phase 12.4 seed — zero-behavior-change defaults: every known document type
// routes MANUAL (the pre-Phase-12 workflow). The admin flips individual doc
// types to PROVIDER / PROVIDER_THEN_MANUAL from the console when ready.
// Idempotent.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from '@/lib/db'

const DOC_TYPES = [
  'NATIONAL_ID', 'PASSPORT', 'RESIDENCE_PERMIT',
  'COMMERCIAL_REG', 'BUSINESS_LICENSE', 'TAX_CARD',
  'FINANCIAL_STATEMENT', 'BANK_STATEMENT', 'FEASIBILITY_STUDY',
  'PROOF_OF_ADDRESS', 'GUARANTEE_DOC', 'INVOICE', 'PURCHASE_ORDER', 'PROJECT_FILE', 'OTHER',
]

async function main() {
  for (const docType of DOC_TYPES) {
    await db.kycProviderConfig.upsert({
      where: { docType },
      update: {},
      create: { docType, mode: 'MANUAL', providerKey: 'mock', enabled: true },
    })
  }
  const count = await db.kycProviderConfig.count()
  console.log(`configs ensured: ${count} (all MANUAL — zero behavior change day one)`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
