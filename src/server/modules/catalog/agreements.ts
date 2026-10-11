import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { recordAudit } from '@/server/modules/audit/service'
import { PUBLICATION_AGREEMENT_TEXT, PUBLICATION_AGREEMENT_VERSION } from './settings'

/**
 * PHASE 9.4 — publication agreement management.
 *
 * The Publication Agreement sellers accept on first publish (Phase 4) becomes a
 * fully managed, versioned, auditable object: admin-authored templates
 * (exactly one ACTIVE at a time) + an immutable consent ledger. No agreement
 * text lives in code — the Phase-4 constant (settings.ts) is only used ONCE,
 * to lazily seed the first "legacy" template the first time the ledger is
 * touched, so every consent (old column stamps included) can be traced to a
 * template row.
 *
 * Invariants:
 *  • activating a template deactivates every other one (single-active, in a
 *    transaction);
 *  • ACTIVE templates are immutable — edits are draft-only, so a consent that
 *    references version "v2" always points at the exact text that was accepted;
 *  • recordConsent is idempotent on (template, user, product) — re-acceptance
 *    of the same version is a no-op;
 *  • consents snapshot productTitle, so the ledger survives product deletion.
 */

export class AgreementError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

/** Version strings: "v2", "1.1", "2026-10-rev2" — dotted/dashed alphanumerics. */
const VERSION_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface AgreementTemplateDTO {
  id: string
  version: string
  title: string
  body: string
  isActive: boolean
  consentCount: number
  createdBy: { id: string; name: string } | null
  createdAt: string
}

export interface ConsentRowDTO {
  id: string
  templateId: string
  templateVersion: string
  templateTitle: string
  productId: string | null
  productTitle: string | null
  productDeleted: boolean // productId set but the product row is gone
  sellerId: string
  sellerName: string
  sellerStoreName: string | null
  sellerEmail: string | null
  acceptedAt: string
  ipAddress: string | null
}

// ── Template CRUD ────────────────────────────────────────────────────────────

function assertTemplateFields(version: string, title: string, body: string) {
  if (!VERSION_RE.test(version))
    throw new AgreementError('Version must be 1–32 characters — letters, digits, dots or dashes (e.g. "v2", "1.1")')
  if (title.length < 2 || title.length > 120)
    throw new AgreementError('Title must be 2–120 characters')
  if (body.length < 20 || body.length > 20000)
    throw new AgreementError('Agreement body must be 20–20,000 characters')
}

export async function listTemplates(): Promise<AgreementTemplateDTO[]> {
  const rows = await db.publicationAgreementTemplate.findMany({
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    include: {
      createdBy: { select: { id: true, name: true } },
      _count: { select: { consents: true } },
    },
  })
  return rows.map((t) => ({
    id: t.id,
    version: t.version,
    title: t.title,
    body: t.body,
    isActive: t.isActive,
    consentCount: t._count.consents,
    createdBy: t.createdBy ? { id: t.createdBy.id, name: t.createdBy.name } : null,
    createdAt: t.createdAt.toISOString(),
  }))
}

export async function createTemplate(
  input: { version: string; title: string; body: string },
  createdById: string | null
): Promise<AgreementTemplateDTO> {
  const version = input.version.trim()
  const title = input.title.trim()
  const body = input.body.trim()
  assertTemplateFields(version, title, body)

  const existing = await db.publicationAgreementTemplate.findUnique({ where: { version } })
  if (existing)
    throw new AgreementError(`Version "${version}" already exists — agreement versions are permanent`, 409)

  const created = await db.publicationAgreementTemplate.create({
    data: { version, title, body, createdById },
  })
  if (createdById) {
    await recordAudit({
      actorId: createdById,
      actorType: 'ADMIN',
      action: 'AGREEMENT_TEMPLATE_CREATED',
      entityType: 'PublicationAgreementTemplate',
      entityId: created.id,
      summary: `Agreement template "${version} — ${title}" created (draft)`,
      metadata: { version, title },
    })
  }
  return {
    id: created.id,
    version: created.version,
    title: created.title,
    body: created.body,
    isActive: created.isActive,
    consentCount: 0,
    createdBy: createdById ? { id: createdById, name: '' } : null,
    createdAt: created.createdAt.toISOString(),
  }
}

