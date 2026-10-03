import { randomBytes } from 'crypto'
import { db } from '@/lib/db'
import {
  ALL_ORG_PERMISSIONS,
  ALL_PLATFORM_PERMISSIONS,
  type PermissionDomain,
  PERMISSION_DOMAINS,
} from '@/lib/rbac-catalog'
import { recordAudit } from '@/server/modules/audit/service'

// ─────────────────────────────────────────────────────────────────────────────
// RBAC SERVICE — roles, permissions, assignments & staff invitations.
// (mergedplan.md Phase 2 — answers owner gaps #2 and #3.)
//
// RBACSEC-1 hardening (role module CRUD + isolation):
//  • Granular role permissions: rbac.roles.view / create / update / delete on
//    top of the rbac.manage umbrella and staff.view / staff.invite /
//    staff.manage — see src/lib/rbac-catalog.ts.
//  • PROTECTED ROLES (platform.super-admin, org.owner): invisible and
//    untouchable for anyone who is not a super administrator. Reads, updates,
//    deletes, assignments and revocations answer 404 so their very existence
//    is not revealed. Their holders and legacy ADMIN accounts are hidden from
//    the staff list and user search of non-super-admin staff.
//  • PRIVILEGE BRACKETING: staff may only create / edit / grant / revoke /
//    invite with roles whose permission set is a subset of their own —
//    nobody can hand out more access than they have.
//  • FORCE DELETE: super admins can delete a role that still has members;
//    the assignments are revoked (and audited) in the same transaction.
//
// Design notes:
//  • User.role === 'ADMIN' is an implicit super-admin bypass everywhere — the
//    platform owner never depends on a role row existing.
//  • Platform staff = users with at least one UserRole where organizationId
//    is "" (platform scope). They keep their legacy User.role (BUYER/…) and
//    gain console access purely through assignments.
//  • System roles can be edited and deleted by super admins only — except
//    the two LOCKED roles (platform.super-admin, org.owner) which are
//    permanent for everyone: they cannot be deleted, narrowed or tampered
//    with. Custom roles are deletable by any holder of rbac.roles.delete
//    within their privilege bracket.
// ─────────────────────────────────────────────────────────────────────────────

export class RbacServiceError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'role'
  )
}

// ── Actor context (RBACSEC-1) ───────────────────────────────────────────────

export interface RbacActor {
  id: string
  role: string
  name: string
  email: string | null // Phase 3: phone-first accounts may have no email
}

export interface ActorContext {
  /** Legacy ADMIN bypass or platform.super-admin holder. */
  isSuperAdmin: boolean
  /** Effective platform permissions of the actor (empty set = none). */
  permissions: Set<string>
}

export async function getActorContext(user: { id: string; role: string }): Promise<ActorContext> {
  if (user.role === 'ADMIN') {
    return { isSuperAdmin: true, permissions: new Set(ALL_PLATFORM_PERMISSIONS) }
  }
  const assignments = await db.userRole.findMany({
    where: { userId: user.id, organizationId: '' },
    select: { role: { select: { key: true, permissions: { select: { permissionKey: true } } } } },
    take: 50,
  })
  const permissions = new Set<string>()
  let isSuperAdmin = false
  for (const a of assignments) {
    if (a.role.key === 'platform.super-admin') isSuperAdmin = true
    for (const p of a.role.permissions) permissions.add(p.permissionKey)
  }
  return { isSuperAdmin, permissions }
}

/**
 * Privilege bracketing — a staff member can never manage (create / edit /
 * grant / revoke / invite with) a role whose permission set exceeds their own.
 */
function ensureWithinBracket(actor: ActorContext, keys: string[], action: string): void {
  if (actor.isSuperAdmin) return
  const outside = keys.filter((k) => !actor.permissions.has(k))
  if (outside.length > 0) {
    throw new RbacServiceError(
      `Access denied — you cannot ${action} because it includes permissions you do not hold: ${outside
        .slice(0, 5)
        .join(', ')}${outside.length > 5 ? '…' : ''}`,
      403
    )
  }
}

