// ─────────────────────────────────────────────────────────────────────────────
// PHASE 7.2 — Multi-currency substrate seed (lastplan v5 §7.2)
//
//   bun scripts/seed-currencies.ts
//
// Idempotent + resumable: Currency rows are upserted by code; SEED exchange
// rates are inserted only when the (base, quote) pair has no SEED row yet.
// Rates are plausible fixed snapshots (USD/SAR is the riyal peg; YER is the
// Aden rial street approximation) — admins replace them through the FX
// console, which appends ADMIN-source rows with fresh validFrom instants.
// ─────────────────────────────────────────────────────────────────────────────
import { assertNotProd } from './lib/assert-not-prod'
import { db } from '../src/lib/db'

const CURRENCIES = [
  { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2 },
  { code: 'YER', name: 'Yemeni Rial', symbol: 'ر.ي', decimals: 0 },
  { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼', decimals: 2 },
]

// 1 base = rate quote (seeded cross pairs, both directions)
const RATES: Array<[base: string, quote: string, rate: number]> = [
  ['USD', 'YER', 530.0],
  ['YER', 'USD', 0.00189],
  ['USD', 'SAR', 3.75],
  ['SAR', 'USD', 0.26667],
  ['SAR', 'YER', 141.5],
  ['YER', 'SAR', 0.00707],
]

async function main() {
  assertNotProd()

  let currenciesUpserted = 0
  for (const c of CURRENCIES) {
    await db.currency.upsert({
      where: { code: c.code },
      create: { ...c, isActive: true },
      update: { name: c.name, symbol: c.symbol, decimals: c.decimals },
    })
    currenciesUpserted++
  }

  let ratesInserted = 0
  let ratesSkipped = 0
  for (const [base, quote, rate] of RATES) {
    const existing = await db.exchangeRate.findFirst({
      where: { baseCode: base, quoteCode: quote, source: 'SEED' },
    })
    if (existing) {
      ratesSkipped++
      continue
    }
    await db.exchangeRate.create({
      data: { baseCode: base, quoteCode: quote, rate, source: 'SEED' },
    })
    ratesInserted++
  }

  const [rows, total] = await Promise.all([
    db.currency.findMany({ orderBy: { code: 'asc' } }),
    db.exchangeRate.count(),
  ])

  console.log('── Phase 7.2 currency seed ──')
  console.log(`currencies upserted: ${currenciesUpserted}`)
  console.log(`rates inserted: ${ratesInserted} (skipped, already seeded: ${ratesSkipped})`)
  console.log(`DB state now: currencies=${rows.length}, exchangeRates(total)=${total}`)
  for (const r of rows) {
    console.log(`  ${r.code}  ${r.name.padEnd(14)} symbol=${r.symbol ?? '—'} decimals=${r.decimals} active=${r.isActive}`)
  }
}

main()
  .catch((err) => {
    console.error('seed-currencies failed:', err)
    process.exit(1)
  })
  .finally(() => db.$disconnect?.())
