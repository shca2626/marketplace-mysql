import { db } from '@/lib/db'
import { recordAudit } from '@/server/modules/audit/service'

/**
 * SPEC ATTRIBUTE DICTIONARY (Phase 3 — structured specs; companies never see
 * JSON). Admins define the attribute set per category (categoryId=null →
 * available to EVERY category); sellers then fill a real form in the product
 * editor and the values serialize into Product.specs as the SAME
 * [{label, value}] array the storefront already renders — no storefront
 * changes needed.
 *
 * Storage notes (schema, task 3-a): options is a JSON string (MySQL-safe),
 * and @@unique([categoryId, key]) can't enforce uniqueness for global rows
 * (NULL categoryId) — the service layer dedupes global keys.
 */

export const SPEC_DATA_TYPES = ['TEXT', 'NUMBER', 'SELECT', 'BOOLEAN'] as const
export type SpecDataType = (typeof SPEC_DATA_TYPES)[number]

// Single source of truth lives in lib/types.ts (client-safe) — re-exported here
// for the server-side import sites.
import type { SpecAttributeDTO } from '@/lib/types'
export type { SpecAttributeDTO }

const KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

type AttrRaw = {
  id: string
  categoryId: string | null
  key: string
  label: string
  dataType: string
  unit: string | null
  options: string | null
  required: boolean
  position: number
  isActive: boolean
  createdAt: Date
  category?: { name: string } | null
}

export function serializeSpecAttribute(a: AttrRaw): SpecAttributeDTO {
  let options: string[] = []
  try {
    const parsed = JSON.parse(a.options || '[]')
    if (Array.isArray(parsed)) options = parsed.filter((x): x is string => typeof x === 'string')
  } catch {
    options = []
  }
  return {
    id: a.id,
    categoryId: a.categoryId,
    categoryName: a.category?.name ?? null,
    key: a.key,
    label: a.label,
    dataType: a.dataType,
    unit: a.unit,
    options,
    required: a.required,
    position: a.position,
    isActive: a.isActive,
    createdAt: a.createdAt.toISOString(),
  }
}

const includeCategory = { category: { select: { name: true } } } as const

export class SpecAttributeError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

/** Admin listing: globals + the given category's rows, position-ordered. */
export async function listSpecAttributes(categoryId: string | null): Promise<SpecAttributeDTO[]> {
  const rows = await db.specAttribute.findMany({
    where: { categoryId: categoryId ?? null },
    include: includeCategory,
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    take: 300,
  })
  return rows.map((r) => serializeSpecAttribute(r as AttrRaw))
}

/**
 * Seller/public listing: ACTIVE attributes usable for a category — the
 * category's own set plus every global row, position-ordered (category rows
 * first so they feel primary).
 */
export async function listActiveSpecAttributes(categoryId: string): Promise<SpecAttributeDTO[]> {
  const [globals, categoryRows] = await Promise.all([
    db.specAttribute.findMany({
      where: { categoryId: null, isActive: true },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      take: 200,
    }),
    db.specAttribute.findMany({
      where: { categoryId, isActive: true },
      include: includeCategory,
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      take: 200,
    }),
  ])
  return [...categoryRows.map((c) => serializeSpecAttribute(c as AttrRaw)), ...globals.map((g) => serializeSpecAttribute(g as AttrRaw))]
}

export interface CreateSpecAttributeInput {
  categoryId?: string | null
  key: string
  label: string
  dataType: string
  unit?: string | null
  options?: string[]
  required?: boolean
  position?: number
}

