import { db } from '@/lib/db'

/**
 * Server-side data fetchers for the Phase 3–4 public pages.
 * Every page reads live content from the database — no hardcoded copy.
 * All fetchers fail soft (return []) so pages still render on DB hiccups.
 */

// ── Funding entities directory ─────────────────────────────────────────────

export type FundingEntityCardData = {
  id: string
  name: string
  orgType: string
  typeLabel: string
  about: string
  regulator: string | null
  licenseNumber: string | null
  logoUrl: string | null
  contactEmail: string | null
  contactPhone: string | null
  minTicket: number | null
  maxTicket: number | null
  programsCount: number
  branchesCount: number
  storiesCount: number
  socialLinks: { platform: string; url: string; label: string | null }[]
  topPrograms: { id: string; name: string; category: string; summary: string | null; shariaCompliant: boolean; rateMax: number | null }[]
  verifiedAt: Date | null
}

const TYPE_LABELS: Record<string, string> = {
  BANK: 'Bank',
  MFI: 'Microfinance institution',
  EWALLET: 'Digital finance provider',
}

export const DEFAULT_ENTITY_ABOUT: Record<string, string> = {
  BANK: 'Licensed banking partner offering financing for solar equipment and projects through Vendora.',
  MFI: 'Verified microfinance institution offering financing programs for solar buyers and businesses.',
  EWALLET: 'Verified digital finance provider participating in Vendora’s funding network.',
}

