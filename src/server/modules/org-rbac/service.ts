import { randomBytes, createHash } from 'crypto'
import { db } from '@/lib/db'
import { isPlatformPermission, orgTypeAllowlist, ORG_ROLE_BY_LEGACY } from '@/lib/rbac-catalog'
import { recordAudit } from '@/server/modules/audit/service'

// ─────────────────────────────────────────────────────────────────────────────
// ORG-RBAC SERVICE — canonical organization-scope RBAC (Phase 2).
//
// Backs the Team & Roles console INSIDE an organization:
//   • Members: list, change legacy role, remove (last-owner protected), leave
//   • Custom org roles: create / update / delete — permission set must stay
//     within the organization type's allowlist. Organization OWNERS hold every
//     ORG permission for their org type (no delegation ceiling); they can
//     never grant PLATFORM permissions.
//   • Assignments: grant multiple roles per member, optionally store-scoped
//   • Invitations: email invites carrying an org role, revocable, expiring
//
// Every sensitive change and every authorization denial is audited. Nothing
// is cached — revocations are effective immediately.
// ─────────────────────────────────────────────────────────────────────────────

export class OrgRbacError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const ASSIGNABLE_MEMBERSHIP_ROLES = ['ADMIN', 'BUYER', 'APPROVER', 'VIEWER'] as const

async function requireMembership(userId: string, organizationId: string) {
  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    include: { organization: true },
  })
  if (!membership) throw new OrgRbacError('You are not a member of this organization', 403)
  return membership
}

/** Owner or org.members.manage holder — the actor for every admin op here. */
async function requireOrgManage(userId: string, organizationId: string, permission = 'org.members.manage') {
  const membership = await requireMembership(userId, organizationId)
  const allow = orgTypeAllowlist(membership.organization.orgType)
  if (!allow.includes(permission)) {
    throw new OrgRbacError('This organization type cannot manage teams', 403)
  }
  if (membership.role === 'OWNER') return membership
  const held = await db.userRole.count({
    where: { userId, organizationId, role: { permissions: { some: { permissionKey: permission } } } },
  })
  // Legacy bridge — same mapping the authz evaluator applies, so a legacy
  // ADMIN member keeps managing the team until canonical assignments exist.
  if (held === 0 && !legacyMembershipGrants(membership.role).includes(permission)) {
    await recordAudit({
      actorId: userId,
      actorType: 'USER',
      action: 'AUTHZ_DENIED',
      entityType: 'Organization',
      entityId: organizationId,
      summary: 'Denied ' + permission + ' in "' + membership.organization.name + '"',
      metadata: { permission, organizationId },
    })
    throw new OrgRbacError('This action requires the "' + permission + '" permission', 403)
  }
  return membership
}

/** Legacy OrganizationMember.role → permissions (mirrors the authz evaluator bridge). */
function legacyMembershipGrants(role: string): string[] {
  switch (role) {
    case 'ADMIN':
      return ['org.profile.view', 'org.profile.update', 'org.members.invite', 'org.orders.view', 'org.rfq.view', 'org.rfq.create', 'org.approvals.manage', 'org.pricelists.view', 'org.finance.view', 'org.finance.apply']
    case 'BUYER':
      return ['org.profile.view', 'org.orders.view', 'org.rfq.view', 'org.rfq.create', 'org.pricelists.view', 'org.finance.view', 'org.finance.apply']
    case 'APPROVER':
      return ['org.profile.view', 'org.approvals.manage', 'org.orders.view', 'org.rfq.view']
    case 'VIEWER':
      return ['org.profile.view', 'org.orders.view', 'org.rfq.view']
    default:
      return []
  }
}

async function countActiveOwners(organizationId: string): Promise<number> {
  return db.organizationMember.count({ where: { organizationId, role: 'OWNER' } })
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'role'
  )
}

// ── Members ─────────────────────────────────────────────────────────────────

export interface OrgMemberDTO {
  id: string
  userId: string
  name: string
  email: string
  membershipRole: string
  jobTitle: string | null
  isOwner: boolean
  roles: { assignmentId: string; roleId: string; roleName: string; roleKey: string; storeId: string; isCustom: boolean }[]
  createdAt: string
}

