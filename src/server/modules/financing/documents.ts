import { db } from '@/lib/db'
import { recordAudit } from '@/server/modules/audit/service'
import { emitNotification } from '@/server/modules/notifications/service'
import { resolvePanel } from '@/server/modules/settings/service'
import { UPLOAD_LIMITS, processImageUpload } from '@/lib/storage/image-pipeline'
import { serializeMediaAsset } from '@/lib/serialize-media'
import { FinancingError, DOCUMENT_TYPES, assertOrgMember, iso } from './shared'

/**
 * ACCOUNT DOCUMENT VAULT — universal document management (R-2, DP-27).
 *
 * Every user (and every org) owns a document vault: KYC evidence is uploaded
 * ONCE through the EXISTING media pipeline (processImageUpload → MediaAsset,
 * sha256-deduped, webp renditions), verified ONCE by the platform, and reused
 * by every financing / accreditation / general KYC flow. Requests never own
 * document bytes — they REFERENCE via RequirementSubmission.accountDocumentId
 * and RequestAttachment (single entry, R-2).
 *
 * Upload policy comes from the financingDocuments settings panel
 * (allowedTypes + maxSizeMb). Soft-delete = isActive=false.
 */

// ── DTOs ────────────────────────────────────────────────────────────────────

export interface AccountDocumentDTO {
  id: string
  userId: string
  userName: string
  organizationId: string | null
  organizationName: string | null
  documentType: string
  title: string | null
  issuedAt: string | null
  expiresAt: string | null
  status: string // PENDING | VERIFIED | REJECTED
  reviewedById: string | null
  reviewedAt: string | null
  note: string | null
  isActive: boolean
  media: ReturnType<typeof serializeMediaAsset>
  createdAt: string
}

// ── Serialization ───────────────────────────────────────────────────────────

type DocRaw = Awaited<ReturnType<typeof db.accountDocument.findFirstOrThrow>>

function serializeDoc(
  d: DocRaw & {
    user: { id: string; name: string }
    organization?: { name: string } | null
    media: Parameters<typeof serializeMediaAsset>[0]
  }
): AccountDocumentDTO {
  return {
    id: d.id,
    userId: d.userId,
    userName: d.user.name,
    organizationId: d.organizationId,
    organizationName: d.organization?.name ?? null,
    documentType: d.documentType,
    title: d.title,
    issuedAt: iso(d.issuedAt),
    expiresAt: iso(d.expiresAt),
    status: d.status,
    reviewedById: d.reviewedById,
    reviewedAt: iso(d.reviewedAt),
    note: d.note,
    isActive: d.isActive,
    media: serializeMediaAsset(d.media),
    createdAt: d.createdAt.toISOString(),
  }
}

const docInclude = {
  user: { select: { id: true, name: true } },
  organization: { select: { name: true } },
  media: true,
} as const

// ── Upload (through the EXISTING media pipeline — DP-19) ───────────────────

export interface UploadDocumentInput {
  file: { buffer: Buffer; originalName: string }
  documentType: string
  title?: string | null
  issuedAt?: string | null
  expiresAt?: string | null
  organizationId?: string | null
}

// 4-digit year + sane range guard (BUY-206): native date inputs can commit
// 5-digit years (e.g. 99999) that overflow SQLite datetime → opaque 500.
// Every vault date goes through this parser → structured 400s instead.
export function parseDocDateSafe(raw: string, label: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim())
  if (!m) throw new FinancingError(`${label} must be a valid calendar date (YYYY-MM-DD)`, 400)
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new FinancingError(`${label} is not a valid calendar date`, 400)
  }
  if (year < 1900 || year > 2100) {
    throw new FinancingError(`${label} year must be between 1900 and 2100`, 400)
  }
  const d = new Date(Date.UTC(year, month - 1, day))
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    throw new FinancingError(`${label} is not a valid calendar date (day out of range)`, 400)
  }
  return d
}