/** Protected roles must not even be revealed to non-super-admins → 404. */
function assertCanSeeRole(actor: ActorContext, role: { key: string; isProtected: boolean }): void {
  if (role.isProtected && !actor.isSuperAdmin) {
    throw new RbacServiceError('Role not found', 404)
  }
}

// ── Session context (used by /api/auth/* to enrich SessionUser) ────────────

export interface SessionRbac {
  permissions: string[]
  isPlatformStaff: boolean
}

export async function buildSessionRbac(user: { id: string; role: string }): Promise<SessionRbac> {
  if (user.role === 'ADMIN') {
    return { permissions: [...ALL_PLATFORM_PERMISSIONS], isPlatformStaff: true }
  }
  const assignments = await db.userRole.findMany({
    where: { userId: user.id, organizationId: '' },
    include: { role: { include: { permissions: { select: { permissionKey: true } } } } },
    take: 50,
  })
  const set = new Set<string>()
  for (const a of assignments) {
    for (const p of a.role.permissions) set.add(p.permissionKey)
  }
  return { permissions: [...set], isPlatformStaff: assignments.length > 0 }
}

/** True when the user holds the permission through any platform-scope role. */
export async function userHasPlatformPermission(userId: string, permission: string): Promise<boolean> {
  const count = await db.userRole.count({
    where: {
      userId,
      organizationId: '',
      role: { permissions: { some: { permissionKey: permission } } },
    },
  })
  return count > 0
}

/** True when the user holds ANY of the given permissions through platform-scope roles. */
export async function userHasAnyPlatformPermission(userId: string, permissions: string[]): Promise<boolean> {
  if (permissions.length === 0) return false
  const count = await db.userRole.count({
    where: {
      userId,
      organizationId: '',
      role: { permissions: { some: { permissionKey: { in: permissions } } } },
    },
  })
  return count > 0
}

// ── Catalog ─────────────────────────────────────────────────────────────────

export function getCatalog(): PermissionDomain[] {
  return PERMISSION_DOMAINS
}

// ── Roles ───────────────────────────────────────────────────────────────────

export interface RoleDTO {
  id: string
  key: string
  name: string
  description: string | null
  scope: 'PLATFORM' | 'ORG'
  isSystem: boolean
  isProtected: boolean
  permissions: string[]
  memberCount: number
  createdAt: string
}

const roleInclude = {
  permissions: { select: { permissionKey: true } },
  _count: { select: { assignments: true } },
} as const

type RoleWithRelations = {
  id: string
  key: string
  name: string
  description: string | null
  scope: string
  isSystem: boolean
  isProtected: boolean
  createdAt: Date
  permissions: { permissionKey: string }[]
  _count: { assignments: number }
}

function toRoleDTO(role: RoleWithRelations): RoleDTO {
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    scope: role.scope === 'ORG' ? 'ORG' : 'PLATFORM',
    isSystem: role.isSystem,
    isProtected: role.isProtected,
    permissions: role.permissions.map((p) => p.permissionKey),
    memberCount: role._count.assignments,
    createdAt: role.createdAt.toISOString(),
  }
}

export async function listRoles(actor: RbacActor): Promise<RoleDTO[]> {
  const ctx = await getActorContext(actor)
  const roles = await db.role.findMany({
    include: roleInclude,
    orderBy: [{ scope: 'asc' }, { isSystem: 'desc' }, { name: 'asc' }],
  })
  // RBACSEC-1: protected roles are invisible to non-super-admins.
  return roles.filter((r) => ctx.isSuperAdmin || !r.isProtected).map(toRoleDTO)
}

