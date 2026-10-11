/**
 * FINANCIER DOMAIN SEED v5.0 (FIN-1) — runs on top of seed-demo.ts.
 *
 * Usage:
 *   DATABASE_URL="mysql://vendora:VendoraDb_2025_Prod@127.0.0.1:3306/vendora" \
 *     bun scripts/seed-financier.ts
 *
 * Seeds (per FINANCIER_PLAN FIN-1 DoD):
 *   - 2 financier orgs (Al-Amal Bank BANK / Al-Kuraimi MFI) w/ profiles + branches
 *   - 2 services each (1 FINANCING + 1 ACCREDITATION program)
 *   - GENERAL condition library (~13 templates covering all 8 condition types)
 *   - Financier-private conditions (autoPass demo)
 *   - ServiceRequirement attachments per service
 *   - Demo AccountDocuments (real MediaAsset-backed, via image pipeline)
 *   - Demo requests: one FinancingRequest mid-gate (UNDER_PLATFORM_REVIEW),
 *     one FORWARDED w/ offer + installments, one AccreditationRequest FORWARDED
 */
import { PrismaClient } from '@prisma/client'
import { randomBytes, scryptSync, createHash } from 'crypto'
import sharp from 'sharp'
import { processImageUpload } from '../src/lib/storage/image-pipeline'