export async function updateTemplate(
  id: string,
  patch: { version?: string; title?: string; body?: string },
  adminId: string
): Promise<AgreementTemplateDTO> {
  const template = await db.publicationAgreementTemplate.findUnique({ where: { id } })
  if (!template) throw new AgreementError('Agreement template not found', 404)
  if (template.isActive)
    throw new AgreementError(
      'Active templates are immutable — publish a new version instead (existing consents must keep pointing at the exact text that was accepted)',
      409
    )

  const version = (patch.version ?? template.version).trim()
  const title = (patch.title ?? template.title).trim()
  const body = (patch.body ?? template.body).trim()
  assertTemplateFields(version, title, body)
  if (version !== template.version) {
    const clash = await db.publicationAgreementTemplate.findUnique({ where: { version } })
    if (clash) throw new AgreementError(`Version "${version}" already exists — agreement versions are permanent`, 409)
  }

  const updated = await db.publicationAgreementTemplate.update({ where: { id }, data: { version, title, body } })
  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'AGREEMENT_TEMPLATE_UPDATED',
    entityType: 'PublicationAgreementTemplate',
    entityId: id,
    summary: `Draft agreement template "${version} — ${title}" edited`,
    metadata: { before: { version: template.version, title: template.title }, after: { version, title } },
  })
  const consentCount = await db.publicationConsent.count({ where: { templateId: id } })
  return {
    id: updated.id,
    version: updated.version,
    title: updated.title,
    body: updated.body,
    isActive: updated.isActive,
    consentCount,
    createdBy: template.createdById ? { id: template.createdById, name: '' } : null,
    createdAt: updated.createdAt.toISOString(),
  }
}

/**
 * Make this template THE active agreement new publications capture —
 * single-active invariant enforced inside one transaction (all others flip to
 * draft). Existing consents are never rewritten: they keep their version.
 */
export async function activateTemplate(id: string, adminId: string): Promise<AgreementTemplateDTO> {
  const template = await db.publicationAgreementTemplate.findUnique({ where: { id } })
  if (!template) throw new AgreementError('Agreement template not found', 404)

  await db.$transaction(async (tx) => {
    await tx.publicationAgreementTemplate.updateMany({
      where: { isActive: true, id: { not: id } },
      data: { isActive: false },
    })
    await tx.publicationAgreementTemplate.update({ where: { id }, data: { isActive: true } })
  })

  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'AGREEMENT_TEMPLATE_ACTIVATED',
    entityType: 'PublicationAgreementTemplate',
    entityId: id,
    summary: `Agreement "${template.version} — ${template.title}" is now the active publication agreement`,
    metadata: { version: template.version, title: template.title },
  })

  const consentCount = await db.publicationConsent.count({ where: { templateId: id } })
  return {
    id: template.id,
    version: template.version,
    title: template.title,
    body: template.body,
    isActive: true,
    consentCount,
    createdBy: template.createdById ? { id: template.createdById, name: '' } : null,
    createdAt: template.createdAt.toISOString(),
  }
}

// ── Active template resolution + legacy seed ─────────────────────────────────

/**
 * Seed the first template from the Phase-4 hardcoded agreement text so the
 * ledger always has a version-of-record. Called lazily by getActiveTemplate()
 * when the table is empty — never on import. Safe under concurrency (version
 * is unique; the loser of the race receives the winner's row).
 */
export async function seedLegacyTemplate() {
  try {
    return await db.publicationAgreementTemplate.create({
      data: {
        version: PUBLICATION_AGREEMENT_VERSION,
        title: 'Vendora Publication Agreement (legacy seed)',
        body: PUBLICATION_AGREEMENT_TEXT,
        isActive: true,
      },
    })
  } catch (err) {
    const existing = await db.publicationAgreementTemplate.findUnique({
      where: { version: PUBLICATION_AGREEMENT_VERSION },
    })
    if (existing) return existing
    throw err
  }
}

/**
 * The template new consents are recorded against.
 *   1. the ACTIVE template, if one exists;
 *   2. otherwise the template matching the legacy constant version — the text
 *      the seller form still displays — used as-is (seeded first when absent),
 *      so the ledger NEVER silently pauses: every acceptance gets a version of
 *      record even while the admin console holds only unactivated drafts.
 */
export async function getActiveTemplate() {
  const active = await db.publicationAgreementTemplate.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  })
  if (active) return active
  const legacy = await db.publicationAgreementTemplate.findUnique({
    where: { version: PUBLICATION_AGREEMENT_VERSION },
  })
  if (legacy) return legacy
  return seedLegacyTemplate()
}

// ── Consent ledger ───────────────────────────────────────────────────────────

export interface ConsentInput {
  userId: string
  productId?: string | null
  productTitle?: string | null
  ipAddress?: string | null
  templateId?: string | null
}

/**
 * Record one seller acceptance (idempotent upsert on the unique key
 * (template, user, product); product-less consents are guarded manually
 * because MySQL uniques ignore NULL). Returns the consent + the template
 * version it landed against, or null when no template could be resolved.
 */