export async function createRole(
  actor: RbacActor,
  input: { name: string; description?: string | null; scope: 'PLATFORM' | 'ORG'; permissionKeys: string[] }
): Promise<RoleDTO> {
  const ctx = await getActorContext(actor)
  const name = input.name.trim()
  if (name.length < 2 || name.length > 60) throw new RbacServiceError('Role name must be 2–60 characters')
  const allowed = input.scope === 'PLATFORM' ? ALL_PLATFORM_PERMISSIONS : ALL_ORG_PERMISSIONS
  const keys = [...new Set(input.permissionKeys)]
  const invalid = keys.filter((k) => !allowed.includes(k))
  if (invalid.length > 0) throw new RbacServiceError(`Permissions not valid for this scope: ${invalid.join(', ')}`)
  if (keys.length === 0) throw new RbacServiceError('Select at least one permission for the role')
  // RBACSEC-1: privilege bracketing — no handing out more than you have.
  ensureWithinBracket(ctx, keys, 'create a role that grants')

  const base = `custom.${input.scope.toLowerCase()}.${slugify(name)}`
  let key = base
  let n = 1
  while (await db.role.findUnique({ where: { key } })) {
    key = `${base}-${++n}`
  }

  const role = await db.role.create({
    data: {
      key,
      name,
      description: input.description?.trim() || null,
      scope: input.scope,
      isSystem: false,
      permissions: { create: keys.map((permissionKey) => ({ permissionKey })) },
    },
    include: roleInclude,
  })

  await recordAudit({
    actorId: actor.id,
    actorType: 'ADMIN',
    action: 'ROLE_CREATED',
    entityType: 'Role',
    entityId: role.id,
    summary: `Role "${role.name}" created (${keys.length} permissions, ${input.scope} scope)`,
    metadata: { key: role.key, scope: input.scope, permissions: keys },
  })
  return toRoleDTO(role)
}

export async function updateRole(
  actor: RbacActor,
  id: string,
  input: { name?: string; description?: string | null; permissionKeys?: string[] }
): Promise<RoleDTO> {
  const ctx = await getActorContext(actor)
  const role = await db.role.findUnique({ where: { id }, include: roleInclude })
  if (!role) throw new RbacServiceError('Role not found', 404)
  // RBACSEC-1: protected roles do not exist for non-super-admins.
  assertCanSeeRole(ctx, role)
  if (role.key === 'platform.super-admin') {
    throw new RbacServiceError('The Super Administrator role is locked — it always grants every permission', 403)
  }
  if (role.key === 'org.owner') {
    throw new RbacServiceError('The Organization Owner role is locked — owners always hold every organization permission', 403)
  }
  // RBACSEC-1: system role templates are only editable by super admins.
  if (role.isSystem && !ctx.isSuperAdmin) {
    throw new RbacServiceError('System roles can only be edited by super administrators', 403)
  }

  const data: { name?: string; description?: string | null } = {}
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length < 2 || name.length > 60) throw new RbacServiceError('Role name must be 2–60 characters')
    data.name = name
  }
  if (input.description !== undefined) data.description = input.description?.trim() || null

  const allowed = role.scope === 'ORG' ? ALL_ORG_PERMISSIONS : ALL_PLATFORM_PERMISSIONS
  let permissionChanges: { added: string[]; removed: string[] } | undefined
  if (input.permissionKeys !== undefined) {
    const wanted = [...new Set(input.permissionKeys)]
    const invalid = wanted.filter((k) => !allowed.includes(k))
    if (invalid.length > 0) throw new RbacServiceError(`Permissions not valid for this scope: ${invalid.join(', ')}`)
    if (wanted.length === 0) throw new RbacServiceError('A role needs at least one permission')
    // RBACSEC-1: privilege bracketing — cannot widen a role beyond your own access.
    ensureWithinBracket(ctx, wanted, `re-permission "${role.name}" with`)
    const existing = new Set(role.permissions.map((p) => p.permissionKey))
    permissionChanges = {
      added: wanted.filter((k) => !existing.has(k)),
      removed: [...existing].filter((k) => !wanted.includes(k)),
    }
  }

  const updated = await db.$transaction(async (tx) => {
    if (input.permissionKeys !== undefined) {
      const existingRows = await tx.rolePermission.findMany({ where: { roleId: id }, select: { permissionKey: true } })
      const existingKeys = existingRows.map((e) => e.permissionKey)
      const wanted = [...new Set(input.permissionKeys!)]
      const toAdd = wanted.filter((k) => !existingKeys.includes(k))
      const toRemove = existingKeys.filter((k) => !wanted.includes(k))
      if (toRemove.length > 0) {
        await tx.rolePermission.deleteMany({ where: { roleId: id, permissionKey: { in: toRemove } } })
      }
      if (toAdd.length > 0) {
        await tx.rolePermission.createMany({ data: toAdd.map((permissionKey) => ({ roleId: id, permissionKey })) })
      }
    }
    return tx.role.update({ where: { id }, data, include: roleInclude })
  })

  await recordAudit({
    actorId: actor.id,
    actorType: 'ADMIN',
    action: 'ROLE_UPDATED',
    entityType: 'Role',
    entityId: id,
    summary: `Role "${updated.name}" updated`,
    metadata: { name: data.name, permissionChanges },
  })
  return toRoleDTO(updated)
}

