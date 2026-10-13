/**
 * scripts/rbac-reconcile-report.ts — READ-ONLY reconciliation evidence for the
 * audit's item 5: org-type-invalid role assignments, dormant assignments,
 * orphan permission keys, and legacy-admin ↔ super-admin parity.
 */
import { db } from '../src/lib/db'
import { execSync } from 'child_process'
import {
  ALL_ORG_PERMISSIONS,
  ALL_PLATFORM_PERMISSIONS,
} from '../src/lib/rbac-catalog'

const FINANCIER_ORG_TYPES = ['BANK', 'MFI', 'EWALLET']

function allowFor(orgType: string): Set<string> {
  if (FINANCIER_ORG_TYPES.includes(orgType)) {
    return new Set(
      ALL_ORG_PERMISSIONS.filter(
        (k) =>
          k.startsWith('financier.') ||
          ['org.profile.view', 'org.profile.update', 'org.members.invite', 'org.members.manage', 'org.finance.view'].includes(k)
      )
    )
  }
  return new Set(ALL_ORG_PERMISSIONS.filter((k) => !k.startsWith('financier.')))
}

async function main() {
  const rolePerms = await db.rolePermission.findMany()
  const byRole = new Map<string, string[]>()
  for (const p of rolePerms) {
    if (!byRole.has(p.roleId)) byRole.set(p.roleId, [])
    byRole.get(p.roleId)!.push(p.permissionKey)
  }

  const orgAssignments = await db.userRole.findMany({
    where: { organizationId: { not: '' } },
    include: { role: true, user: { select: { email: true } } },
  })
  const orgs = await db.organization.findMany({ select: { id: true, name: true, orgType: true } })
  const orgById = new Map(orgs.map((o) => [o.id, o]))

  let invalid = 0
  let dormant = 0
  for (const a of orgAssignments) {
    const org = orgById.get(a.organizationId)
    if (!org) {
      dormant++
      console.log(`DORMANT ${a.user.email} role=${a.role.key} orgId=${a.organizationId} (org missing)`)
      continue
    }
    const allow = allowFor(org.orgType)
    const outside = (byRole.get(a.roleId) ?? []).filter((k) => !allow.has(k))
    if (outside.length > 0) {
      invalid++
      console.log(`INVALID ${a.user.email} org=${org.name}(${org.orgType}) role=${a.role.key} disallowed=[${outside.join(',')}]`)
    }
  }

  // ORG-scope roles assigned at platform scope (organizationId='') or vice versa
  const scopeMismatch = await db.userRole.findMany({
    where: { role: { scope: 'ORG' }, organizationId: '' },
    include: { role: true, user: { select: { email: true } } },
  })
  for (const a of scopeMismatch) {
    dormant++
    console.log(`DORMANT ${a.user.email} role=${a.role.key} assigned at PLATFORM scope (org role, no org)`)
  }
  const platformMismatch = await db.userRole.findMany({
    where: { role: { scope: 'PLATFORM' }, organizationId: { not: '' } },
    include: { role: true, user: { select: { email: true } } },
  })
  for (const a of platformMismatch) {
    invalid++
    console.log(`INVALID ${a.user.email} role=${a.role.key} (PLATFORM role) assigned inside org ${a.organizationId}`)
  }

  // 2. permission keys in DB not present in the code catalog
  const dbKeys = await db.permission.findMany({ select: { key: true } })
  const codeSet = new Set([...ALL_PLATFORM_PERMISSIONS, ...ALL_ORG_PERMISSIONS])
  const orphan = dbKeys.filter((p) => !codeSet.has(p.key))
  console.log(`\nPERMISSION KEYS: db=${dbKeys.length} code=${codeSet.size} orphan-in-db=${orphan.length}`)
  for (const o of orphan) console.log(`  ORPHAN ${o.key}`)

  // rolePermission rows referencing keys outside the catalog
  const orphanRP = rolePerms.filter((p) => !codeSet.has(p.permissionKey))
  console.log(`rolePermission rows with non-catalog keys: ${orphanRP.length}`)
  for (const p of orphanRP.slice(0, 10)) console.log(`  RP ${p.roleId} -> ${p.permissionKey}`)

  // 3. legacy admins ↔ super-admin parity
  const admins = await db.user.findMany({ where: { role: 'ADMIN' }, select: { id: true, email: true } })
  const superRole = await db.role.findUnique({ where: { key: 'platform.super-admin' } })
  let missing = 0
  for (const a of admins) {
    if (!superRole) break
    const has = await db.userRole.findFirst({
      where: { userId: a.id, roleId: superRole.id, organizationId: '', storeId: '' },
    })
    if (!has) {
      missing++
      console.log(`ADMIN_NO_SUPERADMIN ${a.email}`)
    }
  }
  console.log(`\nLEGACY ADMINS: ${admins.length}, missing super-admin assignment: ${missing}`)

  // summary
  console.log(`\nSUMMARY orgAssignments=${orgAssignments.length} invalid=${invalid} dormant=${dormant}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => void db.$disconnect())