const db = new PrismaClient()

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function daysAgo(n: number, hour = 10): Date {
  const d = new Date()
  d.setHours(hour, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return d
}
function daysFromNow(n: number, hour = 18): Date {
  const d = new Date()
  d.setHours(hour, 0, 0, 0)
  d.setDate(d.getDate() + n)
  return d
}

async function nextNumber(prefix: string): Promise<string> {
  return db.$transaction(async (tx) => {
    await tx.sequence.upsert({
      where: { key: prefix },
      create: { key: prefix, value: 1 },
      update: { value: { increment: 1 } },
    })
    const seq = await tx.sequence.findUniqueOrThrow({ where: { key: prefix } })
    return `${prefix}-${new Date().getFullYear()}-${String(seq.value).padStart(6, '0')}`
  })
}

/** Real MediaAsset-backed "document": colored PNG through the true pipeline. */
async function makeDocumentAsset(
  uploaderId: string,
  label: string,
  hue: number
): Promise<string> {
  const png = await sharp({
    create: { width: 640, height: 880, channels: 3, background: { r: 244, g: hue, b: 96 + hue / 2 } },
  })
    .jpeg({ quality: 80 })
    .toBuffer()
  const processed = await processImageUpload(png)
  const sha256 = processed.sha256
  const asset = await db.mediaAsset.upsert({
    where: { sha256 },
    update: {},
    create: {
      key: processed.baseKey,
      originalName: `${label}.jpg`,
      mime: processed.mime,
      size: processed.originalBytes,
      width: processed.width,
      height: processed.height,
      sha256,
      variants: JSON.stringify(processed.variants),
      uploadedById: uploaderId,
    },
  })
  return asset.id
}

async function main() {
  console.log('🧹 Clearing financier-domain data (FK-safe order)...')
  await db.financingFee.deleteMany()
  await db.financingEvent.deleteMany()
  await db.financingAgreement.deleteMany()
  await db.financingOfferInstallment.deleteMany()
  await db.financingOffer.deleteMany()
  await db.requirementSubmission.deleteMany()
  await db.requestAttachment.deleteMany()
  await db.accountDocument.deleteMany()
  await db.financingRequest.deleteMany()
  await db.accreditationRequest.deleteMany()
  await db.serviceRequirement.deleteMany()
  await db.conditionOption.deleteMany()
  await db.conditionTemplate.deleteMany()
  await db.financierServiceAttribute.deleteMany()
  await db.financierServiceCoverage.deleteMany()
  await db.financierService.deleteMany()
  await db.financierBranch.deleteMany()
  await db.financierProfile.deleteMany()
  // financier orgs + staff (keep Acme — the applicant org)
  const finOrgs = await db.organization.findMany({ where: { orgType: { in: ['BANK', 'MFI', 'EWALLET'] } }, select: { id: true } })
  const finOrgIds = finOrgs.map((o) => o.id)
  if (finOrgIds.length) {
    await db.organizationMember.deleteMany({ where: { organizationId: { in: finOrgIds } } })
    await db.organization.deleteMany({ where: { id: { in: finOrgIds } } })
  }
  await db.user.deleteMany({ where: { email: { in: ['financier1@vendora.com', 'financier2@vendora.com'] } } })

  const admin = await db.user.findUniqueOrThrow({ where: { email: 'admin@vendora.com' } })
  const acme = await db.organization.findFirstOrThrow({ where: { name: { contains: 'Acme' } }, include: { members: true } })
  const demo = await db.user.findUniqueOrThrow({ where: { email: 'demo@vendora.com' } })

  // Applicant profile completeness (PROFILE_FIELD auto-eval demo)
  await db.user.update({
    where: { id: demo.id },
    data: {
      phone: '+967 77 228 2890',
      dateOfBirth: new Date('1990-05-14'),
      gender: 'MALE',
      maritalStatus: 'MARRIED',
      nationality: 'Yemeni',
      identityType: 'NATIONAL_ID',
      identityNumber: '0101254747',
      residenceStreet: 'Hadda Street, Building 12',
      residenceCity: 'Sana\'a',
      residenceDistrict: 'Hadda',
      residenceType: 'OWNED',
    },
  })
  if (!acme.taxId) {
    await db.organization.update({ where: { id: acme.id }, data: { taxId: 'TAX-2026-01147', registrationNumber: 'CR-2019-3391' } })
  }

  console.log('🏢 Creating financier organizations...')
  const amal = await db.organization.create({
    data: {
      name: 'Al-Amal Bank',
      slug: 'al-amal-bank',
      orgType: 'BANK',
      legalName: 'Al-Amal Bank for Microfinance S.A.C.',
      taxId: 'BK-2007-0092',
      registrationNumber: 'CR-2007-1188',
      industry: 'Banking & Microfinance',
      website: 'https://al-amal.example.com',
      status: 'ACTIVE',
      verifiedAt: daysAgo(400),
      notes: 'Full-service bank with dedicated SME financing desk.',
    },
  })
  const kuraimi = await db.organization.create({
    data: {
      name: 'Al-Kuraimi Microfinance',
      slug: 'al-kuraimi',
      orgType: 'MFI',
      legalName: 'Al-Kuraimi Islamic Microfinance Bank',
      taxId: 'MFI-2011-0443',
      registrationNumber: 'CR-2011-7710',
      industry: 'Islamic Microfinance',
      website: 'https://kuraimi.example.com',
      status: 'ACTIVE',
      verifiedAt: daysAgo(520),
      notes: 'Sharia-compliant microfinance institution, 22 governorates.',
    },
  })

  console.log('👥 Financier staff...')
  const omar = await db.user.create({
    data: {
      email: 'financier1@vendora.com',
      password: hashPassword('financier1234'),
      name: 'Omar Hassan',
      role: 'BUYER',
      phone: '+967 1 200 300',
      verifiedAt: daysAgo(400),
    },
  })
  const fatima = await db.user.create({
    data: {
      email: 'financier2@vendora.com',
      password: hashPassword('financier1234'),
      name: 'Fatima Al-Salem',
      role: 'BUYER',
      phone: '+967 1 440 550',
      verifiedAt: daysAgo(520),
    },
  })
  await db.organizationMember.createMany({
    data: [
      { organizationId: amal.id, userId: omar.id, role: 'OWNER', jobTitle: 'Head of SME Financing' },
      { organizationId: kuraimi.id, userId: fatima.id, role: 'OWNER', jobTitle: 'Head of Vendor Programs' },
    ],
  })

  console.log('🏦 Financier profiles + branches...')
  const amalProfile = await db.financierProfile.create({
    data: {
      organizationId: amal.id,
      about: 'Al-Amal Bank finances growing Yemeni businesses with murabaha-based working capital, equipment and supplier programs. 15 years of SME lending across all governorates.',
      licenseNumber: 'CBA-BANK-2007-092',
      regulator: 'Central Bank of Yemen',
      contactEmail: 'sme@al-amal.example.com',
      contactPhone: '+967 1 200 300',
      minTicket: 100000,
      maxTicket: 50000000,
      viewCount: 11449,
      branches: {
        create: [
          { name: 'Head Office — Hadda', kind: 'BRANCH', street: 'Hadda Street', city: 'Sana\'a', district: 'Hadda', latitude: 15.3366, longitude: 44.1910, phone: '+967 1 200 300', position: 0 },
          { name: 'Crater Branch', kind: 'BRANCH', street: 'Al-Mualla', city: 'Aden', district: 'Crater', latitude: 12.7895, longitude: 45.0352, phone: '+967 2 240 110', position: 1 },
          { name: 'Taiz Agent — Al-Rabat', kind: 'AGENT', city: 'Taiz', district: 'Al-Rabat', phone: '+967 4 220 330', position: 2 },
        ],
      },
    },
  })
  const kuraimiProfile = await db.financierProfile.create({
    data: {
      organizationId: kuraimi.id,
      about: 'Al-Kuraimi provides Sharia-compliant micro and SME financing with fast decisions and doorstep service. Accredited supplier and vendor programs unlock RFQ participation.',
      licenseNumber: 'CBA-MFI-2011-443',
      regulator: 'Central Bank of Yemen',
      contactEmail: 'programs@kuraimi.example.com',
      contactPhone: '+967 1 440 550',
      minTicket: 50000,
      maxTicket: 10000000,
      viewCount: 8210,
      branches: {
        create: [
          { name: 'Sana\'a Main', kind: 'BRANCH', street: 'Ali Abdulmughni St', city: 'Sana\'a', district: 'Al-Hasaba', latitude: 15.3500, longitude: 44.2060, phone: '+967 1 440 550', position: 0 },
          { name: 'Hudaydah Branch', kind: 'BRANCH', city: 'Al-Hudaydah', district: 'Al-Mina', phone: '+967 3 210 440', position: 1 },
        ],
      },
    },
  })

  console.log('📚 GENERAL condition library (13 templates, all 8 types)...')

  async function generalTemplate(data: {
    code: string; conditionType: string; title: string; description?: string
    documentType?: string; profileFieldKey?: string; validationMin?: number; validationMax?: number
    validityMonths?: number; isRepeatable?: boolean
    options?: string[]
  }) {
    return db.conditionTemplate.create({
      data: {
        scope: 'GENERAL',
        organizationId: null,
        conditionType: data.conditionType,
        code: data.code,
        title: data.title,
        description: data.description,
        documentType: data.documentType,
        profileFieldKey: data.profileFieldKey,
        validationMin: data.validationMin,
        validationMax: data.validationMax,
        validityMonths: data.validityMonths,
        isRepeatable: data.isRepeatable ?? false,
        createdById: admin.id,
        options: data.options
          ? { create: data.options.map((value, i) => ({ value, position: i })) }
          : undefined,
      },
      include: { options: true },
    })
  }

  const tComReg = await generalTemplate({ code: 'COM-REG', conditionType: 'DOCUMENT', title: 'Valid commercial registration', description: 'Attach the current commercial registration certificate for the applicant company.', documentType: 'COMMERCIAL_REG', validityMonths: 12 })
  const tTaxCard = await generalTemplate({ code: 'TAX-CARD', conditionType: 'DOCUMENT', title: 'Valid tax card', documentType: 'TAX_CARD', validityMonths: 12 })
  const tFinState = await generalTemplate({ code: 'FIN-STATE', conditionType: 'DOCUMENT', title: 'Latest audited financial statement', documentType: 'FINANCIAL_STATEMENT', validityMonths: 12, isRepeatable: true })
  const tBank3m = await generalTemplate({ code: 'BANK-3M', conditionType: 'DOCUMENT', title: 'Bank statements — last 3 months', documentType: 'BANK_STATEMENT', validityMonths: 3, isRepeatable: true })
  const tNatId = await generalTemplate({ code: 'ID-NAT', conditionType: 'DOCUMENT', title: 'National ID of the legal representative', documentType: 'NATIONAL_ID', validityMonths: 60 })
  const tPhone = await generalTemplate({ code: 'PHONE', conditionType: 'PROFILE_FIELD', title: 'Phone number on profile', profileFieldKey: 'user.phone' })
  const tOrgTax = await generalTemplate({ code: 'ORG-TAXID', conditionType: 'PROFILE_FIELD', title: 'Tax ID on company profile', profileFieldKey: 'org.taxId' })
  const tDeclAccurate = await generalTemplate({ code: 'DECL-ACC', conditionType: 'DECLARATION', title: 'All supplied information is accurate', description: 'The applicant confirms that every answer and document supplied is true and complete.' })
  const tDeclDebt = await generalTemplate({ code: 'DECL-DEBT', conditionType: 'DECLARATION', title: 'No outstanding defaulted obligations', description: 'The applicant declares no defaulted obligations with any financing institution.' })
  const tYears = await generalTemplate({ code: 'YEARS-OP', conditionType: 'NUMBER', title: 'Years in operation', validationMin: 1, validationMax: 50 })
  const tLicense = await generalTemplate({ code: 'LIC-DATE', conditionType: 'DATE', title: 'Commercial license issue date' })
  const tCity = await generalTemplate({ code: 'CITY', conditionType: 'SELECT', title: 'Primary city of operation', options: ['Sana\'a', 'Aden', 'Taiz', 'Al-Hudaydah', 'Mukalla', 'Ibb', 'Dhamar'] })
  const tSectors = await generalTemplate({ code: 'SECTORS', conditionType: 'MULTI_SELECT', title: 'Business sectors served', options: ['Retail & Trade', 'Manufacturing', 'Agriculture', 'Services', 'Construction', 'Technology', 'Food & Beverages'] })

  console.log('🔒 Financier-private conditions...')
  const tKuraimiAccount = await db.conditionTemplate.create({
    data: {
      scope: 'FINANCIER', organizationId: kuraimi.id, conditionType: 'DECLARATION',
      code: 'KRM-ACCT-6M', title: 'Al-Kuraimi account held for 6+ months',
      description: 'The applicant declares an active Al-Kuraimi account opened at least six months ago.',
      createdById: fatima.id,
    },
  })
  const tAmalGuarantors = await db.conditionTemplate.create({
    data: {
      scope: 'FINANCIER', organizationId: amal.id, conditionType: 'DECLARATION',
      code: 'AML-GRANT-2', title: 'Two personal guarantors on staff',
      description: 'Two staff members of the applicant company are presented as personal guarantors.',
      createdById: omar.id,
    },
  })

  console.log('🛍️ Financier services (2 each, incl. 1 ACCREDITATION)...')
  const amalELoan = await db.financierService.create({
    data: {
      financierProfileId: amalProfile.id,
      serviceKind: 'FINANCING', category: 'WORKING_CAPITAL',
      name: 'E-Loan — Working Capital',
      summary: 'Murabaha working-capital financing from YER 100,000 with decisions in 3 days.',
      description: 'Purpose-built working capital for established SMEs. Funds inventory purchases, bridging and seasonal demand. Sharia-compliant murabaha structure with transparent profit rates capped at 30% annually.',
      targetSegment: 'BUSINESS', status: 'ACTIVE', currency: 'YER',
      amountMin: 100000, amountMax: 50000000,
      rateType: 'MURABAHA_ANNUAL', rateMax: 30.0,
      tenorMinMonths: 6, tenorMaxMonths: 36,
      repaymentFrequency: 'MONTHLY', gracePeriodDays: 30,
      shariaCompliant: true, processingDays: 3, viewCount: 3120,
      attributes: {
        create: [
          { kind: 'FEATURE', position: 0, text: 'Decision within 3 working days' },
          { kind: 'FEATURE', position: 1, text: 'No collateral for facilities under YER 2M' },
          { kind: 'FEATURE', position: 2, text: 'Top-up available after 6 clean repayments' },
          { kind: 'ELIGIBILITY_CONDITION', position: 0, text: 'Commercial registration at least 12 months old' },
          { kind: 'ELIGIBILITY_CONDITION', position: 1, text: 'Minimum monthly turnover of YER 300,000' },
        ],
      },
      coverage: {
        create: [
          { regionName: 'Sana\'a' }, { regionName: 'Aden' }, { regionName: 'Taiz' },
          { regionName: 'Al-Hudaydah' }, { regionName: 'Mukalla' }, { regionName: 'Ibb' },
        ],
      },
    },
  })
  const amalSupplier = await db.financierService.create({
    data: {
      financierProfileId: amalProfile.id,
      serviceKind: 'ACCREDITATION', category: 'SUPPLIER_QUALIFICATION',
      name: 'Supplier Qualification Program',
      summary: 'Qualify as an Al-Amal-approved supplier for RFQ opportunities and payment priority.',
      description: 'Suppliers accredited by Al-Amal are routed RFQ opportunities from our corporate financing clients, receive payment-priority on purchase-order facilities and get requirements auto-passed on our financing services.',
      targetSegment: 'BUSINESS', status: 'ACTIVE', currency: 'YER',
      accreditationValidMonths: 12, accreditationFeeAmount: 25000,
      processingDays: 7, viewCount: 980,
      attributes: {
        create: [
          { kind: 'FEATURE', position: 0, text: 'RFQ routing to corporate buyers' },
          { kind: 'FEATURE', position: 1, text: 'Auto-passed requirements on Al-Amal financing services' },
          { kind: 'ELIGIBILITY_CONDITION', position: 0, text: 'Commercial registration at least 24 months old' },
        ],
      },
      coverage: { create: [{ regionName: 'Sana\'a' }, { regionName: 'Aden' }, { regionName: 'Taiz' }] },
    },
  })
  const kuraimiSme = await db.financierService.create({
    data: {
      financierProfileId: kuraimiProfile.id,
      serviceKind: 'FINANCING', category: 'SME',
      name: 'SME Growth Financing',
      summary: 'Sharia-compliant growth financing up to YER 10M with doorstep service.',
      description: 'Flexible growth capital for micro and small enterprises. Weekly and monthly repayment plans, field-officer support and no penalties for early settlement.',
      targetSegment: 'BOTH', status: 'ACTIVE', currency: 'YER',
      amountMin: 50000, amountMax: 10000000,
      rateType: 'MURABAHA_ANNUAL', rateMax: 24.0,
      tenorMinMonths: 6, tenorMaxMonths: 48,
      repaymentFrequency: 'MONTHLY', shariaCompliant: true, processingDays: 2, viewCount: 2140,
      attributes: {
        create: [
          { kind: 'FEATURE', position: 0, text: 'Doorstep collection available' },
          { kind: 'FEATURE', position: 1, text: 'Early settlement without penalty' },
          { kind: 'ELIGIBILITY_CONDITION', position: 0, text: 'Existing Al-Kuraimi account preferred' },
        ],
      },
      coverage: { create: [{ regionName: 'Sana\'a' }, { regionName: 'Aden' }, { regionName: 'Al-Hudaydah' }, { regionName: 'Ibb' }, { regionName: 'Dhamar' }] },
    },
  })
  const kuraimiVendor = await db.financierService.create({
    data: {
      financierProfileId: kuraimiProfile.id,
      serviceKind: 'ACCREDITATION', category: 'VENDOR_APPROVAL',
      name: 'Approved Vendor Program',
      summary: '6-month vendor accreditation with instant RFQ-unlock across Kuraimi-financed orders.',
      description: 'Vendors approved into the program can quote on RFQs from Kuraimi-financed buyers and receive purchase-order financing fast-tracking.',
      targetSegment: 'BUSINESS', status: 'ACTIVE', currency: 'YER',
      accreditationValidMonths: 6, accreditationFeeAmount: 15000,
      processingDays: 5, viewCount: 640,
      coverage: { create: [{ regionName: 'Sana\'a' }, { regionName: 'Al-Hudaydah' }] },
    },
  })

  console.log('🔗 Attaching requirements to services...')
  async function attach(serviceId: string, templateId: string, cfg: { isRequired?: boolean; displayOrder: number; instructions?: string; autoPassAccredited?: boolean }) {
    return db.serviceRequirement.create({
      data: {
        serviceId, conditionTemplateId: templateId,
        isRequired: cfg.isRequired ?? true,
        displayOrder: cfg.displayOrder,
        instructions: cfg.instructions,
        autoPassAccredited: cfg.autoPassAccredited ?? false,
      },
    })
  }
  // E-Loan: rich checklist (documents + profile + declarations + typed answers)
  const eLoanReqs = [
    await attach(amalELoan.id, tComReg.id, { displayOrder: 0, instructions: 'Registration must be valid for the full financing tenor.' }),
    await attach(amalELoan.id, tTaxCard.id, { displayOrder: 1 }),
    await attach(amalELoan.id, tBank3m.id, { displayOrder: 2, instructions: 'Statements from the company\'s primary operating account.' }),
    await attach(amalELoan.id, tFinState.id, { displayOrder: 3, isRequired: false }),
    await attach(amalELoan.id, tNatId.id, { displayOrder: 4 }),
    await attach(amalELoan.id, tPhone.id, { displayOrder: 5 }),
    await attach(amalELoan.id, tOrgTax.id, { displayOrder: 6 }),
    await attach(amalELoan.id, tYears.id, { displayOrder: 7 }),
    await attach(amalELoan.id, tCity.id, { displayOrder: 8 }),
    await attach(amalELoan.id, tSectors.id, { displayOrder: 9, isRequired: false }),
    await attach(amalELoan.id, tDeclAccurate.id, { displayOrder: 10 }),
    await attach(amalELoan.id, tDeclDebt.id, { displayOrder: 11 }),
    await attach(amalELoan.id, tAmalGuarantors.id, { displayOrder: 12, instructions: 'Guarantor IDs are collected at agreement signing.' }),
    await attach(amalELoan.id, tLicense.id, { displayOrder: 13, isRequired: false }),
  ]
  // Supplier Qualification program
  const supplierReqs = [
    await attach(amalSupplier.id, tComReg.id, { displayOrder: 0, instructions: 'Registration at least 24 months old (program requirement).' }),
    await attach(amalSupplier.id, tTaxCard.id, { displayOrder: 1 }),
    await attach(amalSupplier.id, tNatId.id, { displayOrder: 2 }),
    await attach(amalSupplier.id, tYears.id, { displayOrder: 3 }),
    await attach(amalSupplier.id, tSectors.id, { displayOrder: 4 }),
    await attach(amalSupplier.id, tDeclAccurate.id, { displayOrder: 5 }),
  ]

  // SME Growth
  const smeReqs = [
    await attach(kuraimiSme.id, tComReg.id, { displayOrder: 0 }),
    await attach(kuraimiSme.id, tBank3m.id, { displayOrder: 1, isRequired: false }),
    await attach(kuraimiSme.id, tNatId.id, { displayOrder: 2 }),
    await attach(kuraimiSme.id, tPhone.id, { displayOrder: 3 }),
    await attach(kuraimiSme.id, tCity.id, { displayOrder: 4 }),
    await attach(kuraimiSme.id, tDeclAccurate.id, { displayOrder: 5 }),
    await attach(kuraimiSme.id, tKuraimiAccount.id, { displayOrder: 6 }),
  ]
  // Approved Vendor program
  const vendorReqs = [
    await attach(kuraimiVendor.id, tComReg.id, { displayOrder: 0 }),
    await attach(kuraimiVendor.id, tTaxCard.id, { displayOrder: 1 }),
    await attach(kuraimiVendor.id, tYears.id, { displayOrder: 2 }),
    await attach(kuraimiVendor.id, tDeclAccurate.id, { displayOrder: 3 }),
  ]

  console.log('📄 Account documents vault (real MediaAssets)...')
  const docComReg = await db.accountDocument.create({
    data: {
      userId: demo.id, organizationId: acme.id,
      mediaId: await makeDocumentAsset(demo.id, 'Acme commercial registration', 90),
      documentType: 'COMMERCIAL_REG', title: 'Commercial Registration CR-2019-3391',
      issuedAt: daysAgo(300), expiresAt: daysFromNow(430),
      status: 'VERIFIED', reviewedById: admin.id, reviewedAt: daysAgo(295),
      note: 'Verified against Ministry of Trade records.',
    },
  })
  const docTax = await db.accountDocument.create({
    data: {
      userId: demo.id, organizationId: acme.id,
      mediaId: await makeDocumentAsset(demo.id, 'Acme tax card', 140),
      documentType: 'TAX_CARD', title: 'Tax Card 2026',
      issuedAt: daysAgo(120), expiresAt: daysFromNow(245),
      status: 'VERIFIED', reviewedById: admin.id, reviewedAt: daysAgo(118),
    },
  })
  const docBank = await db.accountDocument.create({
    data: {
      userId: demo.id, organizationId: acme.id,
      mediaId: await makeDocumentAsset(demo.id, 'Bank statement month 1', 60),
      documentType: 'BANK_STATEMENT', title: 'Operating account statement — month 1',
      issuedAt: daysAgo(35), status: 'VERIFIED', reviewedById: admin.id, reviewedAt: daysAgo(33),
    },
  })
  const docBank2 = await db.accountDocument.create({
    data: {
      userId: demo.id, organizationId: acme.id,
      mediaId: await makeDocumentAsset(demo.id, 'Bank statement month 2', 70),
      documentType: 'BANK_STATEMENT', title: 'Operating account statement — month 2',
      issuedAt: daysAgo(5), status: 'PENDING',
    },
  })
  const docFinState = await db.accountDocument.create({
    data: {
      userId: demo.id, organizationId: acme.id,
      mediaId: await makeDocumentAsset(demo.id, 'FY2025 financial statement', 190),
      documentType: 'FINANCIAL_STATEMENT', title: 'FY2025 audited financial statement',
      issuedAt: daysAgo(90), status: 'PENDING',
    },
  })
  const docNatId = await db.accountDocument.create({
    data: {
      userId: demo.id,
      mediaId: await makeDocumentAsset(demo.id, 'National ID — legal representative', 220),
      documentType: 'NATIONAL_ID', title: 'National ID of legal representative',
      issuedAt: daysAgo(1500), status: 'VERIFIED', reviewedById: admin.id, reviewedAt: daysAgo(280),
    },
  })

  console.log('📨 Financing request #1 — mid-gate (UNDER_PLATFORM_REVIEW)...')
  const req1 = await db.financingRequest.create({
    data: {
      number: await nextNumber('FIN'),
      organizationId: acme.id, createdById: demo.id,
      serviceId: amalELoan.id, targetType: 'WORKING_CAPITAL',
      activityStatus: 'EXISTING', activityName: 'Acme Trading — general import & distribution',
      activityDescription: 'Import and distribution of consumer electronics accessories to retail networks in Sana\'a and Aden.',
      activityStartDate: daysAgo(2100), activityCity: 'Sana\'a', activityDistrict: 'Hadda',
      activityAddress: 'Hadda Street, Building 12', activityLocationType: 'OWNED',
      activityCategory: 'INVESTMENT',
      capitalAmount: 4500000, ownContributionAmount: 900000, monthlyInstallmentCapacity: 480000,
      previousFinancing: false, otherIncomeSources: 'Small retail storefront rents (approx. YER 120k/month)',
      amountRequested: 2500000, currency: 'YER',
      purpose: 'Pre- Eid seasonal inventory build-up: 3 containers of accessories and chargers.',
      tenorRequestedMonths: 18,
      guaranteeType: 'PERSONAL_GUARANTEE', guaranteeStatus: 'AVAILABLE',
      applicantNotes: 'Ready to provide two staff guarantors.',
      consentAt: daysAgo(2),
      platformReviewedById: admin.id, platformReviewedAt: daysAgo(1),
      status: 'UNDER_PLATFORM_REVIEW', submittedAt: daysAgo(2), expiresAt: daysFromNow(28),
    },
  })
  // Checklist rows for req1 — mixed states mid-review
  async function submission(serviceRequirementId: string, data: {
    status: string; valueText?: string; valueNumber?: number; valueDate?: Date
    accountDocumentId?: string; submittedAt?: Date; verifiedAt?: Date; verifiedById?: string
    decisionNote?: string
  }) {
    return db.requirementSubmission.create({
      data: {
        serviceRequirementId, financingRequestId: req1.id,
        status: data.status,
        valueText: data.valueText, valueNumber: data.valueNumber, valueDate: data.valueDate,
        accountDocumentId: data.accountDocumentId,
        submittedAt: data.submittedAt, verifiedAt: data.verifiedAt, verifiedById: data.verifiedById,
        decisionNote: data.decisionNote,
      },
    })
  }
  await submission(eLoanReqs[0].id, { status: 'VERIFIED', accountDocumentId: docComReg.id, submittedAt: daysAgo(2), verifiedAt: daysAgo(1), verifiedById: admin.id })
  await submission(eLoanReqs[1].id, { status: 'VERIFIED', accountDocumentId: docTax.id, submittedAt: daysAgo(2), verifiedAt: daysAgo(1), verifiedById: admin.id })
  await submission(eLoanReqs[2].id, { status: 'SUBMITTED', accountDocumentId: docBank2.id, submittedAt: daysAgo(2) })
  await submission(eLoanReqs[3].id, { status: 'PENDING' })
  await submission(eLoanReqs[4].id, { status: 'VERIFIED', accountDocumentId: docNatId.id, submittedAt: daysAgo(2), verifiedAt: daysAgo(1), verifiedById: admin.id })
  await submission(eLoanReqs[5].id, { status: 'VERIFIED', submittedAt: daysAgo(2), verifiedAt: daysAgo(1), verifiedById: admin.id }) // PROFILE_FIELD auto-eval
  await submission(eLoanReqs[6].id, { status: 'VERIFIED', submittedAt: daysAgo(2), verifiedAt: daysAgo(1), verifiedById: admin.id })
  await submission(eLoanReqs[7].id, { status: 'SUBMITTED', valueNumber: 5, submittedAt: daysAgo(2) }) // years in operation
  await submission(eLoanReqs[8].id, { status: 'SUBMITTED', valueText: 'Sana\'a', submittedAt: daysAgo(2) })
  await submission(eLoanReqs[9].id, { status: 'SUBMITTED', valueText: 'Retail & Trade; Technology', submittedAt: daysAgo(2) })
  await submission(eLoanReqs[10].id, { status: 'VERIFIED', valueText: 'CONFIRMED', submittedAt: daysAgo(2), verifiedAt: daysAgo(1), verifiedById: admin.id })
  await submission(eLoanReqs[11].id, { status: 'SUBMITTED', valueText: 'CONFIRMED', submittedAt: daysAgo(2) })
  await submission(eLoanReqs[12].id, { status: 'SUBMITTED', valueText: 'CONFIRMED', submittedAt: daysAgo(2) })
  await submission(eLoanReqs[13].id, { status: 'PENDING' })

  console.log('📨 Financing request #2 — FORWARDED with live offer...')
  const req2 = await db.financingRequest.create({
    data: {
      number: await nextNumber('FIN'),
      organizationId: acme.id, createdById: demo.id,
      serviceId: kuraimiSme.id, targetType: 'WORKING_CAPITAL',
      multiGroupId: 'MG-2026-000001',
      activityStatus: 'EXISTING', activityName: 'Acme Trading — general import & distribution',
      activityCity: 'Sana\'a', activityCategory: 'INVESTMENT',
      capitalAmount: 4500000, monthlyInstallmentCapacity: 480000,
      previousFinancing: false,
      amountRequested: 1800000, currency: 'YER',
      purpose: 'Shop refit and point-of-sale upgrade across two branches.',
      tenorRequestedMonths: 24,
      guaranteeType: 'PERSONAL_GUARANTEE', guaranteeStatus: 'AVAILABLE',
      consentAt: daysAgo(20), submittedAt: daysAgo(20), expiresAt: daysFromNow(10),
      status: 'OFFERED', forwardedAt: daysAgo(18),
      platformReviewedById: admin.id, platformReviewedAt: daysAgo(19),
    },
  })
  // req2 checklist: all VERIFIED (that's why it was forwarded)
  for (const r of smeReqs) {
    await db.requirementSubmission.create({
      data: {
        serviceRequirementId: r.id, financingRequestId: req2.id,
        status: 'VERIFIED',
        valueText: r.conditionTemplateId ? 'CONFIRMED' : undefined,
        submittedAt: daysAgo(20), verifiedAt: daysAgo(18), verifiedById: admin.id,
      },
    })
  }
  // sibling request to Al-Amal in the same multi-group (declined by applicant comparison flow — keep OFFERED sibling for compare demo)
  const req2b = await db.financingRequest.create({
    data: {
      number: await nextNumber('FIN'),
      organizationId: acme.id, createdById: demo.id,
      serviceId: amalELoan.id, targetType: 'WORKING_CAPITAL',
      multiGroupId: 'MG-2026-000001',
      activityStatus: 'EXISTING', activityName: 'Acme Trading — general import & distribution',
      activityCity: 'Sana\'a', activityCategory: 'INVESTMENT',
      capitalAmount: 4500000, monthlyInstallmentCapacity: 480000,
      previousFinancing: false,
      amountRequested: 1800000, currency: 'YER',
      purpose: 'Shop refit and point-of-sale upgrade across two branches.',
      tenorRequestedMonths: 24,
      guaranteeType: 'PERSONAL_GUARANTEE', guaranteeStatus: 'AVAILABLE',
      consentAt: daysAgo(20), submittedAt: daysAgo(20), expiresAt: daysFromNow(10),
      status: 'OFFERED', forwardedAt: daysAgo(18),
      platformReviewedById: admin.id, platformReviewedAt: daysAgo(19),
    },
  })
  // req2 offers — one SENT with installment schedule from Kuraimi; one from Al-Amal (multi-compare)
  const offer1 = await db.financingOffer.create({
    data: {
      requestId: req2.id, createdById: fatima.id,
      amount: 1800000, currency: 'YER',
      rateType: 'MURABAHA_ANNUAL', ratePercent: 21.5,
      tenorMonths: 24, collateralRequired: 'PERSONAL_GUARANTEE',
      notes: 'Murabaha facility with 30-day grace period. Doorstep collection available.',
      validUntil: daysFromNow(14), status: 'SENT', sentAt: daysAgo(6),
      installments: {
        create: Array.from({ length: 24 }, (_, i) => ({
          installmentNo: i + 1,
          dueDate: new Date(new Date().setMonth(new Date().getMonth() + i + 1, 5)),
          amount: 91125,
        })),
      },
    },
  })
  const offer2 = await db.financingOffer.create({
    data: {
      requestId: req2b.id, createdById: omar.id,
      amount: 1700000, currency: 'YER',
      rateType: 'MURABAHA_ANNUAL', ratePercent: 27.0,
      tenorMonths: 18, collateralRequired: 'PERSONAL_GUARANTEE',
      notes: 'E-Loan structure. Two staff guarantors required at signing.',
      validUntil: daysFromNow(14), status: 'SENT', sentAt: daysAgo(5),
      installments: {
        create: Array.from({ length: 18 }, (_, i) => ({
          installmentNo: i + 1,
          dueDate: new Date(new Date().setMonth(new Date().getMonth() + i + 1, 10)),
          amount: 113056,
        })),
      },
    },
  })

  console.log('🎓 Accreditation request — FORWARDED to Al-Amal...')
  const acc1 = await db.accreditationRequest.create({
    data: {
      number: await nextNumber('ACC'),
      organizationId: acme.id, submittedById: demo.id,
      serviceId: amalSupplier.id,
      scopeNotes: 'IT equipment and accessories supply to corporate clients.',
      consentAt: daysAgo(12), submittedAt: daysAgo(12), expiresAt: daysFromNow(18),
      status: 'FORWARDED_TO_FINANCIER', forwardedAt: daysAgo(11),
      platformReviewedById: admin.id, platformReviewedAt: daysAgo(12),
    },
  })
  for (const r of supplierReqs) {
    await db.requirementSubmission.create({
      data: {
        serviceRequirementId: r.id, accreditationRequestId: acc1.id,
        status: 'VERIFIED',
        valueText: 'CONFIRMED',
        valueNumber: r.displayOrder === 3 ? 5 : undefined,
        submittedAt: daysAgo(12), verifiedAt: daysAgo(11), verifiedById: admin.id,
      },
    })
  }

  console.log('✅ Financier domain seed complete:', {
    orgs: [amal.name, kuraimi.name],
    services: 4,
    generalTemplates: 13,
    privateTemplates: 2,
    serviceRequirements: eLoanReqs.length + supplierReqs.length + smeReqs.length + vendorReqs.length + 1,
    accountDocuments: 6,
    financingRequests: 3,
    offers: 2,
    accreditationRequests: 1,
  })
  console.log('   Financier logins: financier1@vendora.com / financier1234 (Al-Amal OWNER)')
  console.log('                    financier2@vendora.com / financier1234 (Al-Kuraimi OWNER)')
  console.log('   Mid-gate demo: FR request #1 (UNDER_PLATFORM_REVIEW) in admin financing queue')
  console.log('   Offer demo: MG-2026-000001 sibling group with two SENT offers to compare')
  console.log(`   Offers: ${offer1.id.slice(0, 8)}… / ${offer2.id.slice(0, 8)}…`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