export async function createAccountDocument(
  userId: string,
  input: UploadDocumentInput
): Promise<AccountDocumentDTO> {
  const settings = await resolvePanel('financingDocuments')
  const allowedTypes = (settings.allowedTypes as string[]) ?? [...DOCUMENT_TYPES]
  if (!allowedTypes.includes(input.documentType)) {
    throw new FinancingError(`Document type ${input.documentType} is not allowed on this platform`, 400)
  }
  const maxSizeMb = Number(settings.maxSizeMb) || 8
  if (input.file.buffer.byteLength === 0) throw new FinancingError('Empty file')
  if (input.file.buffer.byteLength > maxSizeMb * 1024 * 1024) {
    throw new FinancingError(`File exceeds the ${maxSizeMb} MB limit`, 413)
  }
  if (input.file.buffer.byteLength > UPLOAD_LIMITS.maxBytes) {
    throw new FinancingError('File exceeds the hard upload ceiling', 413)
  }

  // org-scoped docs require membership
  if (input.organizationId) await assertOrgMember(userId, input.organizationId)

  let issuedAt: Date | null = null
  let expiresAt: Date | null = null
  try {
    issuedAt = input.issuedAt ? parseDocDateSafe(input.issuedAt, 'Issue date') : null
    expiresAt = input.expiresAt ? parseDocDateSafe(input.expiresAt, 'Expiry date') : null
  } catch (err) {
    if (err instanceof FinancingError) throw err
    throw new FinancingError('Invalid issued/expires date', 400)
  }
  if (issuedAt && expiresAt && expiresAt.getTime() < issuedAt.getTime()) {
    throw new FinancingError('Expiry date cannot be before the issue date', 400)
  }
  if (expiresAt && expiresAt.getTime() < Date.now()) {
    throw new FinancingError('This document is already expired — upload a current version', 400)
  }

  // The REAL pipeline: magic-sniff, size-cap, webp renditions, sha256.
  // PDFs and other non-image files fail the sniff — translate to a clear
  // 415 instead of the opaque 500 (BUY-206 family).
  const processed = await processImageUpload(input.file.buffer).catch((err: unknown) => {
    if (err instanceof FinancingError) throw err
    const msg = err instanceof Error ? err.message : String(err)
    if (/magic|format|type|image|unsupported|not an image/i.test(msg)) {
      throw new FinancingError(
        'This file type is not supported — the vault accepts JPG, PNG, WebP or GIF images (PDF is not supported yet)',
        415
      )
    }
    throw new FinancingError(`Could not process the image — ${msg}`, 400)
  })

  const doc = await db.$transaction(async (tx) => {
    // Dedupe by content hash — same bytes never stored twice
    let asset = await tx.mediaAsset.findUnique({ where: { sha256: processed.sha256 } })
    if (!asset) {
      asset = await tx.mediaAsset.create({
        data: {
          key: processed.baseKey,
          originalName: (input.file.originalName || 'document').replace(/[\r\n\0]/g, '').slice(0, 255),
          mime: processed.mime,
          size: processed.originalBytes,
          width: processed.width,
          height: processed.height,
          sha256: processed.sha256,
          variants: JSON.stringify(processed.variants),
          uploadedById: userId,
        },
      })
    }
    return tx.accountDocument.create({
      data: {
        userId,
        organizationId: input.organizationId ?? null,
        mediaId: asset.id,
        documentType: input.documentType,
        title: input.title?.trim() || null,
        issuedAt,
        expiresAt,
        status: 'PENDING',
      },
      include: docInclude,
    })
  })

  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'DOCUMENT_UPLOADED',
    entityType: 'AccountDocument',
    entityId: doc.id,
    summary: `${input.documentType} uploaded to the vault${input.organizationId ? ' (org scope)' : ''}`,
    metadata: { documentType: input.documentType, mediaId: doc.mediaId, organizationId: input.organizationId ?? null },
  })
  return serializeDoc(doc as never)
}

// ── Listing (by user, by org scope, by documentType — DP-27) ────────────────

