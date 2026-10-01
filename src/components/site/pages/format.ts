/**
 * Shared formatting helpers for the tier-2 public pages. Plain functions —
 * safe to import from both server components and client islands.
 */

/** "Aug 18, 2025" — pinned to UTC so SSR and client renders agree. */
export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

/** First URL from a product `images` JSON string array — parse failures yield null. */
export function firstImage(imagesJson: string | null | undefined): string | null {
  if (!imagesJson) return null
  try {
    const arr: unknown = JSON.parse(imagesJson)
    if (!Array.isArray(arr) || arr.length === 0) return null
    const first = arr[0]
    return typeof first === 'string' && first.trim() ? first.trim() : null
  } catch {
    return null
  }
}

/** Initials monogram for a name ("Al-Amal Bank" → "AB"). */
export function initialsOf(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z\u0600-\u06FF]/.test(w[0] ?? ''))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
  return initials || 'V'
}

/* ── Server-safe money labels ───────────────────────────────────────────────
 * kit.moneyRange lives in the client bundle ('use client'), so server pages
 * can't invoke it. These pure twins mirror its output exactly.
 */

export function moneyLabel(amount: number | null | undefined, currency = 'YER'): string {
  if (amount == null) return '—'
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}M ${currency}`.trim()
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(amount % 1_000 === 0 ? 0 : 1)}k ${currency}`.trim()
  return `${amount.toLocaleString('en-US')} ${currency}`.trim()
}

/** Range label "80k – 2.5M YER" (server-safe twin of kit.moneyRange). */
export function moneyRangeLabel(min: number | null, max: number | null, currency = 'YER'): string | null {
  if (min == null && max == null) return null
  if (min != null && max != null) return `${moneyLabel(min, '')} – ${moneyLabel(max, currency)}`
  if (max != null) return `up to ${moneyLabel(max, currency)}`
  return `from ${moneyLabel(min as number, currency)}`
}
