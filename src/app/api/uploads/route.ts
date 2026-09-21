import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { UPLOAD_LIMITS, processImageUpload } from '@/lib/storage/image-pipeline'
import { serializeMediaAsset } from '@/lib/serialize-media'
import type { MediaAssetDTO } from '@/lib/types'

// POST /api/uploads — multipart image upload (day-1 storage core).
// Authenticated SELLER/ADMIN only. Each file is magic-byte-sniffed, size-capped,
// processed into webp renditions (EXIF stripped) and tracked as a MediaAsset
// (sha256-deduplicated). Product.images then references the medium URL.
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Please sign in first' }, { status: 401 })
  if (user.role !== 'SELLER' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only sellers can upload media' }, { status: 403 })
  }

  const limited = enforceRateLimit(req, 'upload', RATE_LIMITS.upload, user.id)
  if (limited) return limited

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const files = form.getAll('file').filter((f): f is File => f instanceof File)
  if (files.length === 0) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (files.length > UPLOAD_LIMITS.maxFilesPerRequest) {
    return NextResponse.json({ error: `At most ${UPLOAD_LIMITS.maxFilesPerRequest} files per request` }, { status: 400 })
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

      // Dedupe by content hash — same bytes never stored twice.
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
        console.error('upload error', file.name, err)
        errors.push({ name: file.name, error: 'Upload failed while processing' })
      }
    }
  }

  return NextResponse.json(
    { assets, errors },
    { status: assets.length > 0 ? 201 : (errors.length > 0 ? 422 : 400) },
  )
}

// GET /api/uploads — the signed-in user's media library (paged, newest first).
// Powers the seller form's "My library" section; ADMIN sees every asset.
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Please sign in first' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 24, 1), 60)
    const offset = Math.max(Number(searchParams.get('offset')) || 0, 0)

    const where = user.role === 'ADMIN' ? {} : { uploadedById: user.id }
    const [rows, total] = await Promise.all([
      db.mediaAsset.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset }),
      db.mediaAsset.count({ where }),
    ])

    return NextResponse.json({ assets: rows.map(serializeMediaAsset), total, limit, offset })
  } catch (err) {
    console.error('uploads GET error', err)
    return NextResponse.json({ error: 'Failed to load media library' }, { status: 500 })
  }
}

function sanitizeName(name: string): string {
  return (name || 'image').replace(/[\r\n\0]/g, '').slice(0, 255)
}
