import { db } from '@/lib/db'
import { recordAudit, recordAuditTx } from '@/server/modules/audit/service'
import { recomputeOrgKycLevel } from '@/server/modules/kyc/service'
import { assertNotLastActiveOwner } from '@/server/membership'
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
    orgType: org.orgType,
    legalName: org.legalName,
    taxId: org.taxId,
    registrationNumber: org.registrationNumber,
    industry: org.industry,
    website: org.website,
    status: org.status as OrganizationDTO['status'],
    verifiedAt: org.verifiedAt?.toISOString() ?? null,
    creditTermsDays: org.creditTermsDays,
    creditLimit: org.creditLimit,
    approvalThreshold: org.approvalThreshold === null ? null : org.approvalThreshold,
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
    groups: org.groups?.map((cg) => cg.customerGroup).map((g) => ({
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
      groups: { include: { customerGroup: true } },
      _count: { select: { members: true } },
    },
  })
  if (!org) throw new OrgServiceError('Organization not found', 404)

  const membership = org.members.find((m) => m.userId === userId)
  if (!membership && !isAdmin) throw new OrgServiceError('Access denied', 403)

  const dto = serializeOrg(org as never, membership?.role as OrgRole | undefined)

  // TENANT-AUDIT RISK-5 (conflict-of-interest soft guard): for PLATFORM
  // ADMIN views only, flag members who simultaneously hold staff membership
  // in an ACTIVE org of the other family (selling-side COMPANY ↔
  // financing-side BANK/MFI/EWALLET). Documented accepted deviation — this
  // surfaces it to the humans deciding approvals instead of silently
  // blocking legitimate multi-org consultants.
  if (isAdmin) {
    const thisIsFinancier = (FINANCIER_ORG_TYPES as readonly string[]).includes(org.orgType)
    const otherMemberships = await db.organizationMember.findMany({
      where: {
        userId: { in: org.members.map((m) => m.userId) },
        organizationId: { not: orgId },
        organization: { status: 'ACTIVE' },
      },
      include: { organization: { select: { name: true, orgType: true } } },
      take: 500,
    })
    const conflictMap = new Map<string, { orgName: string; orgType: string }[]>()
    for (const om of otherMemberships) {
      const otherIsFinancier = (FINANCIER_ORG_TYPES as readonly string[]).includes(om.organization.orgType)
      if (thisIsFinancier === otherIsFinancier) continue // same family — not a conflict
      const list = conflictMap.get(om.userId) ?? []
      list.push({ orgName: om.organization.name, orgType: om.organization.orgType })
      conflictMap.set(om.userId, list)
    }
    dto.members = dto.members?.map((m) => ({ ...m, conflicts: conflictMap.get(m.user.id) ?? [] }))
  }

  return dto
}

/**
 * Self-service approval-policy update: OWNER/ADMIN members (or a platform
 * admin) can set or clear the purchase-approval threshold for their org.
 */
export async function updateApprovalThreshold(
  orgId: string,
  userId: string,
  isAdmin: boolean,
  threshold: number | null
): Promise<OrganizationDTO> {
  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId } },
  })
  if (!membership && !isAdmin) throw new OrgServiceError('Access denied', 403)
  if (!isAdmin && !['OWNER', 'ADMIN'].includes(membership!.role)) {
    throw new OrgServiceError('Only organization owners and admins can change the approval policy', 403)
  }
  if (threshold !== null && (threshold < 0 || threshold > 10_000_000)) {
    throw new OrgServiceError('Approval threshold out of range')
  }

  const updated = await db.organization.update({
    where: { id: orgId },
    data: { approvalThreshold: threshold },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      },
      groups: { include: { customerGroup: true } },
      _count: { select: { members: true } },
    },
  })

  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'ORG_APPROVAL_POLICY',
    entityType: 'Organization',
    entityId: orgId,
    summary:
      threshold === null
        ? `Purchase approvals disabled for "${updated.name}"`
        : `Purchase approvals at $${threshold.toFixed(2)}+ for "${updated.name}"`,
    metadata: { approvalThreshold: threshold },
  })

  return serializeOrg(updated as never, membership?.role as OrgRole | undefined)
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

// ── Self-service member management (TENANT-AUDIT Q4) ───────────────────────