export async function deleteRole(actor: RbacActor, id: string, force = false): Promise<{ revoked: number }> {
  const ctx = await getActorContext(actor)
  const role = await db.role.findUnique({
    where: { id },
    include: { permissions: { select: { permissionKey: true } }, _count: { select: { assignments: true } } },
  })
  if (!role) throw new RbacServiceError('Role not found', 404)
  // RBACSEC-1: protected roles do not exist for non-super-admins.
  assertCanSeeRole(ctx, role)
  // RBACSEC-2: locked roles are permanent — nobody can delete them.
  if (role.isProtected) {
    throw new RbacServiceError(
      role.key === 'platform.super-admin'
        ? 'The Super Administrator role is locked — it cannot be deleted. Revoke assignments instead if you need to limit who holds it.'
        : 'The Organization Owner role is locked — it cannot be deleted. Revoke assignments instead if you need to limit who holds it.',
      403
    )
  }
  // RBACSEC-2: system-role templates are deletable by super admins only —
  // staff with rbac.roles.delete can still delete custom roles (bracketed).
  if (role.isSystem && !ctx.isSuperAdmin) {
    throw new RbacServiceError('System roles can only be deleted by super administrators', 403)
  }
  // RBACSEC-1: privilege bracketing — you cannot delete a role above your pay grade.
  ensureWithinBracket(ctx, role.permissions.map((p) => p.permissionKey), `delete "${role.name}"`)

  const memberCount = role._count.assignments
  if (memberCount > 0 && !force) {
    throw new RbacServiceError(
      `This role is still assigned to ${memberCount} member(s) — revoke the assignments first, or delete it with force to un-assign everyone.`,
      409
    )
  }

  const revoked = await db.$transaction(async (tx) => {
    let n = 0
    if (memberCount > 0) {
      const assignments = await tx.userRole.findMany({
        where: { roleId: id },
        include: { user: { select: { id: true, email: true } } },
      })
      await tx.userRole.deleteMany({ where: { roleId: id } })
      n = assignments.length
      // Bump sessionVersion so revoked staff lose console access immediately.
      for (const a of assignments) {
        await tx.user.update({
          where: { id: a.user.id },
          data: { sessionVersion: { increment: 1 } },
        })
      }
    }
    // Drop invitation rows referencing this role (FK constraint; audit keeps history).
    await tx.staffInvitation.deleteMany({ where: { roleId: id } })
    await tx.role.delete({ where: { id } })
    return n
  })

  await recordAudit({
    actorId: actor.id,
    actorType: 'ADMIN',
    action: 'ROLE_DELETED',
    entityType: 'Role',
    entityId: id,
    summary:
      revoked > 0
        ? `Role "${role.name}" force-deleted — ${revoked} member assignment(s) revoked`
        : `Role "${role.name}" deleted`,
    metadata: { key: role.key, scope: role.scope, force: revoked > 0, revoked },
  })
  return { revoked }
}

// ── Assignments ─────────────────────────────────────────────────────────────

