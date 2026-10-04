import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { UPLOAD_LIMITS, processImageUpload } from '@/lib/storage/image-pipeline'
import { serializeMediaAsset } from '@/lib/serialize-media'
import type { MediaAssetDTO } from '@/lib/types'

// POST /api/financing/documents/upload — multipart image upload for the
// universal document vault (DP-27), open to EVERY signed-in role. Mirrors
// POST /api/uploads exactly (magic-byte sniff, 8 MB cap, webp renditions,
// EXIF strip, sha256 dedupe, MediaAsset tracking) — that route is
// SELLER/ADMIN-only, so applicants (BUYER role) need this financing-scoped
// twin to file vault documents and wizard evidence (R-6: upload-only media).

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error

  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const rl = enforceRateLimit(req, 'upload', RATE_LIMITS.upload, user.id)
  if (rl) return rl

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const files = form.getAll('file').filter((f): f is File => f instanceof File)
  if (files.length === 0) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (files.length > UPLOAD_LIMITS.maxFilesPerRequest) {
    return NextResponse.json(
      { error: `At most ${UPLOAD_LIMITS.maxFilesPerRequest} files per request` },
      { status: 400 }
    )
  }

  const assets: MediaAssetDTO[] = []
  const errors: { name: string; error: string }[] = []

  for (const file of files) {
    try {
      const buf = Buffer.from(await file.arrayBuffer())
      if (buf.byteLength === 0) {
        errors.push({ name: file.name, error: 'Empty file' })
        continue
      }
      if (buf.byteLength > UPLOAD_LIMITS.maxBytes) {
        errors.push({ name: file.name, error: 'Image exceeds the 8 MB limit' })
        continue
      }

      const processed = await processImageUpload(buf) // throws 415 on bad format

      const existing = await db.mediaAsset.findUnique({ where: { sha256: processed.sha256 } })
      if (existing) {
        assets.push(serializeMediaAsset(existing))
        continue
      }

      const asset = await db.mediaAsset.create({
        data: {
          key: processed.baseKey,
          originalName: sanitizeName(file.name),
          mime: processed.mime,
          size: processed.originalBytes,
          width: processed.width,
          height: processed.height,
          sha256: processed.sha256,
          variants: JSON.stringify(processed.variants),
          uploadedById: user.id,
        },
      })
      assets.push(serializeMediaAsset(asset))
    } catch (err) {
      const status = (err as { status?: number }).status
      if (status === 415 || status === 413) {
        errors.push({ name: file.name, error: (err as Error).message })
      } else {
        console.error('financing document upload error', file.name, err)
        errors.push({ name: file.name, error: 'Upload failed while processing' })
      }
    }
  }

  return NextResponse.json(
    { assets, errors },
    { status: assets.length > 0 ? 201 : errors.length > 0 ? 422 : 400 }
  )
}

function sanitizeName(name: string): string {
  return (name || 'image').replace(/[\r\n\0]/g, '').slice(0, 255)
}