const FINANCIER_ORG_TYPES = ['BANK', 'MFI', 'EWALLET'] as const
const MANAGEABLE_ROLES = ['ADMIN', 'BUYER', 'APPROVER', 'VIEWER'] as const

/** Resolve the actor's active OWNER/ADMIN membership of a COMPANY org. */
async function requireOrgManager(orgId: string, actorUserId: string) {
  const actor = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId: actorUserId } },
    include: { user: { select: { status: true } }, organization: { select: { status: true, orgType: true, name: true } } },
  })
  if (!actor) throw new OrgServiceError('You are not a member of this organization', 403)
  if (actor.user.status !== 'ACTIVE' || actor.organization.status !== 'ACTIVE') {
    throw new OrgServiceError('Your membership is not active (user or organization suspended/pending)', 403)
  }
  if ((FINANCIER_ORG_TYPES as readonly string[]).includes(actor.organization.orgType)) {
    throw new OrgServiceError(
      'Financing institutions manage their staff in the Financier console → Team (role-based invitations)',
      409
    )
  }
  if (!['OWNER', 'ADMIN'].includes(actor.role)) {
    throw new OrgServiceError('Only owners and admins can manage members', 403)
  }
  return actor
}

/**
 * TENANT-AUDIT Q4: self-service member REMOVAL for plain COMPANY orgs —
 * previously only the financier team surface and admin-side actions could
 * remove memberships, so a merchant OWNER/ADMIN could not remove their own
 * staff. Guards: OWNER/ADMIN actor, no self-removal, OWNER members removable
 * only by an OWNER, and the last-active-owner invariant always holds.
 */
export async function removeOrganizationMember(
  orgId: string,
  actorUserId: string,
  memberId: string
): Promise<{ removedUserId: string; removedName: string; role: string }> {
  await requireOrgManager(orgId, actorUserId)

  const member = await db.organizationMember.findUnique({
    where: { id: memberId },
    include: { user: { select: { id: true, name: true, email: true } } },
  })
  if (!member || member.organizationId !== orgId) {
    throw new OrgServiceError('Member not found in this organization', 404)
  }
  if (member.userId === actorUserId) {
    throw new OrgServiceError('You cannot remove yourself — ask another owner or admin to remove you.', 409)
  }
  const actor = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId: actorUserId } },
    select: { role: true },
  })
  if (member.role === 'OWNER') {
    if (actor?.role !== 'OWNER') {
      throw new OrgServiceError('Only an owner can remove another owner', 403)
    }
    await assertNotLastActiveOwner(orgId, { excludingUserId: member.userId })
  }

  await db.$transaction(async (tx) => {
    await tx.organizationMember.delete({ where: { id: memberId } })
    await recordAuditTx(tx, {
      actorId: actorUserId,
      actorType: 'USER',
      action: 'ORG_MEMBER_REMOVED',
      entityType: 'Organization',
      entityId: orgId,
      summary: `${member.user.name} removed from the organization`,
      metadata: { memberId, removedUserId: member.userId, role: member.role },
    })
  })

  return { removedUserId: member.userId, removedName: member.user.name, role: member.role }
}

/**
 * TENANT-AUDIT Q4: self-service member ROLE CHANGE for plain COMPANY orgs.
 * OWNER-level changes (promotion to OWNER, demotion from OWNER) are
 * owner-only; the last-active-owner invariant guards demotions.
 */