export interface AssignmentDTO {
  id: string
  userId: string
  userName: string
  userEmail: string | null
  userRole: string
  roleId: string
  roleKey: string
  roleName: string
  roleScope: 'PLATFORM' | 'ORG'
  organizationId: string
  organizationName: string | null
  assignedAt: string
}

const assignmentInclude = {
  user: { select: { id: true, name: true, email: true, role: true } },
  role: { select: { id: true, key: true, name: true, scope: true, isProtected: true } },
} as const

type AssignmentWithRelations = {
  id: string
  userId: string
  roleId: string
  organizationId: string
  assignedAt: Date
  assignedBy: string | null
  user: { id: string; name: string; email: string | null; role: string }
  role: { id: string; key: string; name: string; scope: string; isProtected: boolean }
}

function toAssignmentDTO(a: AssignmentWithRelations, organizationName: string | null): AssignmentDTO {
  return {
    id: a.id,
    userId: a.user.id,
    userName: a.user.name,
    userEmail: a.user.email,
    userRole: a.user.role,
    roleId: a.role.id,
    roleKey: a.role.key,
    roleName: a.role.name,
    roleScope: a.role.scope === 'ORG' ? 'ORG' : 'PLATFORM',
    organizationId: a.organizationId,
    organizationName,
    assignedAt: a.assignedAt.toISOString(),
  }
}

export async function listAssignments(
  actor: RbacActor,
  filter: {
    scope?: 'platform' | 'org'
    userId?: string
    organizationId?: string
  }
): Promise<AssignmentDTO[]> {
  const ctx = await getActorContext(actor)
  const where: { organizationId?: string; userId?: string } = {}
  if (filter.scope === 'platform') where.organizationId = ''
  if (filter.scope === 'org' && filter.organizationId) where.organizationId = filter.organizationId
  if (filter.userId) where.userId = filter.userId

  const assignments = await db.userRole.findMany({
    where,
    include: assignmentInclude,
    orderBy: { assignedAt: 'desc' },
    take: 500,
  })
  // RBACSEC-1: protected-role assignments are invisible to non-super-admins.
  const visible = assignments.filter((a) => ctx.isSuperAdmin || !a.role.isProtected)

  // Resolve organization names in one pass (org assignments only)
  const orgIds = [...new Set(visible.filter((a) => a.organizationId).map((a) => a.organizationId))]
  const orgs = orgIds.length
    ? await db.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } })
    : []
  const orgNameById = new Map(orgs.map((o) => [o.id, o.name]))

  return visible.map((a) =>
    toAssignmentDTO(a, a.organizationId ? (orgNameById.get(a.organizationId) ?? null) : null)
  )
}

