import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { db } from '@/lib/db'
import { Markdown } from '@/components/site/markdown'
import { SectionContainer } from '@/components/site/kit'
import {
  CoveragePanel,
  KeyFactsPanel,
  ProgramChecklists,
  ProgramHero,
  ProgramRequirements,
  RelatedPrograms,
  ServiceFeaturesPanel,
  TermsNoteBand,
  type ProgramDetailData,
} from '@/components/site/funding/sections'
import { getFundingPrograms } from '@/lib/site-content'

/**
 * /funding/programs/[id] — public FinancierService detail page.
 * Layout follows the approved reference (supplier_qualification_program.html):
 * white header band → 12-col grid (sidebar key-facts + entity card | main
 * column with ONE text section per content block). All content DB-driven.
 */

const TYPE_LABELS: Record<string, string> = {
  BANK: 'Bank',
  MFI: 'Microfinance institution',
  EWALLET: 'Digital finance provider',
}

/** Parse the JSON list columns (guaranteeTypes / financingPeriods). */
function parseJsonList(value: string | null): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

/** Direct DB fetch — cached so generateMetadata and the page share one query. */
const getProgram = cache(async (id: string) => {
  try {
    return await db.financierService.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        summary: true,
        description: true,
        status: true,
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
        accreditationValidMonths: true,
        accreditationFeeAmount: true,
        financingLimitText: true,
        targetAudience: true,
        termsNote: true,
        guaranteeTypes: true,
        financingPeriods: true,
        attributes: { select: { kind: true, text: true }, orderBy: { position: 'asc' } },
        coverage: { select: { regionName: true } },
        requirements: {
          where: { isActive: true },
          orderBy: [{ displayOrder: 'asc' }, { conditionTemplate: { title: 'asc' } }],
          select: {
            isRequired: true,
            instructions: true,
            autoPassAccredited: true,
            conditionTemplate: { select: { title: true, description: true, conditionType: true, validityMonths: true } },
          },
        },
        financierProfile: {
          select: {
            regulator: true,
            licenseNumber: true,
            organization: { select: { id: true, name: true, orgType: true } },
          },
        },
      },
    })
  } catch {
    return null
  }
})

/** 2–3 related programs — same entity first, then same category. */
async function getRelated(currentId: string, entityOrgId: string, category: string) {
  const programs = await getFundingPrograms()
  const others = programs.filter((p) => p.id !== currentId)
  const sameEntity = others.filter((p) => p.entity.id === entityOrgId)
  const sameCategory = others.filter((p) => p.category === category && p.entity.id !== entityOrgId)
  return [...sameEntity, ...sameCategory].slice(0, 2)
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const service = await getProgram(id)
  if (!service || service.status !== 'ACTIVE' || !service.financierProfile) {
    return { title: 'Program not found — Vendora' }
  }
  const orgName = service.financierProfile.organization.name
  const title = `${service.name} — ${orgName} | Vendora Funding`
  const description = service.summary ?? `${service.name}, a funding program by ${orgName} on Vendora.`
  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
  }
}

