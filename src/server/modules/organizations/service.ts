import { db } from '@/lib/db'
import { recordAudit } from '@/server/modules/audit/service'
import type { OrganizationDTO, OrganizationMemberDTO, OrgRole } from '@/lib/types'

/**
 * ORGANIZATIONS — the B2B party graph.
 * A business account is an Organization with members (users in roles),
 * verification lifecycle, credit configuration and customer-group mapping.
 * All mutations are audited.
 */

const ORG_STATUSES = ['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'REJECTED'] as const
const MEMBER_ROLES = ['OWNER', 'ADMIN', 'BUYER', 'APPROVER', 'VIEWER'] as const
const ASSIGNABLE_ROLES = ['ADMIN', 'BUYER', 'APPROVER', 'VIEWER'] as const

export class OrgServiceError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'org'
  )
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base)
  let suffix = 1
  while (await db.organization.findUnique({ where: { slug } })) {
    suffix += 1
    slug = `${slugify(base)}-${suffix}`
  }
  return slug
}

type OrgRaw = Awaited<ReturnType<typeof db.organization.findFirstOrThrow>>

function serializeOrg(
  org: OrgRaw & {
    _count?: { members: number }
    members?: (Awaited<ReturnType<typeof db.organizationMember.findFirstOrThrow>> & {
      user: { id: string; name: string; email: string }
    })[]
    groups?: { id: string; key: string; name: string; description: string | null; priority: number; isDefault: boolean; createdAt: Date }[]
  },
  myRole?: OrgRole
): OrganizationDTO {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    legalName: org.legalName,
    taxId: org.taxId,
    registrationNumber: org.registrationNumber,
    industry: org.industry,
    website: org.website,
    status: org.status as OrganizationDTO['status'],
    verifiedAt: org.verifiedAt?.toISOString() ?? null,
    creditTermsDays: org.creditTermsDays,
    creditLimit: org.creditLimit.toNumber(),
    notes: org.notes,
    createdAt: org.createdAt.toISOString(),
    memberCount: org._count?.members,
    myRole,
    members: org.members?.map((m) => ({
      id: m.id,
      role: m.role as OrgRole,
      jobTitle: m.jobTitle,
      user: { id: m.user.id, name: m.user.name, email: m.user.email },
      createdAt: m.createdAt.toISOString(),
    })),
    groups: org.groups?.map((g) => ({
      id: g.id,
      key: g.key,
      name: g.name,
      description: g.description,
      priority: g.priority,
      isDefault: g.isDefault,
      createdAt: g.createdAt.toISOString(),
    })),
  }
}

export async function createOrganization(
  userId: string,
  input: {
    name: string
    legalName?: string | null
    taxId?: string | null
    registrationNumber?: string | null
    industry?: string | null
    website?: string | null
  }
): Promise<OrganizationDTO> {
  const existingMembership = await db.organizationMember.findFirst({
    where: { userId, role: 'OWNER' },
  })
  if (existingMembership) {
    throw new OrgServiceError(
      'You already own a business account. One user can own a single organization.',
      409
    )
  }

  const slug = await uniqueSlug(input.name)
  const org = await db.$transaction(async (tx) => {
    const created = await tx.organization.create({
      data: {
        name: input.name,
        slug,
        legalName: input.legalName ?? null,
        taxId: input.taxId ?? null,
        registrationNumber: input.registrationNumber ?? null,
        industry: input.industry ?? null,
        website: input.website ?? null,
        members: { create: { userId, role: 'OWNER' } },
      },
      include: { members: { include: { user: { select: { id: true, name: true, email: true } } } } },
    })
    return created
  })

  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'ORG_CREATED',
    entityType: 'Organization',
    entityId: org.id,
    summary: `Organization "${org.name}" registered (pending verification)`,
    metadata: { name: org.name, taxId: org.taxId },
  })

  return serializeOrg(org as never, 'OWNER')
}