export async function recordConsent(input: ConsentInput): Promise<{ id: string; version: string } | null> {
  const template = input.templateId
    ? await db.publicationAgreementTemplate.findUnique({ where: { id: input.templateId } })
    : await getActiveTemplate()
  if (!template) return null

  const productId = input.productId ?? null
  const productTitle = input.productTitle?.trim() || null
  const data = {
    templateId: template.id,
    userId: input.userId,
    productId,
    productTitle,
    ipAddress: input.ipAddress ?? null,
  }

  if (productId) {
    const consent = await db.publicationConsent.upsert({
      where: { templateId_userId_productId: { templateId: template.id, userId: input.userId, productId } },
      create: data,
      update: {}, // re-accepting the same version for the same listing is a no-op
      select: { id: true },
    })
    return { id: consent.id, version: template.version }
  }

  const existing = await db.publicationConsent.findFirst({
    where: { templateId: template.id, userId: input.userId, productId: null },
    select: { id: true },
  })
  if (existing) return { id: existing.id, version: template.version }
  const consent = await db.publicationConsent.create({ data, select: { id: true } })
  return { id: consent.id, version: template.version }
}

// ── Consent search / export ──────────────────────────────────────────────────

export interface ConsentFilters {
  templateId?: string | null
  userId?: string | null
  productId?: string | null
  q?: string | null // free text: product title snapshot / seller name / store
  from?: Date | null
  to?: Date | null
  page: number // 1-based
  pageSize: number
}

function consentWhere(f: ConsentFilters): Prisma.PublicationConsentWhereInput {
  const where: Prisma.PublicationConsentWhereInput = {}
  if (f.templateId) where.templateId = f.templateId
  if (f.userId) where.userId = f.userId
  if (f.productId) where.productId = f.productId
  if (f.from || f.to) {
    where.acceptedAt = {
      ...(f.from ? { gte: f.from } : {}),
      ...(f.to ? { lte: f.to } : {}),
    }
  }
  const q = f.q?.trim()
  if (q) {
    // MySQL ci collation makes contains case-insensitive
    where.OR = [
      { productTitle: { contains: q } },
      { user: { name: { contains: q } } },
      { user: { storeName: { contains: q } } },
    ]
  }
  return where
}

export async function searchConsents(
  f: ConsentFilters
): Promise<{ items: ConsentRowDTO[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, f.page)
  const pageSize = Math.min(100, Math.max(1, f.pageSize))
  const where = consentWhere(f)

  const [total, rows] = await Promise.all([
    db.publicationConsent.count({ where }),
    db.publicationConsent.findMany({
      where,
      orderBy: { acceptedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        template: { select: { id: true, version: true, title: true } },
        user: { select: { id: true, name: true, storeName: true, email: true } },
        product: { select: { id: true } },
      },
    }),
  ])

  return {
    items: rows.map((c) => ({
      id: c.id,
      templateId: c.template.id,
      templateVersion: c.template.version,
      templateTitle: c.template.title,
      productId: c.productId,
      productTitle: c.productTitle,
      productDeleted: !!c.productId && !c.product,
      sellerId: c.user.id,
      sellerName: c.user.name,
      sellerStoreName: c.user.storeName,
      sellerEmail: c.user.email,
      acceptedAt: c.acceptedAt.toISOString(),
      ipAddress: c.ipAddress,
    })),
    total,
    page,
    pageSize,
  }
}

/** CSV cell escape — quote-wrap always, double embedded quotes. */
function csvCell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value)
  return `"${s.replace(/"/g, '""')}"`
}

/** Full-ledger CSV export (honors the same filters as the search). */
export async function exportConsents(f: ConsentFilters): Promise<string> {
  const where = consentWhere(f)
  const rows = await db.publicationConsent.findMany({
    where,
    orderBy: { acceptedAt: 'desc' },
    take: 50000, // hard ceiling — the ledger is per-(template,user,product) and stays small
    include: {
      template: { select: { version: true, title: true } },
      user: { select: { name: true, storeName: true, email: true } },
      product: { select: { id: true } },
    },
  })

  const header = [
    'Template Version',
    'Template Title',
    'Product Title (snapshot)',
    'Product ID',
    'Product Status',
    'Seller Name',
    'Seller Store',
    'Seller Email',
    'Accepted At (UTC)',
    'IP Address',
  ]
  const lines = [header.map(csvCell).join(',')]
  for (const c of rows) {
    lines.push(
      [
        c.template.version,
        c.template.title,
        c.productTitle ?? '',
        c.productId ?? '',
        c.productId ? (c.product ? 'live' : 'deleted') : 'n/a',
        c.user.name,
        c.user.storeName ?? '',
        c.user.email ?? '',
        c.acceptedAt.toISOString(),
        c.ipAddress ?? '',
      ]
        .map(csvCell)
        .join(',')
    )
  }
  // BOM so Excel opens UTF-8 correctly
  return '\uFEFF' + lines.join('\r\n') + '\r\n'
}