export async function assignRole(
  actor: RbacActor,
  input: { userId: string; roleId: string; organizationId?: string }
): Promise<AssignmentDTO> {
  const ctx = await getActorContext(actor)
  const role = await db.role.findUnique({
    where: { id: input.roleId },
    include: { permissions: { select: { permissionKey: true } } },
  })
  if (!role) throw new RbacServiceError('Role not found', 404)
  // RBACSEC-1: protected roles cannot be granted by non-super-admins (404 —
  // do not reveal that the role exists).
  assertCanSeeRole(ctx, role)
  // RBACSEC-1: privilege bracketing — no granting roles above your own access.
  ensureWithinBracket(ctx, role.permissions.map((p) => p.permissionKey), `grant "${role.name}"`)

  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: { id: true, name: true, email: true, role: true, status: true },
  })
  if (!user) throw new RbacServiceError('User not found', 404)
  if (user.status === 'SUSPENDED') throw new RbacServiceError('This account is suspended', 403)
  // RBACSEC-1: legacy ADMIN accounts are implicit super-admins — only
  // super admins may attach further roles to them.
  if (user.role === 'ADMIN' && !ctx.isSuperAdmin) {
    throw new RbacServiceError('Access denied — this account is a super administrator', 403)
  }

  let organizationId = ''
  let organizationName: string | null = null
  if (role.scope === 'ORG') {
    const orgId = input.organizationId?.trim()
    if (!orgId) throw new RbacServiceError('Organization roles need an organization')
    const org = await db.organization.findUnique({ where: { id: orgId }, select: { id: true, name: true } })
    if (!org) throw new RbacServiceError('Organization not found', 404)
    organizationId = org.id
    organizationName = org.name
  }

  const existing = await db.userRole.findUnique({
    where: { userId_roleId_organizationId: { userId: user.id, roleId: role.id, organizationId } },
  })
  if (existing) {
    throw new RbacServiceError(
      `${user.name} already holds the "${role.name}" role${organizationName ? ` at ${organizationName}` : ''}`,
      409
    )
  }

  const assignment = await db.userRole.create({
    data: { userId: user.id, roleId: role.id, organizationId, assignedBy: actor.id },
    include: assignmentInclude,
  })
  // The user may have gained console access — invalidate their session payload.
  await db.user.update({ where: { id: user.id }, data: { sessionVersion: { increment: 1 } } })

  await recordAudit({
    actorId: actor.id,
    actorType: 'ADMIN',
    action: 'ROLE_ASSIGNED',
    entityType: 'User',
    entityId: user.id,
    summary: `Role "${role.name}" assigned to ${user.email}${organizationName ? ` at ${organizationName}` : ''}`,
    metadata: { roleId: role.id, roleKey: role.key, scope: role.scope, organizationId },
  })
  return toAssignmentDTO(assignment, organizationName)
}

export async function revokeAssignment(actor: RbacActor, id: string): Promise<void> {
  const ctx = await getActorContext(actor)
  const assignment = await db.userRole.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
      role: { select: { id: true, key: true, name: true, isProtected: true, permissions: { select: { permissionKey: true } } } },
    },
  })
  if (!assignment) throw new RbacServiceError('Assignment not found', 404)
  // RBACSEC-1: protected-role seats (super-admin, org.owner) can only be
  // revoked by super admins — and never your own super-admin seat.
  if (assignment.role.isProtected) {
    if (!ctx.isSuperAdmin) throw new RbacServiceError('Assignment not found', 404)
    if (assignment.role.key === 'platform.super-admin' && assignment.userId === actor.id) {
      throw new RbacServiceError('You cannot revoke your own Super Administrator access', 403)
    }
  } else {
    // Privilege bracketing on revocation (mirrors the grant rule).
    ensureWithinBracket(
      ctx,
      assignment.role.permissions.map((p) => p.permissionKey),
      `revoke "${assignment.role.name}"`
    )
  }

  await db.userRole.delete({ where: { id } })
  // Refresh the affected user's session payload (permissions may have shrunk).
  await db.user.update({ where: { id: assignment.userId }, data: { sessionVersion: { increment: 1 } } })

  await recordAudit({
    actorId: actor.id,
    actorType: 'ADMIN',
    action: 'ROLE_REVOKED',
    entityType: 'User',
    entityId: assignment.userId,
    summary: `Role "${assignment.role.name}" revoked from ${assignment.user.email}`,
    metadata: { roleId: assignment.roleId, roleKey: assignment.role.key, organizationId: assignment.organizationId },
  })
}

// ── Platform staff (grouped view) ───────────────────────────────────────────

export interface StaffDTO {
  userId: string
  name: string
  email: string | null
  userRole: string
  isSuperAdmin: boolean
  permissions: string[]
  roles: { assignmentId: string; roleId: string; roleName: string; roleKey: string; assignedAt: string }[]
}

