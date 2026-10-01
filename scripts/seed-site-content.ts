/**
 * Seeds Phase 3–4 site content (fully DB-driven, no hardcoded pages):
 *  - pushes db/site-content-images/*.png through the storage pipeline
 *  - enriches Tihama MFI (profile, branches, service attributes/coverage/requirements)
 *  - adds 4 new financing services across the three entities
 *  - financier social links, success stories, partners
 *  - SiteSteps (funding / how-it-works tracks / sell), Solutions + features,
 *    InsightPosts, FaqItems, LegalDocuments
 *
 * Safe to re-run: new content tables are wiped & re-seeded; entity enrichment
 * is skipped when already present.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { processImageUpload } from '../src/lib/storage/image-pipeline'
import { mediaUrl } from '../src/lib/storage/url'
import { HERO_COLLAGE } from '../src/lib/constants'

const db = new PrismaClient()
const IMG_DIR = 'db/site-content-images'

const YER = 'YER'

async function main() {
  console.log('🌱 seeding Phase 3–4 site content...')

  const admin = await db.user.findFirst({ where: { email: 'admin@vendora.com' } })
  if (!admin) throw new Error('admin@vendora.com not found')

  // ── 1. Push cover images through the storage pipeline ─────────────────────
  const files = existsSync(IMG_DIR) ? readdirSync(IMG_DIR).filter((f) => f.endsWith('.png')) : []
  const urlByFile = new Map<string, string>()
  for (const file of files) {
    const buffer = readFileSync(`${IMG_DIR}/${file}`)
    const sha256 = createHash('sha256').update(buffer).digest('hex')
    const existing = await db.mediaAsset.findFirst({ where: { sha256 } })
    if (existing) {
      const variants = JSON.parse(existing.variants as string)
      urlByFile.set(file, mediaUrl(variants.medium))
      continue
    }
    const processedImg = await processImageUpload(buffer)
    await db.mediaAsset.create({
      data: {
        key: processedImg.baseKey,
        originalName: file,
        mime: processedImg.mime,
        size: processedImg.originalBytes,
        width: processedImg.width,
        height: processedImg.height,
        sha256,
        variants: JSON.stringify(processedImg.variants),
        uploadedById: admin.id,
      },
    })
    urlByFile.set(file, mediaUrl(processedImg.variants.medium))
  }
  console.log(`🖼  ${urlByFile.size} cover images in the pipeline`)
  const cover = (name: string, fallbackIndex = 0) => urlByFile.get(name) ?? HERO_COLLAGE[fallbackIndex]

  // ── 2. Look up financier orgs ─────────────────────────────────────────────
  const alAmal = await db.organization.findFirst({ where: { name: 'Al-Amal Bank' }, include: { financierProfile: true } })
  const kuraimi = await db.organization.findFirst({ where: { name: 'Al-Kuraimi Microfinance' }, include: { financierProfile: true } })
  const tihama = await db.organization.findFirst({ where: { name: 'Tihama Microfinance Institution' }, include: { financierProfile: true } })
  if (!alAmal || !kuraimi || !tihama) throw new Error('financier organizations not found')

  // ── 3. Tihama enrichment: profile + branches + service detail ─────────────
  if (!tihama.financierProfile) {
    await db.financierProfile.create({
      data: {
        organizationId: tihama.id,
        about:
          'Tihama Microfinance Institution brings solar power to rural businesses and households along Yemen’s western coast. Since 2014 we finance pumps, cold storage and shop-scale systems on lease-to-own terms designed for seasonal cash flows — no collateral, decisions within one week.',
        licenseNumber: 'MFI-2014-0091',
        regulator: 'Central Bank of Yemen',
        contactEmail: 'solar@tihama.example.com',
        contactPhone: '+967 3 210 555',
        minTicket: 50_000,
        maxTicket: 15_000_000,
        branches: {
          create: [
            { name: 'Hodeidah Head Office', kind: 'BRANCH', street: 'Al-Arshi St, near Al-Hawk', city: 'Hodeidah', district: 'Al-Hawk', phone: '+967 3 210 555', position: 0 },
            { name: 'Taiz Branch', kind: 'BRANCH', street: 'Jamal St, Al-Mudhaffar', city: 'Taiz', district: 'Al-Mudhaffar', phone: '+967 4 220 888', position: 1 },
          ],
        },
      },
    })
    console.log('🏦 Tihama profile + 2 branches created')
  }

  // ── 3b. Re-fetch orgs with the freshly created Tihama profile ─────────────
  const alAmal2 = await db.organization.findFirst({ where: { name: 'Al-Amal Bank' }, include: { financierProfile: true } })
  const kuraimi2 = await db.organization.findFirst({ where: { name: 'Al-Kuraimi Microfinance' }, include: { financierProfile: true } })
  const tihama2 = await db.organization.findFirst({ where: { name: 'Tihama Microfinance Institution' }, include: { financierProfile: true } })
  if (alAmal2) alAmal.financierProfile = alAmal2.financierProfile
  if (kuraimi2) kuraimi.financierProfile = kuraimi2.financierProfile
  if (tihama2) tihama.financierProfile = tihama2.financierProfile

  // ── 4. Social links for all three entities ────────────────────────────────
  const socials: { org: string; platform: string; url: string; label?: string }[] = [
    { org: alAmal.name, platform: 'WEBSITE', url: 'https://www.alamalbank.example.com', label: 'alamalbank.example.com' },
    { org: alAmal.name, platform: 'FACEBOOK', url: 'https://facebook.com/alamalbank', label: 'Facebook' },
    { org: alAmal.name, platform: 'X', url: 'https://x.com/alamalbank', label: 'X (Twitter)' },
    { org: alAmal.name, platform: 'LINKEDIN', url: 'https://linkedin.com/company/alamalbank', label: 'LinkedIn' },
    { org: kuraimi.name, platform: 'WEBSITE', url: 'https://www.alkuraimi.example.com', label: 'alkuraimi.example.com' },
    { org: kuraimi.name, platform: 'FACEBOOK', url: 'https://facebook.com/alkuraimi', label: 'Facebook' },
    { org: kuraimi.name, platform: 'INSTAGRAM', url: 'https://instagram.com/alkuraimi', label: 'Instagram' },
    { org: kuraimi.name, platform: 'X', url: 'https://x.com/alkuraimi', label: 'X (Twitter)' },
    { org: kuraimi.name, platform: 'YOUTUBE', url: 'https://youtube.com/@alkuraimi', label: 'YouTube' },
    { org: tihama.name, platform: 'WEBSITE', url: 'https://www.tihamamfi.example.com', label: 'tihamamfi.example.com' },
    { org: tihama.name, platform: 'FACEBOOK', url: 'https://facebook.com/tihamamfi', label: 'Facebook' },
    { org: tihama.name, platform: 'WHATSAPP', url: 'https://wa.me/9673000000', label: 'WhatsApp' },
  ]
  for (const org of [alAmal, kuraimi, tihama]) {
    if (org.financierProfile) await db.financierSocialLink.deleteMany({ where: { financierProfileId: org.financierProfile.id } })
  }
  let pos = 0
  for (const s of socials) {
    const org = [alAmal, kuraimi, tihama].find((o) => o.name === s.org)
    if (!org?.financierProfile) continue
    await db.financierSocialLink.create({
      data: { financierProfileId: org.financierProfile.id, platform: s.platform, url: s.url, label: s.label ?? null, position: pos++ },
    })
  }
  console.log('🔗 social links created')

  // ── 5. Enrich Tihama’s existing service ──────────────────────────────────
  const tihamaProfile = await db.financierProfile.findUnique({ where: { organizationId: tihama.id } })
  const leaseService = await db.financierService.findFirst({ where: { name: 'Solar Equipment Lease-to-Own', financierProfileId: tihamaProfile?.id } })
  if (leaseService && tihamaProfile) {
    await db.financierService.update({
      where: { id: leaseService.id },
      data: {
        summary: 'Lease-to-own solar equipment for shops, farms and clinics — own the system in 12–48 months.',
        description:
          'Tihama’s flagship program converts diesel spend into solar ownership. We buy the system you select on Vendora and lease it to you at a fixed, declining-balance murabaha markup. After the final installment the equipment is yours — with warranty intact. Seasonal repayment schedules available for farms (post-harvest lump sums).',
        targetSegment: 'BOTH',
        rateType: 'MURABAHA_ANNUAL',
        rateMax: 15,
        tenorMinMonths: 12,
        tenorMaxMonths: 48,
        repaymentFrequency: 'MONTHLY',
        gracePeriodDays: 30,
        shariaCompliant: true,
        processingDays: 7,
      },
    })
    await db.financierServiceAttribute.deleteMany({ where: { serviceId: leaseService.id } })
    await db.financierServiceAttribute.createMany({
      data: [
        { serviceId: leaseService.id, kind: 'FEATURE', position: 0, text: 'Fixed murabaha markup — the total cost is known before you sign' },
        { serviceId: leaseService.id, kind: 'FEATURE', position: 1, text: 'No collateral — the equipment itself secures the lease' },
        { serviceId: leaseService.id, kind: 'FEATURE', position: 2, text: 'Seasonal schedules for farms: pay after harvest' },
        { serviceId: leaseService.id, kind: 'FEATURE', position: 3, text: 'Warranty stays with you from day one' },
        { serviceId: leaseService.id, kind: 'ELIGIBILITY_CONDITION', position: 0, text: 'Registered business or cooperative, 12+ months of activity' },
        { serviceId: leaseService.id, kind: 'ELIGIBILITY_CONDITION', position: 1, text: 'Bank or wallet account in the applicant’s name' },
        { serviceId: leaseService.id, kind: 'ELIGIBILITY_CONDITION', position: 2, text: 'Site suitable for the proposed system' },
      ],
    })
    await db.financierServiceCoverage.deleteMany({ where: { serviceId: leaseService.id } })
    await db.financierServiceCoverage.createMany({
      data: ['Hodeidah', 'Taiz', 'Ibb', 'Hajjah'].map((regionName) => ({ serviceId: leaseService.id!, regionName })),
    })
    console.log('☀️  Lease-to-Own service enriched')
  }

  // ── 6. GENERAL condition templates for requirements ──────────────────────
  const templates = await db.conditionTemplate.findMany({ where: { scope: 'GENERAL', isActive: true } })
  const tpl = (title: string) => templates.find((t) => t.title === title)

  async function attachRequirements(serviceId: string, titles: string[]) {
    await db.serviceRequirement.deleteMany({ where: { serviceId } })
    let order = 0
    for (const title of titles) {
      const t = tpl(title)
      if (!t) continue
      await db.serviceRequirement.create({
        data: { serviceId, conditionTemplateId: t.id, isRequired: true, displayOrder: order++ },
      })
    }
  }

  // ── 7. New services (idempotent by name) ─────────────────────────────────
  type NewService = {
    org: NonNullable<typeof alAmal>
    data: {
      serviceKind: string
      category: string
      name: string
      summary: string
      description: string
      targetSegment: string
      currency: string
      amountMin: number | null
      amountMax: number | null
      rateType: string | null
      rateMax: number | null
      tenorMinMonths: number | null
      tenorMaxMonths: number | null
      repaymentFrequency?: string
      gracePeriodDays?: number
      shariaCompliant?: boolean
      processingDays?: number
    }
    features: string[]
    eligibility: string[]
    coverage: string[]
    requirements: string[]
  }
  const newServices: NewService[] = [
    {
      org: alAmal,
      data: {
        serviceKind: 'FINANCING',
        category: 'HOME',
        name: 'Home Solar Installment Plan',
        summary: 'Murabaha installments for household solar systems — 80,000 to 2.5M YER over 6–36 months.',
        description:
          'Bring reliable power home. Al-Amal finances complete residential solar systems — panels, battery, inverter and installation — selected from Vendora’s engineer-reviewed catalog. A murabaha contract fixes the total price at signing; monthly installments are flat and known. Free survey visit before approval, and the system is insured for the entire tenor.',
        targetSegment: 'INDIVIDUAL',
        currency: YER,
        amountMin: 80_000,
        amountMax: 2_500_000,
        rateType: 'MURABAHA_ANNUAL',
        rateMax: 16,
        tenorMinMonths: 6,
        tenorMaxMonths: 36,
        repaymentFrequency: 'MONTHLY',
        shariaCompliant: true,
        processingDays: 3,
      },
      features: [
        'Sharia-compliant murabaha — fixed total price at signing',
        'Free technical site survey before approval',
        'System insured for the full tenor',
        'Early settlement with rebate of unearned markup',
      ],
      eligibility: [
        'Salaried employees or documented household income',
        'National ID + proof of address',
        'No active default with any Yemeni lender',
      ],
      coverage: ["Sana'a", 'Aden', 'Taiz', 'Ibb', 'Dhamar'],
      requirements: ['Valid national ID', 'Proof of address'],
    },
    {
      org: kuraimi,
      data: {
        serviceKind: 'FINANCING',
        category: 'AGRICULTURE',
        name: 'Agriculture Equipment Financing',
        summary: 'Sharia-compliant financing for solar pumps and farm equipment — 100k to 20M YER, up to 60 months.',
        description:
          'Al-Kuraimi finances the tools that make farms productive: solar pumping systems, drip irrigation, cold storage and processing equipment. Repayment follows the crop calendar — grace periods align with planting, and balloon installments land after harvest. Decisions in 5 working days, with technical vetting from Vendora’s engineering team.',
        targetSegment: 'BUSINESS',
        currency: YER,
        amountMin: 100_000,
        amountMax: 20_000_000,
        rateType: 'MURABAHA_ANNUAL',
        rateMax: 14,
        tenorMinMonths: 6,
        tenorMaxMonths: 60,
        repaymentFrequency: 'QUARTERLY',
        gracePeriodDays: 90,
        shariaCompliant: true,
        processingDays: 5,
      },
      features: [
        'Crop-aligned repayment calendar with up to 90 days grace',
        'Sharia-compliant murabaha structure',
        'Financing covers equipment, installation and first-year service',
        'Top-up facility after 12 months of on-time repayment',
      ],
      eligibility: [
        'Farm or cooperative registered for 12+ months',
        'Land use rights or lease for the installation site',
        'Bank statements for the last 6 months',
      ],
      coverage: ["Sana'a", 'Hodeidah', 'Taiz', 'Ibb', 'Dhamar', 'Hajjah', 'Aden'],
      requirements: ['Valid commercial registration', 'Tax card', 'Bank statements — last 6 months'],
    },
    {
      org: kuraimi,
      data: {
        serviceKind: 'FINANCING',
        category: 'MICROENTERPRISE',
        name: 'Micro Business Growth Facility',
        summary: 'Small-ticket working capital for workshops and shops — 30k to 3M YER, fast decisions.',
        description:
          'The growth facility behind thousands of Yemeni micro businesses: a top-up friendly murabaha line for tools, stock and equipment. Apply through Vendora in under 10 minutes; approval decisions land in 48 hours for returning customers. Group guarantees accepted where individual collateral is not available.',
        targetSegment: 'BUSINESS',
        currency: YER,
        amountMin: 30_000,
        amountMax: 3_000_000,
        rateType: 'MURABAHA_ANNUAL',
        rateMax: 22,
        tenorMinMonths: 4,
        tenorMaxMonths: 24,
        repaymentFrequency: 'MONTHLY',
        shariaCompliant: true,
        processingDays: 2,
      },
      features: [
        '48-hour decisions for returning customers',
        'Group guarantee accepted instead of collateral',
        'Automatic credit limit growth with repayment history',
        'Payments at any Kuraimi branch or agent',
      ],
      eligibility: [
        '6+ months of business activity',
        'Two trade references or a group guarantee',
        'Valid national ID of the owner',
      ],
      coverage: ["Sana'a", 'Hodeidah', 'Taiz', 'Ibb', 'Hajjah'],
      requirements: ['Valid national ID', 'Phone number on profile'],
    },
    {
      org: tihama,
      data: {
        serviceKind: 'FINANCING',
        category: 'SME',
        name: 'SME Solar Package',
        summary: 'Complete solar power systems for SMEs on fixed-rate installments — 500k to 40M YER.',
        description:
          'A turnkey package for small and medium enterprises: system design, equipment, installation and financing in one contract. Tihama’s engineering partner sizes the system to your load profile; repayments are fixed annual-rate installments over up to 60 months. Diesel replacement analysis included — most customers cut energy cost by 60% or more.',
        targetSegment: 'BUSINESS',
        currency: YER,
        amountMin: 500_000,
        amountMax: 40_000_000,
        rateType: 'FIXED_ANNUAL',
        rateMax: 17,
        tenorMinMonths: 12,
        tenorMaxMonths: 60,
        repaymentFrequency: 'MONTHLY',
        gracePeriodDays: 60,
        processingDays: 10,
      },
      features: [
        'Turnkey: design, equipment, install and finance in one contract',
        'Diesel replacement analysis before you commit',
        'Fixed annual rate — payments never change',
        'Remote monitoring included for the first year',
      ],
      eligibility: [
        'Registered SME with 12+ months of operations',
        'Audited or bank-statement financials for the last fiscal year',
        'Commercial registration and tax card',
      ],
      coverage: ['Hodeidah', 'Taiz', 'Ibb', 'Hajjah', 'Al-Mahwit'],
      requirements: ['Valid commercial registration', 'Tax card', 'Financial statements — last fiscal year'],
    },
  ]

  for (const ns of newServices) {
    if (!ns.org.financierProfile) continue
    const existing = await db.financierService.findFirst({ where: { name: ns.data.name, financierProfileId: ns.org.financierProfile.id } })
    if (existing) {
      console.log(`• ${ns.data.name} already exists`)
      continue
    }
    const created = await db.financierService.create({
      data: { ...ns.data, financierProfileId: ns.org.financierProfile.id },
    })
    await db.financierServiceAttribute.createMany({
      data: [
        ...ns.features.map((text, i) => ({ serviceId: created.id, kind: 'FEATURE', position: i, text })),
        ...ns.eligibility.map((text, i) => ({ serviceId: created.id, kind: 'ELIGIBILITY_CONDITION', position: i, text })),
      ],
    })
    await db.financierServiceCoverage.createMany({
      data: ns.coverage.map((regionName) => ({ serviceId: created.id, regionName })),
    })
    await attachRequirements(created.id, ns.requirements)
    console.log(`➕ ${ns.data.name} (${ns.org.name})`)
  }

  // ── 8. Success stories ────────────────────────────────────────────────────
  await db.fundingStory.deleteMany()
  const stories = [
    {
      financierProfileId: kuraimi.financierProfile?.id ?? null,
      title: 'Hodeidah farm triples yield with solar irrigation',
      summary: 'A 4-hectare vegetable farm replaced a diesel pump with a 5.5 kW solar pumping system — and tripled its irrigated area.',
      body: `## From diesel to daylight
Saleem’s farm outside Hodeidah depended on one diesel pump that consumed a third of every harvest’s revenue. Fuel queues, price swings and breakdowns decided his planting calendar.

## The financing
Al-Kuraimi’s Agriculture Equipment Financing covered the pump, panels, controller and installation — 2.4M YER over 36 months on a murabaha contract with a 90-day grace period aligned to the growing season.

> “The pump paid for itself in the first two harvests. Now I plant when the market asks, not when the fuel allows.”

## The result
- Irrigated area tripled — 1.2 hectares became 4
- 18 seasonal workers now have steady employment
- ~21 tonnes of CO₂ avoided every year`,
      imageUrl: cover('story-farm.png', 2),
      sector: 'AGRICULTURE',
      location: 'Hodeidah',
      year: 2025,
      amountFinanced: 2_400_000,
      peopleImpacted: 18,
      co2AvoidedTonnes: 21,
      featured: true,
      position: 0,
    },
    {
      financierProfileId: alAmal.financierProfile?.id ?? null,
      title: 'Taiz grocer keeps produce fresh around the clock',
      summary: 'A family grocer financed a solar cold room — spoilage fell from 30% to 4% and the store now supplies three neighborhoods.',
      body: `## The problem: darkness eats margins
Blackouts cost Amal’s grocery 30% of its fresh stock every week. The diesel generator kept the lights on but not the cold room.

## The financing
Al-Amal’s Working Capital Advance provided 5.8M YER over 24 months for an 8-panel array, hybrid inverter and cold-storage compressor.

> “We sign one paper, the engineer comes, the cold room hums on sunlight. The installment is less than what spoilage used to cost us.”

## The result
- Spoilage down from 30% to 4%
- 9 new jobs across two shifts
- Fresh supply contracts with 3 neighborhood schools`,
      imageUrl: cover('story-coldstorage.png', 1),
      sector: 'RETAIL',
      location: 'Taiz',
      year: 2025,
      amountFinanced: 5_800_000,
      peopleImpacted: 9,
      co2AvoidedTonnes: 14,
      featured: true,
      position: 1,
    },
    {
      financierProfileId: tihama.financierProfile?.id ?? null,
      title: 'Hajjah clinic powers vaccine cold chain 24/7',
      summary: 'A rural health center leased a solar system — 3,400 patients a year now get vaccines that never break the cold chain.',
      body: `## When the power fails, vaccines die
The Hajjah clinic served 22 villages with a generator that ran four hours a day. Vaccine refrigeration failed twice in one summer.

## The financing
Tihama’s Solar Equipment Lease-to-Own program covered a 6.4 kW array, LiFePO4 storage and a medical-grade refrigerator — 1.2M YER over 48 months, with the equipment itself as the only security.

> “Mothers walk two hours to reach us. Now the fridge never sleeps, and neither does our promise.”

## The result
- Cold chain uptime: 100% since installation
- 3,400 patients served annually, up from 2,100
- Generator fuel budget redirected to medicine`,
      imageUrl: cover('story-clinic.png', 2),
      sector: 'HEALTH',
      location: 'Hajjah',
      year: 2024,
      amountFinanced: 1_200_000,
      peopleImpacted: 3400,
      co2AvoidedTonnes: 9,
      featured: false,
      position: 2,
    },
    {
      financierProfileId: kuraimi.financierProfile?.id ?? null,
      title: 'Sana’a tailoring workshop doubles its machines',
      summary: 'A micro-financed solar system freed a workshop from generator costs — and paid for six new sewing machines.',
      body: `## Sewing by sunlight
Nour’s workshop ran six machines on grid power that arrived four hours a day. Generator fuel for the other twenty ate every riyal of margin.

## The financing
The Micro Business Growth Facility provided 850,000 YER over 18 months. Decision in 48 hours, group guarantee, no collateral.

> “I stopped paying for diesel and started paying for machines. Twelve now hum where six struggled.”

## The result
- 6 additional machines financed with fuel savings
- 6 new tailoring jobs
- Production capacity doubled with zero downtime`,
      imageUrl: cover('story-workshop.png', 3),
      sector: 'MANUFACTURING',
      location: "Sana'a",
      year: 2024,
      amountFinanced: 850_000,
      peopleImpacted: 6,
      co2AvoidedTonnes: 6,
      featured: false,
      position: 3,
    },
  ]
  await db.fundingStory.createMany({ data: stories })
  console.log(`📖 ${stories.length} success stories`)

  // ── 9. Partners ───────────────────────────────────────────────────────────
  await db.partner.deleteMany()
  const partners = [
    { name: 'Yemen Solar Association', monogram: 'YSA', accentColor: '#d97706', kind: 'NGO', websiteUrl: 'https://ysa.example.org' },
    { name: 'Green Energy Council', monogram: 'GEC', accentColor: '#059669', kind: 'NGO', websiteUrl: 'https://gec.example.org' },
    { name: 'Sana’a Chamber of Commerce', monogram: 'SCC', accentColor: '#b45309', kind: 'GOVERNMENT', websiteUrl: 'https://scc.example.org' },
    { name: 'Rural Development Fund', monogram: 'RDF', accentColor: '#7c2d12', kind: 'GOVERNMENT' },
    { name: 'SME Development Agency', monogram: 'SME', accentColor: '#9a3412', kind: 'GOVERNMENT' },
    { name: 'Renewable Energy Society', monogram: 'RES', accentColor: '#0f766e', kind: 'NGO' },
    { name: 'Trade & Industry Federation', monogram: 'TIF', accentColor: '#a16207', kind: 'PARTNER' },
    { name: 'Water Users Alliance', monogram: 'WUA', accentColor: '#0369a1', kind: 'PARTNER' },
  ]
  await db.partner.createMany({ data: partners.map((p, i) => ({ ...p, position: i })) })
  // per-financier partner tiles
  const finPartners: { org: typeof alAmal; name: string; monogram: string; accentColor: string; kind: string }[] = [
    { org: alAmal, name: 'Al-Amal Foundation', monogram: 'AF', accentColor: '#b45309', kind: 'NGO' },
    { org: alAmal, name: 'Yemen Bankers Institute', monogram: 'YBI', accentColor: '#92400e', kind: 'PARTNER' },
    { org: kuraimi, name: 'Islamic Finance Forum', monogram: 'IFF', accentColor: '#047857', kind: 'PARTNER' },
    { org: kuraimi, name: 'AgriGrow Initiative', monogram: 'AG', accentColor: '#3f6212', kind: 'NGO' },
    { org: tihama, name: 'Coastal Development NGO', monogram: 'CD', accentColor: '#0e7490', kind: 'NGO' },
    { org: tihama, name: 'Tihama Farmers Union', monogram: 'TFU', accentColor: '#a16207', kind: 'PARTNER' },
  ]
  for (const fp of finPartners) {
    if (!fp.org.financierProfile) continue
    await db.partner.create({
      data: { name: fp.name, monogram: fp.monogram, accentColor: fp.accentColor, kind: fp.kind, financierProfileId: fp.org.financierProfile.id, position: 99 },
    })
  }
  console.log(`🤝 ${partners.length + finPartners.length} partners`)

  // ── 10. Site steps ────────────────────────────────────────────────────────
  await db.siteStep.deleteMany()
  const steps = [
    // FUNDING
    { page: 'FUNDING', track: 'MAIN', position: 0, icon: 'FileText', title: 'Submit your request', subtitle: 'One form, ten minutes', body: 'Describe your project, the equipment you need and the amount. Attach what you have — the wizard tells you exactly what each entity requires.', stat: '≈ 10 min' },
    { page: 'FUNDING', track: 'MAIN', position: 1, icon: 'ShieldCheck', title: 'Platform review', subtitle: 'We check before they see it', body: 'Vendora’s financing desk verifies your documents and routes the request to the entities whose programs match your project and region.', stat: '1–2 days' },
    { page: 'FUNDING', track: 'MAIN', position: 2, icon: 'Landmark', title: 'Entity offers', subtitle: 'Real numbers, side by side', body: 'Verified entities respond with binding offers: amounts, rates, tenors and repayment calendars. Compare them in one view — no phone calls needed.', stat: '2–5 days' },
    { page: 'FUNDING', track: 'MAIN', position: 3, icon: 'FileSignature', title: 'Agreement & funding', subtitle: 'Sign digitally, get funded', body: 'Accept the offer, e-sign the agreement, and the entity settles the equipment invoice with your Vendora seller. Delivery and installation follow.', stat: 'Same week' },
    // HOW_WORKS — SHOP track
    { page: 'HOW_WORKS', track: 'SHOP', position: 0, icon: 'Search', title: 'Browse & compare', body: 'Every listing carries full engineering specs — wattage, daily yield, compatibility — because our catalog team sizes them for real conditions.' },
    { page: 'HOW_WORKS', track: 'SHOP', position: 1, icon: 'BadgeCheck', title: 'Vetted sellers only', body: 'Stores pass identity and stock verification before their first listing. Reviews come from confirmed orders only.' },
    { page: 'HOW_WORKS', track: 'SHOP', position: 2, icon: 'ShoppingCart', title: 'Order with confidence', body: 'Cart, checkout and payment with order tracking. If something is off, disputes are handled from your dashboard.' },
    { page: 'HOW_WORKS', track: 'SHOP', position: 3, icon: 'Plug', title: 'Install & power up', body: 'Pickup or delivery, with installer contacts for most governorates. Engineer-reviewed wiring guides included per system type.' },
    // HOW_WORKS — PROCURE track
    { page: 'HOW_WORKS', track: 'PROCURE', position: 0, icon: 'Building2', title: 'Create your organization', body: 'Register your company, add buyers and approvers, and set spending thresholds that fit your procurement policy.' },
    { page: 'HOW_WORKS', track: 'PROCURE', position: 1, icon: 'FileSpreadsheet', title: 'Send one RFQ', body: 'One request-for-quote reaches every qualified seller at once — with your quantities, delivery location and deadline.' },
    { page: 'HOW_WORKS', track: 'PROCURE', position: 2, icon: 'GitCompareArrows', title: 'Compare quotes', body: 'Quotes arrive in a standardized table: unit prices, lead times, warranties. Route the choice through approvals with one click.' },
    { page: 'HOW_WORKS', track: 'PROCURE', position: 3, icon: 'Repeat', title: 'Make it recurring', body: 'Turn any RFQ into a monthly or quarterly cycle — recurring procurement runs itself and alerts you before stock runs low.' },
    // HOW_WORKS — FUND track
    { page: 'HOW_WORKS', track: 'FUND', position: 0, icon: 'FileText', title: 'Submit your request', body: 'Describe the project and the equipment. The wizard knows each entity’s requirements before you start.' },
    { page: 'HOW_WORKS', track: 'FUND', position: 1, icon: 'ShieldCheck', title: 'Platform review', body: 'We verify documents and route you to the entities whose programs actually fit your case.' },
    { page: 'HOW_WORKS', track: 'FUND', position: 2, icon: 'Landmark', title: 'Compare offers', body: 'Binding offers with real rates arrive side by side. Negotiate details through the platform, not the phone.' },
    { page: 'HOW_WORKS', track: 'FUND', position: 3, icon: 'FileSignature', title: 'Sign & get funded', body: 'E-sign the agreement; the entity pays the seller directly and your equipment ships.' },
    // SELL track
    { page: 'SELL', track: 'MAIN', position: 0, icon: 'UserPlus', title: 'Create your account', body: 'Sign up with your national ID or commercial registration. It takes five minutes — no fees to apply.' },
    { page: 'SELL', track: 'MAIN', position: 1, icon: 'Store', title: 'Open your storefront', body: 'Name your store, add your story and set your shipping zones. Your storefront gets a public page customers can follow.' },
    { page: 'SELL', track: 'MAIN', position: 2, icon: 'BadgeCheck', title: 'Pass verification', body: 'We verify identity, stock and contact details. Verified stores carry a badge and rank higher in the catalog.' },
    { page: 'SELL', track: 'MAIN', position: 3, icon: 'Package', title: 'List with our specs', body: 'Use guided spec templates per category — customers see engineering data, not just photos. Bulk import supported.' },
    { page: 'SELL', track: 'MAIN', position: 4, icon: 'TrendingUp', title: 'Grow with B2B', body: 'Receive RFQs from businesses, join entity financing programs, and watch your seller analytics tell you what to stock next.' },
  ]
  await db.siteStep.createMany({ data: steps })
  console.log(`👣 ${steps.length} site steps`)

  // ── 11. Solutions + features ──────────────────────────────────────────────
  await db.solutionFeature.deleteMany()
  await db.solution.deleteMany()
  const solutions = [
    {
      slug: 'home',
      title: 'Solar for your home',
      tagline: 'Lights that stay on. Bills that shrink.',
      description: 'Complete home systems — panels, battery and inverter — sized by engineers for real Yemeni rooftops, with financing from 80,000 YER a month-equivalent.',
      audience: 'HOME',
      icon: 'Home',
      imageUrl: HERO_COLLAGE[1],
      accentColor: '#d97706',
      categorySlug: 'solar-panels',
      position: 0,
      features: [
        { icon: 'Calculator', title: 'Sized to your roof & usage', body: 'Our catalog shows the exact daily yield per system so you buy capacity, not hope.' },
        { icon: 'Moon', title: 'Storage that lasts the night', body: 'LiFePO4 options with honest cycle-life data — 10-year warranties available.' },
        { icon: 'Wallet', title: 'Financing from 80k', body: 'Al-Amal’s Home Solar Installment Plan covers the whole system on a fixed murabaha.' },
        { icon: 'Wrench', title: 'Installer network', body: 'Contact details of vetted installers in most governorates, included with every order.' },
      ],
    },
    {
      slug: 'farm',
      title: 'Farm & irrigation',
      tagline: 'Pump water with sunlight, not diesel.',
      description: 'Solar pumping systems sized for well depth and daily water demand — with crop-aligned financing that waits for harvest.',
      audience: 'FARM',
      icon: 'Sprout',
      imageUrl: HERO_COLLAGE[2],
      accentColor: '#059669',
      categorySlug: 'solar-pumps',
      position: 1,
      features: [
        { icon: 'Droplets', title: 'Matched to your well', body: 'Submersible and surface pumps for depths from 20 to 150 meters with controller options.' },
        { icon: 'CalendarClock', title: 'Pay after harvest', body: 'Kuraimi’s Agriculture Financing gives up to 90 days grace and quarterly repayment.' },
        { icon: 'Gauge', title: 'Drip-ready pressure', body: 'Systems spec’d for drip and pivot lines — not just open-channel flow.' },
        { icon: 'ShieldCheck', title: 'Dust-hardened gear', body: 'IP65+ equipment selected for coastal salt and dust conditions.' },
      ],
    },
    {
      slug: 'business',
      title: 'Business & institutions',
      tagline: 'Power your operation without generators.',
      description: 'From corner shops to cold chains and clinics — commercial-scale systems with B2B procurement and fixed-rate financing up to 40M YER.',
      audience: 'BUSINESS',
      icon: 'Building2',
      imageUrl: HERO_COLLAGE[3],
      accentColor: '#b45309',
      categorySlug: 'batteries-storage',
      position: 2,
      features: [
        { icon: 'FileSpreadsheet', title: 'Buy as an organization', body: 'RFQs, price lists and buyer roles — one invoice, multiple approvers.' },
        { icon: 'Landmark', title: 'Finance to 40M YER', body: 'Tihama’s SME Solar Package: turnkey systems on fixed-rate installments to 60 months.' },
        { icon: 'Snowflake', title: 'Cold chain ready', body: 'Hybrid inverters and storage sized for compressors and medical refrigeration.' },
        { icon: 'LineChart', title: 'Cut energy 60%', body: 'Most businesses replace diesel at a fraction of the running cost — analysis included.' },
      ],
    },
  ]
  for (const s of solutions) {
    await db.solution.create({
      data: {
        slug: s.slug,
        title: s.title,
        tagline: s.tagline,
        description: s.description,
        audience: s.audience,
        icon: s.icon,
        imageUrl: s.imageUrl,
        accentColor: s.accentColor,
        categorySlug: s.categorySlug,
        position: s.position,
        features: { create: s.features.map((f, i) => ({ ...f, position: i })) },
      },
    })
  }
  console.log(`🧩 ${solutions.length} solutions`)

  // ── 12. Insight posts ─────────────────────────────────────────────────────
  await db.insightPost.deleteMany()
  const posts = [
    {
      slug: 'how-to-size-a-home-solar-system',
      title: 'How to size a home solar system that actually fits',
      excerpt: 'Wattage is marketing; daily yield is truth. A practical walkthrough of sizing a home system for Yemeni rooftops and blackout patterns.',
      topic: 'GUIDE',
      tags: 'sizing,beginners,home',
      readMinutes: 7,
      featured: true,
      coverUrl: cover('insight-sizing.png', 0),
      authorName: 'Eng. Khalid Al-Hamdani',
      authorTitle: 'Head of Catalog Engineering',
      body: `Most buyers pick panels by peak wattage — the biggest number on the box. But your fridge does not read boxes. Here is how our engineers size a system that keeps the lights on through a real week.

## Start with what you actually run
List every appliance with its running watts and hours per day. A modern fridge cycles at ~150W for 8–10 effective hours. LED lights add up to almost nothing. The pump is the one that bites.

## Convert to daily watt-hours
Multiply and sum. A typical 3-bedroom home lands between 2.5 and 6 kWh per day. If your number is above 8 kWh, look at where it leaks — old fridges and water heaters are the usual suspects.

## Size the array for your worst month
December delivers roughly 60% of June’s yield. Size the panels for the darkest weeks or accept a winter top-up. We publish the **daily yield estimate** on every system listing for exactly this reason.

## Size the battery for your blackout pattern
If you need 8 hours of evening power, you need 8 hours of storage — with a 20% margin. Lithium tolerates deep cycles; lead-acid does not. Match chemistry to how you actually discharge.

## The inverter is the marriage
Panels and battery must speak the inverter’s voltage and protocol. Every listing on Vendora shows compatibility — when in doubt, follow it.`,
      publishedAt: new Date('2025-09-02T09:00:00Z'),
    },
    {
      slug: 'murabaha-vs-conventional-loans',
      title: 'Murabaha vs conventional loans: what solar buyers should know',
      excerpt: 'A clear, practical comparison of murabaha financing structures and conventional interest for equipment purchases.',
      topic: 'FUNDING',
      tags: 'financing,islamic-finance',
      readMinutes: 6,
      featured: true,
      coverUrl: cover('insight-murabaha.png', 1),
      authorName: 'Fatima Al-Sabri',
      authorTitle: 'Financing Desk Lead',
      body: `When you finance solar equipment in Yemen today, you will meet two structures: the conventional interest-bearing loan and the murabaha sale. They are not the same thing wearing different clothes.

## What murabaha actually is
In a murabaha, the financier **buys the equipment and sells it to you at a disclosed markup**, payable in installments. You know the total price on day one. The financier owns the asset until the final payment — which is why "no collateral" is possible.

## The practical differences
- **Price certainty**: murabaha fixes the total from the start; floating rates can move
- **Ownership**: the equipment itself secures a murabaha; a loan may ask for other collateral
- **Late payment**: conventional loans compound penalties; murabaha markup cannot legally increase after signing
- **Early settlement**: both offer it, but murabaha often includes a rebate of unearned markup

## What to compare when you see offers
Look at the **total payable amount** and the **tenor** — not a headline "rate". A 14% murabaha over 36 months can cost less overall than a 10% loan over 60. On Vendora, offers from entities are presented with both numbers side by side.

## Who offers what
On our funding entities page, every program carries a Sharia-compliant badge where applicable — Al-Kuraimi and Tihama structures are murabaha-based by design; Al-Amal offers both murabaha and conventional facilities.`,
      publishedAt: new Date('2025-08-18T09:00:00Z'),
    },
    {
      slug: 'battery-lifespan-what-datasheets-hide',
      title: 'Battery lifespan: what the datasheet hides',
      excerpt: 'Cycle counts are measured under laboratory conditions you will never live in. Here is how to read between the lines.',
      topic: 'GUIDE',
      tags: 'batteries,storage,engineering',
      readMinutes: 5,
      coverUrl: cover('insight-battery.png', 1),
      authorName: 'Eng. Khalid Al-Hamdani',
      authorTitle: 'Head of Catalog Engineering',
      body: `A "3000-cycle" battery can die in 800 cycles or outlive your rooftop. The difference is in four numbers the datasheet prints small.

## Depth of discharge (DoD)
Cycle counts are measured at a specific DoD — often 80%. If you drain the battery to empty every night, the same cell delivers far fewer cycles. Lithium (LiFePO4) tolerates deep discharge; lead-acid chemistry ages quickly below 50%.

## Temperature
Capacity and lifespan are rated at 25°C. Every 10°C above that roughly **halves** lead-acid life. A battery closet that hits 45°C in summer is a battery dying young.

## Charge current
Charging too fast heats cells and strips plates. Match your controller’s charge current to the battery’s spec — one more reason our listings show full charge-parameter compatibility.

## Round-trip efficiency
What you put in is not what you take out. LiFePO4 returns 95%+; flooded lead-acid returns 75–85%. Over a decade of daily cycling, that difference is a whole extra battery.

## Our rule of thumb
For daily cycling: lithium. For backup-only duty: quality AGM. For budgets that must stretch: flooded, but with eyes open — and a hydrometer.`,
      publishedAt: new Date('2025-07-21T09:00:00Z'),
    },
    {
      slug: 'how-rfqs-cut-procurement-costs',
      title: 'How RFQs cut solar procurement costs by 18%',
      excerpt: 'Inside the numbers from our B2B buyers: why one standardized request beats a week of phone calls.',
      topic: 'MARKET',
      tags: 'b2b,rfq,procurement',
      readMinutes: 4,
      coverUrl: cover('insight-rfq.png', 3),
      authorName: 'Vendora Newsroom',
      authorTitle: null,
      body: `We analyzed a year of quote requests from farms, NGOs and retailers on the platform. The pattern was unambiguous: organizations that sent standardized RFQs paid, on average, **18% less** than those negotiating one-on-one.

## Why the price drops
- **Every seller sees the same spec**: apple-to-apple comparisons eliminate the "cheaper panel, thinner frame" trick
- **Deadline pressure moves to sellers**: a 5-day window concentrates attention
- **Volume is visible**: sellers price for the whole year when the RFQ says 40 units, not 4

## The hidden win: time
Buyers reported saving **6–10 hours per purchase**. No repeat phone calls, no WhatsApp screenshots, no re-entry of specs. Quotes arrive in one table — unit price, lead time, warranty, payment terms.

## Getting started
Create your organization on Vendora, then send your first RFQ with quantities, delivery location and deadline. Approvals and recurring cycles (monthly, quarterly) are built in — and every entity offer for financing is attached to the same document trail.`,
      publishedAt: new Date('2025-09-15T09:00:00Z'),
    },
    {
      slug: 'five-mistakes-when-buying-panels',
      title: 'Five mistakes to avoid when buying solar panels',
      excerpt: 'From chasing peak watts to ignoring mounting rails — the expensive errors we see every week.',
      topic: 'GUIDE',
      tags: 'panels,beginners',
      readMinutes: 4,
      coverUrl: HERO_COLLAGE[0],
      authorName: 'Eng. Amina Qasem',
      authorTitle: 'Catalog Engineer',
      body: `## 1. Buying peak watts instead of daily yield
"450W" means 450W at 25°C cell temperature with perfect sun. A dusty panel at 50°C delivers a fifth less. Judge systems by their **estimated daily yield** in your conditions.

## 2. Ignoring the mounting system
Rails and clamps are the skeleton of your array. The cheapest rails corrode through coastal winters. Anodized aluminum pays for itself in year three.

## 3. Mismatching panels and controller
A 60A MPPT controller has real voltage windows. Put a high-voltage string on a PWM controller and you paid for silicon you will never use.

## 4. Forgetting the wiring losses
Every meter of undersized cable between panel, controller and battery costs you watts, all day, forever. Our listings include recommended cable gauges — use them.

## 5. No plan for maintenance
Dust in Yemen is not a footnote. A monthly rinse keeps yield where it should be. Panels with easy-access mounting get cleaned; panels on clever brackets do not.`,
      publishedAt: new Date('2025-06-30T09:00:00Z'),
    },
    {
      slug: 'from-quote-to-installation-funded-project',
      title: 'From quote to installation: the timeline of a funded project',
      excerpt: 'A real 3-week timeline: how financing, procurement and installation overlap when everything runs on one platform.',
      topic: 'FUNDING',
      tags: 'financing,timeline,projects',
      readMinutes: 5,
      coverUrl: HERO_COLLAGE[3],
      authorName: 'Fatima Al-Sabri',
      authorTitle: 'Financing Desk Lead',
      body: `Funded projects on Vendora follow a rhythm. Here is a real one — a 6.4 kW clinic system financed through Tihama — from first click to running refrigerator.

## Day 1 — the request
The clinic director completes the financing wizard: project description, equipment list, documents. **Time spent: 40 minutes.**

## Days 2–3 — platform review
Our financing desk verifies the commercial registration and matches the request against entity programs. The request routes to Tihama and Al-Kuraimi.

## Days 4–8 — offers arrive
Two offers land: different tenors, different grace periods. The director compares total payable amounts and accepts the 48-month lease-to-own.

## Day 9 — agreement signed
E-signature on the platform. Tihama confirms the equipment invoice with the seller directly.

## Days 10–16 — equipment & installation
The seller ships panels, storage and the medical refrigerator. The installer contact provided with the order schedules the mounting.

## Day 17 — power on
Cold chain runs on sunlight. Repayment begins after a 30-day grace period — and the platform tracks every installment from the clinic’s dashboard.

> One platform, one document trail, three weeks. That is the point.`,
      publishedAt: new Date('2025-09-08T09:00:00Z'),
    },
  ]
  await db.insightPost.createMany({ data: posts })
  console.log(`📰 ${posts.length} insight posts`)

  // ── 13. FAQ items ─────────────────────────────────────────────────────────
  await db.faqItem.deleteMany()
  const faqs = [
    { topic: 'GENERAL', position: 0, featured: true, question: 'What is Vendora?', answer: 'Vendora is the platform where Yemen buys, procures and funds solar energy. Shop engineer-reviewed equipment from vetted stores, buy as an organization with RFQs and price lists, or finance your project through verified funding entities — all in one place.' },
    { topic: 'GENERAL', position: 1, question: 'Do I need an account to browse?', answer: 'No. Browsing the market, funding entities and all public pages is open. An account is needed to order, send RFQs or apply for financing — it takes about a minute to create.' },
    { topic: 'GENERAL', position: 2, question: 'Which regions do you serve?', answer: 'Our sellers ship to all governorates, with installer contacts for most. Funding entities each publish their own coverage regions on their program pages.' },
    { topic: 'GENERAL', position: 3, question: 'How do I contact a human?', answer: 'Use the contact page — messages reach the right desk (orders, funding, sellers, partnerships) and we answer within one working day.' },
    { topic: 'FUNDING', position: 0, featured: true, question: 'Who provides the financing — Vendora or the entities?', answer: 'The financing always comes from the verified entities (banks and microfinance institutions). Vendora operates the platform: we verify requests, route them to matching programs, and host the offers, agreements and repayment tracking.' },
    { topic: 'FUNDING', position: 1, featured: true, question: 'What documents do I need to apply?', answer: 'It depends on the entity and program. Typical requirements: national ID, commercial registration for businesses, bank statements for the last 6 months, and sometimes proof of address. Each program page lists its exact requirements before you start.' },
    { topic: 'FUNDING', position: 2, question: 'Is the financing Sharia-compliant?', answer: 'Many programs are. Al-Kuraimi and Tihama structures are murabaha-based by design; Al-Amal offers both Sharia-compliant and conventional facilities. Every program card carries a Sharia-compliant badge where applicable.' },
    { topic: 'FUNDING', position: 3, question: 'How long does a funding decision take?', answer: 'Platform review takes 1–2 working days. Entity decisions typically arrive within 2–5 days after that — the Home Solar Installment Plan from Al-Amal advertises decisions in 3 days, and Kuraimi’s micro facility decides in 48 hours for returning customers.' },
    { topic: 'FUNDING', position: 4, question: 'Can I compare offers from different entities?', answer: 'Yes — that is the core of the flow. Your request is routed to every matching entity, and their binding offers arrive in one comparison view: amounts, rates, tenors and total payable side by side.' },
    { topic: 'FUNDING', position: 5, question: 'Does applying affect my credit anywhere?', answer: 'Submitting a request on the platform does not. Once you accept an entity’s offer, the resulting agreement is with that institution and follows their reporting.' },
    { topic: 'MARKET', position: 0, question: 'Are the sellers vetted?', answer: 'Yes. Every store passes identity, stock and contact verification before its first listing. Verified stores carry a badge, and reviews can only come from confirmed orders.' },
    { topic: 'MARKET', position: 1, question: 'What if the equipment arrives damaged or wrong?', answer: 'Open a dispute from your dashboard within the protection window. The seller responds on-platform; unresolved cases are escalated to Vendora support with the full order trail as evidence.' },
    { topic: 'MARKET', position: 2, question: 'Can I buy one panel, or only full systems?', answer: 'Both. Individual components are sold per unit, and our catalog also curates complete systems with compatibility data so components work together.' },
    { topic: 'SELL', position: 0, featured: true, question: 'How much does it cost to sell on Vendora?', answer: 'Opening a store and listing products is free. A commission applies only when you sell — the current rate is published in the seller console before your first listing.' },
    { topic: 'SELL', position: 1, question: 'What do I need to open a store?', answer: 'A national ID for individuals or a commercial registration for companies, real stock, and a way to fulfill orders. Verification usually completes within two working days.' },
    { topic: 'SELL', position: 2, question: 'Can I sell to businesses too?', answer: 'Yes — verified stores automatically receive RFQs from organizations. You can also join entity supplier-accreditation programs to unlock institutional demand.' },
  ]
  await db.faqItem.createMany({ data: faqs })
  console.log(`❓ ${faqs.length} FAQ items`)

  // ── 14. Legal documents ──────────────────────────────────────────────────
  await db.legalDocument.deleteMany()
  const terms = {
    slug: 'terms',
    title: 'Terms of Service',
    summary: 'The agreement between you and Vendora covering the marketplace, funding platform and seller services.',
    version: '1.1',
    body: `These Terms of Service govern your use of the Vendora platform, including the marketplace, the procurement tools and the financing request service. By creating an account or placing an order you accept these terms.

## 1. The platform
Vendora operates an online marketplace where independent sellers offer solar equipment, and a platform through which verified funding entities offer financing programs. Unless stated otherwise, Vendora is not the seller of marketplace items and is not the financier of any program.

## 2. Accounts
You must provide accurate information and keep your credentials secure. Business accounts may add members with roles; the organization is responsible for actions taken under its accounts.

## 3. Marketplace purchases
Contracts of sale are concluded between you and the seller. Prices, availability and delivery terms are set by sellers. We facilitate payment, order tracking and disputes.

## 4. Disputes
If an order arrives damaged, incomplete or materially different from its listing, open a dispute within the protection window published at checkout. Vendora mediates with access to the full order trail and may issue refunds or compensation from seller guarantees where warranted.

## 5. Financing requests
Financing requests submitted through the platform are routed to verified entities. Offers, agreements and repayment obligations exist between you and the entity. Vendora verifies documentation and hosts the process but does not lend money.

## 6. Prohibited conduct
Fraudulent listings, manipulation of reviews, harassment of other users, and attempts to circumthesize platform safety controls are grounds for immediate termination.

## 7. Liability
The platform is provided on an as-is basis to the extent permitted by law. We do not exclude liability for fraud or for anything that cannot lawfully be excluded.

## 8. Changes
We may update these terms with 14 days notice for material changes. Continued use after the effective date constitutes acceptance.`,
  }
  const privacy = {
    slug: 'privacy',
    title: 'Privacy Policy',
    summary: 'What data Vendora collects, why we collect it, and the choices you have.',
    version: '1.1',
    body: `This policy explains how Vendora handles personal data when you use the marketplace, procurement tools and financing service.

## What we collect
- **Account data**: name, email, phone, and for businesses the commercial registration details you provide
- **Order data**: items, amounts, delivery addresses and order history
- **Financing data**: the documents and information you submit with a financing request, and the status of any resulting offer or agreement
- **Usage data**: pages visited and technical events needed to run and secure the service

## Why we process it
To operate the marketplace (orders, payments, disputes), to route financing requests to entities whose programs match your project, to verify identity as required by our funding partners, and to keep the platform secure.

## Who we share it with
- **Sellers**: the information needed to fulfil your order
- **Funding entities**: the documents and details of your financing request, when you submit one
- **Service providers**: payment and email infrastructure, under contract
- We do not sell personal data.

## Retention
Order and financing records are retained for the periods required by commercial practice and applicable regulation. You may request deletion of your account; records we must legally retain are minimized and access-restricted.

## Your choices
You can access, correct or export your data from your dashboard, or by contacting us through the contact page. Security settings let you review sessions and revoke devices.

## Contact
Questions about this policy reach the same desks listed on our contact page.`,
  }
  await db.legalDocument.create({ data: terms })
  await db.legalDocument.create({ data: privacy })
  console.log('⚖️  legal documents: terms, privacy')

  console.log('\n✅ site content seed complete')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