export async function listOrgMembers(actorUserId: string, organizationId: string): Promise<OrgMemberDTO[]> {
  await requireMembership(actorUserId, organizationId)
  const members = await db.organizationMember.findMany({
    where: { organizationId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  })
  const assignments = await db.userRole.findMany({
    where: { organizationId, user: { id: { in: members.map((m) => m.userId) } } },
    include: { role: true },
  })
  return members.map((m) => ({
    id: m.id,
    userId: m.user.id,
    name: m.user.name,
    email: m.user.email,
    membershipRole: m.role,
    jobTitle: m.jobTitle,
    isOwner: m.role === 'OWNER',
    roles: assignments
      .filter((a) => a.userId === m.userId)
      .map((a) => ({
        assignmentId: a.id,
        roleId: a.role.id,
        roleName: a.role.name,
        roleKey: a.role.key,
        storeId: a.storeId,
        isCustom: !a.role.isSystem,
      })),
    createdAt: m.createdAt.toISOString(),
  }))
}

export async function changeMemberRole(
  actorUserId: string,
  organizationId: string,
  memberUserId: string,
  newRole: string
): Promise<OrgMemberDTO> {
  const actor = await requireOrgManage(actorUserId, organizationId)
  const role = newRole.toUpperCase()
  if (!(ASSIGNABLE_MEMBERSHIP_ROLES as readonly string[]).includes(role)) {
    throw new OrgRbacError('Role must be one of ' + ASSIGNABLE_MEMBERSHIP_ROLES.join(', ') + ' (ownership is transferred, not assigned)')
  }
  const target = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: memberUserId } },
  })
  if (!target) throw new OrgRbacError('Member not found', 404)

  if (target.role === 'OWNER') {
    if (actor.role !== 'OWNER') throw new OrgRbacError('Only an owner can change another owner', 403)
    if ((await countActiveOwners(organizationId)) <= 1) {
      await recordAudit({
        actorId: actorUserId,
        actorType: 'USER',
        action: 'AUTHZ_DENIED',
        entityType: 'Organization',
        entityId: organizationId,
        summary: 'Blocked last-owner role change',
        metadata: { memberUserId, newRole },
      })
      throw new OrgRbacError('Cannot change the last active owner — transfer ownership or promote another owner first', 409)
    }
  }

  const updated = await db.$transaction(async (tx) => {
    const m = await tx.organizationMember.update({
      where: { id: target.id },
      data: { role },
      include: { user: { select: { id: true, name: true, email: true } } },
    })
    // Keep the canonical assignment in sync with the legacy membership role.
    const systemKey = ORG_ROLE_BY_LEGACY[role]
    if (systemKey) {
      const sysRole = await tx.role.findUnique({ where: { key: systemKey } })
      if (sysRole) {
        const stale = await tx.role.findMany({
          where: { scope: 'ORG', isSystem: true, key: { in: Object.values(ORG_ROLE_BY_LEGACY) } },
          select: { id: true },
        })
        await tx.userRole.deleteMany({
          where: { organizationId, userId: memberUserId, roleId: { in: stale.map((r) => r.id) } },
        })
        await tx.userRole.create({
          data: { userId: memberUserId, roleId: sysRole.id, organizationId, assignedBy: actorUserId },
        })
      }
    }
    return m
  }, { timeout: 15000 })

  await recordAudit({
    actorId: actorUserId,
    actorType: 'USER',
    action: 'ORG_MEMBER_ROLE_CHANGED',
    entityType: 'Organization',
    entityId: organizationId,
    summary: updated.user.name + ' role changed ' + target.role + ' → ' + role,
    metadata: { memberUserId, from: target.role, to: role },
  })

  return {
    id: updated.id,
    userId: updated.user.id,
    name: updated.user.name,
    email: updated.user.email,
    membershipRole: updated.role,
    jobTitle: updated.jobTitle,
    isOwner: updated.role === 'OWNER',
    roles: [],
    createdAt: updated.createdAt.toISOString(),
  }
}