export async function getFundingEntities(): Promise<FundingEntityCardData[]> {
  try {
    const orgs = await db.organization.findMany({
      where: { orgType: { in: ['BANK', 'MFI', 'EWALLET'] }, status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        orgType: true,
        verifiedAt: true,
        financierProfile: {
          select: {
            id: true,
            about: true,
            regulator: true,
            licenseNumber: true,
            logoUrl: true,
            contactEmail: true,
            contactPhone: true,
            minTicket: true,
            maxTicket: true,
            socialLinks: { select: { platform: true, url: true, label: true }, orderBy: { position: 'asc' } },
            _count: { select: { branches: true, services: true, stories: true } },
            services: {
              where: { status: 'ACTIVE' },
              select: { id: true, name: true, category: true, summary: true, shariaCompliant: true, rateMax: true },
              orderBy: { createdAt: 'asc' },
              take: 3,
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })
    return orgs
      .filter((o) => o.financierProfile)
      .map((org) => ({
        id: org.id,
        name: org.name,
        orgType: org.orgType,
        typeLabel: TYPE_LABELS[org.orgType] || 'Financing institution',
        about:
          org.financierProfile!.about?.trim() ||
          DEFAULT_ENTITY_ABOUT[org.orgType] ||
          'Verified financing institution on the Vendora platform.',
        regulator: org.financierProfile!.regulator ?? null,
        licenseNumber: org.financierProfile!.licenseNumber ?? null,
        logoUrl: org.financierProfile!.logoUrl ?? null,
        contactEmail: org.financierProfile!.contactEmail ?? null,
        contactPhone: org.financierProfile!.contactPhone ?? null,
        minTicket: org.financierProfile!.minTicket ?? null,
        maxTicket: org.financierProfile!.maxTicket ?? null,
        programsCount: org.financierProfile!._count.services,
        branchesCount: org.financierProfile!._count.branches,
        storiesCount: org.financierProfile!._count.stories,
        socialLinks: org.financierProfile!.socialLinks,
        topPrograms: org.financierProfile!.services,
        verifiedAt: org.verifiedAt,
      }))
  } catch {
    return []
  }
}

// ── Financing programs (FinancierService public projection) ────────────────

export type FundingProgramCard = {
  id: string
  name: string
  summary: string | null
  description: string | null
  serviceKind: string
  category: string
  targetSegment: string | null
  currency: string
  amountMin: number | null
  amountMax: number | null
  rateType: string | null
  rateMax: number | null
  tenorMinMonths: number | null
  tenorMaxMonths: number | null
  repaymentFrequency: string | null
  gracePeriodDays: number | null
  shariaCompliant: boolean
  processingDays: number | null
  features: string[]
  eligibility: string[]
  coverage: string[]
  entity: { id: string; name: string; orgType: string; typeLabel: string }
}

export async function getFundingPrograms(): Promise<FundingProgramCard[]> {
  try {
    const services = await db.financierService.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        summary: true,
        description: true,
        serviceKind: true,
        category: true,
        targetSegment: true,
        currency: true,
        amountMin: true,
        amountMax: true,
        rateType: true,
        rateMax: true,
        tenorMinMonths: true,
        tenorMaxMonths: true,
        repaymentFrequency: true,
        gracePeriodDays: true,
        shariaCompliant: true,
        processingDays: true,
        attributes: { select: { kind: true, text: true, position: true }, orderBy: { position: 'asc' } },
        coverage: { select: { regionName: true } },
        financierProfile: {
          select: { organization: { select: { id: true, name: true, orgType: true } } },
        },
      },
      orderBy: [{ financierProfile: { organization: { createdAt: 'asc' } } }, { createdAt: 'asc' }],
    })
    return services
      .filter((s) => s.financierProfile)
      .map((s) => ({
        id: s.id,
        name: s.name,
        summary: s.summary,
        description: s.description,
        serviceKind: s.serviceKind,
        category: s.category,
        targetSegment: s.targetSegment,
        currency: s.currency,
        amountMin: s.amountMin,
        amountMax: s.amountMax,
        rateType: s.rateType,
        rateMax: s.rateMax,
        tenorMinMonths: s.tenorMinMonths,
        tenorMaxMonths: s.tenorMaxMonths,
        repaymentFrequency: s.repaymentFrequency,
        gracePeriodDays: s.gracePeriodDays,
        shariaCompliant: s.shariaCompliant,
        processingDays: s.processingDays,
        features: s.attributes.filter((a) => a.kind === 'FEATURE').map((a) => a.text),
        eligibility: s.attributes.filter((a) => a.kind === 'ELIGIBILITY_CONDITION').map((a) => a.text),
        coverage: s.coverage.map((c) => c.regionName),
        entity: {
          id: s.financierProfile!.organization.id,
          name: s.financierProfile!.organization.name,
          orgType: s.financierProfile!.organization.orgType,
          typeLabel: TYPE_LABELS[s.financierProfile!.organization.orgType] || 'Financing institution',
        },
      }))
  } catch {
    return []
  }
}

// ── Requirements library (GENERAL templates) ───────────────────────────────

export type PublicRequirement = {
  id: string
  title: string
  description: string | null
  conditionType: string
  validityMonths: number | null
  usedByCount: number
}

export async function getGeneralRequirements(): Promise<PublicRequirement[]> {
  try {
    const rows = await db.conditionTemplate.findMany({
      where: { scope: 'GENERAL', isActive: true },
      select: {
        id: true,
        title: true,
        description: true,
        conditionType: true,
        validityMonths: true,
        _count: { select: { serviceRequirements: true } },
      },
      orderBy: { createdAt: 'asc' },
    })
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      conditionType: r.conditionType,
      validityMonths: r.validityMonths,
      usedByCount: r._count.serviceRequirements,
    }))
  } catch {
    return []
  }
}

// ── Success stories ────────────────────────────────────────────────────────

export type PublicStory = {
  id: string
  title: string
  summary: string
  body: string | null
  imageUrl: string | null
  sector: string | null
  location: string | null
  year: number | null
  amountFinanced: number | null
  currency: string
  peopleImpacted: number | null
  co2AvoidedTonnes: number | null
  featured: boolean
  entity: { id: string; name: string } | null
}

