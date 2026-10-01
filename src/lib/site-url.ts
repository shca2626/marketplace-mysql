import { headers } from 'next/headers'

/**
 * Absolute site base URL derived from the incoming request — proxy-aware
 * (Caddy/gateway in the sandbox sets x-forwarded-host / x-forwarded-proto).
 * Used for metadata (OG images), JSON-LD ids/urls and the sitemap so they
 * are valid absolute URLs in every environment the app is served from.
 */
export async function siteBaseUrl(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto =
    h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https')
  return `${proto}://${host}`
}

/** Join the request-derived base with a path (and optional query). */
export function toAbsoluteUrl(base: string, path: string, query?: string): string {
  const suffix = query ? (path.includes('?') ? `&${query}` : `?${query}`) : ''
  return `${base}${path.startsWith('/') ? path : `/${path}`}${suffix}`
}
