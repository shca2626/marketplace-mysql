/**
 * FINANCIER DOMAIN DEMO SEED (FIN-1) — complements seed-demo.ts (commerce).
 * Idempotent: clears ONLY financier-domain tables (FK-safe order), then rebuilds.
 *
 * Usage:
 *   DATABASE_URL="mysql://vendora:VendoraDb_2025_Prod@127.0.0.1:3306/vendora" \
 *     bun scripts/seed-financiers.ts
 *
 * Restores (FINANCIER_SCHEMA v5.0/v5.1 — DP-22..29):
 *   - 2 financier organizations w/ FinancierProfile + branches:
 *       Al-Amal Bank (BANK, 3 branches) · Al-Kuraimi MFI (MFI, 2 branches)
 *   - 2 services each incl. 1 ACCREDITATION program (serviceKind mix):
 *       E-Loan working capital · Supplier Qualification program (Al-Amal)
 *       Working Capital · Approved Vendor program (Al-Kuraimi)
 *   - GENERAL condition library (~10 templates, all 8 typed kinds exercised)
 *   - 1 FINANCIER-private template per financier
 *   - Requirements attached per-service (general + private mix)
 *   - Demo applications: one financing request mid-gate (UNDER_PLATFORM_REVIEW
 *     w/ checklist: 2 VERIFIED, 1 SUBMITTED, 1 PENDING) + one accreditation
 *     request FORWARDED_TO_FINANCIER (gate passed) + one RETURNED w/ per-item notes
 *   - AccountDocument vault entries for the applicant org + individual
 *   - Notification + audit rows are NOT seeded here (they fire from real actions)
 */
import { PrismaClient } from '@prisma/client'
import { randomBytes, scryptSync } from 'crypto'

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

