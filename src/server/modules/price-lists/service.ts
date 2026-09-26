import { db } from '@/lib/db'
import { recordAudit } from '@/server/modules/audit/service'
import type { PriceListDTO, PriceListEntryDTO } from '@/lib/types'

/**
 * PRICE LISTS — admin-managed pricing segments.
 * Scope ORG = contract prices for one organization; scope GROUP = segment
 * prices for a customer group. Entries are quantity-break ladders per product.
 * The pricing resolver consumes these at runtime (see modules/pricing).
 */

export class PriceListServiceError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export interface PriceListEntryInput {
  productId: string
  minQuantity: number
  unitPrice: number
}

type ListRaw = Awaited<ReturnType<typeof db.priceList.findFirstOrThrow>>

function serializeList(
  l: ListRaw & {
    _count?: { entries: number }
    organization?: { name: string } | null
    customerGroup?: { name: string } | null
    entries?: (Awaited<ReturnType<typeof db.priceListEntry.findFirstOrThrow>> & {
      product?: { title: string }
    })[]
  }
): PriceListDTO {
  return {
    id: l.id,
    name: l.name,
    description: l.description,
    scope: l.scope as PriceListDTO['scope'],
    status: l.status as PriceListDTO['status'],
    priority: l.priority,
    currency: l.currency,
    startsAt: l.startsAt?.toISOString() ?? null,
    endsAt: l.endsAt?.toISOString() ?? null,
    organizationId: l.organizationId,
    organizationName: l.organization?.name ?? null,
    customerGroupId: l.customerGroupId,
    customerGroupName: l.customerGroup?.name ?? null,
    entryCount: l._count?.entries,
    createdAt: l.createdAt.toISOString(),
    entries: l.entries?.map((e) => ({
      id: e.id,
      productId: e.productId,
      productTitle: e.product?.title,
      minQuantity: e.minQuantity,
      unitPrice: e.unitPrice,
    })),
  }
}

async function validateTarget(scope: string, organizationId?: string | null, customerGroupId?: string | null) {
  if (scope === 'ORG') {
    if (!organizationId) throw new PriceListServiceError('Organization scope needs an organization')
    const org = await db.organization.findUnique({ where: { id: organizationId } })
    if (!org) throw new PriceListServiceError('Organization not found', 404)
    return
  }
  if (scope === 'GROUP') {
    if (!customerGroupId) throw new PriceListServiceError('Group scope needs a customer group')
    const group = await db.customerGroup.findUnique({ where: { id: customerGroupId } })
    if (!group) throw new PriceListServiceError('Customer group not found', 404)
    return
  }
  if (scope === 'CHANNEL') {
    throw new PriceListServiceError(
      'Channel scope arrives with the B2B2C storefront phase — use ORG or GROUP for now'
    )
  }
  throw new PriceListServiceError('Scope must be ORG or GROUP')
}

export async function adminListPriceLists(): Promise<PriceListDTO[]> {
  const lists = await db.priceList.findMany({
    include: {
      _count: { select: { entries: true } },
      organization: { select: { name: true } },
      customerGroup: { select: { name: true } },
    },
    orderBy: [{ scope: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
  })
  return lists.map((l) => serializeList(l as never))
}

export async function adminGetPriceList(id: string): Promise<PriceListDTO> {
  const list = await db.priceList.findUnique({
    where: { id },
    include: {
      _count: { select: { entries: true } },
      organization: { select: { name: true } },
      customerGroup: { select: { name: true } },
      entries: { include: { product: { select: { title: true } } }, orderBy: [{ productId: 'asc' }, { minQuantity: 'asc' }] },
    },
  })
  if (!list) throw new PriceListServiceError('Price list not found', 404)
  return serializeList(list as never)
}

export async function adminCreatePriceList(
  adminId: string,
  input: {
    name: string
    description?: string | null
    scope: string
    status?: string
    priority?: number
    currency?: string
    startsAt?: string | null
    endsAt?: string | null
    organizationId?: string | null
    customerGroupId?: string | null
  }
): Promise<PriceListDTO> {
  await validateTarget(input.scope, input.organizationId, input.customerGroupId)

  const list = await db.priceList.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      scope: input.scope,
      status: input.status ?? 'ACTIVE',
      priority: input.priority ?? 0,
      currency: (input.currency ?? 'USD').toUpperCase().slice(0, 3),
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      organizationId: input.scope === 'ORG' ? input.organizationId : null,
      customerGroupId: input.scope === 'GROUP' ? input.customerGroupId : null,
    },
    include: { _count: { select: { entries: true } }, organization: { select: { name: true } }, customerGroup: { select: { name: true } } },
  })

  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'PRICELIST_CREATED',
    entityType: 'PriceList',
    entityId: list.id,
    summary: `Price list "${list.name}" (${list.scope}) created`,
    metadata: { scope: list.scope, organizationId: list.organizationId, customerGroupId: list.customerGroupId },
  })
  return serializeList(list as never)
}

