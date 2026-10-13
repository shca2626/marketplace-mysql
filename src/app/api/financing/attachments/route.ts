import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { financingError, readJson } from '@/lib/financing-api'
import { recordAudit } from '@/server/modules/audit/service'
import {
  FinancingServiceError,
  REQUEST_ATTACHMENT_KINDS,
  REQUEST_ATTACHMENT_PARENT_TYPES,
} from '@/server/modules/financing/types'
import { assertApplicantActor } from '@/server/modules/financing/shared'

// POST /api/financing/attachments — link an AccountDocument from the vault to
// a request as a free-form attachment (guarantee docs, studies, project
// files — not tied to a specific requirement; those go through submissions).
// No service function exists yet, so this follows the module's error pattern:
// parent owner check + AccountDocument owner check, then a guarded db write.

const attachSchema = z.object({
  parentType: z.enum(REQUEST_ATTACHMENT_PARENT_TYPES),
  parentId: z.string().min(1),
  accountDocumentId: z.string().min(1),
  kind: z.enum(REQUEST_ATTACHMENT_KINDS),
})

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error

  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const rl = enforceRateLimit(req, 'productWrite', RATE_LIMITS.productWrite, user.id)
  if (rl) return rl

  try {
    const input = attachSchema.parse(await readJson(req))

    // ── parent owner check (request creator / org member / admin) ──
    let applicantUserId: string
    let organizationId: string | null
    if (input.parentType === 'FINANCING_REQUEST') {
      const parent = await db.financingRequest.findUnique({
        where: { id: input.parentId },
        select: { createdById: true, organizationId: true },
      })
      if (!parent) throw new FinancingServiceError('Financing request not found', 404)
      applicantUserId = parent.createdById
      organizationId = parent.organizationId
    } else {
      const parent = await db.accreditationRequest.findUnique({
        where: { id: input.parentId },
        select: { submittedById: true, organizationId: true },
      })
      if (!parent) throw new FinancingServiceError('Accreditation request not found', 404)
      applicantUserId = parent.submittedById
      organizationId = parent.organizationId
    }
    // parent owner check: the applicant themself or an ACTIVE org member
    // (platform admins may attach on behalf of applicants — support flows)
    if (user.role !== 'ADMIN') {
      await assertApplicantActor(user.id, { createdById: applicantUserId, organizationId })
    }

    // ── AccountDocument owner check (personal vault or the org's vault) ──
    const doc = await db.accountDocument.findUnique({
      where: { id: input.accountDocumentId },
      select: { id: true, userId: true, organizationId: true, documentType: true, isActive: true },
    })
    if (!doc) throw new FinancingServiceError('Document not found', 404)
    if (!doc.isActive) {
      throw new FinancingServiceError('That document was replaced and is no longer active', 409)
    }
    const ownsDoc = doc.userId === user.id || (organizationId !== null && doc.organizationId === organizationId)
    if (!ownsDoc && user.role !== 'ADMIN') {
      throw new FinancingServiceError('You can only attach documents from your own vault', 403)
    }

    const attachment = await db.requestAttachment.create({
      data: {
        parentType: input.parentType,
        parentId: input.parentId,
        accountDocumentId: doc.id,
        kind: input.kind,
      },
    })

    await recordAudit({
      actorId: user.id,
      actorType: user.role === 'ADMIN' ? 'ADMIN' : 'USER',
      action: 'REQUEST_ATTACHMENT_ADDED',
      entityType: 'RequestAttachment',
      entityId: attachment.id,
      summary: `${input.kind} (${doc.documentType}) attached to ${input.parentType} ${input.parentId}`,
    })
    return NextResponse.json({ attachment }, { status: 201 })
  } catch (err) {
    return financingError(err, 'attach the document')
  }
}
