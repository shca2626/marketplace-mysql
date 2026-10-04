import { NextRequest, NextResponse } from 'next/server'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { randomBytes } from 'crypto'
import { getSessionUser } from '@/lib/auth'

// POST /api/upload — multipart image upload for authenticated users.
// Files are written under public/uploads/<scope>/ and served by the dev
// server as static assets; the returned relative URL is what gets stored
// in DB records (Product.images etc.), so uploads survive DB reseeds.

const MAX_BYTES = 6 * 1024 * 1024 // 6 MB
const ALLOWED_SCOPES = new Set(['products', 'avatars'])
const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

// Magic-byte sniffing — trust the bytes, never the declared Content-Type.
function sniffMime(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'image/png'
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buf.subarray(8, 12).toString('latin1') === 'WEBP'
  )
    return 'image/webp'
  if (buf.length >= 6 && buf.subarray(0, 4).toString('latin1').startsWith('GIF8')) return 'image/gif'
  return null
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const form = await req.formData()
    const scope = (form.get('scope') as string) || 'products'
    if (!ALLOWED_SCOPES.has(scope)) {
      return NextResponse.json({ error: 'Invalid upload scope' }, { status: 400 })
    }

    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (file.size === 0) return NextResponse.json({ error: 'File is empty' }, { status: 400 })
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Image is too large (max 6 MB)' }, { status: 413 })
    }

    const buf = Buffer.from(await file.arrayBuffer())
    const mime = sniffMime(buf)
    if (!mime || !MIME_EXT[mime]) {
      return NextResponse.json(
        { error: 'Unsupported image type — use JPG, PNG, WebP or GIF' },
        { status: 415 }
      )
    }

    const name = `img-${Date.now().toString(36)}-${randomBytes(5).toString('hex')}.${MIME_EXT[mime]}`
    const dir = path.join(process.cwd(), 'public', 'uploads', scope)
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, name), buf)

    return NextResponse.json({ url: `/uploads/${scope}/${name}`, bytes: buf.length, mime })
  } catch (err) {
    console.error('[upload] failed:', err)
    return NextResponse.json({ error: 'Upload failed — please try again' }, { status: 500 })
  }
}