export async function updateOrganizationMemberRole(
  orgId: string,
  actorUserId: string,
  memberId: string,
  input: { role: string; jobTitle?: string | null }
): Promise<OrganizationMemberDTO> {
  const manager = await requireOrgManager(orgId, actorUserId)
  const role = input.role.toUpperCase()
  const validRoles = [...MANAGEABLE_ROLES, 'OWNER'] as const
  if (!(validRoles as readonly string[]).includes(role)) {
    throw new OrgServiceError(`Role must be one of ${validRoles.join(', ')}`)
  }

  const member = await db.organizationMember.findUnique({
    where: { id: memberId },
    include: { user: { select: { id: true, name: true, email: true } } },
  })
  if (!member || member.organizationId !== orgId) {
    throw new OrgServiceError('Member not found in this organization', 404)
  }

  const ownerChange = role === 'OWNER' || member.role === 'OWNER'
  if (ownerChange && manager.role !== 'OWNER') {
    throw new OrgServiceError('Only an owner can grant or revoke the Owner role', 403)
  }
  if (member.role === 'OWNER' && role !== 'OWNER') {
    await assertNotLastActiveOwner(orgId, { excludingUserId: member.userId })
  }

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.organizationMember.update({
      where: { id: memberId },
      data: { role, jobTitle: input.jobTitle !== undefined ? input.jobTitle : member.jobTitle },
    })
    await recordAuditTx(tx, {
      actorId: actorUserId,
      actorType: 'USER',
      action: 'ORG_MEMBER_ROLE_CHANGED',
      entityType: 'Organization',
      entityId: orgId,
      summary: `${member.user.name}: ${member.role} → ${role}`,
      metadata: { memberId, from: member.role, to: role },
    })
    return row
  })

  return {
    id: updated.id,
    role: updated.role as OrgRole,
    jobTitle: updated.jobTitle,
    user: { id: member.user.id, name: member.user.name, email: member.user.email },
    createdAt: updated.createdAt.toISOString(),
  }
}

// ── Admin operations ────────────────────────────────────────────────────────

/** Trim an optional string field: '' → null, undefined → undefined. */
function cleanOptionalString(
  value: string | null | undefined,
  max: number,
  label: string
): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  const trimmed = value.trim()
  if (trimmed.length > max) {
    throw new OrgServiceError(`${label} must be at most ${max} characters`)
  }
  return trimmed || null
}

