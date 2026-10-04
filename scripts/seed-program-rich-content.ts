/**
 * Seed rich program-detail content (Phase 3.5 redesign).
 *
 * Adds the user-specified content structure to every ACTIVE FinancierService:
 *   financingLimitText / targetAudience / termsNote /
 *   guaranteeTypes (JSON string[]) / financingPeriods (JSON string[])
 *
 * The flagship example (user's exact content) is applied to Al-Kuraimi's
 * "Solar Equipment Lease-to-Own" Murabaha program. Idempotent — safe to re-run.
 */
import { PrismaClient } from '@prisma/client'
import { assertNotProd } from './lib/assert-not-prod'

const db = new PrismaClient()

const ALL_REGIONS = [
  "Sana'a", 'Aden', 'Taiz', 'Al-Hudaydah', 'Amanat Al-Asimah', 'Dhamar',
  'Amran', 'Hajjah', 'Ibb', 'Marib', 'Hadramaut',
]

type Rich = {
  name: string
  financingLimitText?: string
  targetAudience?: string
  termsNote?: string
  guaranteeTypes?: string[]
  financingPeriods?: string[]
  // optional structured overrides
  amountMin?: number
  amountMax?: number
  rateMax?: number
  tenorMinMonths?: number
  tenorMaxMonths?: number
  gracePeriodDays?: number
  repaymentFrequency?: string
  coverage?: string[]
  features?: string[]
  eligibility?: string[]
}

const USER_EXAMPLE: Rich = {
  // The user's provided program content — applied verbatim to the flagship
  name: 'Solar Equipment Lease-to-Own',
  financingLimitText: 'Financing ranges from 50,000 to 50 million Yemeni Rials.',
  targetAudience:
    'Owners of small and micro-enterprises/projects\nEmployees of government, private, and mixed-sector entities',
  termsNote:
    'Terms can be agreed upon with the bank or institution; note that the annual Murabaha rate will not exceed 30%, and the loan repayment period will not be less than 6 months.',
  guaranteeTypes: ['Bank guarantee', 'Gold guarantee', 'Personal guarantee', 'Commercial guarantee'],
  financingPeriods: ['Monthly', 'Seasonal'],
  amountMin: 50_000,
  amountMax: 50_000_000,
  rateMax: 30,
  tenorMinMonths: 6,
  tenorMaxMonths: 24,
  gracePeriodDays: 90, // grace period of up to 3 months
  repaymentFrequency: 'MONTHLY',
  coverage: ALL_REGIONS,
  features: [
    'Islamic Murabaha financing',
    'Financing in Yemeni Rials',
    'Takaful insurance covering total disability or death',
    'Flexible installment repayment',
    'Grace period of up to 3 months',
    'Repayment period of up to 24 months',
    'Repayment via bank branches or agents',
  ],
  eligibility: [
    'Yemeni nationality',
    'Valid identification document',
    'Age not exceeding 60 years',
    'Good credit reputation',
    'Provision of necessary guarantees',
    'Financing compliant with Islamic Sharia',
  ],
}