export async function removeMember(actorUserId: string, organizationId: string, memberUserId: string): Promise<void> {
  const actor = await requireOrgManage(actorUserId, organizationId)
  const target = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: memberUserId } },
  })
  if (!target) throw new OrgRbacError('Member not found', 404)
  if (target.userId === actorUserId) throw new OrgRbacError('Use "leave organization" to remove yourself', 400)
  if (target.role === 'OWNER') {
    if (actor.role !== 'OWNER') throw new OrgRbacError('Only an owner can remove another owner', 403)
    if ((await countActiveOwners(organizationId)) <= 1) {
      await recordAudit({
        actorId: actorUserId,
        actorType: 'USER',
        action: 'AUTHZ_DENIED',
        entityType: 'Organization',
        entityId: organizationId,
        summary: 'Blocked last-owner removal',
        metadata: { memberUserId },
      })
      throw new OrgRbacError('Cannot remove the last active owner — transfer ownership first', 409)
    }
  }

  await db.$transaction(async (tx) => {
    await tx.organizationMember.delete({ where: { id: target.id } })
    await tx.userRole.deleteMany({ where: { organizationId, userId: memberUserId } })
  }, { timeout: 15000 })

  await recordAudit({
    actorId: actorUserId,
    actorType: 'USER',
    action: 'ORG_MEMBER_REMOVED',
    entityType: 'Organization',
    entityId: organizationId,
    summary: 'Member ' + memberUserId + ' removed; org role assignments revoked',
    metadata: { memberUserId, wasRole: target.role },
  })
}

export async function leaveOrganization(userId: string, organizationId: string): Promise<void> {
  const membership = await requireMembership(userId, organizationId)
  if (membership.role === 'OWNER') {
    if ((await countActiveOwners(organizationId)) <= 1) {
      throw new OrgRbacError('You are the last active owner — transfer ownership before leaving', 409)
    }
  }
  await db.$transaction(async (tx) => {
    await tx.organizationMember.delete({ where: { id: membership.id } })
    await tx.userRole.deleteMany({ where: { organizationId, userId } })
  }, { timeout: 15000 })
  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'ORG_MEMBER_LEFT',
    entityType: 'Organization',
    entityId: organizationId,
    summary: 'Member left organization',
    metadata: { userId },
  })
}

// ── Custom org roles ────────────────────────────────────────────────────────

export interface OrgRoleDTO {
  id: string
  key: string
  name: string
  description: string | null
  isSystem: boolean
  isProtected: boolean
  memberCount: number
  permissions: string[]
}

export async function listOrgRoles(actorUserId: string, organizationId: string): Promise<OrgRoleDTO[]> {
  const membership = await requireMembership(actorUserId, organizationId)
  const orgType = membership.organization.orgType
  const allow = new Set(orgTypeAllowlist(orgType))
  const roles = await db.role.findMany({
    where: { scope: 'ORG', OR: [{ organizationId }, { isSystem: true }] },
    include: { permissions: { select: { permissionKey: true } }, _count: { select: { assignments: true } } },
    orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
  })
  return roles
    .filter((r) => r.permissions.every((p) => allow.has(p.permissionKey)))
    .map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      isProtected: r.isProtected,
      memberCount: r._count.assignments,
      permissions: r.permissions.map((p) => p.permissionKey),
    }))
}

async function validatePermissionSet(organizationId: string, orgType: string, keys: string[]): Promise<void> {
  if (keys.length === 0) throw new OrgRbacError('A role needs at least one permission')
  const allow = orgTypeAllowlist(orgType)
  const platformKeys = keys.filter(isPlatformPermission)
  if (platformKeys.length > 0) {
    throw new OrgRbacError('Platform permissions cannot be granted inside an organization: ' + platformKeys.slice(0, 3).join(', '))
  }
  const invalid = keys.filter((k) => !allow.includes(k))
  if (invalid.length > 0) {
    throw new OrgRbacError('Permissions not available to ' + orgType + ' organizations: ' + invalid.slice(0, 3).join(', '))
  }
  const existing = await db.permission.findMany({ where: { key: { in: keys } }, select: { key: true } })
  const missing = keys.filter((k) => !existing.some((e) => e.key === k))
  if (missing.length > 0) throw new OrgRbacError('Unknown permissions: ' + missing.slice(0, 3).join(', '))
}