export async function createSpecAttribute(
  adminId: string,
  input: CreateSpecAttributeInput
): Promise<SpecAttributeDTO> {
  const key = input.key.trim().toLowerCase()
  if (!KEY_PATTERN.test(key)) {
    throw new SpecAttributeError('Key must be a lowercase slug (letters, digits, single dashes) — e.g. "rated-power"')
  }
  const label = input.label.trim()
  if (label.length < 2 || label.length > 60) {
    throw new SpecAttributeError('Label must be 2–60 characters')
  }
  if (!SPEC_DATA_TYPES.includes(input.dataType as SpecDataType)) {
    throw new SpecAttributeError('Data type must be TEXT, NUMBER, SELECT or BOOLEAN')
  }
  if (input.dataType === 'SELECT' && (!input.options || input.options.length < 2)) {
    throw new SpecAttributeError('SELECT attributes need at least 2 options')
  }
  const options = (input.options ?? []).map((o) => o.trim()).filter(Boolean).slice(0, 30)

  // Scope validation + key uniqueness. Category rows are protected by the DB
  // @@unique([categoryId, key]); globals (NULL categoryId) are NOT — MySQL
  // treats NULLs as distinct — so the service layer dedupes here.
  let categoryId: string | null = null
  if (input.categoryId) {
    const category = await db.category.findUnique({ where: { id: input.categoryId }, select: { id: true } })
    if (!category) throw new SpecAttributeError('Category not found', 404)
    categoryId = input.categoryId
    const clash = await db.specAttribute.findFirst({ where: { categoryId, key }, select: { id: true } })
    if (clash) throw new SpecAttributeError(`Key "${key}" already exists for this category`, 409)
  } else {
    const globalClash = await db.specAttribute.findFirst({ where: { categoryId: null, key }, select: { id: true } })
    if (globalClash) throw new SpecAttributeError(`Global key "${key}" already exists`, 409)
  }

  const last = await db.specAttribute.findFirst({
    where: { categoryId },
    orderBy: { position: 'desc' },
    select: { position: true },
  })

  const created = await db.specAttribute.create({
    data: {
      categoryId,
      key,
      label,
      dataType: input.dataType,
      unit: input.unit?.trim() || null,
      options: input.dataType === 'SELECT' ? JSON.stringify(options) : null,
      required: input.required ?? false,
      position: input.position ?? (last ? last.position + 10 : 0),
    },
    include: includeCategory,
  })

  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'SPEC_ATTRIBUTE_CREATED',
    entityType: 'SpecAttribute',
    entityId: created.id,
    summary: `Spec attribute "${label}" (${key}) created${categoryId ? ` for category` : ' (global)'}`,
    metadata: { categoryId, key, dataType: input.dataType, required: created.required },
  })
  return serializeSpecAttribute(created as AttrRaw)
}

export interface UpdateSpecAttributeInput {
  label?: string
  unit?: string | null
  options?: string[]
  required?: boolean
  position?: number
  isActive?: boolean
}

export async function updateSpecAttribute(
  adminId: string,
  id: string,
  input: UpdateSpecAttributeInput
): Promise<SpecAttributeDTO> {
  const existing = await db.specAttribute.findUnique({ where: { id } })
  if (!existing) throw new SpecAttributeError('Spec attribute not found', 404)

  const data: Record<string, unknown> = {}
  if (input.label !== undefined) {
    const label = input.label.trim()
    if (label.length < 2 || label.length > 60) throw new SpecAttributeError('Label must be 2–60 characters')
    data.label = label
  }
  if (input.unit !== undefined) data.unit = input.unit?.trim() || null
  if (input.options !== undefined) {
    if (existing.dataType === 'SELECT') {
      const options = input.options.map((o) => o.trim()).filter(Boolean).slice(0, 30)
      if (options.length < 2) throw new SpecAttributeError('SELECT attributes need at least 2 options')
      data.options = JSON.stringify(options)
    }
  }
  if (input.required !== undefined) data.required = input.required
  if (input.position !== undefined) data.position = Math.max(0, Math.min(9999, Math.round(input.position)))
  if (input.isActive !== undefined) data.isActive = input.isActive

  const updated = await db.specAttribute.update({ where: { id }, data, include: includeCategory })
  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'SPEC_ATTRIBUTE_UPDATED',
    entityType: 'SpecAttribute',
    entityId: id,
    summary: `Spec attribute "${existing.label}" (${existing.key}) updated`,
    metadata: { fields: Object.keys(data) },
  })
  return serializeSpecAttribute(updated as AttrRaw)
}

/**
 * Hard delete (chosen over soft-delete: the dictionary is admin-curated config,
 * not user data — existing Product.specs copies survive as plain text, so
 * nothing cascades and no history is lost).
 */
export async function deleteSpecAttribute(adminId: string, id: string): Promise<void> {
  const existing = await db.specAttribute.findUnique({ where: { id } })
  if (!existing) throw new SpecAttributeError('Spec attribute not found', 404)
  await db.specAttribute.delete({ where: { id } })
  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'SPEC_ATTRIBUTE_DELETED',
    entityType: 'SpecAttribute',
    entityId: id,
    summary: `Spec attribute "${existing.label}" (${existing.key}) deleted`,
    metadata: { categoryId: existing.categoryId, key: existing.key },
  })
}
