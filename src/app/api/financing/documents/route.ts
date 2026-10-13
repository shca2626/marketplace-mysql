import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { financingError, readJson } from '@/lib/financing-api'
import { listAccountDocuments } from '@/server/modules/financing/documents'
import { FinancingError } from '@/server/modules/financing/shared'

// /api/financing/documents — the universal document vault (DP-27: every user
// and organization; verify once, reuse everywhere).
// GET  → my vault (personal docs; add ?organizationId= for an org vault).
// POST → file a document against an uploaded MediaAsset (starts PENDING).

const createSchema = z.object({
  mediaId: z.string().min(1),
  documentType: z.string().trim().min(2).max(40),
  title: z.string().trim().max(120).optional().nullable(),
  organizationId: z.string().optional().nullable(),
  issuedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Issued date must be YYYY-MM-DD')
    .optional()
    .nullable(),
  expiresAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expiry date must be YYYY-MM-DD')
    .optional()
    .nullable(),
})

export async function GET(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const sp = req.nextUrl.searchParams
    const documents = await listAccountDocuments(user.id, {
      includeInactive: sp.get('includeInactive') === 'true',
      organizationId: sp.get('organizationId') || undefined,
      ...(sp.get('documentType') ? { documentType: sp.get('documentType') as string } : {}),
    })
    return NextResponse.json({ documents })
  } catch (err) {
    return financingError(err, 'load your document vault')
  }
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error

  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const rl = enforceRateLimit(req, 'document', RATE_LIMITS.document, user.id)
  if (rl) return rl

  try {
    const input = createSchema.parse(await readJson(req))

    // The MediaAsset must exist and be owned by the uploader (vault uploads
    // mint assets owned by the uploader — see the image pipeline).
    const media = await db.mediaAsset.findUnique({
      where: { id: input.mediaId },
      select: { id: true, uploadedById: true },
    })
    if (!media) throw new FinancingError('Uploaded file not found — upload it again', 404)
    if (media.uploadedById !== user.id) {
      throw new FinancingError('That file belongs to another account', 403)
    }

    // Org-scoped documents require an ACTIVE membership (M2).
    let organizationId: string | null = null
    if (input.organizationId) {
      const member = await db.organizationMember.findFirst({
        where: { userId: user.id, organizationId: input.organizationId },
        select: { id: true },
      })
      if (!member) throw new FinancingError('You are not a member of that organization', 403)
      organizationId = input.organizationId
    }

    const document = await db.accountDocument.create({
      data: {
        userId: user.id,
        organizationId,
        mediaId: media.id,
        documentType: input.documentType,
        title: input.title ?? null,
        issuedAt: input.issuedAt ? new Date(input.issuedAt) : null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        status: 'PENDING',
      },
    })
    return NextResponse.json({ document: { id: document.id } }, { status: 201 })
  } catch (err) {
    return financingError(err, 'file the document')
  }
}