export async function createOrgRole(
  actorUserId: string,
  organizationId: string,
  input: { name: string; description?: string | null; permissions: string[] }
): Promise<OrgRoleDTO> {
  await requireOrgManage(actorUserId, organizationId, 'org.members.manage')
  const org = await db.organization.findUnique({ where: { id: organizationId } })
  if (!org) throw new OrgRbacError('Organization not found', 404)
  const name = input.name.trim()
  if (name.length < 2 || name.length > 60) throw new OrgRbacError('Role name must be 2–60 characters')
  await validatePermissionSet(organizationId, org.orgType, input.permissions)

  const base = 'custom.org.' + org.slug + '.' + slugify(name)
  let key = base
  for (let i = 2; (await db.role.findUnique({ where: { key } })) !== null; i++) key = base + '-' + i

  const role = await db.role.create({
    data: {
      key,
      name,
      description: input.description?.trim() || null,
      scope: 'ORG',
      organizationId,
      permissions: { create: input.permissions.map((permissionKey) => ({ permissionKey })) },
    },
    include: { permissions: { select: { permissionKey: true } } },
  })
  await recordAudit({
    actorId: actorUserId,
    actorType: 'USER',
    action: 'ORG_ROLE_CREATED',
    entityType: 'Role',
    entityId: role.id,
    summary: 'Custom role "' + name + '" created',
    metadata: { organizationId, permissions: input.permissions },
  })
  return { id: role.id, key: role.key, name: role.name, description: role.description, isSystem: false, isProtected: false, memberCount: 0, permissions: role.permissions.map((p) => p.permissionKey) }
}

export async function updateOrgRole(
  actorUserId: string,
  organizationId: string,
  roleId: string,
  input: { name?: string; description?: string | null; permissions?: string[] }
): Promise<OrgRoleDTO> {
  await requireOrgManage(actorUserId, organizationId, 'org.members.manage')
  const org = await db.organization.findUnique({ where: { id: organizationId } })
  if (!org) throw new OrgRbacError('Organization not found', 404)
  const role = await db.role.findUnique({ where: { id: roleId }, include: { permissions: { select: { permissionKey: true } } } })
  if (!role || role.scope !== 'ORG' || role.organizationId !== organizationId) {
    throw new OrgRbacError('Role not found', 404)
  }
  if (role.isProtected) throw new OrgRbacError('This role is protected', 403)
  if (role.isSystem) {
    throw new OrgRbacError('System roles are managed by the platform — clone one instead', 403)
  }
  const nextPermissions = input.permissions ?? role.permissions.map((p) => p.permissionKey)
  await validatePermissionSet(organizationId, org.orgType, nextPermissions)

  const updated = await db.$transaction(async (tx) => {
    const r = await tx.role.update({
      where: { id: roleId },
      data: {
        name: input.name !== undefined ? input.name.trim() : undefined,
        description: input.description !== undefined ? input.description?.trim() || null : undefined,
      },
    })
    if (input.permissions) {
      const current = new Set(role.permissions.map((p) => p.permissionKey))
      const next = new Set(input.permissions)
      await tx.rolePermission.createMany({
        data: [...next].filter((k) => !current.has(k)).map((permissionKey) => ({ roleId, permissionKey })),
      })
      await tx.rolePermission.deleteMany({
        where: { roleId, permissionKey: { in: [...current].filter((k) => !next.has(k)) } },
      })
    }
    return tx.role.findUniqueOrThrow({
      where: { id: roleId },
      include: { permissions: { select: { permissionKey: true } }, _count: { select: { assignments: true } } },
    })
  }, { timeout: 15000 })

  await recordAudit({
    actorId: actorUserId,
    actorType: 'USER',
    action: 'ORG_ROLE_UPDATED',
    entityType: 'Role',
    entityId: roleId,
    summary: 'Custom role "' + updated.name + '" updated',
    metadata: { organizationId, permissions: updated.permissions.map((p) => p.permissionKey) },
  })
  return { id: updated.id, key: updated.key, name: updated.name, description: updated.description, isSystem: false, isProtected: false, memberCount: updated._count.assignments, permissions: updated.permissions.map((p) => p.permissionKey) }
}