export async function getStories(opts?: { entityOrgId?: string; featuredOnly?: boolean; take?: number }): Promise<PublicStory[]> {
  try {
    const rows = await db.fundingStory.findMany({
      where: {
        status: 'PUBLISHED',
        ...(opts?.featuredOnly ? { featured: true } : {}),
        ...(opts?.entityOrgId ? { financierProfile: { organizationId: opts.entityOrgId } } : {}),
      },
      select: {
        id: true,
        title: true,
        summary: true,
        body: true,
        imageUrl: true,
        sector: true,
        location: true,
        year: true,
        amountFinanced: true,
        currency: true,
        peopleImpacted: true,
        co2AvoidedTonnes: true,
        featured: true,
        position: true,
        financierProfile: { select: { organizationId: true, organization: { select: { id: true, name: true } } } },
      },
      orderBy: [{ position: 'asc' }, { publishedAt: 'desc' }],
      take: opts?.take,
    })
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      summary: r.summary,
      body: r.body,
      imageUrl: r.imageUrl,
      sector: r.sector,
      location: r.location,
      year: r.year,
      amountFinanced: r.amountFinanced,
      currency: r.currency,
      peopleImpacted: r.peopleImpacted,
      co2AvoidedTonnes: r.co2AvoidedTonnes,
      featured: r.featured,
      entity: r.financierProfile ? { id: r.financierProfile.organization.id, name: r.financierProfile.organization.name } : null,
    }))
  } catch {
    return []
  }
}

// ── Partners ────────────────────────────────────────────────────────────────

export type PublicPartner = { id: string; name: string; monogram: string | null; accentColor: string | null; websiteUrl: string | null; kind: string }

export async function getPartners(opts?: { entityOrgId?: string }): Promise<PublicPartner[]> {
  try {
    return await db.partner.findMany({
      where: {
        isActive: true,
        ...(opts?.entityOrgId ? { OR: [{ financierProfile: { organizationId: opts.entityOrgId } }, { financierProfileId: null }] } : { financierProfileId: null }),
      },
      select: { id: true, name: true, monogram: true, accentColor: true, websiteUrl: true, kind: true },
      orderBy: { position: 'asc' },
    })
  } catch {
    return []
  }
}

// ── Site steps ─────────────────────────────────────────────────────────────

export type PublicStep = { id: string; position: number; icon: string | null; title: string; subtitle: string | null; body: string | null; stat: string | null }

export async function getSiteSteps(page: string, track = 'MAIN'): Promise<PublicStep[]> {
  try {
    return await db.siteStep.findMany({
      where: { page, track, isActive: true },
      select: { id: true, position: true, icon: true, title: true, subtitle: true, body: true, stat: true },
      orderBy: { position: 'asc' },
    })
  } catch {
    return []
  }
}

// ── Solutions ───────────────────────────────────────────────────────────────

export type PublicSolution = {
  id: string
  slug: string
  title: string
  tagline: string | null
  description: string | null
  audience: string
  icon: string | null
  imageUrl: string | null
  accentColor: string | null
  categorySlug: string | null
  features: { id: string; icon: string | null; title: string; body: string | null; position: number }[]
}

export async function getSolutions(slug?: string): Promise<PublicSolution[]> {
  try {
    return await db.solution.findMany({
      where: { isActive: true, ...(slug ? { slug } : {}) },
      select: {
        id: true,
        slug: true,
        title: true,
        tagline: true,
        description: true,
        audience: true,
        icon: true,
        imageUrl: true,
        accentColor: true,
        categorySlug: true,
        features: { select: { id: true, icon: true, title: true, body: true, position: true }, orderBy: { position: 'asc' } },
      },
      orderBy: { position: 'asc' },
    })
  } catch {
    return []
  }
}

// ── Insight posts ───────────────────────────────────────────────────────────

export type PublicInsight = {
  id: string
  slug: string
  title: string
  excerpt: string
  coverUrl: string | null
  authorName: string | null
  authorTitle: string | null
  topic: string
  tags: string | null
  readMinutes: number
  featured: boolean
  publishedAt: Date
}

