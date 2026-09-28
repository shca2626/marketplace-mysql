/**
 * RESEND REST API CLIENT (EMAILTRACK-1)
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin typed wrapper over https://api.resend.com — the REST side of Resend,
 * companion to the SMTP pool in src/lib/mailer.ts. The REST API is preferred
 * for sends because it returns the provider message id, which this app can
 * POLL for real delivery state (GET /emails/{id} → last_event) and finally
 * surface Resend's invisible "test mode" failure mode: while no sending
 * domain is verified, Resend accepts every send but only DELIVERS to the
 * account owner's address.
 *
 *   RESEND_API_KEY   Resend API key (same key SMTP_PASS uses for SMTP)
 *
 * Server-side only (secrets). Every request aborts after 10s. Read endpoints
 * (status, domains) degrade to null on failure; sendViaApi throws on failure
 * so the mailer can fall back to SMTP — it returns null only when the API
 * key is unset.
 */

const API_BASE = 'https://api.resend.com'
const REQUEST_TIMEOUT_MS = 10_000

/** Delivery events Resend reports on GET /emails/{id} (last_event). */
export const RESEND_EVENTS = [
  'sent',
  'delivered',
  'bounced',
  'complained',
  'delivery_delayed',
] as const
export type ResendEvent = (typeof RESEND_EVENTS)[number]

export function isResendApiConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${process.env.RESEND_API_KEY as string}` }
}

/** fetch + 10s AbortController timeout; throws on HTTP or network failure. */
async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    if (!res.ok) {
      let message = `HTTP ${res.status}`
      try {
        const body = (await res.json()) as { message?: string }
        if (body.message) message = `${message}: ${body.message}`
      } catch {
        /* non-JSON error body — status code alone is enough */
      }
      throw new Error(`Resend API ${url} failed (${message})`)
    }
    return await res.json()
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Resend API ${url} timed out after ${REQUEST_TIMEOUT_MS / 1000}s`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

// ── Send (POST /emails) ──────────────────────────────────────────────────────

export interface ResendSendInput {
  to: string
  subject: string
  html: string
  text?: string
  from: string
}

export interface ResendSendResult {
  /** Resend email id — poll it via getEmailStatus for delivery state. */
  id: string
}

/**
 * Send one email through the Resend REST API.
 * Returns null when RESEND_API_KEY is unset; THROWS on network/HTTP failure
 * (the caller falls back to SMTP). On success returns the provider id.
 */
export async function sendViaApi(input: ResendSendInput): Promise<ResendSendResult | null> {
  if (!isResendApiConfigured()) return null
  const body = await fetchJson(`${API_BASE}/emails`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: input.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  }) as { id?: unknown }
  if (typeof body.id !== 'string' || !body.id) {
    throw new Error('Resend API send returned no email id')
  }
  return { id: body.id }
}

// ── Delivery status (GET /emails/{id}) ───────────────────────────────────────

export interface ResendEmailStatus {
  /** sent | delivered | bounced | complained | delivery_delayed (see RESEND_EVENTS). */
  last_event: string
  to: string[] | null
  subject: string | null
}

/**
 * Poll one sent email's delivery state. Returns null on any failure
 * (unset key, network error, non-2xx, unknown id) — callers show 'unknown'.
 */
export async function getEmailStatus(id: string): Promise<ResendEmailStatus | null> {
  if (!isResendApiConfigured() || !id) return null
  try {
    const body = (await fetchJson(`${API_BASE}/emails/${encodeURIComponent(id)}`, {
      headers: authHeaders(),
    })) as { last_event?: unknown; to?: unknown; subject?: unknown }
    const to =
      Array.isArray(body.to)
        ? body.to.filter((t): t is string => typeof t === 'string')
        : typeof body.to === 'string'
          ? [body.to]
          : null
    return {
      last_event: typeof body.last_event === 'string' ? body.last_event : 'unknown',
      to,
      subject: typeof body.subject === 'string' ? body.subject : null,
    }
  } catch (err) {
    console.error('[resend] getEmailStatus failed →', err instanceof Error ? err.message : err)
    return null
  }
}

// ── Domains (GET /domains) ───────────────────────────────────────────────────

export interface ResendDomain {
  name: string
  /** verified | not_started | failed | pending — only 'verified' delivers everywhere. */
  status: string
}

/**
 * List sending domains in the Resend account. Returns null on any failure;
 * an empty array means no domains are configured at all.
 */
export async function getDomains(): Promise<ResendDomain[] | null> {
  if (!isResendApiConfigured()) return null
  try {
    const body = await fetchJson(`${API_BASE}/domains`, { headers: authHeaders() })
    // The API returns a bare array; tolerate a { data: [...] } wrapper too.
    const list: unknown[] = Array.isArray(body)
      ? body
      : typeof body === 'object' && body !== null && Array.isArray((body as { data?: unknown[] }).data)
        ? (body as { data: unknown[] }).data
        : []
    const domains: ResendDomain[] = []
    for (const entry of list) {
      if (typeof entry !== 'object' || entry === null) continue
      const domain = entry as { name?: unknown; status?: unknown }
      if (typeof domain.name === 'string' && typeof domain.status === 'string') {
        domains.push({ name: domain.name, status: domain.status })
      }
    }
    return domains
  } catch (err) {
    console.error('[resend] getDomains failed →', err instanceof Error ? err.message : err)
    return null
  }
}
