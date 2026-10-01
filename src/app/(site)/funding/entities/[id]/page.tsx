import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { getPartners } from '@/lib/site-content'
import { Breadcrumbs } from '@/components/site/breadcrumbs'
import { FinancierProfile, type EntityPageData } from '@/components/site/financier/profile-sections'

/**
 * /funding/entities/[id] — the public financier profile: a "mini-website in
 * one page" for each verified funding institution (hero + sticky sub-nav,
 * overview dossier, programs, branches, success stories, partners marquee and
 * a contact/apply CTA band). Every piece of content is read live from the
 * DB — the page renders nothing when the org is missing, not a financier
 * type, not ACTIVE, or has no financier profile.
 */

const FINANCIER_ORG_TYPES = ['BANK', 'MFI', 'EWALLET']

const TYPE_LABELS: Record<string, string> = {
  BANK: 'Bank',
  MFI: 'Microfinance institution',
  EWALLET: 'Digital finance provider',
}

/** Accent per org type (amber/solar design system — no indigo/blue). */
const TYPE_ACCENTS: Record<string, string> = {
  BANK: '#b45309',
  MFI: '#059669',
  EWALLET: '#0e7490',
}

const DEFAULT_ABOUT: Record<string, string> = {
  BANK: 'Licensed banking partner offering financing for solar equipment and projects through Vendora.',
  MFI: 'Verified microfinance institution offering financing programs for solar buyers and businesses.',
  EWALLET: 'Verified digital finance provider participating in Vendora’s funding network.',
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  try {
    const org = await db.organization.findUnique({
      where: { id },
      select: {
        name: true,
        orgType: true,
        status: true,
        financierProfile: { select: { about: true } },
      },
    })
    if (!org || !FINANCIER_ORG_TYPES.includes(org.orgType) || org.status !== 'ACTIVE' || !org.financierProfile) {
      return { title: 'Financier profile — Vendora' }
    }
    const about = org.financierProfile.about?.trim() ?? ''
    return {
      title: `${org.name} — ${TYPE_LABELS[org.orgType] ?? 'Financing institution'} — Vendora`,
      description: about
        ? about.length > 175
          ? `${about.slice(0, 172).trimEnd()}…`
          : about
        : `Programs, branches, success stories and contacts for ${org.name} — a verified financing institution on Vendora.`,
    }
  } catch {
    return { title: 'Financier profile — Vendora' }
  }
}

