/**
 * VENDORA · WhatsApp mini-service (Baileys bridge)
 * ──────────────────────────────────────────────
 * Port: 3031 (fixed). Token guard: X-Internal-Token: vendora-internal.
 *
 *   GET  /status   → { up, connected, phone, since, qr }   (qr = data-URL image
 *                    while pairing is pending — render it in the admin UI)
 *   POST /connect  → start/restart pairing (generates a fresh QR)
 *   POST /logout   → unlink the device (deletes the local session)
 *   POST /send     → { to, message } → { ok, id | error }
 *
 * Incoming messages are forwarded to the main app:
 *   POST http://localhost:3000/api/internal/whatsapp/incoming
 *   { from, name?, message, timestampMs? }  (+ token header)
 *
 * The session persists under ./sessions (multi-file auth state) so a service
 * restart or `bun --hot` reload keeps the linked device.
 */
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  type WACredentialEvent,
} from '@whiskeysockets/baileys'
import qrcode from 'qrcode'
import { rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'

const PORT = 3031
const INTERNAL_TOKEN = 'vendora-internal'
const MAIN_APP = 'http://localhost:3000'
const SESSION_DIR = new URL('./sessions', import.meta.url).pathname

interface ServiceState {
  connected: boolean
  phone: string | null
  since: string | null
  qr: string | null
  lastError: string | null
}

const state: ServiceState = {
  connected: false,
  phone: null,
  since: null,
  qr: null,
  lastError: null,
}

let sock: ReturnType<typeof makeWASocket> | null = null
let connectRequested = false

// ── helpers ─────────────────────────────────────────────────────────────────

function authorized(req: Request): boolean {
  return req.headers.get('x-internal-token') === INTERNAL_TOKEN
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function forwardIncoming(from: string, name: string | null, message: string, timestampMs: number | null): Promise<void> {
  try {
    await fetch(`${MAIN_APP}/api/internal/whatsapp/incoming`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Token': INTERNAL_TOKEN },
      body: JSON.stringify({ from, name, message, timestampMs }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch (err) {
    console.error('[wa-service] forward to main app failed:', (err as Error).message)
  }
}

function extractText(m: { message?: Record<string, unknown> | null }): string {
  const msg = m.message ?? {}
  const conv = (msg as { conversation?: string }).conversation
  if (typeof conv === 'string' && conv) return conv
  const ext = (msg as { extendedTextMessage?: { text?: string } }).extendedTextMessage
  if (ext && typeof ext.text === 'string') return ext.text
  return ''
}

// ── Baileys lifecycle ────────────────────────────────────────────────────────

async function startSocket(): Promise<void> {
  if (sock) {
    try {
      await sock.end(undefined)
    } catch {
      /* already dead */
    }
    sock = null
  }
  const { state: authState, saveCreds } = await useMultiFileAuthState(SESSION_DIR)
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1023] as [number, number, number] }))
  const s = makeWASocket({
    version,
    auth: authState,
    printQRInTerminal: false,
    browser: ['Vendora', 'Chrome', '1.0.0'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
  })
  sock = s

  s.ev.on('creds.update' as WACredentialEvent, saveCreds as never)

  s.ev.on('connection.update', (update: Record<string, unknown>) => {
    const connection = update.connection as string | undefined
    const qr = update.qr as string | undefined
    const lastDisconnect = update.lastDisconnect as { error?: { name?: string }; message?: string } | undefined

    if (qr) {
      state.qr = null
      qrcode
        .toDataURL(qr, { margin: 1, width: 320 })
        .then((dataUrl) => {
          state.qr = dataUrl
          console.log('[wa-service] QR ready — render it in the admin console')
        })
        .catch(() => undefined)
    }

    if (connection === 'open') {
      state.connected = true
      state.qr = null
      state.since = new Date().toISOString()
      state.lastError = null
      const me = (s as unknown as { user?: { id?: string } }).user
      state.phone = me?.id ? me.id.split(':')[0] : null
      console.log(`[wa-service] connected${state.phone ? ` as ${state.phone}` : ''}`)
    }

    if (connection === 'close') {
      state.connected = false
      state.since = null
      const reason = (lastDisconnect?.error as { name?: string } | undefined)?.name ?? 'unknown'
      state.lastError = String(lastDisconnect?.error ?? reason)
      const loggedOut = (lastDisconnect?.error as { name?: string } | undefined)?.name === 'DisconnectReason.loggedOut' ||
        (lastDisconnect?.error as unknown as { code?: number } | undefined)?.code === DisconnectReason.loggedOut
      console.log(`[wa-service] connection closed (${reason}${loggedOut ? ', logged out' : ''})`)
      if (loggedOut) {
        rm(SESSION_DIR, { recursive: true, force: true })
          .then(() => console.log('[wa-service] session dir cleared'))
          .catch(() => undefined)
      } else if (connectRequested) {
        // transient (network, restart) — Baileys-style auto-reconnect with backoff
        setTimeout(() => void startSocket(), 3_000)
      }
    }
  })

  s.ev.on('messages.upsert', (upsert: { messages: Array<Record<string, unknown>>; type?: string }) => {
    if (upsert.type !== 'notify') return
    for (const m of upsert.messages) {
      try {
        if (m.key?.fromMe) continue
        const jid = m.key?.remoteJid as string | undefined
        if (!jid || jid === 'status@broadcast') continue
        const text = extractText(m as { message?: Record<string, unknown> | null })
        if (!text.trim()) continue
        const pushName = (m.pushName as string | undefined) || null
        const ts = typeof m.messageTimestamp === 'number' ? (m.messageTimestamp as number) * 1000 : null
        console.log(`[wa-service] ← ${jid}: ${text.slice(0, 60)}`)
        void forwardIncoming(jid, pushName, text, ts)
      } catch (err) {
        console.error('[wa-service] message handler error:', (err as Error).message)
      }
    }
  })
}

// ── HTTP surface ─────────────────────────────────────────────────────────────

const server = Bun.serve({
  port: PORT,
  async fetch(req): Promise<Response> {
    const url = new URL(req.url)

    if (!authorized(req)) {
      return json({ error: 'unauthorized' }, 401)
    }

    if (req.method === 'GET' && url.pathname === '/status') {
      return json({
        up: true,
        connected: state.connected,
        phone: state.phone,
        since: state.since,
        qr: state.qr,
        lastError: state.lastError,
      })
    }

    if (req.method === 'POST' && url.pathname === '/connect') {
      connectRequested = true
      try {
        await startSocket()
        return json({ ok: true })
      } catch (err) {
        return json({ ok: false, error: (err as Error).message }, 500)
      }
    }

    if (req.method === 'POST' && url.pathname === '/logout') {
      connectRequested = false
      try {
        if (sock) await sock.logout(undefined as never).catch(() => undefined)
      } catch {
        /* ignore */
      }
      try {
        await sock?.end(undefined)
      } catch {
        /* ignore */
      }
      sock = null
      state.connected = false
      state.phone = null
      state.since = null
      state.qr = null
      if (existsSync(SESSION_DIR)) {
        await rm(SESSION_DIR, { recursive: true, force: true }).catch(() => undefined)
      }
      return json({ ok: true })
    }

    if (req.method === 'POST' && url.pathname === '/send') {
      if (!sock || !state.connected) {
        return json({ ok: false, error: 'WhatsApp is not connected — scan the QR first' }, 409)
      }
      const body = (await req.json().catch(() => ({}))) as { to?: string; message?: string }
      const to = (body.to ?? '').trim()
      const message = (body.message ?? '').trim()
      if (!to || !message) {
        return json({ ok: false, error: 'to and message are required' }, 400)
      }
      const jid = to.includes('@') ? to : `${to.replace(/[^0-9]/g, '')}@s.whatsapp.net`
      try {
        const sent = await sock.sendMessage(jid, { text: message })
        console.log(`[wa-service] → ${jid}: ${message.slice(0, 60)}`)
        return json({ ok: true, id: (sent as { key?: { id?: string } })?.key?.id ?? null })
      } catch (err) {
        return json({ ok: false, error: (err as Error).message }, 500 )
      }
    }

    return json({ error: 'not found' }, 404)
  },
})

console.log(`[wa-service] listening on :${server.port} (token guard active)`)

// If a stored session exists, auto-reconnect on boot.
if (existsSync(SESSION_DIR)) {
  connectRequested = true
  void startSocket().catch((err) => console.error('[wa-service] boot connect failed:', err.message))
}
