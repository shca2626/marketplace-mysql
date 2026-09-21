import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { getStorage, renditionKey, MEDIA_ROLES, type MediaRole } from './index'

// Image processing pipeline (day-1 core).
// ───────────────────────────────────────
// One upload → four webp renditions, metadata (EXIF/GPS) stripped:
//   thumb  400w  — product cards, cart lines, thumbnails
//   medium 800w  — default display size (stored in Product.images)
//   large 1200w  — product page gallery / lightbox
//   full  2000w  — zoom / download-grade rendition
// Never upscales. Animated GIF/WebP keeps its animation in every rendition.

export const UPLOAD_LIMITS = {
  maxBytes: 8 * 1024 * 1024, // 8 MB per file
  maxPixels: 40_000_000, // 40 MP sanity cap
  maxFilesPerRequest: 6,
} as const

const ROLE_WIDTHS: Record<MediaRole, number> = { thumb: 400, medium: 800, large: 1200, full: 2000 }

export const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIMES)[number]

/** Magic-byte sniffing — never trust the declared Content-Type. */
export function sniffImageMime(buf: Buffer): AllowedImageMime | null {
  if (buf.length < 12) return null
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  // GIF87a / GIF89a
  if (buf.slice(0, 4).toString('ascii') === 'GIF8') return 'image/gif'
  // WEBP: "RIFF" .... "WEBP"
  if (
    buf.slice(0, 4).toString('ascii') === 'RIFF' &&
    buf.slice(8, 12).toString('ascii') === 'WEBP'
  )
    return 'image/webp'
  return null
}

export interface ProcessedImage {
  baseKey: string
  sha256: string
  mime: AllowedImageMime
  originalBytes: number
  width: number | null
  height: number | null
  animated: boolean
  variants: Record<MediaRole, string>
  /** per-role byte sizes (for diagnostics / admin) */
  renditionSizes: Record<MediaRole, number>
}

export async function processImageUpload(input: Buffer): Promise<ProcessedImage> {
  const sniffed = sniffImageMime(input)
  if (!sniffed) {
    throw Object.assign(new Error('Unsupported image format — use JPEG, PNG, WebP or GIF'), { status: 415 })
  }
  if (input.byteLength > UPLOAD_LIMITS.maxBytes) {
    throw Object.assign(new Error('Image exceeds the 8 MB limit'), { status: 413 })
  }

  const sha256 = createHash('sha256').update(input).digest('hex')

  // Metadata first (also validates the image decodes + pixel-count sanity).
  const meta = await sharp(input, { limitInputPixels: UPLOAD_LIMITS.maxPixels }).metadata()
  const animated = (meta.pages ?? 1) > 1
  const width = meta.width ?? null
  const height = meta.height ?? null

  const baseKey = `${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, '0')}/${sha256.slice(0, 8)}-${randomSuffix()}`
  const storage = getStorage()

  const variants = {} as Record<MediaRole, string>
  const renditionSizes = {} as Record<MediaRole, number>

  for (const role of MEDIA_ROLES) {
    const target = ROLE_WIDTHS[role]
    // `animated` is an INPUT option (set above): it reads all frames and keeps
    // the animation in the encoded output. Never upscales smaller images.
    const out = await sharp(input, { animated })
      .rotate() // honor EXIF orientation, then drop metadata
      .resize({ width: target, withoutEnlargement: true })
      .webp({ quality: role === 'thumb' ? 78 : 82, effort: 4 })
      .toBuffer()
    const key = renditionKey(baseKey, role)
    await storage.put(key, out)
    variants[role] = key
    renditionSizes[role] = out.byteLength
  }

  return { baseKey, sha256, mime: sniffed, originalBytes: input.byteLength, width, height, animated, variants, renditionSizes }
}

export async function deleteRenditions(variants: Record<string, string> | null | undefined) {
  if (!variants) return
  const storage = getStorage()
  await Promise.all(Object.values(variants).map((k) => storage.delete(k)))
}

function randomSuffix(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = Buffer.from(crypto.getRandomValues(new Uint8Array(6)))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}
