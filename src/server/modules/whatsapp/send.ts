// ─────────────────────────────────────────────────────────────────────────────
// WHATSAPP SUITE · Outbound transport to the WhatsApp bridge service (agent 8-a)
//
// The bridge is an independent mini-service running on :3031 (outside the
// Next.js app). All calls carry the shared internal token header. Every helper
// degrades gracefully — a down service never throws into the routes.
// ─────────────────────────────────────────────────────────────────────────────

const SERVICE_URL = 'http://localhost:3031'
const INTERNAL_TOKEN = 'vendora-internal'

export interface WaServiceStatus {
  up: boolean
  connected: boolean
  phone: string | null
  since: string | null
  qr: string | null
}

/** Current bridge + WhatsApp session state. Never throws. */
export async function waServiceStatus(): Promise<WaServiceStatus> {
  try {
    const res = await fetch(`${SERVICE_URL}/status`, {
      headers: { 'X-Internal-Token': INTERNAL_TOKEN },
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })
    if (!res.ok) return { up: false, connected: false, phone: null, since: null, qr: null }
    const json = (await res.json()) as Partial<WaServiceStatus>
    return {
      up: true,
      connected: !!json.connected,
      phone: json.phone ?? null,
      since: json.since ?? null,
      qr: json.qr ?? null,
    }
  } catch {
    return { up: false, connected: false, phone: null, since: null, qr: null }
  }
}

/** Send one WhatsApp message through the bridge (8s timeout). Never throws. */
export async function waServiceSend(to: string, message: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const res = await fetch(`${SERVICE_URL}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Token': INTERNAL_TOKEN },
      body: JSON.stringify({ to, message }),
      signal: AbortSignal.timeout(8000),
    })
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; error?: string }
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.error ?? `Bridge responded ${res.status}` }
    }
    return { ok: true, id: json.id }
  } catch (err) {
    const message_ = err instanceof Error ? err.message : 'Network error'
    return { ok: false, error: `WhatsApp service unreachable — ${message_}` }
  }
}

/** Ask the bridge to connect (starts a new QR session) or log out. Never throws. */
export async function waServiceAction(action: 'connect' | 'logout'): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${SERVICE_URL}/${action}`, {
      method: 'POST',
      headers: { 'X-Internal-Token': INTERNAL_TOKEN },
      signal: AbortSignal.timeout(8000),
    })
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
    if (!res.ok || !json.ok) return { ok: false, error: json.error ?? `Bridge responded ${res.status}` }
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error'
    return { ok: false, error: `WhatsApp service unreachable — ${message}` }
  }
}

/**
 * Normalize a phone for storage/sending: strips everything but digits and a
 * leading +, drops any "@s.whatsapp.net" JID suffix, tolerates spaces,
 * dashes and parentheses, and guarantees a leading "+".
 */
export function normalizePhone(raw: string): string {
  let s = (raw ?? '').trim()
  const at = s.indexOf('@')
  if (at > 0) s = s.slice(0, at) // JID → bare number
  s = s.replace(/[\s\-()]/g, '') // spaces, dashes, parentheses
  s = s.replace(/[^+\d]/g, '') // anything else goes
  if (!s) return ''
  if (!s.startsWith('+')) s = `+${s.replace(/^0+/, '')}` // drop leading zeros, add +
  return s === '+' ? '' : s
}
