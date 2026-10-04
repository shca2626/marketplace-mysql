import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { DOCUMENT_LIMITS, processDocumentUpload } from '@/lib/storage/document-pipeline'

// POST /api/uploads/document — document upload for RFQ attachments and
// settlement evidence. Any authenticated user (buyers attach RFQ spec sheets
// and settlement proof; sellers/admins the same). Files are magic-byte
// sniffed, capped at 10 MB, sha256-deduplicated and stored verbatim (no
// renditions) — MediaAsset.variants stays null and `key` keeps its extension.

function sanitizeName(name: string): string {
  return name.replace(/[\r\n\0]/g, '').slice(0, 255) || 'document'
}

export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Please sign in first' }, { status: 401 })
  if (user.status === 'SUSPENDED') {
    return NextResponse.json({ error: 'Your account is suspended' }, { status: 403 })
  }

  const limited = enforceRateLimit(req, 'document', RATE_LIMITS.document, user.id)
  if (limited) return limited

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const files = form.getAll('file').filter((f): f is File => f instanceof File)
  if (files.length === 0) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (files.length > DOCUMENT_LIMITS.maxFilesPerRequest) {
    return NextResponse.json(
      { error: `At most ${DOCUMENT_LIMITS.maxFilesPerRequest} documents per request` },
      { status: 400 }
    )
  }

  const assets: { id: string; key: string; name: string; mime: string; size: number; url: string }[] = []
  const errors: { name: string; error: string }[] = []

  for (const file of files) {
    try {
      const buf = Buffer.from(await file.arrayBuffer())
      if (buf.byteLength === 0) {
        errors.push({ name: file.name, error: 'Empty file' })
        continue
      }

      const processed = await processDocumentUpload(buf) // throws 415/413

      // Dedupe by content hash — same bytes never stored twice.
      const existing = await db.mediaAsset.findUnique({ where: { sha256: processed.sha256 } })
      if (existing) {
        assets.push({
          id: existing.id,
          key: existing.key,
          name: sanitizeName(file.name),
          mime: existing.mime,
          size: existing.size,
          url: `/api/media/${existing.key}`,
        })
        continue
      }

      const asset = await db.mediaAsset.create({
        data: {
          key: processed.key,
          originalName: sanitizeName(file.name),
          mime: processed.mime,
          size: processed.size,
          sha256: processed.sha256,
          variants: null, // documents have no renditions
          uploadedById: user.id,
        },
      })
      assets.push({
        id: asset.id,
        key: asset.key,
        name: asset.originalName,
        mime: asset.mime,
        size: asset.size,
        url: `/api/media/${asset.key}`,
      })
    } catch (err) {
      errors.push({
        name: file.name,
        error: err instanceof Error ? err.message : 'Upload failed',
      })
    }
  }

  if (assets.length === 0 && errors.length > 0) {
    return NextResponse.json(
      { error: errors[0]?.error ?? 'Upload failed', errors },
      { status: 400 }
    )
  }

  return NextResponse.json({ assets, errors }, { status: 201 })
}