export async function listAccountDocuments(
  userId: string,
  filter?: { documentType?: string; organizationId?: string | null; status?: string; includeInactive?: boolean }
): Promise<AccountDocumentDTO[]> {
  let where: Record<string, unknown>
  if (filter?.organizationId) {
    // org vault: any member sees the org's docs
    await assertOrgMember(userId, filter.organizationId)
    where = {
      organizationId: filter.organizationId,
      ...(filter.documentType ? { documentType: filter.documentType } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.includeInactive ? {} : { isActive: true }),
    }
  } else {
    // personal vault: everything the user uploaded themselves (any org scope)
    where = {
      userId,
      ...(filter?.documentType ? { documentType: filter.documentType } : {}),
      ...(filter?.status ? { status: filter.status } : {}),
      ...(filter?.includeInactive ? {} : { isActive: true }),
    }
  }
  const rows = await db.accountDocument.findMany({
    where,
    include: docInclude,
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return rows.map((r) => serializeDoc(r as never))
}

// ── Admin: platform-wide vault queue (FIN-7 gate console) ───────────────────

/**
 * Admin listing across ALL vault documents (DP-27 verification queue): the
 * gate console's Documents section (status=PENDING) + the review console's
 * per-applicant doc lookup (?userId=). Read-only, owner info included.
 */
export async function adminListDocuments(filter?: {
  status?: string
  userId?: string
  organizationId?: string
  documentType?: string
}): Promise<AccountDocumentDTO[]> {
  const rows = await db.accountDocument.findMany({
    where: {
      isActive: true,
      ...(filter?.status ? { status: filter.status } : {}),
      ...(filter?.userId ? { userId: filter.userId } : {}),
      ...(filter?.organizationId ? { organizationId: filter.organizationId } : {}),
      ...(filter?.documentType ? { documentType: filter.documentType } : {}),
    },
    include: docInclude,
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return rows.map((r) => serializeDoc(r as never))
}

export async function getAccountDocument(
  userId: string,
  documentId: string,
  actorRole = 'USER'
): Promise<AccountDocumentDTO> {
  const doc = await db.accountDocument.findUnique({ where: { id: documentId }, include: docInclude })
  if (!doc || !doc.isActive) throw new FinancingError('Document not found', 404)
  const isOwner = doc.userId === userId
  const isAdmin = actorRole === 'ADMIN'
  const isOrgMember = doc.organizationId
    ? !!(await db.organizationMember.findFirst({ where: { userId, organizationId: doc.organizationId } }))
    : false
  if (!isOwner && !isAdmin && !isOrgMember) throw new FinancingError('Access denied', 403)
  return serializeDoc(doc as never)
}

// ── Meta updates + soft-delete ──────────────────────────────────────────────

export async function updateAccountDocument(
  userId: string,
  documentId: string,
  input: { title?: string | null; issuedAt?: string | null; expiresAt?: string | null }
): Promise<AccountDocumentDTO> {
  const doc = await db.accountDocument.findUnique({ where: { id: documentId } })
  if (!doc || !doc.isActive) throw new FinancingError('Document not found', 404)
  if (doc.userId !== userId) throw new FinancingError('Only the uploader can edit document details', 403)

  let issuedAt: Date | null = doc.issuedAt
  let expiresAt: Date | null = doc.expiresAt
  try {
    if (input.issuedAt !== undefined)
      issuedAt = input.issuedAt ? parseDocDateSafe(input.issuedAt, 'Issue date') : null
    if (input.expiresAt !== undefined)
      expiresAt = input.expiresAt ? parseDocDateSafe(input.expiresAt, 'Expiry date') : null
  } catch (err) {
    if (err instanceof FinancingError) throw err
    throw new FinancingError('Invalid issued/expires date', 400)
  }

  const updated = await db.accountDocument.update({
    where: { id: documentId },
    data: {
      ...(input.title !== undefined ? { title: input.title?.trim() || null } : {}),
      issuedAt,
      expiresAt,
    },
    include: docInclude,
  })
  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'ACCOUNT_DOCUMENT_UPDATED',
    entityType: 'AccountDocument',
    entityId: documentId,
    summary: `${doc.documentType} vault details updated`,
    metadata: { documentType: doc.documentType },
  })
  return serializeDoc(updated as never)
}

export async function softDeleteAccountDocument(
  userId: string,
  documentId: string,
  actorRole = 'USER'
): Promise<{ ok: true }> {
  const doc = await db.accountDocument.findUnique({ where: { id: documentId } })
  if (!doc || !doc.isActive) throw new FinancingError('Document not found', 404)
  if (doc.userId !== userId && actorRole !== 'ADMIN') {
    throw new FinancingError('Only the uploader can remove this document', 403)
  }
  await db.accountDocument.update({ where: { id: documentId }, data: { isActive: false } })
  await recordAudit({
    actorId: userId,
    actorType: actorRole === 'ADMIN' ? 'ADMIN' : 'USER',
    action: 'ACCOUNT_DOCUMENT_DELETED',
    entityType: 'AccountDocument',
    entityId: documentId,
    summary: `${doc.documentType} removed from the vault (soft delete)`,
    metadata: { documentType: doc.documentType },
  })
  return { ok: true }
}

// ── Platform verification — verify ONCE, reused everywhere (R-2) ────────────

export async function verifyAccountDocument(
  adminId: string,
  documentId: string,
  note?: string
): Promise<AccountDocumentDTO> {
  const doc = await db.accountDocument.findUnique({ where: { id: documentId }, include: docInclude })
  if (!doc || !doc.isActive) throw new FinancingError('Document not found', 404)
  if (doc.status !== 'PENDING') {
    throw new FinancingError(`Document is already ${doc.status.toLowerCase()} — it is verified once and reused`, 409)
  }
  const updated = await db.accountDocument.update({
    where: { id: documentId },
    data: { status: 'VERIFIED', reviewedById: adminId, reviewedAt: new Date(), note: note?.trim() || null },
    include: docInclude,
  })
  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'DOCUMENT_VERIFIED',
    entityType: 'AccountDocument',
    entityId: documentId,
    summary: `${doc.documentType}${doc.title ? ` “${doc.title}”` : ''} verified`,
    metadata: { note: note ?? null },
  })
  await emitNotification({
    userId: doc.userId,
    type: 'DOCUMENT_VERIFIED',
    title: 'Document verified',
    body: `Your ${doc.title ?? doc.documentType} passed platform verification and can be reused on every application.`,
    linkView: 'financing',
    linkId: documentId,
  })
  return serializeDoc(updated as never)
}

