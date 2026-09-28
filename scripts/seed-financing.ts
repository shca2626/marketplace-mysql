/**
 * FINANCIER MODULE SEED — FIN-1 (FINANCIER_SCHEMA v5.0).
 *
 * Idempotent: wipes the financier domain (FK-safe order), then rebuilds:
 *   - 2 financier organizations (BANK + MFI) with FinancierProfiles + branches
 *   - 2 services each, incl. 1 ACCREDITATION-kind program per financier
 *   - GENERAL condition library (~10 templates, incl. SELECT w/ options)
 *   - 2 financier-private condition templates
 *   - ServiceRequirement attachments (incl. one autoPassAccredited)
 *   - Real AccountDocuments through the media pipeline (sharp → webp → uploads/)
 *   - Demo requests mid-gate: UNDER_PLATFORM_REVIEW, FORWARDED_TO_FINANCIER
 *     (fully verified), accreditation mid-gate, one SENT offer w/ installments
 *
 * Run AFTER seed-demo (reuses admin + demo buyer + Acme org):
 *   bun scripts/seed-financing.ts
 */
import { PrismaClient } from '@prisma/client'
import { randomBytes, scryptSync } from 'crypto'
import sharp from 'sharp'
import { processImageUpload } from '../src/lib/storage/image-pipeline'
import { nextNumber } from '../src/server/modules/sequences/service'

const db = new PrismaClient()

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

const daysAgo = (d: number, h = 0) => new Date(Date.now() - d * 86400_000 - h * 3600_000)
const daysFromNow = (d: number) => new Date(Date.now() + d * 86400_000)

/** Small colored PNG — runs through the REAL media pipeline (renditions land in uploads/). */
async function demoDocImage(label: string, hex: string): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="130">
    <rect width="200" height="130" fill="${hex}"/>
    <rect x="0" y="0" width="200" height="34" fill="rgba(0,0,0,0.25)"/>
    <text x="10" y="23" font-family="monospace" font-size="16" fill="#fff">${label}</text>
    <line x1="10" y1="60" x2="150" y2="60" stroke="rgba(255,255,255,0.6)" stroke-width="2"/>
    <line x1="10" y1="75" x2="170" y2="75" stroke="rgba(255,255,255,0.6)" stroke-width="2"/>
    <line x1="10" y1="90" x2="130" y2="90" stroke="rgba(255,255,255,0.6)" stroke-width="2"/>
  </svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

async function uploadDoc(label: string, hex: string, uploadedById: string) {
  const buf = await demoDocImage(label, hex)
  const processed = await processImageUpload(buf)
  const asset = await db.mediaAsset.create({
    data: {
      key: processed.baseKey,
      originalName: `${label.toLowerCase().replace(/\s+/g, '-')}.png`,
      mime: processed.mime,
      size: processed.originalBytes,
      width: processed.width,
      height: processed.height,
      sha256: processed.sha256,
      variants: JSON.stringify(processed.variants),
      uploadedById,
    },
  })
  return asset
}

