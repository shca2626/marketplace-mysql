// ─────────────────────────────────────────────────────────────────────────────
// MODULE CATALOG SEED — Phase 5.3 (run once after `bun run db:push`).
//
//   1. Upserts the platform module catalog (what can be switched on/off)
//   2. No default activations — every module ships defaultOn, the admin
//      matrix writes ORG/ORG_TYPE/PLATFORM overrides on demand.
//
// Idempotent — safe to re-run (upserts only).
//   bun scripts/seed-modules.ts
// ─────────────────────────────────────────────────────────────────────────────

import { db } from '../src/lib/db'

const MODULE_CATALOG: {
  key: string
  name: string
  description: string
  domain: string
  core?: boolean
  defaultOn?: boolean
  sortOrder: number
}[] = [
  {
    key: 'marketplace',
    name: 'Retail Marketplace',
    description:
      'The storefront itself — catalog, product pages, cart and checkout. Core: always on, never switchable.',
    domain: 'STOREFRONT',
    core: true,
    defaultOn: true,
    sortOrder: 10,
  },
  {
    key: 'financing-hub',
    name: 'Financing Hub',
    description:
      'The public /funding hub, entity mini-sites, the applicant financing console and the financing wizard.',
    domain: 'BUYER',
    defaultOn: true,
    sortOrder: 20,
  },
  {
    key: 'rfq',
    name: 'B2B RFQ Engine',
    description: 'Requests for quote — buyer RFQ creation, seller inboxes, quotes and negotiation.',
    domain: 'BUYER',
    defaultOn: true,
    sortOrder: 30,
  },
  {
    key: 'b2b-orgs',
    name: 'Business Accounts',
    description: 'Organizations, teams, purchase approvals and contract pricing for company buyers.',
    domain: 'BUYER',
    defaultOn: true,
    sortOrder: 40,
  },
  {
    key: 'financier-console',
    name: 'Financier Console',
    description: 'The lender console — institution staff manage services, offers and agreements.',
    domain: 'FINANCIER',
    defaultOn: true,
    sortOrder: 50,
  },
  {
    key: 'compare',
    name: 'Product Comparison',
    description: 'Side-by-side product comparison tray and dialog on the storefront.',
    domain: 'STOREFRONT',
    defaultOn: true,
    sortOrder: 60,
  },
  {
    key: 'reviews',
    name: 'Ratings & Reviews',
    description: 'Product ratings, written reviews and rating aggregates.',
    domain: 'STOREFRONT',
    defaultOn: true,
    sortOrder: 70,
  },
  {
    key: 'insights',
    name: 'Insights (Blog)',
    description: 'The insights magazine — articles, categories and the public reading surface.',
    domain: 'STOREFRONT',
    defaultOn: true,
    sortOrder: 80,
  },
  {
    key: 'solutions',
    name: 'Solutions Pages',
    description: 'Marketing solution pages (household, business, agriculture financing narratives).',
    domain: 'STOREFRONT',
    defaultOn: true,
    sortOrder: 90,
  },
]

async function main() {
  console.log('── Module catalog seed ──────────────────────────────────')
  for (const m of MODULE_CATALOG) {
    await db.moduleDefinition.upsert({
      where: { key: m.key },
      update: {
        name: m.name,
        description: m.description,
        domain: m.domain,
        core: m.core ?? false,
        defaultOn: m.defaultOn ?? true,
        sortOrder: m.sortOrder,
        isActive: true,
      },
      create: {
        key: m.key,
        name: m.name,
        description: m.description,
        domain: m.domain,
        core: m.core ?? false,
        defaultOn: m.defaultOn ?? true,
        sortOrder: m.sortOrder,
        isActive: true,
      },
    })
    console.log(`✓ ${m.core ? '★ core  ' : '       '}${m.key}`)
  }
  const total = await db.moduleDefinition.count()
  const activations = await db.moduleActivation.count()
  console.log(`── done: ${total} modules in catalog, ${activations} activation overrides ──`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
