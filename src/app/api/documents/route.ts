import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import {
  createAccountDocument,
  listAccountDocuments,
} from '@/server/modules/financing/documents'
import { FinancingError } from '@/server/modules/financing/shared'
import { dispatchDocumentForVerification } from '@/server/modules/kyc/provider/dispatch'

// POST /api/documents — universal document vault upload (DP-27 — ALL users).
// Multipart: file + documentType + optional title/issuedAt/expiresAt/
// organizationId. Goes through the REAL media pipeline (magic-sniff, size
// caps, webp renditions, sha256-dedupe) exactly like the uploads route.
export async function POST(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'documents:upload', RATE_LIMITS.upload, user.id)
  if (rl) return rl

  try {
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    const documentType = String(form.get('documentType') ?? '').trim()
    if (!documentType) {
      return NextResponse.json({ error: 'A document type is required' }, { status: 400 })
    }
    const organizationId = String(form.get('organizationId') ?? '').trim() || null
    const doc = await createAccountDocument(user.id, {
      file: { buffer: Buffer.from(await file.arrayBuffer()), originalName: file.name },
      documentType,
      title: String(form.get('title') ?? '') || null,
      issuedAt: String(form.get('issuedAt') ?? '') || null,
      expiresAt: String(form.get('expiresAt') ?? '') || null,
      organizationId,
    })
    // Phase 12.4 — provider dispatch, FIRE-AND-FORGET: a dispatch failure
    // must NEVER break the upload (dispatch catches its own adapter errors
    // into PROVIDER_ERROR cases; this .catch is the last-resort belt).
    // MANUAL routing (the default) resolves to a no-op inside dispatch.
    void dispatchDocumentForVerification(doc.id).catch((err: unknown) => {
      console.error('[kyc-provider] dispatch failed after upload:', err instanceof Error ? err.message : err)
    })
    return NextResponse.json({ document: doc }, { status: 201 })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('documents upload error', err)
    return NextResponse.json({ error: 'Upload failed while processing' }, { status: 500 })
  }
}

// GET /api/documents — my vault: personal (everything I uploaded) or an org
// scope I am a member of. Filters: documentType, status.
export async function GET(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const sp = req.nextUrl.searchParams
    const orgScope = sp.get('organizationId')
    const documents = await listAccountDocuments(user.id, {
      documentType: sp.get('documentType') ?? undefined,
      status: sp.get('status') ?? undefined,
      includeInactive: sp.get('includeInactive') === 'true',
      organizationId: orgScope || undefined,
    })
    return NextResponse.json({ documents })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('documents list error', err)
    return NextResponse.json({ error: 'Failed to load your documents' }, { status: 500 })
  }
}
