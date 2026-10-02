import { db } from '@/lib/db'
import { recordAudit } from '@/server/modules/audit/service'
import type { CustomerGroupDTO } from '@/lib/types'

/**
 * CUSTOMER GROUPS — buyer segmentation that pricing (and future promotions)
 * hangs off. Works for B2C segments (VIP retail) and B2B tiers (wholesale).
 * Fully admin-managed.
 */

export class GroupServiceError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

function slugKey(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'group'
  )
}

function serialize(g: {
  id: string
  key: string
  name: string
  description: string | null
  priority: number
  isDefault: boolean
  createdAt: Date
  _count?: { customerGroupUsers: number; customerGroupOrganizations: number; priceLists: number }
}): CustomerGroupDTO {
  return {
    id: g.id,
    key: g.key,
    name: g.name,
    description: g.description,
    priority: g.priority,
    isDefault: g.isDefault,
    createdAt: g.createdAt.toISOString(),
    _count: g._count
      ? {
          users: g._count.customerGroupUsers,
          organizations: g._count.customerGroupOrganizations,
          priceLists: g._count.priceLists,
        }
      : undefined,
  }
}

// MYSQL/Aiven note: the join relations are the explicit M2M models
// (customerGroupUsers / customerGroupOrganizations) — NOT "users"/"organizations".
const countInclude = {
  _count: { select: { customerGroupUsers: true, customerGroupOrganizations: true, priceLists: true } },
} as const

export async function adminListGroups(): Promise<CustomerGroupDTO[]> {
  const groups = await db.customerGroup.findMany({ include: countInclude, orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }] })
  return groups.map(serialize)
}

export async function adminCreateGroup(
  adminId: string,
  input: { name: string; description?: string | null; priority?: number; key?: string }
): Promise<CustomerGroupDTO> {
  const key = (input.key?.trim() || slugKey(input.name)).toLowerCase()
  if (!/^[a-z0-9-]{2,60}$/.test(key)) {
    throw new GroupServiceError('Key must be 2–60 lowercase letters, numbers or dashes')
  }
  const exists = await db.customerGroup.findUnique({ where: { key } })
  if (exists) throw new GroupServiceError('A group with that key already exists', 409)

  const group = await db.customerGroup.create({
    data: {
      key,
      name: input.name,
      description: input.description ?? null,
      priority: input.priority ?? 0,
      isDefault: false,
    },
    include: countInclude,
  })
  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'GROUP_CREATED',
    entityType: 'CustomerGroup',
    entityId: group.id,
    summary: `Customer group "${group.name}" created`,
  })
  return serialize(group)
}

export async function adminUpdateGroup(
  id: string,
  adminId: string,
  input: { name?: string; description?: string | null; priority?: number; isDefault?: boolean }
): Promise<CustomerGroupDTO> {
  const group = await db.customerGroup.findUnique({ where: { id } })
  if (!group) throw new GroupServiceError('Customer group not found', 404)
  if (group.isDefault && input.isDefault === false) {
    throw new GroupServiceError('The platform needs a default group')
  }

  const updated = await db.customerGroup.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
    },
    include: countInclude,
  })
  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'GROUP_UPDATED',
    entityType: 'CustomerGroup',
    entityId: id,
    summary: `Customer group "${updated.name}" updated`,
    metadata: { fields: Object.keys(input) },
  })
  return serialize(updated)
}

export async function adminDeleteGroup(id: string, adminId: string): Promise<void> {
  const group = await db.customerGroup.findUnique({
    where: { id },
    include: { _count: { select: { priceLists: true, customerGroupOrganizations: true } } },
  })
  if (!group) throw new GroupServiceError('Customer group not found', 404)
  if (group.isDefault) throw new GroupServiceError('The default group cannot be deleted')
  if (group._count.priceLists > 0) {
    throw new GroupServiceError(
      `Still referenced by ${group._count.priceLists} price list(s) — archive those first`
    )
  }

  await db.customerGroup.delete({ where: { id } })
  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'GROUP_DELETED',
    entityType: 'CustomerGroup',
    entityId: id,
    summary: `Customer group "${group.name}" deleted`,
    metadata: { organizationsWereMapped: group._count.customerGroupOrganizations },
  })
}