export async function adminCreateOrganization(
  adminId: string,
  input: {
    name: string
    orgType?: string
    legalName?: string | null
    taxId?: string | null
    registrationNumber?: string | null
    industry?: string | null
    website?: string | null
    status?: string
    creditTermsDays?: number
    creditLimit?: number
    notes?: string | null
    ownerEmail?: string
  }
): Promise<OrganizationDTO> {
  const name = input.name.trim()
  if (name.length < 2 || name.length > 160) {
    throw new OrgServiceError('Organization name must be 2–160 characters')
  }
  const orgType = input.orgType ?? 'COMPANY'
  if (!['COMPANY', 'BANK', 'MFI', 'EWALLET'].includes(orgType)) {
    throw new OrgServiceError('Invalid organization type')
  }
  // Admin-created orgs are trusted — they start active (verified) unless the
  // admin explicitly parks them in the verification queue.
  const status = input.status ?? 'ACTIVE'
  if (!['PENDING_VERIFICATION', 'ACTIVE'].includes(status)) {
    throw new OrgServiceError('Admin-created organizations start as Active or Pending verification')
  }
  if (
    input.creditTermsDays !== undefined &&
    (!Number.isInteger(input.creditTermsDays) || input.creditTermsDays < 0 || input.creditTermsDays > 180)
  ) {
    throw new OrgServiceError('Credit terms must be 0–180 days')
  }
  if (input.creditLimit !== undefined && (input.creditLimit < 0 || input.creditLimit > 10_000_000)) {
    throw new OrgServiceError('Credit limit out of range')
  }
  if (input.notes !== undefined && input.notes !== null && input.notes.length > 5000) {
    throw new OrgServiceError('Notes must be at most 5000 characters')
  }

  const legalName = cleanOptionalString(input.legalName, 200, 'Legal name')
  const taxId = cleanOptionalString(input.taxId, 60, 'Tax ID')
  const registrationNumber = cleanOptionalString(input.registrationNumber, 60, 'Registration number')
  const industry = cleanOptionalString(input.industry, 80, 'Industry')
  const website = cleanOptionalString(input.website, 255, 'Website')

  // Owner (optional) must already have a Vendora account — resolved before any
  // write so a typo never leaves a half-created organization behind.
  const ownerEmail = input.ownerEmail?.trim().toLowerCase()
  const owner = ownerEmail
    ? await db.user.findUnique({ where: { email: ownerEmail }, select: { id: true, name: true } })
    : null
  if (ownerEmail && !owner) {
    throw new OrgServiceError(
      'No Vendora account uses that email — ask them to register first, then assign them.',
      404
    )
  }
  if (owner) {
    const ownedOrg = await db.organizationMember.findFirst({
      where: { userId: owner.id, role: 'OWNER' },
      select: { organization: { select: { name: true } } },
    })
    if (ownedOrg) {
      throw new OrgServiceError(
        `That user already owns "${ownedOrg.organization.name}" — one user can own a single organization.`,
        409
      )
    }
  }

  const slug = await uniqueSlug(name)
  const org = await db.$transaction(async (tx) => {
    const created = await tx.organization.create({
      data: {
        name,
        slug,
        orgType,
        legalName: legalName ?? null,
        taxId: taxId ?? null,
        registrationNumber: registrationNumber ?? null,
        industry: industry ?? null,
        website: website ?? null,
        status,
        verifiedAt: status === 'ACTIVE' ? new Date() : null,
        creditTermsDays: input.creditTermsDays ?? 0,
        creditLimit: input.creditLimit ?? 0,
        notes: input.notes ?? null,
        ...(owner ? { members: { create: { userId: owner.id, role: 'OWNER' } } } : {}),
      },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
        _count: { select: { members: true } },
      },
    })
    return created
  })

  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'ORG_CREATED_ADMIN',
    entityType: 'Organization',
    entityId: org.id,
    summary: `Organization "${org.name}" created by admin`,
    metadata: { name: org.name, status: org.status, ownerEmail: ownerEmail ?? null },
  })

  return serializeOrg(org as never)
}

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
    include: { _count: { select: { members: true, rfqs: true, priceLists: true } }, groups: { include: { customerGroup: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return orgs.map((o) => serializeOrg(o as never))
}

export async function adminUpdateOrganization(
  orgId: string,
  adminId: string,
  input: {
    name?: string
    legalName?: string | null
    taxId?: string | null
    registrationNumber?: string | null
    industry?: string | null
    website?: string | null
    status?: string
    orgType?: string
    creditTermsDays?: number
    creditLimit?: number
    approvalThreshold?: number | null
    notes?: string | null
    groupIds?: string[]
  }
): Promise<OrganizationDTO> {
  const org = await db.organization.findUnique({ where: { id: orgId } })
  if (!org) throw new OrgServiceError('Organization not found', 404)

  const data: Record<string, unknown> = {}
  // Profile fields — the slug is a stable identifier and never follows renames.
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length < 2 || name.length > 160) {
      throw new OrgServiceError('Organization name must be 2–160 characters')
    }
    data.name = name
  }
  const legalName = cleanOptionalString(input.legalName, 200, 'Legal name')
  if (legalName !== undefined) data.legalName = legalName
  const taxId = cleanOptionalString(input.taxId, 60, 'Tax ID')
  if (taxId !== undefined) data.taxId = taxId
  const registrationNumber = cleanOptionalString(input.registrationNumber, 60, 'Registration number')
  if (registrationNumber !== undefined) data.registrationNumber = registrationNumber
  const industry = cleanOptionalString(input.industry, 80, 'Industry')
  if (industry !== undefined) data.industry = industry
  const website = cleanOptionalString(input.website, 255, 'Website')
  if (website !== undefined) data.website = website
  if (input.orgType !== undefined) {
    if (!['COMPANY', 'BANK', 'MFI', 'EWALLET'].includes(input.orgType)) {
      throw new OrgServiceError('Invalid organization type')
    }
    data.orgType = input.orgType
  }
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
  if (input.approvalThreshold !== undefined) {
    if (input.approvalThreshold !== null && (input.approvalThreshold < 0 || input.approvalThreshold > 10_000_000)) {
      throw new OrgServiceError('Approval threshold out of range')
    }
    data.approvalThreshold = input.approvalThreshold // null disables the approval workflow
  }
  if (input.notes !== undefined) data.notes = input.notes
  if (input.groupIds !== undefined)
    data.groups = { deleteMany: {}, create: input.groupIds.map((id) => ({ customerGroupId: id })) }

  const updated = await db.organization.update({
    where: { id: orgId },
    data,
    include: { _count: { select: { members: true } }, groups: { include: { customerGroup: true } } },
  })

  // KYC engine hook (Phase 3 — task 3-d): admin-activating an org runs the
  // KYB recompute — the org flips to level 3 when it holds a VERIFIED business
  // doc (COMMERCIAL_REG / BUSINESS_LICENSE), which also re-raises every
  // OWNER/ADMIN member's own user level. Recompute swallows its own errors,
  // so the org update result stays safe.
  if (input.status === 'ACTIVE' && org.status !== 'ACTIVE') {
    await recomputeOrgKycLevel(orgId)
  }

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

export async function adminDeleteOrganization(adminId: string, orgId: string): Promise<void> {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    include: {
      _count: { select: { members: true, rfqs: true, orders: true, priceLists: true, approvalRequests: true } },
    },
  })
  if (!org) throw new OrgServiceError('Organization not found', 404)

  // Trading history must survive — orgs that transacted can only be suspended.
  const { rfqs, orders, priceLists, approvalRequests } = org._count
  if (rfqs + orders + priceLists + approvalRequests > 0) {
    const parts: string[] = []
    if (orders) parts.push(`${orders} order(s)`)
    if (rfqs) parts.push(`${rfqs} RFQ(s)`)
    if (priceLists) parts.push(`${priceLists} price list(s)`)
    if (approvalRequests) parts.push(`${approvalRequests} approval request(s)`)
    throw new OrgServiceError(
      `Cannot delete "${org.name}": it has ${parts.join(', ')}. Suspend it instead to preserve history.`,
      409
    )
  }

  await db.organization.delete({ where: { id: orgId } })

  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'ORG_DELETED',
    entityType: 'Organization',
    entityId: orgId,
    summary: `Organization "${org.name}" deleted`,
    metadata: { name: org.name, slug: org.slug, members: org._count.members },
  })
}

