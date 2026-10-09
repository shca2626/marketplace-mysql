// ─────────────────────────────────────────────────────────────────────────────
// RBAC SEED — permissions catalog, system roles, legacy migration.
// (mergedplan.md Phase 2 — run once after `bun run db:push`.)
//
//   1. Upserts every Permission row from src/lib/rbac-catalog.ts
//   2. Upserts the system roles and syncs their permission sets
//   3. Migrates legacy User.role === 'ADMIN' → platform.super-admin assignment
//   4. Migrates every OrganizationMember.role → the matching org.* assignment
//
// Idempotent — safe to re-run (upserts + skip-existing).
// ─────────────────────────────────────────────────────────────────────────────

import { db } from '../src/lib/db'
import { ORG_ROLE_BY_LEGACY, PERMISSION_DOMAINS, SYSTEM_ROLES, isProtectedRoleKey } from '../src/lib/rbac-catalog'

async function main() {
  console.log('── RBAC seed ────────────────────────────────────────────')

  // 1. Permissions ─────────────────────────────────────────────────────────
  let permCount = 0
  for (const domain of PERMISSION_DOMAINS) {
    for (const p of domain.permissions) {
      await db.permission.upsert({
        where: { key: p.key },
        update: { domain: domain.key, description: p.description },
        create: { key: p.key, domain: domain.key, description: p.description },
      })
      permCount++
    }
  }
  console.log(`✓ permissions upserted: ${permCount}`)

  // 2. System roles + permission sync ──────────────────────────────────────
  // RBACSEC-1: protected roles (platform.super-admin, org.owner) get
  // isProtected=true — invisible and untouchable for non-super-admins.
  for (const r of SYSTEM_ROLES) {
    const isProtected = isProtectedRoleKey(r.key)
    const role = await db.role.upsert({
      where: { key: r.key },
      update: { name: r.name, description: r.description, scope: r.scope, isSystem: true, isProtected },
      create: {
        key: r.key,
        name: r.name,
        description: r.description,
        scope: r.scope,
        isSystem: true,
        isProtected,
        permissions: { create: r.permissions.map((permissionKey) => ({ permissionKey })) },
      },
    })
    // Sync (handles catalog edits after the first seed)
    const existing = await db.rolePermission.findMany({
      where: { roleId: role.id },
      select: { permissionKey: true },
    })
    const existingKeys = new Set(existing.map((e) => e.permissionKey))
    const wanted = new Set(r.permissions)
    for (const key of wanted) {
      if (!existingKeys.has(key)) {
        await db.rolePermission.create({ data: { roleId: role.id, permissionKey: key } })
      }
    }
    for (const key of existingKeys) {
      if (!wanted.has(key)) {
        await db.rolePermission.deleteMany({ where: { roleId: role.id, permissionKey: key } })
      }
    }
  }
  console.log(`✓ system roles synced: ${SYSTEM_ROLES.length}`)

  // 3. Legacy admins → platform.super-admin ────────────────────────────────
  const superAdmin = await db.role.findUnique({ where: { key: 'platform.super-admin' } })
  if (!superAdmin) throw new Error('platform.super-admin role missing after seed — aborting')
  const admins = await db.user.findMany({ where: { role: 'ADMIN' }, select: { id: true, email: true } })
  for (const a of admins) {
    await db.userRole.upsert({
      where: {
        userId_roleId_organizationId_storeId: { userId: a.id, roleId: superAdmin.id, organizationId: '', storeId: '' },
      },
      update: {},
      create: { userId: a.id, roleId: superAdmin.id, organizationId: '', storeId: '' },
    })
  }
  console.log(`✓ legacy admins migrated: ${admins.length} (${admins.map((a) => a.email).join(', ') || 'none'})`)

  // 4. Org members → org.* roles ───────────────────────────────────────────
  const orgRoleIds = new Map<string, string>()
  for (const key of Object.values(ORG_ROLE_BY_LEGACY)) {
    const role = await db.role.findUnique({ where: { key } })
    if (role) orgRoleIds.set(key, role.id)
  }
  const members = await db.organizationMember.findMany({
    select: { userId: true, organizationId: true, role: true },
  })
  let migrated = 0
  for (const m of members) {
    const roleKey = ORG_ROLE_BY_LEGACY[m.role] ?? 'org.viewer'
    const roleId = orgRoleIds.get(roleKey)
    if (!roleId) continue
    await db.userRole.upsert({
      where: {
        userId_roleId_organizationId_storeId: { userId: m.userId, roleId, organizationId: m.organizationId, storeId: '' },
      },
      update: {},
      create: { userId: m.userId, roleId, organizationId: m.organizationId, storeId: '' },
    })
    migrated++
  }
  console.log(`✓ organization members migrated: ${migrated}`)

  // Summary ────────────────────────────────────────────────────────────────
  const [roles, assignments, invitations] = await Promise.all([
    db.role.count(),
    db.userRole.count(),
    db.staffInvitation.count(),
  ])
  console.log(`── done: ${permCount} permissions · ${roles} roles · ${assignments} assignments · ${invitations} invitations`)
}

main()
  .catch((err) => {
    console.error('RBAC seed failed:', err)
    process.exit(1)
  })
  .finally(() => {
    void db.$disconnect()
  })
