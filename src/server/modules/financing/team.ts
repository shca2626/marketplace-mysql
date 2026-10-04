import { randomBytes } from 'crypto'
import { sha256Hex } from '@/lib/secret-box'
import { db } from '@/lib/db'
import { recordAudit } from '@/server/modules/audit/service'
import { FinancingError, requireFinancierContext } from './shared'

// ─────────────────────────────────────────────────────────────────────────────
// FINANCIER TEAM — institution staff management (Phase 5.2).
//
// The lender-console sibling of org team management, running on the Phase 2
// RBAC substrate: granular org-scoped roles (financier.admin / underwriter /
// reviewer / branch-officer) on top of a VIEWER OrganizationMember row. The
// caller must be an OWNER/ADMIN member of the active institution — the same
// gate the console itself uses.
// ─────────────────────────────────────────────────────────────────────────────

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** ORG-scoped roles an institution may hand out (seeded system roles). */
export const INSTITUTION_ASSIGNABLE_ROLE_KEYS = [
  'financier.admin',
  'financier.underwriter',
  'financier.reviewer',
  'financier.branch-officer',
] as const

export interface TeamMemberDTO {
  userId: string
  name: string
  email: string | null
  phone: string | null
  memberRole: string // OrganizationMember.role (OWNER for founders)
  joinedAt: string
  /** Granular org-scoped role assignments (financier.* keys). */
  financierRoles: { roleId: string; roleKey: string; roleName: string }[]
}

export interface TeamInvitationDTO {
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
  /** Phase 6 (6.5): raw token shown once at creation only; omitted in lists. */
  token?: string
}

export interface InstitutionTeamDTO {
  members: TeamMemberDTO[]
  invitations: TeamInvitationDTO[]
  assignableRoles: { id: string; key: string; name: string; description: string | null; permissions: string[] }[]
  myMemberRole: string
}

async function requireInstitutionAdmin(userId: string) {
  const ctx = await requireFinancierContext(userId)
  // @@unique([organizationId, userId]) → compound key is organizationId_userId
  // (field order in the schema defines the Prisma compound-key name).
  const me = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: ctx.organizationId, userId } },
    select: { role: true },
  })
  if (!me || (me.role !== 'OWNER' && me.role !== 'ADMIN')) {
    throw new FinancingError('Only institution owners and admins can manage the team', 403)
  }
  return { ctx, myMemberRole: me.role }
}