export async function listPlatformStaff(actor: RbacActor): Promise<StaffDTO[]> {
  const ctx = await getActorContext(actor)
  const assignments = await db.userRole.findMany({
    where: { organizationId: '' },
    include: {
      user: { select: { id: true, name: true, email: true, role: true, status: true } },
      role: { include: { permissions: { select: { permissionKey: true } } } },
    },
    orderBy: { assignedAt: 'asc' },
    take: 500,
  })

  // RBACSEC-1: for non-super-admins, drop protected-role assignments entirely
  // and never list legacy admins (implicit super-admins).
  const visible = assignments.filter((a) => ctx.isSuperAdmin || !a.role.isProtected)
  const legacyAdmins =
    ctx.isSuperAdmin
      ? await db.user.findMany({
          where: { role: 'ADMIN' },
          select: { id: true, name: true, email: true, role: true },
        })
      : []

  const byUser = new Map<string, StaffDTO>()
  const ensure = (id: string, name: string, email: string | null, userRole: string): StaffDTO => {
    let entry = byUser.get(id)
    if (!entry) {
      entry = { userId: id, name, email, userRole, isSuperAdmin: false, permissions: [], roles: [] }
      byUser.set(id, entry)
    }
    return entry
  }
  for (const a of visible) {
    const entry = ensure(a.user.id, a.user.name, a.user.email, a.user.role)
    entry.roles.push({
      assignmentId: a.id,
      roleId: a.role.id,
      roleName: a.role.name,
      roleKey: a.role.key,
      assignedAt: a.assignedAt.toISOString(),
    })
    if (a.role.key === 'platform.super-admin') entry.isSuperAdmin = true
    for (const p of a.role.permissions) entry.permissions.push(p.permissionKey)
  }
  for (const admin of legacyAdmins) {
    const entry = ensure(admin.id, admin.name, admin.email, admin.role)
    entry.isSuperAdmin = true
  }
  for (const entry of byUser.values()) entry.permissions = [...new Set(entry.permissions)]
  return [...byUser.values()].sort((a, b) =>
    a.isSuperAdmin === b.isSuperAdmin ? a.name.localeCompare(b.name) : a.isSuperAdmin ? -1 : 1
  )
}

// ── User search (for the grant-role picker) ─────────────────────────────────

export interface StaffUserDTO {
  id: string
  name: string
  email: string | null
  role: string
}

export async function searchUsers(actor: RbacActor, query: string): Promise<StaffUserDTO[]> {
  const ctx = await getActorContext(actor)
  const q = query.trim()
  if (q.length < 2) return []
  const users = await db.user.findMany({
    where: {
      status: 'ACTIVE',
      OR: [{ email: { contains: q } }, { name: { contains: q } }],
    },
    select: { id: true, name: true, email: true, role: true },
    take: 10,
    orderBy: { createdAt: 'desc' },
  })
  // RBACSEC-1: legacy ADMIN accounts are invisible to non-super-admin staff.
  return users.filter((u) => ctx.isSuperAdmin || u.role !== 'ADMIN')
}

// ── Staff invitations ────────────────────────────────────────────────────────

export interface InvitationDTO {
  id: string
  email: string
  name: string | null
  roleId: string
  roleKey: string
  roleName: string
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED'
  invitedByName: string | null
  expiresAt: string
  createdAt: string
  token: string
}

type InvitationRow = {
  id: string
  email: string
  name: string | null
  token: string
  status: string
  invitedByName: string | null
  expiresAt: Date
  createdAt: Date
  roleId: string
  role: { id: string; key: string; name: string; isProtected: boolean }
}

function toInvitationDTO(inv: InvitationRow): InvitationDTO {
  return {
    id: inv.id,
    email: inv.email,
    name: inv.name,
    roleId: inv.role.id,
    roleKey: inv.role.key,
    roleName: inv.role.name,
    status: inv.status === 'ACCEPTED' ? 'ACCEPTED' : inv.status === 'REVOKED' ? 'REVOKED' : 'PENDING',
    invitedByName: inv.invitedByName,
    expiresAt: inv.expiresAt.toISOString(),
    createdAt: inv.createdAt.toISOString(),
    token: inv.token,
  }
}