export default async function ProgramDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const service = await getProgram(id)
  if (!service || service.status !== 'ACTIVE' || !service.financierProfile) notFound()

  const org = service.financierProfile.organization
  const isAccreditation = service.serviceKind === 'ACCREDITATION'

  const detail: ProgramDetailData = {
    id: service.id,
    name: service.name,
    summary: service.summary,
    serviceKind: service.serviceKind,
    category: service.category,
    targetSegment: service.targetSegment,
    currency: service.currency,
    // accreditation fees live in accreditationFeeAmount — surface them as the program amount
    amountMin: isAccreditation ? (service.accreditationFeeAmount ?? service.amountMin) : service.amountMin,
    amountMax: isAccreditation ? null : service.amountMax,
    rateType: service.rateType,
    rateMax: service.rateMax,
    tenorMinMonths: service.tenorMinMonths,
    tenorMaxMonths: service.tenorMaxMonths,
    repaymentFrequency: service.repaymentFrequency,
    gracePeriodDays: service.gracePeriodDays,
    shariaCompliant: service.shariaCompliant,
    processingDays: service.processingDays,
    accreditationValidMonths: service.accreditationValidMonths,
    accreditationFeeAmount: service.accreditationFeeAmount,
    financingLimitText: service.financingLimitText,
    targetAudience: service.targetAudience,
    termsNote: service.termsNote,
    guaranteeTypes: parseJsonList(service.guaranteeTypes),
    financingPeriods: parseJsonList(service.financingPeriods),
    features: service.attributes.filter((a) => a.kind === 'FEATURE').map((a) => a.text),
    eligibility: service.attributes.filter((a) => a.kind === 'ELIGIBILITY_CONDITION').map((a) => a.text),
    coverage: service.coverage.map((c) => c.regionName),
    requirements: service.requirements.map((r) => ({
      title: r.conditionTemplate.title,
      description: r.conditionTemplate.description,
      conditionType: r.conditionTemplate.conditionType,
      validityMonths: r.conditionTemplate.validityMonths,
      isRequired: r.isRequired,
      instructions: r.instructions,
      autoPassAccredited: r.autoPassAccredited,
    })),
    entity: {
      id: org.id,
      name: org.name,
      orgType: org.orgType,
      typeLabel: TYPE_LABELS[org.orgType] ?? 'Financing institution',
      regulator: service.financierProfile.regulator,
      licenseNumber: service.financierProfile.licenseNumber,
    },
  }

  const related = await getRelated(service.id, org.id, service.category)

  // ── structured data ──
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'FinancialProduct',
    name: service.name,
    description: service.summary ?? undefined,
    provider: { '@type': 'Organization', name: org.name },
    ...(service.shariaCompliant ? { interest: false } : {}),
  }
  if (service.rateMax != null) jsonLd.annualInterestRate = service.rateMax
  if (service.amountMin != null || service.amountMax != null) {
    jsonLd.amount = {
      '@type': 'MonetaryAmount',
      currency: service.currency,
      ...(service.amountMin != null ? { minValue: service.amountMin } : {}),
      ...(service.amountMax != null ? { maxValue: service.amountMax } : {}),
    }
  }
  if (service.coverage.length > 0) {
    jsonLd.areaServed = service.coverage.map((c) => ({ '@type': 'Place', name: c.regionName }))
  }

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Funding', item: '/funding' },
      { '@type': 'ListItem', position: 2, name: 'Programs', item: '/funding#programs' },
      { '@type': 'ListItem', position: 3, name: service.name },
    ],
  }

  return (
    <>
      {/* white header band — breadcrumbs + tag + 30px H1 */}
      <ProgramHero service={detail} />

      {/* 12-col layout: sidebar (key facts + entity) | main column */}
      <main className="py-8">
        <SectionContainer>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            <aside className="space-y-6 self-start lg:col-span-4" aria-label="Program key facts">
              <KeyFactsPanel service={detail} />
            </aside>

            <div className="min-w-0 space-y-8 lg:col-span-8">
              {(service.description || service.summary) && (
                <section className="rounded-2xl border border-bh-border bg-bh-card p-6 shadow-card" aria-labelledby="about-heading">
                  <h2 id="about-heading" className="h2-practical mb-3 text-bh-navy">
                    About this program
                  </h2>
                  {service.description ? (
                    <Markdown body={service.description} className="text-sm leading-relaxed text-bh-subtle" />
                  ) : (
                    <p className="text-sm leading-relaxed text-bh-subtle">{service.summary}</p>
                  )}
                </section>
              )}

              <ServiceFeaturesPanel service={detail} />

              <ProgramChecklists features={detail.features} eligibility={detail.eligibility} />

              <ProgramRequirements requirements={detail.requirements} />

              <TermsNoteBand note={detail.termsNote} />

              <CoveragePanel coverage={detail.coverage} />

              <RelatedPrograms related={related} />
            </div>
          </div>
        </SectionContainer>
      </main>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
    </>
  )
}