async function main() {
  console.log('— financier seed: clearing domain tables (FK-safe order)…')
  // Requests & checklists first, then offers/agreements chain, then catalog, then vault
  await db.requestAttachment.deleteMany()
  await db.requirementSubmission.deleteMany()
  await db.financingFee.deleteMany()
  await db.financingEvent.deleteMany()
  await db.financingAgreement.deleteMany()
  await db.financingOfferInstallment.deleteMany()
  await db.financingOffer.deleteMany()
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
  // vault docs (financier-domain created ones only — every doc belongs to a user/org we also own)
  await db.accountDocument.deleteMany()
  // seed-created placeholder assets (before the users they reference are deleted)
  await db.mediaAsset.deleteMany({ where: { key: { startsWith: 'seed/financier/' } } })
  // financier users/orgs (identified by slug prefix so commerce demo data survives)
  const finOrgs = await db.organization.findMany({ where: { slug: { in: ['al-amal-bank', 'al-kuraimi-mfi'] } } })
  for (const org of finOrgs) {
    await db.organization.delete({ where: { id: org.id } }).catch(() => {}) // cascades profile/members
  }
  await db.user.deleteMany({ where: { email: { in: ['fin1@al-amal.ye', 'fin2@al-kuraimi.ye', 'applicant@vendora.com', 'individual@vendora.com'] } } })

  console.log('— users & financier organizations…')
  const admin = await db.user.findFirstOrThrow({ where: { email: 'admin@vendora.com' } })

  const alAmalStaff = await db.user.create({
    data: { email: 'fin1@al-amal.ye', password: hashPassword('fin1234'), name: 'Yusuf Al-Amal', role: 'BUYER' },
  })
  const kuraimiStaff = await db.user.create({
    data: { email: 'fin2@al-kuraimi.ye', password: hashPassword('fin1234'), name: 'Salma Al-Kuraimi', role: 'BUYER' },
  })
  const applicant = await db.user.create({
    data: {
      email: 'applicant@vendora.com', password: hashPassword('demo1234'), name: 'Tariq Saeed', role: 'BUYER',
      phone: '+967 77 123 4567', whatsappNumber: '+967 77 123 4567',
      dateOfBirth: new Date('1990-04-12'), gender: 'MALE', maritalStatus: 'MARRIED', nationality: 'Yemeni',
      identityType: 'NATIONAL_ID', identityNumber: '01-2345678-9',
      residenceStreet: 'Zubairi St. 12', residenceCity: 'Sana\'a', residenceDistrict: 'Al-Wahda', residenceType: 'RENTED',
    },
  })
  const individual = await db.user.create({
    data: {
      email: 'individual@vendora.com', password: hashPassword('demo1234'), name: 'Amina Hadi', role: 'BUYER',
      phone: '+967 73 555 0199', identityType: 'NATIONAL_ID', identityNumber: '05-9988776-1',
      residenceCity: 'Aden', residenceType: 'OWNED',
    },
  })

  const alAmal = await db.organization.create({
    data: {
      name: 'Al-Amal Bank', slug: 'al-amal-bank', orgType: 'BANK',
      legalName: 'Al-Amal Microfinance Bank', taxId: 'TAX-778812', registrationNumber: 'REG-2011-0044',
      industry: 'Banking', website: 'https://al-amal-bank.example', status: 'ACTIVE', verifiedAt: daysAgo(400),
    },
  })
  const kuraimi = await db.organization.create({
    data: {
      name: 'Al-Kuraimi Islamic Microfinance', slug: 'al-kuraimi-mfi', orgType: 'MFI',
      legalName: 'Al-Kuraimi Islamic Bank for Microfinance', taxId: 'TAX-334455', registrationNumber: 'REG-2009-1177',
      industry: 'Microfinance', website: 'https://al-kuraimi.example', status: 'ACTIVE', verifiedAt: daysAgo(600),
    },
  })
  await db.organizationMember.create({ data: { organizationId: alAmal.id, userId: alAmalStaff.id, role: 'OWNER' } })
  await db.organizationMember.create({ data: { organizationId: kuraimi.id, userId: kuraimiStaff.id, role: 'OWNER' } })

  console.log('— FinancierProfiles + branches (R-6: no logoUrl — logo is an upload)…')
  const alAmalProfile = await db.financierProfile.create({
    data: {
      organizationId: alAmal.id,
      about: 'Al-Amal Bank finances small and growing businesses across Yemen with murabaha-based working capital and supplier programs.',
      licenseNumber: 'CBY-BANK-2011-044', regulator: 'Central Bank of Yemen',
      contactEmail: 'financing@al-amal.example', contactPhone: '+967 1 250 111',
      minTicket: 100000, maxTicket: 50000000,
      branches: {
        create: [
          { name: 'Head Office — Sana\'a', kind: 'BRANCH', city: 'Sana\'a', district: 'Al-Hasaba', street: 'Hadda Rd. 45', phone: '+967 1 250 111', position: 0 },
          { name: 'Aden Branch', kind: 'BRANCH', city: 'Aden', district: 'Crater', street: 'Malla Rd. 8', phone: '+967 2 240 222', position: 1 },
          { name: 'Taiz Agent', kind: 'AGENT', city: 'Taiz', district: 'Al-Mudhaffar', position: 2 },
        ],
      },
    },
  })
  const kuraimiProfile = await db.financierProfile.create({
    data: {
      organizationId: kuraimi.id,
      about: 'Al-Kuraimi Islamic Microfinance — Sharia-compliant financing for micro and small enterprises since 2009.',
      licenseNumber: 'CBY-MFI-2009-177', regulator: 'Central Bank of Yemen',
      contactEmail: 'services@al-kuraimi.example', contactPhone: '+967 1 444 300',
      minTicket: 50000, maxTicket: 15000000,
      branches: {
        create: [
          { name: 'Sana\'a Main', kind: 'BRANCH', city: 'Sana\'a', district: 'Al-Zubairi', phone: '+967 1 444 300', position: 0 },
          { name: 'Hodeidah Branch', kind: 'BRANCH', city: 'Hodeidah', district: 'Al-Mina', phone: '+967 3 311 400', position: 1 },
        ],
      },
    },
  })

  console.log('— GENERAL condition library (10 templates, all 8 kinds)…')
  const T = (data: Parameters<typeof db.conditionTemplate.create>[0]['data']) => db.conditionTemplate.create({ data })
  const comReg = await T({
    scope: 'GENERAL', conditionType: 'DOCUMENT', code: 'COM-REG', documentType: 'COMMERCIAL_REG',
    title: 'Valid commercial registration', description: 'A commercial registration certificate issued within the last 12 months.',
    validityMonths: 12, createdById: admin.id,
  })
  const taxCard = await T({
    scope: 'GENERAL', conditionType: 'DOCUMENT', code: 'TAX-CARD', documentType: 'TAX_CARD',
    title: 'Valid tax card', description: 'Current tax card from the Yemeni tax authority.', validityMonths: 12, createdById: admin.id,
  })
  const bankStmt = await T({
    scope: 'GENERAL', conditionType: 'DOCUMENT', code: 'BANK-6M', documentType: 'BANK_STATEMENT',
    title: '6-month bank statement', description: 'Bank statements covering the last six consecutive months.',
    validityMonths: 3, isRepeatable: true, createdById: admin.id,
  })
  const idDoc = await T({
    scope: 'GENERAL', conditionType: 'DOCUMENT', code: 'NAT-ID', documentType: 'NATIONAL_ID',
    title: 'National ID of the applicant', description: 'Clear scan of both sides.', validityMonths: 60, createdById: admin.id,
  })
  const phoneField = await T({
    scope: 'GENERAL', conditionType: 'PROFILE_FIELD', code: 'PF-PHONE', profileFieldKey: 'user.phone',
    title: 'Contact phone on profile', description: 'Auto-checked: your profile must contain a phone number.', createdById: admin.id,
  })
  const declaration = await T({
    scope: 'GENERAL', conditionType: 'DECLARATION', code: 'DEC-TRUTH',
    title: 'Data accuracy declaration', description: 'I declare that all information provided is true and complete.', createdById: admin.id,
  })
  const yearsActive = await T({
    scope: 'GENERAL', conditionType: 'NUMBER', code: 'NUM-YEARS', validationMin: 1, validationMax: 50,
    title: 'Years in business', description: 'How many years has the activity operated?', createdById: admin.id,
  })
  const licenseDate = await T({
    scope: 'GENERAL', conditionType: 'DATE', code: 'DATE-LIC',
    title: 'Commercial registration issue date', createdById: admin.id,
  })
  const collateral = await T({
    scope: 'GENERAL', conditionType: 'SELECT', code: 'SEL-COLL', title: 'Primary collateral type',
    options: { create: [
      { value: 'Personal guarantee', position: 0 }, { value: 'Bank guarantee', position: 1 },
      { value: 'Gold', position: 2 }, { value: 'Commercial goods', position: 3 }, { value: 'Other', position: 4 },
    ] },
    createdById: admin.id,
  })
  const sectors = await T({
    scope: 'GENERAL', conditionType: 'MULTI_SELECT', code: 'MS-SECT', title: 'Sectors you trade in',
    options: { create: [
      { value: 'Retail', position: 0 }, { value: 'Agriculture', position: 1 }, { value: 'Construction', position: 2 },
      { value: 'Services', position: 3 }, { value: 'Manufacturing', position: 4 },
    ] },
    createdById: admin.id,
  })

  console.log('— FINANCIER-private templates (1 each)…')
  const amalGuarantors = await T({
    scope: 'FINANCIER', organizationId: alAmal.id, conditionType: 'DECLARATION',
    code: 'AMAL-2G', title: 'Two guarantors commitment',
    description: 'I confirm I can provide two salaried guarantors as required by Al-Amal Bank.', createdById: alAmalStaff.id,
  })
  const kuraimiAccount = await T({
    scope: 'FINANCIER', organizationId: kuraimi.id, conditionType: 'DECLARATION',
    code: 'KUR-ACC6', title: 'Al-Kuraimi account ≥ 6 months',
    description: 'I confirm my Al-Kuraimi account has been active for at least six months.', createdById: kuraimiStaff.id,
  })

  console.log('— services (2 per financier, incl. 1 ACCREDITATION program each)…')
  const eLoan = await db.financierService.create({
    data: {
      financierProfileId: alAmalProfile.id, serviceKind: 'FINANCING', category: 'WORKING_CAPITAL',
      name: 'E-Loan Working Capital', summary: 'Murabaha working capital up to 50M YER for growing businesses.',
      description: 'Financing for purchasing goods and inventory. Murabaha annual rate capped at 30% with a minimum 6-month repayment.',
      targetSegment: 'BOTH', status: 'ACTIVE', currency: 'YER', amountMin: 99996, amountMax: 50000000,
      rateType: 'MURABAHA_ANNUAL', rateMax: 30, tenorMinMonths: 6, tenorMaxMonths: 36,
      repaymentFrequency: 'MONTHLY', shariaCompliant: true, processingDays: 5,
      attributes: { create: [
        { kind: 'FEATURE', position: 0, text: 'Decision within 5 working days' },
        { kind: 'FEATURE', position: 1, text: 'No collateral required below 2M YER' },
        { kind: 'ELIGIBILITY_CONDITION', position: 0, text: 'Commercial registration at least 1 year old' },
        { kind: 'ELIGIBILITY_CONDITION', position: 1, text: 'Activity inside covered governorates' },
      ] },
      coverage: { create: [
        { regionName: 'Sana\'a' }, { regionName: 'Aden' }, { regionName: 'Taiz' }, { regionName: 'Hodeidah' }, { regionName: 'Ibb' },
      ] },
    },
  })
  const amalProgram = await db.financierService.create({
    data: {
      financierProfileId: alAmalProfile.id, serviceKind: 'ACCREDITATION', category: 'SUPPLIER_QUALIFICATION',
      name: 'Al-Amal Supplier Qualification', summary: 'Become an approved supplier for Al-Amal Bank financing programs.',
      description: 'Qualification program for suppliers seeking to work with Al-Amal Bank. Accreditation grants a 12-month approved-vendor status.',
      targetSegment: 'BUSINESS', status: 'ACTIVE', currency: 'YER',
      accreditationValidMonths: 12, accreditationFeeAmount: 25000, processingDays: 10,
    },
  })
  const kuraimiWC = await db.financierService.create({
    data: {
      financierProfileId: kuraimiProfile.id, serviceKind: 'FINANCING', category: 'MICROENTERPRISE',
      name: 'Kuraimi Micro Working Capital', summary: 'Sharia-compliant micro working capital 50K–15M YER.',
      description: 'Islamic microfinance for micro and small enterprises with flat-fee murabaha.',
      targetSegment: 'BOTH', status: 'ACTIVE', currency: 'YER', amountMin: 50000, amountMax: 15000000,
      rateType: 'FLAT_FEE', feeFlat: 2500, tenorMinMonths: 3, tenorMaxMonths: 24,
      repaymentFrequency: 'MONTHLY', shariaCompliant: true, processingDays: 3,
      coverage: { create: [ { regionName: 'Sana\'a' }, { regionName: 'Hodeidah' }, { regionName: 'Hajjah' } ] },
    },
  })
  const kuraimiProgram = await db.financierService.create({
    data: {
      financierProfileId: kuraimiProfile.id, serviceKind: 'ACCREDITATION', category: 'VENDOR_APPROVAL',
      name: 'Kuraimi Approved Vendors', summary: 'Approved vendor program for Kuraimi-financed purchase orders.',
      description: 'Vendors approved under this program receive RFQ invitations for Kuraimi-financed customer purchases.',
      targetSegment: 'BUSINESS', status: 'ACTIVE', currency: 'YER',
      accreditationValidMonths: 24, accreditationFeeAmount: 15000, processingDays: 7,
    },
  })

  console.log('— attaching requirements per service (general + private mix)…')
  const R = (serviceId: string, conditionTemplateId: string, data: Partial<{ isRequired: boolean; displayOrder: number; instructions: string | null; autoPassAccredited: boolean }> = {}) =>
    db.serviceRequirement.create({ data: { serviceId, conditionTemplateId, isRequired: true, displayOrder: 0, ...data } })
  await R(eLoan.id, comReg.id, { displayOrder: 0 })
  await R(eLoan.id, taxCard.id, { displayOrder: 1 })
  await R(eLoan.id, bankStmt.id, { displayOrder: 2, instructions: 'Statements must show the business account, not personal.' })
  await R(eLoan.id, idDoc.id, { displayOrder: 3 })
  await R(eLoan.id, phoneField.id, { displayOrder: 4 })
  await R(eLoan.id, declaration.id, { displayOrder: 5 })
  await R(eLoan.id, yearsActive.id, { displayOrder: 6 })
  await R(eLoan.id, collateral.id, { displayOrder: 7 })
  await R(eLoan.id, amalGuarantors.id, { displayOrder: 8 })
  await R(amalProgram.id, comReg.id, { displayOrder: 0 })
  await R(amalProgram.id, taxCard.id, { displayOrder: 1 })
  await R(amalProgram.id, sectors.id, { displayOrder: 2 })
  await R(amalProgram.id, declaration.id, { displayOrder: 3 })
  await R(kuraimiWC.id, idDoc.id, { displayOrder: 0 })
  await R(kuraimiWC.id, bankStmt.id, { displayOrder: 1 })
  await R(kuraimiWC.id, phoneField.id, { displayOrder: 2 })
  await R(kuraimiWC.id, declaration.id, { displayOrder: 3 })
  await R(kuraimiWC.id, licenseDate.id, { isRequired: false, displayOrder: 4 })
  await R(kuraimiWC.id, kuraimiAccount.id, { displayOrder: 5 })
  await R(kuraimiProgram.id, comReg.id, { displayOrder: 0 })
  await R(kuraimiProgram.id, sectors.id, { displayOrder: 1 })
  await R(kuraimiProgram.id, declaration.id, { displayOrder: 2 })

  console.log('— applicant vault documents (universal AccountDocument, DP-27)…')
  // NOTE: mediaId references a real MediaAsset when uploaded through the pipeline; the seed
  // creates a placeholder MediaAsset per doc so the FK graph is honest.
  const mkAsset = async (name: string) =>
    db.mediaAsset.create({
      data: {
        key: `seed/financier/${name}`, originalName: `${name}.pdf`, mime: 'application/pdf',
        size: 102400, sha256: `seed-${name}-${Date.now()}`, uploadedById: applicant.id,
      },
    })
  const a1 = await mkAsset('commercial-reg')
  const a2 = await mkAsset('tax-card')
  const a3 = await mkAsset('bank-statement-q1')
  const a4 = await mkAsset('bank-statement-q2')
  const a5 = await mkAsset('national-id')
  const comRegDoc = await db.accountDocument.create({
    data: { userId: applicant.id, organizationId: null, mediaId: a1.id, documentType: 'COMMERCIAL_REG',
      title: 'Commercial registration 2026', issuedAt: daysAgo(90), status: 'VERIFIED', reviewedById: admin.id, reviewedAt: daysAgo(5), isActive: true },
  })
  const taxCardDoc = await db.accountDocument.create({
    data: { userId: applicant.id, mediaId: a2.id, documentType: 'TAX_CARD',
      title: 'Tax card 2026', issuedAt: daysAgo(60), status: 'VERIFIED', reviewedById: admin.id, reviewedAt: daysAgo(5), isActive: true },
  })
  await db.accountDocument.create({
    data: { userId: applicant.id, mediaId: a3.id, documentType: 'BANK_STATEMENT',
      title: 'Bank statement Jan–Mar', issuedAt: daysAgo(30), status: 'PENDING', isActive: true },
  })
  await db.accountDocument.create({
    data: { userId: applicant.id, mediaId: a4.id, documentType: 'BANK_STATEMENT',
      title: 'Bank statement Apr–Jun', issuedAt: daysAgo(3), status: 'PENDING', isActive: true },
  })
  const idDocDoc = await db.accountDocument.create({
    data: { userId: applicant.id, mediaId: a5.id, documentType: 'NATIONAL_ID',
      title: 'National ID (both sides)', issuedAt: daysAgo(2000), status: 'VERIFIED', reviewedById: admin.id, reviewedAt: daysAgo(10), isActive: true },
  })
  await db.accountDocument.create({
    data: { userId: individual.id, mediaId: (await mkAsset('national-id-amina')).id, documentType: 'NATIONAL_ID',
      title: 'National ID', status: 'PENDING', isActive: true },
  })

  console.log('— demo request #1: financing MID-GATE (UNDER_PLATFORM_REVIEW)…')
  const eLoanReqs = await db.serviceRequirement.findMany({
    where: { serviceId: eLoan.id }, orderBy: { displayOrder: 'asc' },
  })
  const fr1 = await db.financingRequest.create({
    data: {
      number: `FR-${new Date().getFullYear()}-000001`,
      createdById: applicant.id, organizationId: null,
      serviceId: eLoan.id, targetType: 'WORKING_CAPITAL',
      activityStatus: 'EXISTING', activityName: 'Saeed Textiles Trading',
      activityDescription: 'Retail and wholesale of fabrics and clothing with two shop locations.',
      activityStartDate: daysAgo(1500), activityCity: 'Sana\'a', activityDistrict: 'Al-Sabeen',
      activityAddress: 'Main market, shop 14', activityLocationType: 'RENTED', activityCategory: 'RETAIL',
      capitalAmount: 8000000, ownContributionAmount: 1500000, monthlyInstallmentCapacity: 900000,
      previousFinancing: false, otherIncomeSources: 'Small agricultural income from family farm',
      amountRequested: 5000000, currency: 'YER',
      purpose: 'Purchase of winter inventory ahead of the season.', tenorRequestedMonths: 24,
      guaranteeType: 'PERSONAL_GUARANTEE', guaranteeStatus: 'AVAILABLE',
      applicantNotes: 'Ready to provide any additional documents on request.',
      consentAt: daysAgo(2), status: 'UNDER_PLATFORM_REVIEW', submittedAt: daysAgo(2),
      platformReviewedById: admin.id, platformReviewedAt: daysAgo(1),
      expiresAt: daysFromNow(28),
      submissions: { create: [
        // 2 VERIFIED
        { serviceRequirementId: eLoanReqs[0].id, status: 'VERIFIED', accountDocumentId: comRegDoc.id,
          submittedAt: daysAgo(2), verifiedAt: daysAgo(1), verifiedById: admin.id },
        { serviceRequirementId: eLoanReqs[1].id, status: 'VERIFIED', accountDocumentId: taxCardDoc.id,
          submittedAt: daysAgo(2), verifiedAt: daysAgo(1), verifiedById: admin.id },
        // 1 SUBMITTED (awaiting verification)
        { serviceRequirementId: eLoanReqs[2].id, status: 'SUBMITTED', submittedAt: daysAgo(1) },
        // 1 PENDING (not supplied yet)
        { serviceRequirementId: eLoanReqs[8].id, status: 'PENDING' },
      ] },
    },
  })

  console.log('— demo request #2: accreditation FORWARDED (gate passed)…')
  const amalProgramReqs = await db.serviceRequirement.findMany({
    where: { serviceId: amalProgram.id }, orderBy: { displayOrder: 'asc' },
  })
  // (slug fixed in FIN-2: the B2B seed registers this org as 'acme-trading-co')
  const acme = await db.organization.findFirst({ where: { slug: 'acme-trading-co' } })
  if (acme) {
    const acmeMember = await db.user.findFirst({ where: { email: 'demo@vendora.com' } })
    if (acmeMember) {
      const acc1 = await db.accreditationRequest.create({
        data: {
          number: `ACC-${new Date().getFullYear()}-000001`,
          organizationId: acme.id, submittedById: acmeMember.id, serviceId: amalProgram.id,
          scopeNotes: 'Supply of IT equipment and office furniture.',
          consentAt: daysAgo(4), status: 'FORWARDED_TO_FINANCIER', submittedAt: daysAgo(4),
          platformReviewedById: admin.id, platformReviewedAt: daysAgo(3), forwardedAt: daysAgo(3),
          expiresAt: daysFromNow(20),
        },
      })
      await db.requirementSubmission.createMany({
        data: amalProgramReqs.map((r, i) => ({
          serviceRequirementId: r.id, accreditationRequestId: acc1.id,
          status: 'VERIFIED', submittedAt: daysAgo(4), verifiedAt: daysAgo(3), verifiedById: admin.id,
          valueText: r.conditionTemplateId === sectors.id ? 'Retail; Services' : 'I declare the information is true.',
        })),
      })
    }
  }

  console.log('— demo request #3: financing RETURNED w/ per-item rejection note…')
  const fr2 = await db.financingRequest.create({
    data: {
      number: `FR-${new Date().getFullYear()}-000002`,
      createdById: applicant.id, organizationId: null,
      serviceId: kuraimiWC.id, targetType: 'WORKING_CAPITAL',
      activityStatus: 'NEW', activityName: 'Amina Home Bakery',
      activityDescription: 'Home-based bakery starting with catering orders.',
      activityStartDate: null, activityCity: 'Aden', activityLocationType: 'OWNED', activityCategory: 'OTHER',
      activityCategoryOther: 'Home food production',
      capitalAmount: 400000, ownContributionAmount: 100000, monthlyInstallmentCapacity: 60000,
      amountRequested: 300000, currency: 'YER', tenorRequestedMonths: 12,
      guaranteeType: 'SELF_GUARANTEE', guaranteeStatus: 'AVAILABLE',
      consentAt: daysAgo(10), status: 'RETURNED_FOR_COMPLETION', submittedAt: daysAgo(10),
      platformReviewedById: admin.id, platformReviewedAt: daysAgo(9),
      returnedAt: daysAgo(9), returnedReason: 'Bank statement unreadable — please re-upload a clearer scan.',
      expiresAt: daysFromNow(20),
    },
  })
  const kuraimiReqs = await db.serviceRequirement.findMany({
    where: { serviceId: kuraimiWC.id }, orderBy: { displayOrder: 'asc' },
  })
  // pick the bank-statement requirement (displayOrder 1) to carry the rejection
  for (const r of kuraimiReqs) {
    const isBank = r.displayOrder === 1
    await db.requirementSubmission.create({
      data: {
        serviceRequirementId: r.id, financingRequestId: fr2.id,
        status: isBank ? 'REJECTED' : 'SUBMITTED',
        submittedAt: daysAgo(10),
        verifiedAt: isBank ? daysAgo(9) : undefined, verifiedById: isBank ? admin.id : null,
        decisionNote: isBank ? 'The scan is unreadable — the account number is not visible. Re-upload a clear photo of the full page.' : null,
      },
    })
  }

  console.log('— syncing Sequence counters with the seeded numbers (FIN=2, ACC=1)…')
  const yr = new Date().getFullYear()
  await db.sequence.upsert({ where: { key: 'FIN' }, create: { key: 'FIN', value: 2 }, update: { value: 2 } })
  await db.sequence.upsert({ where: { key: 'AGR' }, create: { key: 'AGR', value: 0 }, update: { value: 0 } })
  await db.sequence.upsert({ where: { key: 'ACC' }, create: { key: 'ACC', value: 1 }, update: { value: 1 } })
  void yr

  console.log('— audit trail entries for the gate actions…')
  await db.auditLog.createMany({
    data: [
      { actorId: admin.id, actorType: 'ADMIN', action: 'PLATFORM_REVIEW_STARTED', entityType: 'FINANCING_REQUEST', entityId: fr1.id,
        summary: 'Platform gate review started for FR-000001 (E-Loan Working Capital).' },
      { actorId: admin.id, actorType: 'ADMIN', action: 'REQUEST_RETURNED', entityType: 'FINANCING_REQUEST', entityId: fr2.id,
        summary: 'FR-000002 returned to applicant: bank statement unreadable.' },
    ],
  })

  console.log('\nFinancier seed complete:')
  console.log('  Financiers:     Al-Amal Bank (fin1@al-amal.ye/fin1234) · Al-Kuraimi (fin2@al-kuraimi.ye/fin1234)')
  console.log('  Applicant:      applicant@vendora.com / demo1234 (Tariq Saeed — individual)')
  console.log('  Individual:     individual@vendora.com / demo1234 (Amina Hadi)')
  console.log('  Services:       E-Loan WC + Supplier Qualification · Kuraimi WC + Approved Vendors')
  console.log('  Library:        10 GENERAL templates (all 8 kinds) + 1 private per financier')
  console.log('  Requests:       FR-000001 mid-gate (UNDER_PLATFORM_REVIEW — 2 VERIFIED / 1 SUBMITTED / 1 PENDING)')
  console.log('                  ACC-000001 forwarded (gate PASSED) · FR-000002 returned w/ per-item note')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