export async function listInstitutionTeam(userId: string): Promise<InstitutionTeamDTO> {
  const { ctx, myMemberRole } = await requireInstitutionAdmin(userId)

  const [members, assignments, invitations, assignable] = await Promise.all([
    db.organizationMember.findMany({
      where: { organizationId: ctx.organizationId },
      include: { user: { select: { id: true, name: true, email: true, phone: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    db.userRole.findMany({
      where: { organizationId: ctx.organizationId },
      include: { role: { select: { id: true, key: true, name: true } }, user: { select: { id: true } } },
    }),
    db.staffInvitation.findMany({
      where: { organizationId: ctx.organizationId },
      include: { role: { select: { id: true, key: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    db.role.findMany({
      where: { key: { in: [...INSTITUTION_ASSIGNABLE_ROLE_KEYS] } },
      include: { permissions: { select: { permissionKey: true } } },
      orderBy: { key: 'asc' },
    }),
  ])

  const rolesByUser = new Map<string, TeamMemberDTO['financierRoles']>()
  for (const a of assignments) {
    const list = rolesByUser.get(a.userId) ?? []
    list.push({ roleId: a.role.id, roleKey: a.role.key, roleName: a.role.name })
    rolesByUser.set(a.userId, list)
  }

  return {
    members: members.map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      phone: m.user.phone,
      memberRole: m.role,
      joinedAt: m.createdAt.toISOString(),
      financierRoles: rolesByUser.get(m.user.id) ?? [],
    })),
    invitations: invitations.map((i) => ({
      id: i.id,
      email: i.email,
      name: i.name,
      roleId: i.role.id,
      roleKey: i.role.key,
      roleName: i.role.name,
      status: i.status === 'ACCEPTED' ? 'ACCEPTED' : i.status === 'REVOKED' ? 'REVOKED' : 'PENDING',
      invitedByName: i.invitedByName,
      expiresAt: i.expiresAt.toISOString(),
      createdAt: i.createdAt.toISOString(),
      // token omitted — only the SHA-256 hash is stored (6.5)
    })),
    assignableRoles: assignable.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      permissions: r.permissions.map((p) => p.permissionKey),
    })),
    myMemberRole,
  }
}

export async function inviteInstitutionStaff(
  userId: string,
  actorName: string,
  input: { email: string; name?: string | null; roleKey: string }
): Promise<TeamInvitationDTO> {
  const { ctx } = await requireInstitutionAdmin(userId)
  const email = input.email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new FinancingError('Enter a valid email address')
  }
  if (!INSTITUTION_ASSIGNABLE_ROLE_KEYS.includes(input.roleKey as (typeof INSTITUTION_ASSIGNABLE_ROLE_KEYS)[number])) {
    throw new FinancingError('That role cannot be assigned to institution staff')
  }
  const role = await db.role.findUnique({ where: { key: input.roleKey } })
  if (!role) throw new FinancingError('Role not found — run the RBAC seed', 404)

  const existingUser = await db.user.findUnique({ where: { email }, select: { id: true } })
  if (existingUser) {
    throw new FinancingError('This email already has an account — assign the role to them below instead', 409)
  }
  const alreadyMember = await db.organizationMember.findFirst({
    where: { organizationId: ctx.organizationId, user: { email } },
    select: { id: true },
  })
  if (alreadyMember) throw new FinancingError('This person is already on the institution team', 409)
  const openInvite = await db.staffInvitation.findFirst({
    where: { email, organizationId: ctx.organizationId, status: 'PENDING', expiresAt: { gt: new Date() } },
  })
  if (openInvite) throw new FinancingError('An open invitation for this email already exists', 409)

  const rawToken = randomBytes(24).toString('hex')
  const invitation = await db.staffInvitation.create({
    data: {
      email,
      name: input.name?.trim() || null,
      roleId: role.id,
      organizationId: ctx.organizationId,
      tokenHash: sha256Hex(rawToken), // Phase 6 (6.5): hash at rest — raw shown once
      status: 'PENDING',
      invitedBy: userId,
      invitedByName: actorName,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
    include: { role: { select: { id: true, key: true, name: true } } },
  })

  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'INSTITUTION_STAFF_INVITED',
    entityType: 'StaffInvitation',
    entityId: invitation.id,
    summary: `${ctx.organizationName} invited ${email} as ${role.name}`,
    metadata: { email, roleKey: role.key, organizationId: ctx.organizationId },
  })

  return {
    id: invitation.id,
    email: invitation.email,
    name: invitation.name,
    roleId: invitation.role.id,
    roleKey: invitation.role.key,
    roleName: invitation.role.name,
    status: 'PENDING',
    invitedByName: invitation.invitedByName,
    expiresAt: invitation.expiresAt.toISOString(),
    createdAt: invitation.createdAt.toISOString(),
    token: rawToken, // one-time display — the stored value is the hash
  }
}

/** Swap the granular role of an existing team member (financier.* keys). */
export async function setMemberRole(
  userId: string,
  input: { memberUserId: string; roleKey: string | null }
): Promise<void> {
  const { ctx } = await requireInstitutionAdmin(userId)
  if (input.memberUserId === userId) {
    throw new FinancingError('You cannot change your own role — ask another institution admin')
  }
  const member = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: ctx.organizationId, userId: input.memberUserId } },
    select: { role: true },
  })
  if (!member) throw new FinancingError('Team member not found', 404)
  if (member.role === 'OWNER') throw new FinancingError('The institution owner cannot be reassigned', 409)

  // Clear current granular assignments, then set the new one (if any).
  await db.userRole.deleteMany({
    where: { userId: input.memberUserId, organizationId: ctx.organizationId, role: { key: { startsWith: 'financier.' } } },
  })
  if (input.roleKey) {
    if (!INSTITUTION_ASSIGNABLE_ROLE_KEYS.includes(input.roleKey as (typeof INSTITUTION_ASSIGNABLE_ROLE_KEYS)[number])) {
      throw new FinancingError('That role cannot be assigned to institution staff')
    }
    const role = await db.role.findUnique({ where: { key: input.roleKey } })
    if (!role) throw new FinancingError('Role not found — run the RBAC seed', 404)
    await db.userRole.create({
      data: { userId: input.memberUserId, roleId: role.id, organizationId: ctx.organizationId },
    })
  }

  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'INSTITUTION_STAFF_ROLE_CHANGED',
    entityType: 'OrganizationMember',
    entityId: input.memberUserId,
    summary: `${ctx.organizationName} staff role set to ${input.roleKey ?? 'none'}`,
    metadata: { organizationId: ctx.organizationId, roleKey: input.roleKey },
  })
}

/** Remove a team member (membership + granular roles). Owners are protected. */
export async function removeMember(userId: string, memberUserId: string): Promise<void> {
  const { ctx } = await requireInstitutionAdmin(userId)
  if (memberUserId === userId) throw new FinancingError('You cannot remove yourself from the team')
  const member = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: ctx.organizationId, userId: memberUserId } },
    select: { role: true },
  })
  if (!member) throw new FinancingError('Team member not found', 404)
  if (member.role === 'OWNER') throw new FinancingError('The institution owner cannot be removed', 409)

  await db.$transaction([
    db.userRole.deleteMany({
      where: { userId: memberUserId, organizationId: ctx.organizationId },
    }),
    db.organizationMember.delete({
      where: { organizationId_userId: { organizationId: ctx.organizationId, userId: memberUserId } },
    }),
  ])

  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'INSTITUTION_STAFF_REMOVED',
    entityType: 'OrganizationMember',
    entityId: memberUserId,
    summary: `Removed from ${ctx.organizationName}`,
    metadata: { organizationId: ctx.organizationId },
  })
}

export async function revokeInstitutionInvitation(userId: string, invitationId: string): Promise<void> {
  const { ctx } = await requireInstitutionAdmin(userId)
  const invitation = await db.staffInvitation.findUnique({ where: { id: invitationId } })
  if (!invitation || invitation.organizationId !== ctx.organizationId) {
    throw new FinancingError('Invitation not found', 404)
  }
  if (invitation.status !== 'PENDING') throw new FinancingError('Only pending invitations can be revoked', 409)
  await db.staffInvitation.update({ where: { id: invitationId }, data: { status: 'REVOKED' } })
  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'INSTITUTION_STAFF_INVITATION_REVOKED',
    entityType: 'StaffInvitation',
    entityId: invitationId,
    summary: `${ctx.organizationName} revoked the invitation to ${invitation.email}`,
    metadata: { email: invitation.email },
  })
}