export async function deleteOrgRole(actorUserId: string, organizationId: string, roleId: string): Promise<{ revoked: number }> {
  await requireOrgManage(actorUserId, organizationId, 'org.members.manage')
  const role = await db.role.findUnique({ where: { id: roleId }, include: { _count: { select: { assignments: true } } } })
  if (!role || role.scope !== 'ORG' || role.organizationId !== organizationId) {
    throw new OrgRbacError('Role not found', 404)
  }
  if (role.isSystem || role.isProtected) throw new OrgRbacError('System roles cannot be deleted here', 403)
  const revoked = await db.$transaction(async (tx) => {
    const removed = await tx.userRole.deleteMany({ where: { roleId } })
    await tx.role.delete({ where: { id: roleId } })
    return removed.count
  }, { timeout: 15000 })
  await recordAudit({
    actorId: actorUserId,
    actorType: 'USER',
    action: 'ORG_ROLE_DELETED',
    entityType: 'Role',
    entityId: roleId,
    summary: 'Custom role "' + role.name + '" deleted (' + revoked + ' assignments revoked)',
    metadata: { organizationId, revoked },
  })
  return { revoked }
}

// ── Assignments ─────────────────────────────────────────────────────────────

export async function assignOrgRole(
  actorUserId: string,
  organizationId: string,
  input: { userId: string; roleId: string; storeId?: string | null }
): Promise<{ assignmentId: string }> {
  await requireOrgManage(actorUserId, organizationId, 'org.members.manage')
  const org = await db.organization.findUnique({ where: { id: organizationId } })
  if (!org) throw new OrgRbacError('Organization not found', 404)
  const member = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: input.userId } },
  })
  if (!member) throw new OrgRbacError('That user is not a member of this organization', 404)
  const role = await db.role.findUnique({ where: { id: input.roleId }, include: { permissions: { select: { permissionKey: true } } } })
  if (!role || role.scope !== 'ORG') throw new OrgRbacError('Role not found', 404)
  if (role.organizationId !== organizationId && !role.isSystem) {
    throw new OrgRbacError('This role belongs to another organization', 403)
  }
  const allow = orgTypeAllowlist(org.orgType)
  const invalid = role.permissions.filter((p) => !allow.includes(p.permissionKey))
  if (invalid.length > 0) throw new OrgRbacError('Role includes permissions not available to ' + org.orgType + ' organizations', 403)
  let storeId = ''
  if (input.storeId) {
    const store = await db.store.findFirst({ where: { id: input.storeId, organizationId } })
    if (!store) throw new OrgRbacError('Store not found in this organization', 404)
    storeId = store.id
  }
  const assignment = await db.userRole.create({
    data: { userId: input.userId, roleId: role.id, organizationId, storeId, assignedBy: actorUserId },
  })
  await recordAudit({
    actorId: actorUserId,
    actorType: 'USER',
    action: 'ORG_ROLE_ASSIGNED',
    entityType: 'UserRole',
    entityId: assignment.id,
    summary: 'Role "' + role.name + '" assigned in ' + org.name + (storeId ? ' (store-scoped)' : ''),
    metadata: { organizationId, userId: input.userId, roleKey: role.key, storeId },
  })
  return { assignmentId: assignment.id }
}

export async function revokeOrgRoleAssignment(actorUserId: string, organizationId: string, assignmentId: string): Promise<void> {
  await requireOrgManage(actorUserId, organizationId, 'org.members.manage')
  const assignment = await db.userRole.findUnique({ where: { id: assignmentId }, include: { role: true } })
  if (!assignment || assignment.organizationId !== organizationId) throw new OrgRbacError('Assignment not found', 404)
  await db.userRole.delete({ where: { id: assignmentId } })
  await recordAudit({
    actorId: actorUserId,
    actorType: 'USER',
    action: 'ORG_ROLE_REVOKED',
    entityType: 'UserRole',
    entityId: assignmentId,
    summary: 'Role "' + assignment.role.name + '" revoked (effective immediately)',
    metadata: { organizationId, userId: assignment.userId },
  })
}

// ── Invitations ─────────────────────────────────────────────────────────────

export interface OrgInvitationDTO {
  id: string
  email: string
  name: string | null
  roleKey: string
  roleName: string
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED'
  invitedByName: string | null
  expiresAt: string
  createdAt: string
  /** Raw token — returned exactly ONCE at creation; null on list rows (hash at rest). */
  token: string | null
}