export async function rejectAccountDocument(
  adminId: string,
  documentId: string,
  note: string
): Promise<AccountDocumentDTO> {
  const clean = note.trim()
  if (!clean) throw new FinancingError('A rejection note is required')
  const doc = await db.accountDocument.findUnique({ where: { id: documentId }, include: docInclude })
  if (!doc || !doc.isActive) throw new FinancingError('Document not found', 404)
  if (doc.status !== 'PENDING') {
    throw new FinancingError(`Document is already ${doc.status.toLowerCase()}`, 409)
  }
  const updated = await db.accountDocument.update({
    where: { id: documentId },
    data: { status: 'REJECTED', reviewedById: adminId, reviewedAt: new Date(), note: clean },
    include: docInclude,
  })
  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'DOCUMENT_REJECTED',
    entityType: 'AccountDocument',
    entityId: documentId,
    summary: `${doc.documentType}${doc.title ? ` “${doc.title}”` : ''} rejected`,
    metadata: { note: clean },
  })
  await emitNotification({
    userId: doc.userId,
    type: 'DOCUMENT_REJECTED',
    title: 'Document rejected',
    body: `Your ${doc.title ?? doc.documentType} was rejected: ${clean}`,
    linkView: 'financing',
    linkId: documentId,
  })
  return serializeDoc(updated as never)
}

/** Re-queue a REJECTED vault document (owner fixed/replaced context). */
export async function requeueAccountDocument(userId: string, documentId: string): Promise<AccountDocumentDTO> {
  const doc = await db.accountDocument.findUnique({ where: { id: documentId } })
  if (!doc || !doc.isActive) throw new FinancingError('Document not found', 404)
  if (doc.userId !== userId) throw new FinancingError('Access denied', 403)
  if (doc.status !== 'REJECTED') throw new FinancingError(`Document is ${doc.status.toLowerCase()}`, 409)
  const updated = await db.accountDocument.update({
    where: { id: documentId },
    data: { status: 'PENDING', reviewedById: null, reviewedAt: null, note: null },
    include: docInclude,
  })
  return serializeDoc(updated as never)
}
