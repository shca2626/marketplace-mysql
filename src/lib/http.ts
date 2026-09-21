import type { NextRequest, NextResponse } from 'next/server'
import { rateLimit, type RateLimitResult } from './rate-limit'

// HTTP request guards (day-1 core infrastructure).
// ───────────────────────────────────────────────
// CSRF: session auth lives in a cookie, so unsafe methods (POST/PUT/PATCH/
// DELETE) must not be triggerable cross-site. assertSameOrigin() enforces the
// browser's own signals — Origin header (must match Host / X-Forwarded-Host)
// and Sec-Fetch-Site (must not be cross-site). Requests without Origin (curl,
// server-to-server) are allowed: they cannot carry a victim's ambient cookie
// credentials, and are separately rate-limited.
//
// The Caddy gateway preserves the browser Host header (header_up Host {host}),
// so Origin↔Host comparison stays valid through the proxy.

function hostMatches(originHost: string, req: NextRequest): boolean {
  const hostHeader = req.headers.get('host')
  if (originHost === hostHeader) return true
  // When behind a proxy that rewrites Host, compare the forwarded host chain too.
  const fwd = req.headers.get('x-forwarded-host')
  if (fwd && fwd.split(',').map((h) => h.trim()).includes(originHost)) return true
  return false
}

/** Returns a 403 response when the request is provably cross-site, else null. */
export function assertSameOrigin(req: NextRequest): NextResponse | null {
  const method = req.method.toUpperCase()
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return null

  // Sec-Fetch-Site is set by the BROWSER (a forbidden header — JS can't forge
  // it). "same-origin" attests the request was initiated by a page served from
  // this exact origin, making it immune to proxy chains that rewrite the Host
  // header between the browser and the app (sandbox preview gateways do).
  // This runs FIRST so gateway-host-rewrite deployments don't false-positive.
  const fetchSite = req.headers.get('sec-fetch-site')
  if (fetchSite === 'cross-site') {
    return csrfDenied('cross-site fetch')
  }
  if (fetchSite === 'same-origin') {
    return null
  }

  // Fallback (older browsers / same-site initiators): compare Origin's host
  // against the Host / X-Forwarded-Host chain the request arrived with.
  const origin = req.headers.get('origin')
  if (origin && origin !== 'null') {
    try {
      const { host } = new URL(origin)
      if (!hostMatches(host, req)) return csrfDenied(`origin ${host}`)
    } catch {
      return csrfDenied('malformed origin')
    }
  }
  return null
}

function csrfDenied(reason: string): NextResponse {
  return Response.json({ error: 'Cross-site requests are not allowed' }, { status: 403, headers: { 'X-Reason': `csrf:${reason}` } }) as NextResponse
}

/** Client IP as seen by the app (Caddy sets X-Forwarded-For = remote host). */
export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return 'unknown'
}

/** Returns a 429 response when the rate limit trips, else null. */
export function enforceRateLimit(
  req: NextRequest,
  bucket: string,
  policy: { limit: number; windowMs: number },
  subject?: string,
): NextResponse | null {
  const key = `${bucket}:${subject ?? clientIp(req)}`
  const result: RateLimitResult = rateLimit(key, policy.limit, policy.windowMs)
  if (result.ok) return null
  return Response.json(
    { error: 'Too many requests — slow down and try again shortly' },
    { status: 429, headers: { 'Retry-After': String(result.retryAfterSec) } },
  ) as NextResponse
}