export default async function FinancierEntityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const [org, platformPartners] = await Promise.all([
    db.organization.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        orgType: true,
        status: true,
        verifiedAt: true,
        website: true,
        financierProfile: {
          select: {
            about: true,
            licenseNumber: true,
            regulator: true,
            contactEmail: true,
            contactPhone: true,
            minTicket: true,
            maxTicket: true,
            viewCount: true,
            socialLinks: { select: { platform: true, url: true, label: true }, orderBy: { position: 'asc' } },
            branches: {
              where: { isActive: true },
              orderBy: { position: 'asc' },
              select: {
                id: true,
                name: true,
                kind: true,
                street: true,
                district: true,
                city: true,
                latitude: true,
                longitude: true,
                phone: true,
              },
            },
            services: {
              where: { status: 'ACTIVE' },
              orderBy: { createdAt: 'asc' },
              select: {
                id: true,
                name: true,
                serviceKind: true,
                category: true,
                summary: true,
                targetSegment: true,
                currency: true,
                amountMin: true,
                amountMax: true,
                rateType: true,
                rateMax: true,
                tenorMinMonths: true,
                tenorMaxMonths: true,
                processingDays: true,
                shariaCompliant: true,
                attributes: { select: { kind: true, text: true }, orderBy: { position: 'asc' } },
                coverage: { select: { regionName: true } },
              },
            },
            stories: {
              where: { status: 'PUBLISHED' },
              orderBy: [{ position: 'asc' }, { publishedAt: 'desc' }],
              select: {
                id: true,
                title: true,
                summary: true,
                imageUrl: true,
                sector: true,
                location: true,
                year: true,
                amountFinanced: true,
                currency: true,
                peopleImpacted: true,
                co2AvoidedTonnes: true,
              },
            },
            partners: {
              where: { isActive: true },
              orderBy: { position: 'asc' },
              select: { id: true, name: true, monogram: true, accentColor: true, websiteUrl: true, kind: true },
            },
          },
        },
      },
    }),
    getPartners(), // platform-level partners (financierProfileId: null)
  ])

  if (!org || !FINANCIER_ORG_TYPES.includes(org.orgType) || org.status !== 'ACTIVE' || !org.financierProfile) notFound()

  const p = org.financierProfile

  // entity partners + platform partners, deduped by name
  const seen = new Set<string>()
  const partners = [...p.partners, ...platformPartners].filter((partner) => {
    const key = partner.name.trim().toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const data: EntityPageData = {
    id: org.id,
    name: org.name,
    orgType: org.orgType,
    typeLabel: TYPE_LABELS[org.orgType] ?? 'Financing institution',
    accent: TYPE_ACCENTS[org.orgType] ?? '#d97706',
    verifiedAt: org.verifiedAt?.toISOString() ?? null,
    website: org.website,
    about: p.about?.trim() || DEFAULT_ABOUT[org.orgType] || 'Verified financing institution on the Vendora platform.',
    regulator: p.regulator,
    licenseNumber: p.licenseNumber,
    contactEmail: p.contactEmail,
    contactPhone: p.contactPhone,
    minTicket: p.minTicket,
    maxTicket: p.maxTicket,
    viewCount: p.viewCount,
    socialLinks: p.socialLinks,
    branches: p.branches,
    programs: p.services.map((s) => ({
      id: s.id,
      name: s.name,
      serviceKind: s.serviceKind,
      category: s.category,
      summary: s.summary,
      targetSegment: s.targetSegment,
      currency: s.currency,
      amountMin: s.amountMin,
      amountMax: s.amountMax,
      rateType: s.rateType,
      rateMax: s.rateMax,
      tenorMinMonths: s.tenorMinMonths,
      tenorMaxMonths: s.tenorMaxMonths,
      processingDays: s.processingDays,
      shariaCompliant: s.shariaCompliant,
      features: s.attributes.filter((a) => a.kind === 'FEATURE').map((a) => a.text),
      coverage: s.coverage.map((c) => c.regionName),
    })),
    stories: p.stories,
    partners,
  }

  // ── JSON-LD: Organization (BankOrCreditUnion for banks) + BreadcrumbList ──
  const headerList = await headers()
  const host = headerList.get('host') ?? 'localhost:3000'
  const origin = `${host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'}://${host}`
  const firstBranch = p.branches[0]

  const orgLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': org.orgType === 'BANK' ? 'BankOrCreditUnion' : 'Organization',
    name: org.name,
    description: p.about ?? undefined,
    url: org.website ?? `${origin}/funding/entities/${org.id}`,
    address: firstBranch
      ? {
          '@type': 'PostalAddress',
          ...(firstBranch.street ? { streetAddress: firstBranch.street } : {}),
          ...(firstBranch.city ? { addressLocality: firstBranch.city } : {}),
          addressCountry: 'YE',
        }
      : undefined,
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'financing inquiries',
      ...(p.contactPhone ? { telephone: p.contactPhone } : {}),
      ...(p.contactEmail ? { email: p.contactEmail } : {}),
    },
  }

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
      { '@type': 'ListItem', position: 2, name: 'Funding', item: `${origin}/funding` },
      { '@type': 'ListItem', position: 3, name: org.name, item: `${origin}/funding/entities/${org.id}` },
    ],
  }

  return (
    <>
      <Breadcrumbs items={[{ label: 'Funding', href: '/funding' }, { label: org.name }]} />
      <FinancierProfile data={data} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd).replace(/</g, '\\u003c') }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c') }}
      />
    </>
  )
}