export async function listOrgInvitations(actorUserId: string, organizationId: string): Promise<OrgInvitationDTO[]> {
  await requireOrgManage(actorUserId, organizationId, 'org.members.invite')
  const invitations = await db.staffInvitation.findMany({
    where: { organizationId },
    include: { role: { select: { key: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  const now = Date.now()
  return invitations.map((i) => ({
    id: i.id,
    email: i.email,
    name: i.name,
    roleKey: i.role.key,
    roleName: i.role.name,
    status: i.status === 'ACCEPTED' ? 'ACCEPTED' : i.status === 'REVOKED' ? 'REVOKED' : i.expiresAt.getTime() < now ? 'EXPIRED' : 'PENDING',
    invitedByName: i.invitedByName,
    expiresAt: i.expiresAt.toISOString(),
    createdAt: i.createdAt.toISOString(),
    token: null, // hashed at rest — the raw token only exists at creation time
  }))
}

export async function createOrgInvitation(
  actorUserId: string,
  organizationId: string,
  input: { email: string; name?: string | null; roleId: string }
): Promise<OrgInvitationDTO> {
  await requireOrgManage(actorUserId, organizationId, 'org.members.invite')
  const org = await db.organization.findUnique({ where: { id: organizationId } })
  if (!org) throw new OrgRbacError('Organization not found', 404)
  const email = input.email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new OrgRbacError('Enter a valid email address')
  const role = await db.role.findUnique({ where: { id: input.roleId }, include: { permissions: { select: { permissionKey: true } } } })
  if (!role || role.scope !== 'ORG') throw new OrgRbacError('Role not found', 404)
  if (role.organizationId !== organizationId && !role.isSystem) {
    throw new OrgRbacError('This role belongs to another organization', 403)
  }
  const allow = orgTypeAllowlist(org.orgType)
  const invalid = role.permissions.filter((p) => !allow.includes(p.permissionKey))
  if (invalid.length > 0) throw new OrgRbacError('Role includes permissions not available to ' + org.orgType + ' organizations', 403)

  const existingUser = await db.user.findUnique({ where: { email }, select: { id: true } })
  if (existingUser) {
    const alreadyMember = await db.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId: existingUser.id } },
    })
    if (alreadyMember) throw new OrgRbacError('That user is already a member', 409)
    throw new OrgRbacError('This email already has an account — add them as a member instead', 409)
  }
  const open = await db.staffInvitation.findFirst({
    where: { email, organizationId, status: 'PENDING', expiresAt: { gt: new Date() } },
  })
  if (open) throw new OrgRbacError('An open invitation for this email already exists', 409)

  // SUBSCRIPTION GATE (maxUsers): seller-org plans cap the team size — the
  // count includes pending invitations (a seat is reserved the moment it is
  // offered). Non-seller orgs are a no-op inside assertOrgLimit.
  const { assertOrgLimit } = await import('@/server/modules/subscriptions/service')
  const memberCount = await db.organizationMember.count({ where: { organizationId } })
  const pendingCount = await db.staffInvitation.count({
    where: { organizationId, status: 'PENDING', expiresAt: { gt: new Date() } },
  })
  await assertOrgLimit(organizationId, 'maxUsers', memberCount + pendingCount)

  const inviter = await db.user.findUnique({ where: { id: actorUserId }, select: { name: true } })
  const rawToken = randomBytes(24).toString('hex')
  const invitation = await db.staffInvitation.create({
    data: {
      email,
      name: input.name?.trim() || null,
      roleId: role.id,
      organizationId,
      tokenHash: createHash('sha256').update(rawToken).digest('hex'),
      status: 'PENDING',
      invitedBy: actorUserId,
      invitedByName: inviter?.name ?? null,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
    include: { role: { select: { key: true, name: true } } },
  })
  await recordAudit({
    actorId: actorUserId,
    actorType: 'USER',
    action: 'ORG_MEMBER_INVITED',
    entityType: 'StaffInvitation',
    entityId: invitation.id,
    summary: 'Invitation sent to ' + email + ' for role "' + role.name + '" in ' + org.name,
    metadata: { organizationId, email, roleKey: role.key },
  })
  return {
    id: invitation.id,
    email: invitation.email,
    name: invitation.name,
    roleKey: invitation.role.key,
    roleName: invitation.role.name,
    status: 'PENDING',
    invitedByName: invitation.invitedByName,
    expiresAt: invitation.expiresAt.toISOString(),
    createdAt: invitation.createdAt.toISOString(),
    token: rawToken, // shown ONCE to the inviter
  }
}

export async function revokeOrgInvitation(actorUserId: string, organizationId: string, invitationId: string): Promise<void> {
  await requireOrgManage(actorUserId, organizationId, 'org.members.invite')
  const invitation = await db.staffInvitation.findUnique({ where: { id: invitationId } })
  if (!invitation || invitation.organizationId !== organizationId) throw new OrgRbacError('Invitation not found', 404)
  if (invitation.status !== 'PENDING') throw new OrgRbacError('Only pending invitations can be revoked', 409)
  await db.staffInvitation.update({ where: { id: invitationId }, data: { status: 'REVOKED' } })
  await recordAudit({
    actorId: actorUserId,
    actorType: 'USER',
    action: 'ORG_INVITATION_REVOKED',
    entityType: 'StaffInvitation',
    entityId: invitationId,
    summary: 'Invitation to ' + invitation.email + ' revoked',
    metadata: { organizationId },
  })
}

/**
 * ATOMIC org-invitation claim — runs INSIDE the caller's transaction so the
 * membership create + role assignment + this claim commit or roll back
 * together (a failed registration can never burn the invitation, and a
 * concurrent double-claim aborts with count 0).
 */
export async function claimOrgInvitationTx(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  email: string,
  token: string
): Promise<{ invitationId: string; roleId: string; roleKey: string; roleName: string; organizationId: string } | null> {
  const invitation = await tx.staffInvitation.findUnique({
    where: { tokenHash: createHash('sha256').update(token).digest('hex') },
    include: { role: { select: { id: true, key: true, name: true, scope: true } } },
  })
  if (
    !invitation ||
    invitation.status !== 'PENDING' ||
    invitation.role.scope !== 'ORG' ||
    !invitation.organizationId ||
    invitation.email !== email.toLowerCase() ||
    invitation.expiresAt < new Date()
  ) {
    return null
  }
  const claimed = await tx.staffInvitation.updateMany({
    where: { id: invitation.id, status: 'PENDING' },
    data: { status: 'ACCEPTED', acceptedAt: new Date() },
  })
  if (claimed.count === 0) return null // consumed concurrently — abort
  return {
    invitationId: invitation.id,
    roleId: invitation.role.id,
    roleKey: invitation.role.key,
    roleName: invitation.role.name,
    organizationId: invitation.organizationId,
  }
}

/**
 * Grant an org invitation's role to an EXISTING user (accept-by-link when logged in).
 *
 * ATOMIC (invitation-acceptance hardening): the claim, the membership create
 * and the role grant commit in ONE transaction, and the claim itself is the
 * PENDING-guarded atomic flip from claimOrgInvitationTx — a concurrent
 * double-accept can never yield two grants (exactly one transaction wins the
 * PENDING → ACCEPTED update; the loser sees count 0 and aborts clean).
 */
export async function acceptOrgInvitationLoggedIn(userId: string, email: string, token: string): Promise<{ organizationName: string } | null> {
  const claim = await db.$transaction(async (tx) => {
    const claimed = await claimOrgInvitationTx(tx, email, token)
    if (!claimed) return null
    const org = await tx.organization.findUnique({
      where: { id: claimed.organizationId },
      select: { name: true },
    })
    if (!org) return null // org vanished — nothing commits
    const existing = await tx.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: claimed.organizationId, userId } },
    })
    if (!existing) {
      await tx.organizationMember.create({ data: { organizationId: claimed.organizationId, userId, role: 'VIEWER' } })
    }
    await tx.userRole.create({ data: { userId, roleId: claimed.roleId, organizationId: claimed.organizationId } })
    return { ...claimed, orgName: org.name }
  }, { timeout: 15000 })
  if (!claim) return null
  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'ORG_INVITATION_ACCEPTED',
    entityType: 'StaffInvitation',
    entityId: claim.invitationId,
    summary: 'Joined ' + claim.orgName + ' via invitation (role "' + claim.roleName + '")',
    metadata: { organizationId: claim.organizationId },
  })
  return { organizationName: claim.orgName }
}
