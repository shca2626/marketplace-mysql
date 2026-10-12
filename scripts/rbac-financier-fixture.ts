/* eslint-disable no-console */
/**
 * scripts/rbac-financier-fixture.ts — FOCUSED verification fixture for the
 * financier runtime-permission model (RBAC completion, item 3).
 *
 * Creates (idempotently, with RBAC-FIX prefix + cleanup support):
 *   • BANK org "RBAC-FIX Bank" + FinancierProfile
 *   • owner@   — OWNER membership (full institution authority)
 *   • reviewer@ — VIEWER membership + financier.reviewer role (requests.view only)
 *   • nobody@  — VIEWER membership, NO roles (must be denied everywhere)
 *   • legacy@  — ADMIN membership, no canonical roles (legacy bridge parity)
 *
 * Nothing else is touched; run with --cleanup to remove everything.
 */
import { db } from '../src/lib/db'
import { hashPassword } from '../src/lib/auth'

const SUFFIX = 'rbacfix'
const PASSWORD = 'RbacFix-Fixture-2026'

async function upsertUser(email: string, name: string, role = 'BUYER') {
  const existing = await db.user.findUnique({ where: { email } })
  if (existing) return existing
  return db.user.create({
    data: { email, name, password: hashPassword(PASSWORD), role },
    select: { id: true, email: true, role: true },
  })
}

async function main() {
  const cleanup = process.argv.includes('--cleanup')

  const orgSlug = `rbac-fix-bank-${SUFFIX}`
  const org = await db.organization.findUnique({ where: { slug: orgSlug } })

  if (cleanup) {
    if (org) {
      await db.organizationMember.deleteMany({ where: { organizationId: org.id } })
      await db.userRole.deleteMany({ where: { organizationId: org.id } })
      await db.financierProfile.deleteMany({ where: { organizationId: org.id } })
      await db.organization.delete({ where: { id: org.id } })
    }
    for (const e of [
      `owner-${SUFFIX}@test.vendora`,
      `reviewer-${SUFFIX}@test.vendora`,
      `nobody-${SUFFIX}@test.vendora`,
      `legacy-${SUFFIX}@test.vendora`,
    ]) {
      await db.user.deleteMany({ where: { email: e } })
    }
    console.log('✓ fixture cleaned')
    return
  }

  if (org) {
    console.log(`fixture org already exists: ${org.id} (re-run --cleanup first)`)
    return
  }

  const bank = await db.organization.create({
    data: { name: 'RBAC-FIX Bank', slug: orgSlug, orgType: 'BANK', status: 'ACTIVE', verifiedAt: new Date() },
    select: { id: true, name: true },
  })
  await db.financierProfile.create({ data: { organizationId: bank.id } })

  const owner = await upsertUser(`owner-${SUFFIX}@test.vendora`, 'Fixture Owner')
  const reviewer = await upsertUser(`reviewer-${SUFFIX}@test.vendora`, 'Fixture Reviewer')
  const nobody = await upsertUser(`nobody-${SUFFIX}@test.vendora`, 'Fixture Nobody')
  const legacy = await upsertUser(`legacy-${SUFFIX}@test.vendora`, 'Fixture LegacyAdmin')

  await db.organizationMember.create({ data: { organizationId: bank.id, userId: owner.id, role: 'OWNER' } })
  await db.organizationMember.create({ data: { organizationId: bank.id, userId: reviewer.id, role: 'VIEWER' } })
  await db.organizationMember.create({ data: { organizationId: bank.id, userId: nobody.id, role: 'VIEWER' } })
  await db.organizationMember.create({ data: { organizationId: bank.id, userId: legacy.id, role: 'ADMIN' } })

  const reviewerRole = await db.role.findUnique({ where: { key: 'financier.reviewer' } })
  if (reviewerRole) {
    await db.userRole.create({
      data: { userId: reviewer.id, roleId: reviewerRole.id, organizationId: bank.id, storeId: '' },
    })
  }

  console.log('✓ fixture created:')
  console.log(`  org=${bank.id} (${bank.name})`)
  console.log(`  owner=${owner.email} (OWNER)`)
  console.log(`  reviewer=${reviewer.email} (VIEWER + financier.reviewer)`)
  console.log(`  nobody=${nobody.email} (VIEWER, no roles)`)
  console.log(`  legacy=${legacy.email} (legacy ADMIN membership)`)
  console.log(`  password for all: ${PASSWORD}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => void db.$disconnect())