// ── Individual-seller tenant provisioning (TENANT-AUDIT Q1) ────────────────

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0]

/**
 * TENANT-AUDIT Q1 fix: provision the individual seller's org tenant AT WRITE
 * TIME (self-registration with Sell intent + the become-seller upgrade) so the
 * invariant "every seller has an Organization tenant" holds from the first
 * minute — previously the tenant appeared only when an admin flipped the
 * verification state (vendors/service setSellerVerification defensive branch)
 * or via the one-shot backfill, leaving org-scoped paths at orgId=null in the
 * interim.
 *
 * Shape mirrors the admin defensive provisioning exactly (COMPANY org,
 * ACTIVE store tenant — seller trust lives on SellerProfile.verificationState,
 * never on org.status): Organization "(Store)" + OWNER membership +
 * SellerProfile(UNVERIFIED). Idempotent: an existing profile or existing OWNER
 * org is reused, never duplicated.
 */
export async function createIndividualSellerTenantTx(
  tx: TxClient,
  input: { userId: string; userName: string; storeName: string | null }
): Promise<{ organizationId: string }> {
  const existingProfile = await tx.sellerProfile.findFirst({
    where: { ownerUserId: input.userId },
    select: { organizationId: true },
  })
  if (existingProfile) return { organizationId: existingProfile.organizationId }

  const existingMembership = await tx.organizationMember.findFirst({
    where: { userId: input.userId, role: 'OWNER' },
    select: { organizationId: true },
  })
  if (existingMembership) {
    // the user already owns an org (e.g. a merchant company) — attach the
    // seller profile to it rather than creating a second tenant
    await tx.sellerProfile.create({
      data: { organizationId: existingMembership.organizationId, ownerUserId: input.userId },
    })
    return { organizationId: existingMembership.organizationId }
  }

  const baseName = `${input.storeName || input.userName} (Store)`
  const baseSlug = `store-${input.userId.slice(-8).toLowerCase()}`
  let slug = baseSlug
  let suffix = 1
  while (await tx.organization.findUnique({ where: { slug } })) {
    suffix += 1
    slug = `${baseSlug}-${suffix}`
  }
  const org = await tx.organization.create({
    data: {
      name: baseName,
      slug,
      orgType: 'COMPANY',
      status: 'ACTIVE', // the store tenant; seller trust = SellerProfile.verificationState
    },
  })
  await tx.organizationMember.create({
    data: { organizationId: org.id, userId: input.userId, role: 'OWNER' },
  })
  await tx.sellerProfile.create({
    data: { organizationId: org.id, ownerUserId: input.userId },
  })
  return { organizationId: org.id }
}