export async function adminUpdatePriceList(
  id: string,
  adminId: string,
  input: {
    name?: string
    description?: string | null
    status?: string
    priority?: number
    startsAt?: string | null
    endsAt?: string | null
  }
): Promise<PriceListDTO> {
  const list = await db.priceList.findUnique({ where: { id } })
  if (!list) throw new PriceListServiceError('Price list not found', 404)
  if (input.status && !['ACTIVE', 'DRAFT', 'ARCHIVED'].includes(input.status)) {
    throw new PriceListServiceError('Invalid status')
  }

  const updated = await db.priceList.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.startsAt !== undefined ? { startsAt: input.startsAt ? new Date(input.startsAt) : null } : {}),
      ...(input.endsAt !== undefined ? { endsAt: input.endsAt ? new Date(input.endsAt) : null } : {}),
    },
    include: { _count: { select: { entries: true } }, organization: { select: { name: true } }, customerGroup: { select: { name: true } } },
  })

  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'PRICELIST_UPDATED',
    entityType: 'PriceList',
    entityId: id,
    summary: `Price list "${updated.name}" updated`,
    metadata: { fields: Object.keys(input) },
  })
  return serializeList(updated as never)
}

export async function adminDeletePriceList(id: string, adminId: string): Promise<void> {
  const list = await db.priceList.findUnique({ where: { id } })
  if (!list) throw new PriceListServiceError('Price list not found', 404)
  await db.priceList.delete({ where: { id } })
  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'PRICELIST_DELETED',
    entityType: 'PriceList',
    entityId: id,
    summary: `Price list "${list.name}" deleted`,
  })
}

/** Transactional full replace of the quantity-break ladder. */
export async function adminReplaceEntries(
  id: string,
  adminId: string,
  entries: PriceListEntryInput[]
): Promise<PriceListEntryDTO[]> {
  const list = await db.priceList.findUnique({ where: { id } })
  if (!list) throw new PriceListServiceError('Price list not found', 404)

  const seen = new Set<string>()
  for (const e of entries) {
    if (e.minQuantity < 1) throw new PriceListServiceError('Minimum quantity must be ≥ 1')
    if (e.unitPrice < 0) throw new PriceListServiceError('Unit price cannot be negative')
    const key = `${e.productId}:${e.minQuantity}`
    if (seen.has(key)) {
      throw new PriceListServiceError('Duplicate product + quantity break — merge them into one row')
    }
    seen.add(key)
  }

  const products = entries.length
    ? await db.product.findMany({ where: { id: { in: entries.map((e) => e.productId) } } })
    : []
  const productIds = new Set(products.map((p) => p.id))
  for (const e of entries) {
    if (!productIds.has(e.productId)) throw new PriceListServiceError('A referenced product does not exist')
  }

  const created = await db.$transaction(async (tx) => {
    await tx.priceListEntry.deleteMany({ where: { priceListId: id } })
    if (entries.length === 0) return []
    await tx.priceListEntry.createMany({
      data: entries.map((e) => ({
        priceListId: id,
        productId: e.productId,
        minQuantity: e.minQuantity,
        unitPrice: e.unitPrice,
      })),
    })
    return tx.priceListEntry.findMany({
      where: { priceListId: id },
      include: { product: { select: { title: true } } },
      orderBy: [{ productId: 'asc' }, { minQuantity: 'asc' }],
    })
  })

  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'PRICELIST_ENTRIES_REPLACED',
    entityType: 'PriceList',
    entityId: id,
    summary: `Price list "${list.name}" ladder set to ${entries.length} entries`,
    metadata: { entryCount: entries.length },
  })
  return created.map((e) => ({
    id: e.id,
    productId: e.productId,
    productTitle: e.product.title,
    minQuantity: e.minQuantity,
    unitPrice: e.unitPrice,
  }))
}
