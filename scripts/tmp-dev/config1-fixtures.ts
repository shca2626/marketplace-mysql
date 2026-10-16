// CONFIG-1 E2E fixtures: super-admin + a financier org with a phased-requirement service.
// Everything is namespaced (C1 …/ p45.*) so cleanup can remove it deterministically.
import { db } from '../../src/lib/db'
import { hashPassword } from '../../src/lib/auth'

async function main() {
  // ── 1. Super-admin fixture (browser login for the platform console) ──
  const adminEmail = 'p45.admin@vendora.test'
  let admin = await db.user.findUnique({ where: { email: adminEmail } })
  if (!admin) {
    admin = await db.user.create({
      data: { name: 'P45 Admin', email: adminEmail, password: hashPassword('Vendora123!'), role: 'ADMIN', emailVerifiedAt: new Date() },
    })
    const superRole = await db.role.findUnique({ where: { key: 'platform.super-admin' } })
    if (superRole) await db.userRole.create({ data: { userId: admin.id, roleId: superRole.id } })
    console.log('created super-admin', adminEmail)
  } else console.log('super-admin exists', adminEmail)

  // ── 2. Financier fixture: BANK org + owner + profile + service + PHASED requirements ──
  const bankerEmail = 'c1.banker@vendora.test'
  let banker = await db.user.findUnique({ where: { email: bankerEmail } })
  if (!banker) {
    banker = await db.user.create({
      data: { name: 'C1 Banker', email: bankerEmail, password: hashPassword('Vendora123!'), role: 'BUYER', emailVerifiedAt: new Date() },
    })
  }
  let org = await db.organization.findFirst({ where: { slug: 'c1-sequence-bank' } })
  if (!org) {
    org = await db.organization.create({
      data: {
        name: 'C1 Sequence Bank',
        slug: 'c1-sequence-bank',
        orgType: 'BANK',
        status: 'ACTIVE',
        verifiedAt: new Date(),
        members: { create: { userId: banker.id, role: 'OWNER' } },
      },
    })
  }
  let profile = await db.financierProfile.findFirst({ where: { organizationId: org.id } })
  if (!profile) {
    profile = await db.financierProfile.create({
      data: { organizationId: org.id, licenseNumber: 'C1-LIC-001', about: 'CONFIG-1 E2E fixture financier' },
    })
  }

  // Condition templates (GENERAL library) — reuse when present
  async function template(title: string, conditionType: string, extra: object = {}) {
    let t = await db.conditionTemplate.findFirst({ where: { title, scope: 'GENERAL' } })
    if (!t) {
      t = await db.conditionTemplate.create({
        data: { scope: 'GENERAL', conditionType, title, createdById: admin.id, ...extra },
      })
    }
    return t
  }
  const tComReg = await template('Commercial registration', 'DOCUMENT', { documentType: 'COMMERCIAL_REG' })
  const tRevenue = await template('Declared annual revenue', 'NUMBER', { validationMin: 0 })
  const tBank = await template('Six months of bank statements', 'DOCUMENT', { documentType: 'BANK_STATEMENT' })
  const tGuarantee = await template('Guarantor declaration', 'DECLARATION')

  let service = await db.financierService.findFirst({ where: { financierProfileId: profile.id } })
  if (!service) {
    service = await db.financierService.create({
      data: {
        financierProfileId: profile.id,
        name: 'C1 Sequence Solar Finance',
        serviceKind: 'FINANCING',
        category: 'EQUIPMENT',
        summary: 'CONFIG-1 phased-sequence E2E service',
        description: 'CONFIG-1 phased-sequence E2E service for verifying workflow sequence phases.',
        status: 'ACTIVE',
        currency: 'USD',
        amountMin: 500,
        amountMax: 250000,
      },
    })
  }

  const phases: { templateId: string; phase: string | null; order: number; required: boolean }[] = [
    { templateId: tComReg.id, phase: 'Pre-approval', order: 0, required: true },
    { templateId: tRevenue.id, phase: 'Pre-approval', order: 1, required: true },
    { templateId: tBank.id, phase: 'Due diligence', order: 2, required: true },
    { templateId: tGuarantee.id, phase: null, order: 3, required: false },
  ]
  for (const p of phases) {
    const existing = await db.serviceRequirement.findUnique({
      where: { serviceId_conditionTemplateId: { serviceId: service.id, conditionTemplateId: p.templateId } },
    })
    if (!existing) {
      await db.serviceRequirement.create({
        data: {
          serviceId: service.id,
          conditionTemplateId: p.templateId,
          isRequired: p.required,
          displayOrder: p.order,
          phase: p.phase,
        },
      })
    } else if (existing.phase !== p.phase) {
      await db.serviceRequirement.update({ where: { id: existing.id }, data: { phase: p.phase } })
    }
  }
  console.log('financier fixture ready:', bankerEmail, 'org', org.id, 'service', service.id, '(password Vendora123!)')
}
main().catch((err) => {
  console.error(err)
  process.exit(1)
}).finally(() => db.$disconnect())