async function main() {
  console.log('🧹 Wiping financier domain (FK-safe order)…')
  // children → parents; all financier-domain tables only
  await db.financingFee.deleteMany({})
  await db.financingEvent.deleteMany({})
  await db.financingAgreement.deleteMany({})
  await db.financingOfferInstallment.deleteMany({})
  await db.financingOffer.deleteMany({})
  await db.requirementSubmission.deleteMany({})
  await db.requestAttachment.deleteMany({})
  await db.financingRequest.deleteMany({})
  await db.accreditationRequest.deleteMany({})
  await db.accountDocument.deleteMany({})
  await db.serviceRequirement.deleteMany({})
  await db.conditionOption.deleteMany({})
  await db.conditionTemplate.deleteMany({})
  await db.financierServiceAttribute.deleteMany({})
  await db.financierServiceCoverage.deleteMany({})
  await db.financierService.deleteMany({})
  await db.financierBranch.deleteMany({})
  await db.financierProfile.deleteMany({})
  await db.sequence.deleteMany({ where: { key: { in: ['FIN', 'AGR', 'ACC'] } } })
  // financier demo orgs + staff users (by fixed emails)
  const finOrgIds = await db.organization.findMany({
    where: { slug: { in: ['al-amal-bank', 'al-kuraimi-mfi'] } },
    select: { id: true },
  })
  if (finOrgIds.length) {
    await db.organizationMember.deleteMany({ where: { organizationId: { in: finOrgIds.map((o) => o.id) } } })
    await db.organization.deleteMany({ where: { id: { in: finOrgIds.map((o) => o.id) } } })
  }
  await db.user.deleteMany({
    where: { email: { in: ['alamal.admin@vendora.com', 'alamal.staff@vendora.com', 'kuraimi.admin@vendora.com'] } },
  })

  // ── anchors from the demo seed ──
  const admin = await db.user.findFirst({ where: { role: 'ADMIN' } })
  const demo = await db.user.findFirst({ where: { email: 'demo@vendora.com' } })
  const acme = await db.organization.findFirst({ where: { slug: 'acme-trading-co' } })
  if (!admin || !demo || !acme) throw new Error('Run bun scripts/seed-demo.ts first (admin/demo/Acme missing)')

  console.log('👤 Financier staff users…')
  const amalAdmin = await db.user.create({
    data: {
      email: 'alamal.admin@vendora.com',
      password: hashPassword('financier1234'),
      name: 'Yusuf Al-Amal',
      role: 'BUYER', // access = org membership (DP-1: no new global role)
      phone: '+967 771 000 111',
    },
  })
  const kuraimiAdmin = await db.user.create({
    data: {
      email: 'kuraimi.admin@vendora.com',
      password: hashPassword('financier1234'),
      name: 'Salma Al-Kuraimi',
      role: 'BUYER',
      phone: '+967 772 000 222',
    },
  })

  console.log('🏦 Financier organizations + profiles…')
  const amalOrg = await db.organization.create({
    data: {
      name: 'Al-Amal Bank',
      slug: 'al-amal-bank',
      orgType: 'BANK',
      legalName: 'Al-Amal Microfinance Bank N.A.',
      taxId: 'YE-BNK-00417',
      registrationNumber: 'BK-1998-0417',
      industry: 'Retail & Microfinance Banking',
      website: 'https://alamal.example.com',
      status: 'ACTIVE',
      verifiedAt: daysAgo(120),
      notes: 'Financier (BANK) — demo institution for the financier module.',
    },
  })
  const kuraimiOrg = await db.organization.create({
    data: {
      name: 'Al-Kuraimi Microfinance',
      slug: 'al-kuraimi-mfi',
      orgType: 'MFI',
      legalName: 'Al-Kuraimi Islamic Microfinance Bank',
      taxId: 'YE-MFI-02219',
      registrationNumber: 'MF-2005-2219',
      industry: 'Islamic Microfinance',
      website: 'https://alkuraimi.example.com',
      status: 'ACTIVE',
      verifiedAt: daysAgo(120),
      notes: 'Financier (MFI) — demo institution for the financier module.',
    },
  })
  await db.organizationMember.createMany({
    data: [
      { organizationId: amalOrg.id, userId: amalAdmin.id, role: 'OWNER' },
      { organizationId: kuraimiOrg.id, userId: kuraimiAdmin.id, role: 'OWNER' },
    ],
  })

  const amalProfile = await db.financierProfile.create({
    data: {
      organizationId: amalOrg.id,
      about:
        'Al-Amal Bank finances working capital for small producers and traders since 1998. Murabaha-based working capital advances with decisions in days, not weeks.',
      licenseNumber: 'CBY-BANK-0417',
      regulator: 'Central Bank of Yemen',
      contactEmail: 'financing@alamal.example.com',
      contactPhone: '+967 1 200 111',
      minTicket: 250000,
      maxTicket: 75000000,
    },
  })
  const kuraimiProfile = await db.financierProfile.create({
    data: {
      organizationId: kuraimiOrg.id,
      about:
        'Al-Kuraimi Islamic Microfinance — Sharia-compliant financing for businesses: invoice financing and SME growth facilities across 14 governorates.',
      licenseNumber: 'CBY-MFI-2219',
      regulator: 'Central Bank of Yemen',
      contactEmail: 'sme@alkuraimi.example.com',
      contactPhone: '+967 1 200 222',
      minTicket: 100000,
      maxTicket: 25000000,
    },
  })
  await db.financierBranch.createMany({
    data: [
      { financierProfileId: amalProfile.id, name: 'Head Office — Sana\u2019a', kind: 'BRANCH', city: "Sana'a", district: 'Asd', street: 'Zubairi St, 12', phone: '+967 1 200 111', position: 0 },
      { financierProfileId: amalProfile.id, name: 'Aden Branch', kind: 'BRANCH', city: 'Aden', district: 'Crater', position: 1 },
      { financierProfileId: kuraimiProfile.id, name: 'Main Branch — Sana\u2019a', kind: 'BRANCH', city: "Sana'a", district: 'Hadda', street: 'Hadda Rd, 45', phone: '+967 1 200 222', position: 0 },
      { financierProfileId: kuraimiProfile.id, name: 'Taiz Agency', kind: 'AGENT', city: 'Taiz', position: 1 },
    ],
  })

  console.log('🧩 GENERAL condition library…')
  const T = (
    data: Partial<{
      scope: string; organizationId: string | null; conditionType: string; code: string | null
      title: string; description: string | null; profileFieldKey: string | null; documentType: string | null
      validationMin: number | null; validationMax: number | null; validityMonths: number | null
      isRepeatable: boolean; createdById: string
    }> & { conditionType: string; title: string }
  ) =>
    db.conditionTemplate.create({
      data: {
        scope: 'GENERAL',
        organizationId: null,
        createdById: admin.id,
        ...data,
      } as never,
    })

  const tNatId = await T({ conditionType: 'DOCUMENT', code: 'NAT-ID', title: 'Valid national ID', description: 'A readable scan of your national ID card or passport.', documentType: 'NATIONAL_ID', validityMonths: 60 })
  const tComReg = await T({ conditionType: 'DOCUMENT', code: 'COM-REG', title: 'Valid commercial registration', description: 'Current commercial registration certificate issued by the Ministry of Industry and Trade.', documentType: 'COMMERCIAL_REG', validityMonths: 12 })
  const tTaxCard = await T({ conditionType: 'DOCUMENT', code: 'TAX-CARD', title: 'Tax card', description: 'Valid tax card issued by the Tax Authority.', documentType: 'TAX_CARD', validityMonths: 12 })
  const tBank = await T({ conditionType: 'DOCUMENT', code: 'BNK-STM', title: 'Bank statements — last 6 months', description: 'Consecutive monthly statements covering the past 6 months.', documentType: 'BANK_STATEMENT', validityMonths: 3, isRepeatable: true })
  const tFin = await T({ conditionType: 'DOCUMENT', code: 'FIN-STM', title: 'Financial statements — last fiscal year', description: 'Audited or reviewed financial statements for the most recent fiscal year.', documentType: 'FINANCIAL_STATEMENT', validityMonths: 12 })
  const tAddr = await T({ conditionType: 'DOCUMENT', code: 'ADDR', title: 'Proof of address', description: 'Utility bill or tenancy contract matching the residence address in your profile.', documentType: 'PROOF_OF_ADDRESS', validityMonths: 6 })
  const tPhone = await T({ conditionType: 'PROFILE_FIELD', code: 'PF-PHONE', title: 'Phone number on profile', description: 'Automatically checked — a contact phone must be present on your account.', profileFieldKey: 'user.phone' })
  const tYears = await T({ conditionType: 'SELECT', code: 'YRS', title: 'Years in business', description: 'How long has the business been operating?' })
  await db.conditionOption.createMany({
    data: [
      { conditionTemplateId: tYears.id, value: 'Less than 1 year', position: 0 },
      { conditionTemplateId: tYears.id, value: '1–3 years', position: 1 },
      { conditionTemplateId: tYears.id, value: '3–5 years', position: 2 },
      { conditionTemplateId: tYears.id, value: 'More than 5 years', position: 3 },
    ],
  })
  const tRevenue = await T({ conditionType: 'NUMBER', code: 'REV', title: 'Average monthly revenue', description: 'Average gross revenue over the last 3 months.', validationMin: 0, validationMax: 100000000 })
  const tLicense = await T({ conditionType: 'DATE', code: 'LIC-DATE', title: 'Business license issue date', description: 'Issue date shown on your current business license.' })
  const tDeclare = await T({ conditionType: 'DECLARATION', code: 'DECL-ACC', title: 'Accuracy declaration', description: 'I confirm the information and documents provided are true and complete, and consent to platform verification before forwarding to the financier.' })
  const tPlan = await T({ conditionType: 'TEXT', code: 'PLAN', title: 'Use of funds summary', description: 'A short summary of how the financing will be used (2–4 sentences).' })
  console.log(`   ${11} GENERAL templates`)

  console.log('🔒 Financier-private conditions…')
  const tAmalGuarantors = await db.conditionTemplate.create({
    data: {
      scope: 'FINANCIER',
      organizationId: amalOrg.id,
      conditionType: 'DECLARATION',
      code: 'AMAL-G',
      title: 'Two guarantors on staff',
      description: 'The applicant confirms two employed guarantors will be presented at contract signing.',
      createdById: amalAdmin.id,
    },
  })
  const tKuraimiAccount = await db.conditionTemplate.create({
    data: {
      scope: 'FINANCIER',
      organizationId: kuraimiOrg.id,
      conditionType: 'DECLARATION',
      code: 'KRM-ACC',
      title: 'Al-Kuraimi account held for 6+ months',
      description: 'The applicant confirms an Al-Kuraimi account has been active for at least six months.',
      createdById: kuraimiAdmin.id,
    },
  })

  console.log('🛠️ Financier services + requirements…')
  const amalWC = await db.financierService.create({
    data: {
      financierProfileId: amalProfile.id,
      serviceKind: 'FINANCING',
      category: 'WORKING_CAPITAL',
      name: 'Working Capital Advance',
      summary: 'Murabaha working-capital facility for producers and traders — 6 to 36 months.',
      description:
        'Finance inventory purchases and operating cycle gaps. Murabaha-based: the bank purchases goods and resells them to you at cost plus an agreed profit margin, payable in monthly installments. Decisions typically within 5 working days after platform verification.',
      targetSegment: 'BOTH',
      currency: 'YER',
      amountMin: 250000,
      amountMax: 75000000,
      rateType: 'MURABAHA_ANNUAL',
      rateMax: 30.0,
      feeFlat: 0,
      tenorMinMonths: 6,
      tenorMaxMonths: 36,
      repaymentFrequency: 'MONTHLY',
      gracePeriodDays: 30,
      shariaCompliant: true,
      processingDays: 5,
    },
  })
  const amalAcc = await db.financierService.create({
    data: {
      financierProfileId: amalProfile.id,
      serviceKind: 'ACCREDITATION',
      category: 'SUPPLIER_QUALIFICATION',
      name: 'Supplier Qualification Program',
      summary: 'Al-Amal supplier accreditation — qualified suppliers unlock RFQ participation with the bank.',
      description:
        'Become an approved supplier to Al-Amal Bank and its institutional clients. Accredited companies are listed as qualified vendors, receive and respond to RFQs in the marketplace, and get auto-passed on financing requirements already covered by the accreditation.',
      targetSegment: 'BUSINESS',
      currency: 'YER',
      accreditationValidMonths: 12,
      accreditationFeeAmount: 15000,
      processingDays: 7,
    },
  })
  const kuraimiIF = await db.financierService.create({
    data: {
      financierProfileId: kuraimiProfile.id,
      serviceKind: 'FINANCING',
      category: 'INVOICE_FINANCING',
      name: 'Invoice Financing',
      summary: 'Advance on confirmed invoices — up to 80% of face value, 30–180 days.',
      description:
        'Bridge the gap between delivering an order and getting paid. Present confirmed marketplace invoices; Al-Kuraimi advances up to 80% of the invoice value with settlement from the buyer payment.',
      targetSegment: 'BUSINESS',
      currency: 'YER',
      amountMin: 100000,
      amountMax: 25000000,
      rateType: 'FIXED_ANNUAL',
      rateMax: 24.0,
      tenorMinMonths: 1,
      tenorMaxMonths: 6,
      repaymentFrequency: 'LUMP_SUM',
      shariaCompliant: true,
      processingDays: 3,
    },
  })
  const kuraimiAcc = await db.financierService.create({
    data: {
      financierProfileId: kuraimiProfile.id,
      serviceKind: 'ACCREDITATION',
      category: 'VENDOR_APPROVAL',
      name: 'Vendor Approval Program',
      summary: 'Al-Kuraimi vendor accreditation for marketplace RFQ participation.',
      description:
        'Qualification program for vendors seeking RFQ participation with Al-Kuraimi and its partner institutions. Live accreditation auto-passes financing requirements marked for it.',
      targetSegment: 'BUSINESS',
      currency: 'YER',
      accreditationValidMonths: 24,
      accreditationFeeAmount: 10000,
      processingDays: 10,
    },
  })

  // text-bullet attributes + coverage
  await db.financierServiceAttribute.createMany({
    data: [
      { serviceId: amalWC.id, kind: 'FEATURE', position: 0, text: 'Decisions within 5 working days after verification' },
      { serviceId: amalWC.id, kind: 'FEATURE', position: 1, text: 'No collateral for facilities under YER 5,000,000' },
      { serviceId: amalWC.id, kind: 'ELIGIBILITY_CONDITION', position: 0, text: 'Business operating for at least 1 year' },
      { serviceId: amalWC.id, kind: 'ELIGIBILITY_CONDITION', position: 1, text: 'Bank account with 6 months of activity' },
      { serviceId: amalAcc.id, kind: 'FEATURE', position: 0, text: 'Listed as a qualified vendor for institutional RFQs' },
      { serviceId: amalAcc.id, kind: 'FEATURE', position: 1, text: 'Auto-pass on covered financing requirements' },
      { serviceId: kuraimiIF.id, kind: 'FEATURE', position: 0, text: 'Up to 80% of confirmed invoice value' },
      { serviceId: kuraimiIF.id, kind: 'FEATURE', position: 1, text: 'Settlement directly from buyer payment' },
      { serviceId: kuraimiAcc.id, kind: 'FEATURE', position: 0, text: '24-month accreditation validity' },
    ],
  })
  await db.financierServiceCoverage.createMany({
    data: [
      { serviceId: amalWC.id, regionName: "Sana'a" },
      { serviceId: amalWC.id, regionName: 'Aden' },
      { serviceId: amalWC.id, regionName: 'Taiz' },
      { serviceId: amalAcc.id, regionName: "Sana'a" },
      { serviceId: kuraimiIF.id, regionName: "Sana'a" },
      { serviceId: kuraimiIF.id, regionName: 'Aden' },
      { serviceId: kuraimiIF.id, regionName: 'Taiz' },
      { serviceId: kuraimiIF.id, regionName: 'Hodeidah' },
      { serviceId: kuraimiAcc.id, regionName: "Sana'a" },
    ],
  })

  const R = (
    serviceId: string,
    conditionTemplateId: string,
    opts: Partial<{ isRequired: boolean; displayOrder: number; instructions: string | null; autoPassAccredited: boolean }>
  ) =>
    db.serviceRequirement.create({
      data: { serviceId, conditionTemplateId, ...opts },
    })

  // Al-Amal Working Capital requirements (the composer showcase)
  const rAmalWC = [
    await R(amalWC.id, tNatId.id, { displayOrder: 0, instructions: 'Attach the ID you registered the account with.' }),
    await R(amalWC.id, tPhone.id, { displayOrder: 1 }),
    await R(amalWC.id, tBank.id, { displayOrder: 2, instructions: 'Al-Amal requires ALL six months — combine into one PDF or attach up to 6 statements.' }),
    await R(amalWC.id, tRevenue.id, { displayOrder: 3 }),
    await R(amalWC.id, tYears.id, { displayOrder: 4 }),
    await R(amalWC.id, tPlan.id, { displayOrder: 5, isRequired: false }),
    await R(amalWC.id, tDeclare.id, { displayOrder: 6 }),
    await R(amalWC.id, tAmalGuarantors.id, { displayOrder: 7 }),
  ]
  // Al-Amal accreditation requirements
  const rAmalAcc = [
    await R(amalAcc.id, tComReg.id, { displayOrder: 0 }),
    await R(amalAcc.id, tTaxCard.id, { displayOrder: 1 }),
    await R(amalAcc.id, tFin.id, { displayOrder: 2 }),
    await R(amalAcc.id, tYears.id, { displayOrder: 3 }),
    await R(amalAcc.id, tDeclare.id, { displayOrder: 4 }),
  ]
  // Al-Kuraimi Invoice Financing requirements
  const rKuraimiIF = [
    await R(kuraimiIF.id, tComReg.id, { displayOrder: 0 }),
    await R(kuraimiIF.id, tTaxCard.id, { displayOrder: 1 }),
    await R(kuraimiIF.id, tBank.id, { displayOrder: 2 }),
    await R(kuraimiIF.id, tLicense.id, { displayOrder: 3 }),
    await R(kuraimiIF.id, tKuraimiAccount.id, { displayOrder: 4 }),
    await R(kuraimiIF.id, tDeclare.id, { displayOrder: 5 }),
  ]
  // Kuraimi Vendor Approval requirements
  const rKuraimiAcc = [
    await R(kuraimiAcc.id, tComReg.id, { displayOrder: 0 }),
    await R(kuraimiAcc.id, tFin.id, { displayOrder: 1 }),
    await R(kuraimiAcc.id, tDeclare.id, { displayOrder: 2 }),
  ]
  // autoPass showcase: Al-Amal WC years-in-business auto-passes for Amal-accredited orgs
  await R(amalWC.id, tFin.id, { displayOrder: 8, autoPassAccredited: true, instructions: 'Auto-passed if your company holds a live Al-Amal accreditation.' })
  console.log('   requirements attached')

  console.log('📄 Applicant profile scalars + demo vault documents…')
  // Applicant profile scalars (User additive — §3.1)
  await db.user.update({
    where: { id: demo.id },
    data: {
      phone: '+967 733 555 010',
      whatsappNumber: '+967 733 555 010',
      dateOfBirth: new Date('1990-04-12'),
      gender: 'MALE',
      maritalStatus: 'MARRIED',
      nationality: 'Yemeni',
      identityType: 'NATIONAL_ID',
      identityNumber: 'YE-0110-9934',
      residenceStreet: 'Al-Rabat St, 14',
      residenceCity: "Sana'a",
      residenceDistrict: 'Madab',
      residenceType: 'OWNED',
    },
  })

  // Vault documents (through the real media pipeline)
  const dNatId = await db.accountDocument.create({
    data: {
      userId: demo.id, organizationId: null,
      mediaId: (await uploadDoc('NATIONAL-ID', '#8a5a2b', demo.id)).id,
      documentType: 'NATIONAL_ID', title: 'National ID card', issuedAt: daysAgo(400),
      status: 'VERIFIED', reviewedById: admin.id, reviewedAt: daysAgo(12), note: 'Legible, matches profile.',
    },
  })
  const dBank = await db.accountDocument.create({
    data: {
      userId: demo.id, organizationId: null,
      mediaId: (await uploadDoc('BANK-STATEMENT', '#2b6a5a', demo.id)).id,
      documentType: 'BANK_STATEMENT', title: 'Bank statement — last 6 months', issuedAt: daysAgo(20),
      status: 'PENDING',
    },
  })
  const dComReg = await db.accountDocument.create({
    data: {
      userId: demo.id, organizationId: acme.id,
      mediaId: (await uploadDoc('COMMERCIAL-REG', '#5a3a6a', demo.id)).id,
      documentType: 'COMMERCIAL_REG', title: 'Acme commercial registration 2026', issuedAt: daysAgo(200), expiresAt: daysFromNow(165),
      status: 'VERIFIED', reviewedById: admin.id, reviewedAt: daysAgo(15), note: 'Registry checked.',
    },
  })
  const dTax = await db.accountDocument.create({
    data: {
      userId: demo.id, organizationId: acme.id,
      mediaId: (await uploadDoc('TAX-CARD', '#6a5a2b', demo.id)).id,
      documentType: 'TAX_CARD', title: 'Tax card 2026', issuedAt: daysAgo(190),
      status: 'VERIFIED', reviewedById: admin.id, reviewedAt: daysAgo(15),
    },
  })
  const dFin = await db.accountDocument.create({
    data: {
      userId: demo.id, organizationId: acme.id,
      mediaId: (await uploadDoc('FINANCIALS', '#2b4a6a', demo.id)).id,
      documentType: 'FINANCIAL_STATEMENT', title: 'FY2025 financial statements', issuedAt: daysAgo(100),
      status: 'SUBMITTED_PENDING' as never, // normalized below
    },
  })
  await db.accountDocument.update({ where: { id: dFin.id }, data: { status: 'PENDING' } })

  console.log('📨 Demo financing requests (gate-first states)…')
  const req = (key: string) => rAmalWC.find((r) => r.conditionTemplateId === key) // unused helper guard

  // FR-1: demo (individual) → Al-Amal Working Capital — UNDER_PLATFORM_REVIEW (mid-gate)
  const fr1 = await db.financingRequest.create({
    data: {
      number: await nextNumber('FIN'),
      createdById: demo.id,
      organizationId: null,
      serviceId: amalWC.id,
      targetType: 'WORKING_CAPITAL',
      activityStatus: 'EXISTING',
      activityName: 'Handmade candles workshop',
      activityDescription: 'Small workshop producing soy-wax candles for local retail and the Vendora storefront.',
      activityStartDate: daysAgo(800),
      activityCity: "Sana'a",
      activityDistrict: 'Madab',
      activityCategory: 'MANUFACTURING',
      capitalAmount: 1200000,
      ownContributionAmount: 300000,
      monthlyInstallmentCapacity: 180000,
      previousFinancing: false,
      amountRequested: 2500000,
      currency: 'YER',
      purpose: 'Bulk soy-wax and glass jar purchase for Q4 production.',
      tenorRequestedMonths: 18,
      guaranteeType: 'SELF_GUARANTEE',
      guaranteeStatus: 'AVAILABLE',
      applicantNotes: 'Ready to provide guarantors if required.',
      consentAt: daysAgo(3),
      status: 'UNDER_PLATFORM_REVIEW',
      submittedAt: daysAgo(3),
      expiresAt: daysFromNow(27),
    },
  })
  const S = (serviceRequirementId: string, data: Record<string, unknown>) =>
    db.requirementSubmission.create({
      data: { serviceRequirementId, financingRequestId: fr1.id, ...data } as never,
    })
  // checklist on FR-1 — mixed states (the gate in progress)
  const fr1Phone = rAmalWC[1] // PROFILE_FIELD phone
  await S(rAmalWC[0].id, { status: 'VERIFIED', accountDocumentId: dNatId.id, submittedAt: daysAgo(3), verifiedAt: daysAgo(1), verifiedById: admin.id })
  await S(fr1Phone.id, { status: 'VERIFIED', submittedAt: daysAgo(3), verifiedAt: daysAgo(1), verifiedById: admin.id, decisionNote: 'Profile phone present (auto-evaluated).' })
  await S(rAmalWC[2].id, { status: 'SUBMITTED', accountDocumentId: dBank.id, submittedAt: daysAgo(2) })
  await S(rAmalWC[3].id, { status: 'REJECTED', valueNumber: 0, submittedAt: daysAgo(3), verifiedAt: daysAgo(1), verifiedById: admin.id, decisionNote: 'Revenue stated as 0 — please provide the real 3-month average.' })
  await S(rAmalWC[4].id, { status: 'PENDING' })
  await S(rAmalWC[5].id, { status: 'WAIVED', submittedAt: daysAgo(3), verifiedAt: daysAgo(1), verifiedById: admin.id, decisionNote: 'Optional — waived at intake review.' })
  await S(rAmalWC[6].id, { status: 'SUBMITTED', valueText: 'Confirmed — all information is true and complete.', submittedAt: daysAgo(3) })
  await S(rAmalWC[7].id, { status: 'PENDING' })

  // FR-2: Acme → Al-Kuraimi Invoice Financing — FORWARDED_TO_FINANCIER (gate passed)
  const fr2 = await db.financingRequest.create({
    data: {
      number: await nextNumber('FIN'),
      createdById: demo.id,
      organizationId: acme.id,
      serviceId: kuraimiIF.id,
      targetType: 'WORKING_CAPITAL',
      multiGroupId: 'MG-2026-000001',
      activityStatus: 'EXISTING',
      activityName: 'Acme Trading Co — hotel supplies',
      activityCity: 'Portland',
      activityCategory: 'WHOLESALE_TRADE',
      amountRequested: 8000000,
      currency: 'YER',
      purpose: 'Finance confirmed invoice to boutique hotel chain (net-60).',
      tenorRequestedMonths: 3,
      guaranteeType: 'COMMERCIAL',
      guaranteeStatus: 'AVAILABLE',
      consentAt: daysAgo(10),
      status: 'FORWARDED_TO_FINANCIER',
      submittedAt: daysAgo(10),
      platformReviewedById: admin.id,
      platformReviewedAt: daysAgo(9),
      platformNote: 'All required documents verified; financials consistent with the registry.',
      forwardedAt: daysAgo(9),
    },
  })
  const S2 = (sr: { id: string }, data: Record<string, unknown>) =>
    db.requirementSubmission.create({ data: { serviceRequirementId: sr.id, financingRequestId: fr2.id, ...data } as never })
  await S2(rKuraimiIF[0], { status: 'VERIFIED', accountDocumentId: dComReg.id, submittedAt: daysAgo(10), verifiedAt: daysAgo(9), verifiedById: admin.id })
  await S2(rKuraimiIF[1], { status: 'VERIFIED', accountDocumentId: dTax.id, submittedAt: daysAgo(10), verifiedAt: daysAgo(9), verifiedById: admin.id })
  await S2(rKuraimiIF[2], { status: 'VERIFIED', accountDocumentId: dBank.id, submittedAt: daysAgo(10), verifiedAt: daysAgo(9), verifiedById: admin.id })
  await S2(rKuraimiIF[3], { status: 'VERIFIED', valueDate: daysAgo(190), submittedAt: daysAgo(10), verifiedAt: daysAgo(9), verifiedById: admin.id })
  await S2(rKuraimiIF[4], { status: 'VERIFIED', valueText: 'Confirmed — Al-Kuraimi account active since 2023.', submittedAt: daysAgo(10), verifiedAt: daysAgo(9), verifiedById: admin.id })
  await S2(rKuraimiIF[5], { status: 'VERIFIED', valueText: 'Confirmed.', submittedAt: daysAgo(10), verifiedAt: daysAgo(9), verifiedById: admin.id })

  // One SENT offer on FR-2 (financier response)
  const offer1 = await db.financingOffer.create({
    data: {
      requestId: fr2.id,
      createdById: kuraimiAdmin.id,
      amount: 6400000,
      currency: 'YER',
      rateType: 'FIXED_ANNUAL',
      ratePercent: 18.5,
      tenorMonths: 3,
      collateralRequired: 'COMMERCIAL',
      notes: '80% of invoice face value; settlement from buyer payment. Sharia-compliant (murabaha on the invoice).',
      validUntil: daysFromNow(14),
      status: 'SENT',
      sentAt: daysAgo(8),
    },
  })
  await db.financingOfferInstallment.createMany({
    data: [
      { offerId: offer1.id, installmentNo: 1, dueDate: daysFromNow(30), amount: 2180000 },
      { offerId: offer1.id, installmentNo: 2, dueDate: daysFromNow(60), amount: 2180000 },
      { offerId: offer1.id, installmentNo: 3, dueDate: daysFromNow(90), amount: 2180000 },
    ],
  })

  // ACC-1: Acme → Al-Amal Supplier Qualification — UNDER_PLATFORM_REVIEW (mid-gate, nearly done)
  const acc1 = await db.accreditationRequest.create({
    data: {
      number: await nextNumber('ACC'),
      organizationId: acme.id,
      submittedById: demo.id,
      serviceId: amalAcc.id,
      scopeNotes: 'Hotel & hospitality supplies — cleaning equipment and small appliances.',
      consentAt: daysAgo(2),
      status: 'UNDER_PLATFORM_REVIEW',
      submittedAt: daysAgo(2),
    },
  })
  const S3 = (sr: { id: string }, data: Record<string, unknown>) =>
    db.requirementSubmission.create({ data: { serviceRequirementId: sr.id, accreditationRequestId: acc1.id, ...data } as never })
  await S3(rAmalAcc[0], { status: 'VERIFIED', accountDocumentId: dComReg.id, submittedAt: daysAgo(2), verifiedAt: daysAgo(1), verifiedById: admin.id })
  await S3(rAmalAcc[1], { status: 'VERIFIED', accountDocumentId: dTax.id, submittedAt: daysAgo(2), verifiedAt: daysAgo(1), verifiedById: admin.id })
  await S3(rAmalAcc[2], { status: 'SUBMITTED', accountDocumentId: dFin.id, submittedAt: daysAgo(1) })
  await S3(rAmalAcc[3], { status: 'VERIFIED', valueText: 'More than 5 years', submittedAt: daysAgo(2), verifiedAt: daysAgo(1), verifiedById: admin.id })
  await S3(rAmalAcc[4], { status: 'VERIFIED', valueText: 'Confirmed.', submittedAt: daysAgo(2), verifiedAt: daysAgo(1), verifiedById: admin.id })

  // Request attachments on FR-1 (guarantee docs, study)
  await db.requestAttachment.createMany({
    data: [
      { parentType: 'FINANCING_REQUEST', parentId: fr1.id, accountDocumentId: dBank.id, kind: 'OTHER' },
      { parentType: 'FINANCING_REQUEST', parentId: fr2.id, accountDocumentId: dFin.id, kind: 'STUDY' },
    ],
  })

  console.log('🧾 Audit trail for the gate transitions…')
  await db.auditLog.createMany({
    data: [
      { actorId: demo.id, actorType: 'USER', action: 'FINANCING_STATUS_CHANGED', entityType: 'FinancingRequest', entityId: fr1.id, summary: 'Request submitted to the platform gate', metadata: JSON.stringify({ status: 'SUBMITTED' }), createdAt: daysAgo(3) },
      { actorId: admin.id, actorType: 'ADMIN', action: 'PLATFORM_REVIEW_STARTED', entityType: 'FinancingRequest', entityId: fr1.id, summary: 'Platform review started — 8 checklist items', createdAt: daysAgo(2) },
      { actorId: admin.id, actorType: 'ADMIN', action: 'REQUIREMENT_REJECTED', entityType: 'RequirementSubmission', entityId: fr1.id, summary: 'Average monthly revenue rejected — stated as 0', metadata: JSON.stringify({ note: 'Provide the real 3-month average' }), createdAt: daysAgo(1) },
      { actorId: demo.id, actorType: 'USER', action: 'FINANCING_STATUS_CHANGED', entityType: 'FinancingRequest', entityId: fr2.id, summary: 'Acme request submitted', metadata: JSON.stringify({ status: 'SUBMITTED' }), createdAt: daysAgo(10) },
      { actorId: admin.id, actorType: 'ADMIN', action: 'REQUEST_FORWARDED', entityType: 'FinancingRequest', entityId: fr2.id, summary: 'Gate passed — all 6 required items verified; forwarded to Al-Kuraimi', metadata: JSON.stringify({ financier: 'Al-Kuraimi Microfinance' }), createdAt: daysAgo(9) },
      { actorId: kuraimiAdmin.id, actorType: 'USER', action: 'OFFER_SENT', entityType: 'FinancingOffer', entityId: offer1.id, summary: 'Invoice financing offer — YER 6.4M @ 18.5% fixed, 3 installments', createdAt: daysAgo(8) },
      { actorId: demo.id, actorType: 'USER', action: 'ACCREDITATION_SUBMITTED', entityType: 'AccreditationRequest', entityId: acc1.id, summary: 'Acme applied to Al-Amal Supplier Qualification Program', createdAt: daysAgo(2) },
      { actorId: admin.id, actorType: 'ADMIN', action: 'PLATFORM_REVIEW_STARTED', entityType: 'AccreditationRequest', entityId: acc1.id, summary: 'Platform review started — 5 checklist items', createdAt: daysAgo(1) },
    ],
  })

  const counts = {
    financierOrgs: 2,
    services: 4,
    generalTemplates: await db.conditionTemplate.count({ where: { scope: 'GENERAL' } }),
    privateTemplates: await db.conditionTemplate.count({ where: { scope: 'FINANCIER' } }),
    requirements: await db.serviceRequirement.count(),
    vaultDocs: await db.accountDocument.count(),
    financingRequests: await db.financingRequest.count(),
    accreditationRequests: await db.accreditationRequest.count(),
    submissions: await db.requirementSubmission.count(),
    offers: await db.financingOffer.count(),
  }
  console.log('✅ Financier seed complete:', counts)
  console.log('   Financier logins: alamal.admin@vendora.com / kuraimi.admin@vendora.com — password: financier1234')
  console.log(`   Mid-gate demo: FR ${fr1.number} (UNDER_PLATFORM_REVIEW, mixed checklist) · ACC ${acc1.number} (UNDER_PLATFORM_REVIEW)`)
  console.log(`   Forwarded demo: FR ${fr2.number} (FORWARDED_TO_FINANCIER) + SENT offer w/ 3 installments`)
}

main()
  .catch((err) => {
    console.error('seed-financing failed:', err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
