// ─────────────────────────────────────────────────────────────────────────────
// FINANCING-LINKED E2E — browser-flow fixtures (isolated, E2EFIN-prefixed).
// Creates the applicant/supplier/financier triangle with a real accreditation
// link and a shared-catalog offer, prints every id the browser steps need.
// Cleaned up by scripts/e2e-financing-cleanup.ts (by exact id / prefix).
// ─────────────────────────────────────────────────────────────────────────────
import { db } from '../src/lib/db'
import { hashPassword } from '../src/lib/auth'
import { createOffer } from '../src/server/modules/catalog/service'
import { nextNumber } from '../src/server/modules/sequences/service'

const PW = 'E2EFin-Passw0rd!'

async function mkUser(email: string, name: string, role = 'BUYER') {
  return db.user.create({
    data: { email, name, password: hashPassword(PW), role, status: 'ACTIVE' },
  })
}

async function mkOrg(name: string, orgType: string) {
  return db.organization.create({
    data: { name, slug: name.toLowerCase().replace(/\s+/g, '-'), orgType, status: 'ACTIVE', verifiedAt: new Date() },
  })
}

async function main() {
  const suffix = Date.now().toString(36)
  const applicant = await mkUser('e2efin-applicant@test.vendora', 'E2EFIN Applicant Owner')
  const supplier = await mkUser('e2efin-supplier@test.vendora', 'E2EFIN Supplier Owner')
  const bankOwner = await mkUser('e2efin-bank@test.vendora', 'E2EFIN Bank Owner')

  const applicantOrg = await mkOrg(`E2EFIN ApplicantCo ${suffix}`, 'COMPANY')
  const supplierOrg = await mkOrg(`E2EFIN SupplierCo ${suffix}`, 'COMPANY')
  const bankOrg = await mkOrg(`E2EFIN Bank ${suffix}`, 'BANK')

  await db.organizationMember.create({ data: { organizationId: applicantOrg.id, userId: applicant.id, role: 'OWNER' } })
  await db.organizationMember.create({ data: { organizationId: supplierOrg.id, userId: supplier.id, role: 'OWNER' } })
  await db.organizationMember.create({ data: { organizationId: bankOrg.id, userId: bankOwner.id, role: 'OWNER' } })

  // Bank profile + services
  const profile = await db.financierProfile.create({
    data: { organizationId: bankOrg.id, licenseNumber: `E2EFIN-${suffix}`, regulator: 'E2E Central Bank' },
  })
  const finService = await db.financierService.create({
    data: {
      financierProfileId: profile.id,
      serviceKind: 'FINANCING',
      category: 'WORKING_CAPITAL',
      name: `E2EFIN Working Capital ${suffix}`,
      summary: 'E2E fixture financing service',
      status: 'ACTIVE',
      currency: 'YER',
      amountMin: 1000,
      amountMax: 50000,
      tenorMinMonths: 3,
      tenorMaxMonths: 36,
    },
  })
  const accService = await db.financierService.create({
    data: {
      financierProfileId: profile.id,
      serviceKind: 'ACCREDITATION',
      category: 'SUPPLIER_QUALIFICATION',
      name: `E2EFIN Supplier Qualification ${suffix}`,
      status: 'ACTIVE',
      accreditationValidMonths: 12,
    },
  })

  // One DOCUMENT requirement on the financing service (drives the gate)
  const docTemplate = await db.conditionTemplate.create({
    data: {
      scope: 'FINANCIER',
      organizationId: bankOrg.id,
      conditionType: 'DOCUMENT',
      code: `E2EFIN-COMREG-${suffix}`,
      title: 'Commercial registration certificate',
      description: 'Upload the company commercial registration certificate',
      documentType: 'COMMERCIAL_REG',
      createdById: bankOwner.id,
    },
  })
  await db.serviceRequirement.create({
    data: {
      serviceId: finService.id,
      conditionTemplateId: docTemplate.id,
      isRequired: true,
      displayOrder: 1,
      instructions: 'Attach the current commercial registration certificate',
    },
  })

  // Supplier accreditation by this bank (the routing link)
  const accNumber = await nextNumber('ACC')
  const accreditation = await db.accreditationRequest.create({
    data: {
      number: accNumber,
      organizationId: supplierOrg.id,
      submittedById: supplier.id,
      serviceId: accService.id,
      status: 'ACCREDITED',
      validUntil: new Date(Date.now() + 365 * 86400 * 1000),
      decidedById: bankOwner.id,
      decidedAt: new Date(),
    },
  })

  // Shared-catalog product + the supplier's ACTIVE offer on it
  const category = await db.category.findFirstOrThrow({})
  const product = await db.product.create({
    data: {
      title: `E2EFIN Solar Pump ${suffix}`,
      description: 'E2E financing-linked flow product',
      price: 500,
      images: '[]',
      categoryId: category.id,
      sellerId: supplier.id,
      stock: 50,
      slug: `e2efin-pump-${suffix}`,
      status: 'ACTIVE',
      approvalState: 'APPROVED',
    },
  })
  const offer = await createOffer(supplier.id, supplierOrg.id, {
    productId: product.id,
    price: 500,
    stock: 40,
    moq: 1,
  })

  console.log(JSON.stringify({
    suffix,
    password: PW,
    applicant: { id: applicant.id, email: applicant.email, orgId: applicantOrg.id },
    supplier: { id: supplier.id, email: supplier.email, orgId: supplierOrg.id },
    bank: { id: bankOwner.id, email: bankOwner.email, orgId: bankOrg.id, profileId: profile.id },
    finServiceId: finService.id,
    accServiceId: accService.id,
    accreditationId: accreditation.id,
    product: { id: product.id, title: product.title },
    offer: { id: offer.id, price: offer.price, stock: offer.stock },
  }, null, 2))
  await db.$disconnect()
}

main().catch((e) => {
  console.error('FIXTURE ERROR:', e)
  process.exit(1)
})
