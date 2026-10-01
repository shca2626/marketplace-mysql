import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import {
  updateAccountDocument,
  softDeleteAccountDocument,
} from '@/server/modules/financing/documents'
import { FinancingError } from '@/server/modules/financing/shared'

// PATCH /api/documents/[id] — owner edits metadata (title/issuedAt/expiresAt).
const schema = z.object({
  title: z.string().max(200).nullable().optional(),
  issuedAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
})

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'documents:update', { limit: 60, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid document metadata', details: parsed.error.flatten() }, { status: 400 })
    }
    const document = await updateAccountDocument(user.id, id, parsed.data)
    return NextResponse.json({ document })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('documents PATCH error', err)
    return NextResponse.json({ error: 'Failed to update the document' }, { status: 500 })
  }
}

// ── DELETE /api/documents/[id] — soft delete with live-reference guard (BUY-209) ──
//
// A vault document referenced by a SUBMITTED (or beyond) financing /
// accreditation request is load-bearing evidence: deleting it would orphan
// the request's checklist rows. Such deletes are blocked with a clear 400
// that reports the reference count; `?confirm=force` explicitly overrides
// (soft delete — history rows survive either way, R-2).

/** Statuses under which a request's evidence is still editable/mutable. */
const OPEN_PARENT_STATUSES = new Set(['DRAFT', 'CANCELLED'])

async function countLiveReferences(documentId: string): Promise<number> {
  // 1) RequirementSubmission evidence — the checklist rows themselves.
  const submissions = await db.requirementSubmission.findMany({
    where: { accountDocumentId: documentId },
    select: {
      financingRequest: { select: { status: true } },
      accreditationRequest: { select: { status: true } },
    },
  })
  let live = submissions.filter((s) => {
    const status = s.financingRequest?.status ?? s.accreditationRequest?.status
    return !!status && !OPEN_PARENT_STATUSES.has(status)
  }).length

  // 2) Free-form request attachments (guarantee docs, studies, project files)
  //    use the loose-parent pattern — resolve their parent statuses explicitly.
  const attachments = await db.requestAttachment.findMany({
    where: { accountDocumentId: documentId },
    select: { parentType: true, parentId: true },
  })
  const finIds = attachments.filter((a) => a.parentType === 'FINANCING_REQUEST').map((a) => a.parentId)
  const accIds = attachments.filter((a) => a.parentType === 'ACCREDITATION_REQUEST').map((a) => a.parentId)
  if (finIds.length > 0) {
    const rows = await db.financingRequest.findMany({ where: { id: { in: finIds } }, select: { status: true } })
    live += rows.filter((r) => !OPEN_PARENT_STATUSES.has(r.status)).length
  }
  if (accIds.length > 0) {
    const rows = await db.accreditationRequest.findMany({ where: { id: { in: accIds } }, select: { status: true } })
    live += rows.filter((r) => !OPEN_PARENT_STATUSES.has(r.status)).length
  }
  return live
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'documents:delete', { limit: 30, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params

    // Ownership/ownership-precedence first so we never leak reference info
    // about a document the caller doesn't own (mirrors the service's checks).
    const doc = await db.accountDocument.findUnique({ where: { id }, select: { userId: true, isActive: true } })
    if (!doc || !doc.isActive) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }
    if (doc.userId !== user.id && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only the uploader can remove this document' }, { status: 403 })
    }

    const force = req.nextUrl.searchParams.get('confirm') === 'force'
    if (!force) {
      const references = await countLiveReferences(id)
      if (references > 0) {
        return NextResponse.json(
          {
            error: `This document is attached to ${references} active financing application${references === 1 ? '' : 's'} — removing it would orphan those checklist items. Remove it anyway if you are sure.`,
            references,
            code: 'DOCUMENT_REFERENCED',
          },
          { status: 400 }
        )
      }
    }

    // actorRole flows through so the ADMIN override allowed by the pre-check
    // above isn't rejected by the service's own ownership guard.
    const result = await softDeleteAccountDocument(user.id, id, user.role)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('documents DELETE error', err)
    return NextResponse.json({ error: 'Failed to remove the document' }, { status: 500 })
  }
}
