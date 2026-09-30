import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { Breadcrumbs } from '@/components/site/breadcrumbs'
import {
  FundingCta,
  FundingEligibility,
  FundingEntities,
  FundingHero,
  FundingPrograms,
  FundingSteps,
  type FundingEntityCard,
} from '@/components/site/funding-reveals'

/**
 * /funding — the public home of the financing module (pagedesign.md §5.3).
 * Server component: reads the verified funding entities straight from the DB
 * (Organization rows of type BANK | MFI | EWALLET with an ACTIVE status) and
 * hands them to the animated client sections. The authenticated wizard stays
 * at /market?view=financing.
 */

export const metadata: Metadata = {
  title: 'Funding — Vendora',
  description:
    'Finance your solar project with verified funding entities — installment plans, equipment leasing, project financing and working capital from banks and microfinance institutions reviewed by Vendora.',
}

/** orgType → directory label */
const TYPE_LABELS: Record<string, string> = {
  BANK: 'Bank',
  MFI: 'Microfinance institution',
  EWALLET: 'Digital finance provider',
}

/** Copy used when an active institution has no public profile text yet. */
const DEFAULT_ABOUT: Record<string, string> = {
  BANK: 'Licensed banking partner offering financing for solar equipment and projects through Vendora.',
  MFI: 'Verified microfinance institution offering financing programs for solar buyers and businesses.',
  EWALLET: 'Verified digital finance provider participating in Vendora’s funding network.',
}

/** Shown only if the live query fails — the real verified institutions in the database. */
const FALLBACK_ENTITIES: FundingEntityCard[] = [
  {
    id: 'fallback-al-amal',
    name: 'Al-Amal Bank',
    typeLabel: 'Bank',
    about:
      'Al-Amal Bank finances working capital for small producers and traders since 1998. Murabaha-based working capital advances with decisions in days, not weeks.',
    regulator: 'Central Bank of Yemen',
  },
  {
    id: 'fallback-al-kuraimi',
    name: 'Al-Kuraimi Microfinance',
    typeLabel: 'Microfinance institution',
    about:
      'Al-Kuraimi Islamic Microfinance — Sharia-compliant financing for businesses: invoice financing and SME growth facilities across 14 governorates.',
    regulator: 'Central Bank of Yemen',
  },
  {
    id: 'fallback-tihama',
    name: 'Tihama Microfinance Institution',
    typeLabel: 'Microfinance institution',
    about: DEFAULT_ABOUT.MFI,
    regulator: null,
  },
]

async function getFundingEntities(): Promise<FundingEntityCard[]> {
  try {
    const orgs = await db.organization.findMany({
      where: { orgType: { in: ['BANK', 'MFI', 'EWALLET'] }, status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        orgType: true,
        financierProfile: { select: { about: true, regulator: true } },
      },
      orderBy: { createdAt: 'asc' },
    })
    if (orgs.length === 0) return FALLBACK_ENTITIES
    return orgs.map((org) => ({
      id: org.id,
      name: org.name,
      typeLabel: TYPE_LABELS[org.orgType] || 'Financing institution',
      about:
        org.financierProfile?.about?.trim() ||
        DEFAULT_ABOUT[org.orgType] ||
        'Verified financing institution on the Vendora platform.',
      regulator: org.financierProfile?.regulator ?? null,
    }))
  } catch {
    return FALLBACK_ENTITIES
  }
}

export default async function FundingPage() {
  const entities = await getFundingEntities()
  return (
    <>
      <Breadcrumbs items={[{ label: 'Funding' }]} />
      <FundingHero />
      <FundingSteps />
      <FundingEntities entities={entities} />
      <FundingPrograms />
      <FundingEligibility />
      <FundingCta />
    </>
  )
}