const OTHERS: Rich[] = [
  {
    name: 'Working Capital Advance',
    financingLimitText: 'Financing ranges from 100,000 to 75 million Yemeni Rials.',
    targetAudience: 'Registered traders, processors and distributors with active commercial operations',
    termsNote:
      'Final terms are agreed with the bank; the annual Murabaha rate will not exceed 24%, and the repayment period will not be less than 6 months.',
    guaranteeTypes: ['Bank guarantee', 'Commercial guarantee', 'Personal guarantee'],
    financingPeriods: ['Monthly', 'Seasonal'],
  },
  {
    name: 'Home Solar Installment Plan',
    financingLimitText: 'Financing ranges from 80,000 to 2.5 million Yemeni Rials.',
    targetAudience: 'Households and individuals installing residential solar systems',
    termsNote:
      'Final terms are agreed with the bank; the annual Murabaha rate will not exceed 16%, and the repayment period will not be less than 6 months.',
    guaranteeTypes: ['Personal guarantee', 'Gold guarantee', 'Salary assignment'],
    financingPeriods: ['Monthly'],
  },
  {
    name: 'Agriculture Equipment Financing',
    financingLimitText: 'Financing ranges from 100,000 to 20 million Yemeni Rials.',
    targetAudience: 'Farmers, cooperatives and agri-businesses across covered governorates',
    termsNote:
      'Final terms are agreed with the institution; the annual Murabaha rate will not exceed 14%, and the repayment period will not be less than 6 months.',
    guaranteeTypes: ['Gold guarantee', 'Personal guarantee', 'Commercial guarantee'],
    financingPeriods: ['Monthly', 'Seasonal'],
  },
  {
    name: 'Micro Business Growth Facility',
    financingLimitText: 'Financing ranges from 30,000 to 3 million Yemeni Rials.',
    targetAudience: 'Owners of micro-enterprises and home-based businesses',
    termsNote:
      'Final terms are agreed with the institution; the annual Murabaha rate will not exceed 22%, and the repayment period will not be less than 4 months.',
    guaranteeTypes: ['Personal guarantee', 'Gold guarantee'],
    financingPeriods: ['Monthly'],
  },
  {
    name: 'SME Solar Package',
    financingLimitText: 'Financing ranges from 500,000 to 40 million Yemeni Rials.',
    targetAudience: 'Small and medium enterprises upgrading or installing commercial solar power',
    termsNote:
      'Final terms are agreed with the institution; the fixed annual rate will not exceed 17%, and the repayment period will not be less than 12 months.',
    guaranteeTypes: ['Bank guarantee', 'Commercial guarantee', 'Equipment lien'],
    financingPeriods: ['Monthly', 'Quarterly'],
  },
  {
    name: 'Supplier Qualification Program',
    financingLimitText: 'Program fee from 15,000 Yemeni Rials.',
    targetAudience: 'Suppliers and vendors seeking institutional RFQ participation',
    termsNote: 'The qualification fee is invoiced externally and covers the 12-month accreditation period.',
    guaranteeTypes: [],
    financingPeriods: [],
  },
  {
    name: 'Vendor Approval Program',
    financingLimitText: 'Program fee from 10,000 Yemeni Rials.',
    targetAudience: 'Product vendors seeking marketplace approval and financing eligibility',
    termsNote: 'The approval fee is invoiced externally and covers the 12-month vendor accreditation period.',
    guaranteeTypes: [],
    financingPeriods: [],
  },
]

async function upsertAttributes(serviceId: string, kind: 'FEATURE' | 'ELIGIBILITY_CONDITION', items: string[]) {
  await db.financierServiceAttribute.deleteMany({ where: { serviceId, kind } })
  await db.financierServiceAttribute.createMany({
    data: items.map((text, position) => ({ serviceId, kind, position, text })),
  })
}

async function upsertCoverage(serviceId: string, regions: string[]) {
  await db.financierServiceCoverage.deleteMany({ where: { serviceId } })
  await db.financierServiceCoverage.createMany({
    data: regions.map((regionName) => ({ serviceId, regionName })),
  })
}

async function main() {
assertNotProd() // Phase 6 (6.0b.8/B1): fail-closed — no production mode, ever
  const all = [USER_EXAMPLE, ...OTHERS]
  let touched = 0
  for (const rich of all) {
    const service = await db.financierService.findFirst({ where: { name: rich.name } })
    if (!service) {
      console.log(`skip (not found): ${rich.name}`)
      continue
    }
    await db.financierService.update({
      where: { id: service.id },
      data: {
        financingLimitText: rich.financingLimitText,
        targetAudience: rich.targetAudience,
        termsNote: rich.termsNote,
        guaranteeTypes: rich.guaranteeTypes && rich.guaranteeTypes.length ? JSON.stringify(rich.guaranteeTypes) : null,
        financingPeriods: rich.financingPeriods && rich.financingPeriods.length ? JSON.stringify(rich.financingPeriods) : null,
        ...(rich.amountMin != null ? { amountMin: rich.amountMin } : {}),
        ...(rich.amountMax != null ? { amountMax: rich.amountMax } : {}),
        ...(rich.rateMax != null ? { rateMax: rich.rateMax, rateType: 'MURABAHA_ANNUAL' } : {}),
        ...(rich.tenorMinMonths != null ? { tenorMinMonths: rich.tenorMinMonths } : {}),
        ...(rich.tenorMaxMonths != null ? { tenorMaxMonths: rich.tenorMaxMonths } : {}),
        ...(rich.gracePeriodDays != null ? { gracePeriodDays: rich.gracePeriodDays } : {}),
        ...(rich.repaymentFrequency ? { repaymentFrequency: rich.repaymentFrequency } : {}),
      },
    })
    if (rich.features) await upsertAttributes(service.id, 'FEATURE', rich.features)
    if (rich.eligibility) await upsertAttributes(service.id, 'ELIGIBILITY_CONDITION', rich.eligibility)
    if (rich.coverage) await upsertCoverage(service.id, rich.coverage)
    touched++
    console.log(`updated: ${rich.name}`)
  }
  console.log(`done — ${touched} services enriched`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