export async function listMyOrganizations(userId: string): Promise<OrganizationDTO[]> {
  const memberships = await db.organizationMember.findMany({
    where: { userId },
    include: {
      organization: { include: { _count: { select: { members: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  })
  return memberships.map((m) => serializeOrg(m.organization as never, m.role as OrgRole))
}

export async function getOrganization(
  orgId: string,
  userId: string,
  isAdmin: boolean
): Promise<OrganizationDTO> {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      },
      groups: true,
      _count: { select: { members: true } },
    },
  })
  if (!org) throw new OrgServiceError('Organization not found', 404)

  const membership = org.members.find((m) => m.userId === userId)
  if (!membership && !isAdmin) throw new OrgServiceError('Access denied', 403)

  return serializeOrg(org as never, membership?.role as OrgRole | undefined)
}

export async function addOrganizationMember(
  orgId: string,
  actorUserId: string,
  input: { email: string; role: string; jobTitle?: string | null }
): Promise<OrganizationMemberDTO> {
  const role = input.role.toUpperCase()
  if (!(ASSIGNABLE_ROLES as readonly string[]).includes(role)) {
    throw new OrgServiceError(`Role must be one of ${ASSIGNABLE_ROLES.join(', ')}`)
  }

  const actor = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId: actorUserId } },
  })
  if (!actor || !['OWNER', 'ADMIN'].includes(actor.role)) {
    throw new OrgServiceError('Only owners and admins can add members', 403)
  }

  const user = await db.user.findUnique({ where: { email: input.email.toLowerCase() } })
  if (!user) {
    throw new OrgServiceError(
      'No Vendora account uses that email — ask them to register first, then add them.',
      404
    )
  }

  const existing = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId: user.id } },
  })
  if (existing) throw new OrgServiceError('That user is already a member', 409)

  const member = await db.organizationMember.create({
    data: {
      organizationId: orgId,
      userId: user.id,
      role,
      jobTitle: input.jobTitle ?? null,
    },
    include: { user: { select: { id: true, name: true, email: true } } },
  })

  await recordAudit({
    actorId: actorUserId,
    actorType: 'USER',
    action: 'ORG_MEMBER_ADDED',
    entityType: 'Organization',
    entityId: orgId,
    summary: `${user.name} added as ${role}`,
    metadata: { memberId: member.id, role },
  })

  return {
    id: member.id,
    role: member.role as OrgRole,
    jobTitle: member.jobTitle,
    user: { id: user.id, name: user.name, email: user.email },
    createdAt: member.createdAt.toISOString(),
  }
}

// ── Admin operations ────────────────────────────────────────────────────────

export async function adminListOrganizations(filter?: {
  status?: string
  search?: string
}): Promise<OrganizationDTO[]> {
  const orgs = await db.organization.findMany({
    where: {
      ...(filter?.status && (ORG_STATUSES as readonly string[]).includes(filter.status)
        ? { status: filter.status }
        : {}),
      ...(filter?.search
        ? {
            OR: [
              { name: { contains: filter.search } },
              { legalName: { contains: filter.search } },
              { taxId: { contains: filter.search } },
            ],
          }
        : {}),
    },
    include: { _count: { select: { members: true, rfqs: true, priceLists: true } }, groups: true },
    orderBy: { createdAt: 'desc' },
  })
  return orgs.map((o) => serializeOrg(o as never))
}

export async function adminUpdateOrganization(
  orgId: string,
  adminId: string,
  input: {
    status?: string
    creditTermsDays?: number
    creditLimit?: number
    notes?: string | null
    groupIds?: string[]
  }
): Promise<OrganizationDTO> {
  const org = await db.organization.findUnique({ where: { id: orgId } })
  if (!org) throw new OrgServiceError('Organization not found', 404)

  const data: Record<string, unknown> = {}
  if (input.status !== undefined) {
    if (!(ORG_STATUSES as readonly string[]).includes(input.status)) {
      throw new OrgServiceError('Invalid status')
    }
    if (input.status === 'ACTIVE' && org.status !== 'ACTIVE') {
      data.status = 'ACTIVE'
      data.verifiedAt = new Date()
    } else {
      data.status = input.status
    }
  }
  if (input.creditTermsDays !== undefined) {
    if (input.creditTermsDays < 0 || input.creditTermsDays > 180) {
      throw new OrgServiceError('Credit terms must be 0–180 days')
    }
    data.creditTermsDays = input.creditTermsDays
  }
  if (input.creditLimit !== undefined) {
    if (input.creditLimit < 0 || input.creditLimit > 10_000_000) {
      throw new OrgServiceError('Credit limit out of range')
    }
    data.creditLimit = input.creditLimit
  }
  if (input.notes !== undefined) data.notes = input.notes
  if (input.groupIds !== undefined) data.groups = { set: input.groupIds.map((id) => ({ id })) }

  const updated = await db.organization.update({
    where: { id: orgId },
    data,
    include: { _count: { select: { members: true } }, groups: true },
  })

  if (input.status && input.status !== org.status) {
    await recordAudit({
      actorId: adminId,
      actorType: 'ADMIN',
      action: input.status === 'ACTIVE' ? 'ORG_VERIFIED' : `ORG_${input.status}`,
      entityType: 'Organization',
      entityId: orgId,
      summary: `Organization "${org.name}" → ${input.status}`,
      metadata: { from: org.status, to: input.status },
    })
  } else {
    await recordAudit({
      actorId: adminId,
      actorType: 'ADMIN',
      action: 'ORG_UPDATED',
      entityType: 'Organization',
      entityId: orgId,
      summary: `Organization "${org.name}" configuration updated`,
      metadata: { fields: Object.keys(data).filter((k) => k !== 'groups') },
    })
  }

  return serializeOrg(updated as never)
}