export async function listInvitations(actor: RbacActor): Promise<InvitationDTO[]> {
  const ctx = await getActorContext(actor)
  const invitations = await db.staffInvitation.findMany({
    include: { role: { select: { id: true, key: true, name: true, isProtected: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  // RBACSEC-1: invitations for protected roles are invisible to non-super-admins.
  return invitations.filter((i) => ctx.isSuperAdmin || !i.role.isProtected).map(toInvitationDTO)
}

export async function createInvitation(
  actor: RbacActor,
  input: { email: string; name?: string | null; roleId: string }
): Promise<InvitationDTO> {
  const ctx = await getActorContext(actor)
  const email = input.email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new RbacServiceError('Enter a valid email address')
  const role = await db.role.findUnique({
    where: { id: input.roleId },
    include: { permissions: { select: { permissionKey: true } } },
  })
  if (!role) throw new RbacServiceError('Role not found', 404)
  if (role.scope !== 'PLATFORM') throw new RbacServiceError('Invitations currently target platform roles only')
  // RBACSEC-1: no inviting people as super-admin / org.owner unless you are one.
  assertCanSeeRole(ctx, role)
  // RBACSEC-1: privilege bracketing on invitations too.
  ensureWithinBracket(ctx, role.permissions.map((p) => p.permissionKey), `invite staff to "${role.name}"`)

  const existingUser = await db.user.findUnique({ where: { email }, select: { id: true } })
  if (existingUser) {
    throw new RbacServiceError('This email already has an account — grant the role to the existing user instead', 409)
  }
  const openInvite = await db.staffInvitation.findFirst({
    where: { email, status: 'PENDING', expiresAt: { gt: new Date() } },
  })
  if (openInvite) throw new RbacServiceError('An open invitation for this email already exists', 409)

  const invitation = await db.staffInvitation.create({
    data: {
      email,
      name: input.name?.trim() || null,
      roleId: role.id,
      organizationId: '',
      token: randomBytes(24).toString('hex'),
      status: 'PENDING',
      invitedBy: actor.id,
      invitedByName: actor.name,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
    include: { role: { select: { id: true, key: true, name: true, isProtected: true } } },
  })

  await recordAudit({
    actorId: actor.id,
    actorType: 'ADMIN',
    action: 'STAFF_INVITED',
    entityType: 'StaffInvitation',
    entityId: invitation.id,
    summary: `Staff invitation sent to ${email} for role "${role.name}"`,
    metadata: { email, roleKey: role.key, expiresAt: invitation.expiresAt.toISOString() },
  })
  return toInvitationDTO(invitation)
}

export async function revokeInvitation(actor: RbacActor, id: string): Promise<void> {
  const invitation = await db.staffInvitation.findUnique({
    where: { id },
    include: { role: { select: { key: true } } },
  })
  if (!invitation) throw new RbacServiceError('Invitation not found', 404)
  if (invitation.status !== 'PENDING') throw new RbacServiceError('Only pending invitations can be revoked', 409)
  await db.staffInvitation.update({ where: { id }, data: { status: 'REVOKED' } })
  await recordAudit({
    actorId: actor.id,
    actorType: 'ADMIN',
    action: 'STAFF_INVITATION_REVOKED',
    entityType: 'StaffInvitation',
    entityId: id,
    summary: `Staff invitation to ${invitation.email} revoked`,
    metadata: { email: invitation.email },
  })
}

/**
 * Consume a pending invitation at registration time. Returns the platform
 * role to assign when the token is valid + matches the registering email.
 */
export async function consumeInvitation(
  email: string,
  token: string
): Promise<{ roleId: string; roleName: string } | null> {
  const invitation = await db.staffInvitation.findUnique({
    where: { token },
    include: { role: { select: { id: true, name: true, scope: true } } },
  })
  if (
    !invitation ||
    invitation.status !== 'PENDING' ||
    invitation.role.scope !== 'PLATFORM' ||
    invitation.email !== email.toLowerCase() ||
    invitation.expiresAt < new Date()
  ) {
    return null
  }
  await db.staffInvitation.update({ where: { id: invitation.id }, data: { status: 'ACCEPTED', acceptedAt: new Date() } })
  return { roleId: invitation.roleId, roleName: invitation.role.name }
}
