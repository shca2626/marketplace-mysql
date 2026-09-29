// Media URL helpers — shared by server and client (NO node imports here).
// ──────────────────────────────────────────────────────────────────────
// Product.images stores the MEDIUM rendition URL of an uploaded asset
// (e.g. "/api/media/2026/09/ab12cd34-k3x9f2.medium.png"). Because every
// rendition of one asset shares the same key base and only differs by the
// `.{role}.png` suffix, any consumer can cheaply pick the right size:

export type VariantRole = 'thumb' | 'medium' | 'large' | 'full'

export function mediaUrl(key: string): string {
  return `/api/media/${key}`
}

const ROLE_SUFFIX = /\.(thumb|medium|large|full)\.(webp|png)$/

/**
 * Swap the rendition of an uploaded-media URL:
 *   resolveImageVariant('/api/media/2026/09/ab-c.medium.png', 'thumb')
 *   → '/api/media/2026/09/ab-c.thumb.png'
 * External URLs (CDN, seeds) pass through untouched.
 */
export function resolveImageVariant(url: string | null | undefined, role: VariantRole): string {
  if (!url) return ''
  if (!url.startsWith('/api/media/')) return url
  return url.replace(ROLE_SUFFIX, `.${role}.png`)
}

/** First image of a product at card size (thumb) — falls back to any URL. */
export function cardImage(images: string[] | null | undefined): string | undefined {
  if (!images || images.length === 0) return undefined
  return resolveImageVariant(images[0], 'thumb')
}