export async function getInsights(opts?: { slug?: string; topic?: string; featuredFirst?: boolean; take?: number }): Promise<PublicInsight[]> {
  try {
    return await db.insightPost.findMany({
      where: { status: 'PUBLISHED', ...(opts?.slug ? { slug: opts.slug } : {}), ...(opts?.topic ? { topic: opts.topic } : {}) },
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        coverUrl: true,
        authorName: true,
        authorTitle: true,
        topic: true,
        tags: true,
        readMinutes: true,
        featured: true,
        publishedAt: true,
      },
      orderBy: [{ featured: 'desc' }, { publishedAt: 'desc' }],
      take: opts?.take,
    })
  } catch {
    return []
  }
}

export async function getInsightBody(slug: string): Promise<string | null> {
  try {
    const post = await db.insightPost.findUnique({ where: { slug }, select: { body: true } })
    return post?.body ?? null
  } catch {
    return null
  }
}

// ── FAQ ────────────────────────────────────────────────────────────────────

export type PublicFaq = { id: string; topic: string; question: string; answer: string; featured: boolean }

export async function getFaqs(topic?: string): Promise<PublicFaq[]> {
  try {
    return await db.faqItem.findMany({
      where: { isActive: true, ...(topic ? { topic } : {}) },
      select: { id: true, topic: true, question: true, answer: true, featured: true },
      orderBy: [{ topic: 'asc' }, { position: 'asc' }],
    })
  } catch {
    return []
  }
}

// ── Legal documents ────────────────────────────────────────────────────────

export type PublicLegalDoc = { slug: string; title: string; summary: string | null; body: string; version: string; effectiveAt: Date; updatedAt: Date }

export async function getLegalDoc(slug: string): Promise<PublicLegalDoc | null> {
  try {
    return await db.legalDocument.findUnique({
      where: { slug },
      select: { slug: true, title: true, summary: true, body: true, version: true, effectiveAt: true, updatedAt: true },
    })
  } catch {
    return null
  }
}

export async function getLegalDocList(): Promise<{ slug: string; title: string; summary: string | null }[]> {
  try {
    return await db.legalDocument.findMany({
      select: { slug: true, title: true, summary: true },
      orderBy: { slug: 'asc' },
    })
  } catch {
    return []
  }
}

// ── Funding stats (live numbers from the DB) ───────────────────────────────

export type FundingStats = {
  entities: number
  programs: number
  shariaPrograms: number
  regionsCovered: number
  storiesTotal: number
  totalFinanced: number
  peopleImpacted: number
  co2Avoided: number
}

export async function getFundingStats(): Promise<FundingStats> {
  try {
    const [entities, programs, sharia, coverageRows, stories] = await Promise.all([
      db.organization.count({ where: { orgType: { in: ['BANK', 'MFI', 'EWALLET'] }, status: 'ACTIVE', financierProfile: { isNot: null } } }),
      db.financierService.count({ where: { status: 'ACTIVE', serviceKind: 'FINANCING' } }),
      db.financierService.count({ where: { status: 'ACTIVE', serviceKind: 'FINANCING', shariaCompliant: true } }),
      db.financierServiceCoverage.findMany({ select: { regionName: true }, distinct: ['regionName'] }),
      db.fundingStory.findMany({ select: { amountFinanced: true, peopleImpacted: true, co2AvoidedTonnes: true } }),
    ])
    return {
      entities,
      programs,
      shariaPrograms: sharia,
      regionsCovered: coverageRows.length,
      storiesTotal: stories.length,
      totalFinanced: stories.reduce((s, r) => s + (r.amountFinanced ?? 0), 0),
      peopleImpacted: stories.reduce((s, r) => s + (r.peopleImpacted ?? 0), 0),
      co2Avoided: Math.round(stories.reduce((s, r) => s + (r.co2AvoidedTonnes ?? 0), 0)),
    }
  } catch {
    return { entities: 0, programs: 0, shariaPrograms: 0, regionsCovered: 0, storiesTotal: 0, totalFinanced: 0, peopleImpacted: 0, co2Avoided: 0 }
  }
}
