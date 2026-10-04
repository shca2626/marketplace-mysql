// ─────────────────────────────────────────────────────────────────────────────
// Vendora WhatsApp mini-service — Baileys (@whiskeysockets/baileys) on port 3031
// ─────────────────────────────────────────────────────────────────────────────
// FREE WhatsApp sending via a self-paired number. The admin pairs ANY international
// SIM from the admin console ("WhatsApp Channels" panel):
//   1. Admin enters the phone number of the SIM that physically owns WhatsApp.
//   2. This service calls Baileys requestPairingCode(phoneDigits) → 8-char code.
//   3. Admin types the code in WhatsApp → Settings → Linked devices → Link a
//      device → "Link with phone number instead".
//   4. Baileys fires connection open + creds.update(registered) → we flip the
//      WhatsAppSender row to PAIRED and persist the session for restarts.
//
// DB ownership contract (single source of truth per write):
//   • THIS service owns: WhatsAppSender.status transitions (PENDING_PAIRING →
//     PAIRED → DISCONNECTED/FAILED driven by live Baileys events), credsJson,
//     pairingCode, lastError, lastUsedAt.
//   • Next API routes own: sender row CRUD (label/phoneNumber/isDefault),
//     WhatsAppMessage ledger rows (written by src/lib/whatsapp.ts).
//
// Session persistence: every creds/key mutation is snapshotted (debounced) to
//   • mini-services/whatsapp-service/sessions/<senderId>.json   (freshest)
//   • DB WhatsAppSender.credsJson                                (survives FS loss)
// On boot all PAIRED/PENDING_PAIRING senders are rehydrated from the snapshot.
//
// Env: reads .env from this folder (copy of the root .env — KEEP IN SYNC when
// the root Aiven URL changes; see worklog Task 3-b). WHATSAPP_SERVICE_TOKEN
// guards every route except /health (default 'vendora-internal', same value
// src/lib/whatsapp.ts sends as X-Internal-Token).
// ─────────────────────────────────────────────────────────────────────────────

import http from 'node:http'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { encryptBox, decryptBox } from './crypto-box'
import pino from 'pino'
import {
  makeWASocket,
  initAuthCreds,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers,
  type AuthenticationCreds,
  type ConnectionState,
  type SignalDataSet,
  type SignalDataTypeMap,
  type SignalKeyStore,
  type WASocket,
} from '@whiskeysockets/baileys'

const PORT = 3031
const HERE = path.dirname(fileURLToPath(import.meta.url))
const SESSIONS_DIR = path.join(HERE, 'sessions')

// The sandbox /start.sh clobbers the shell env with a SQLite DATABASE_URL —
// bun lets the shell env override .env, so resolve the real Aiven URL from the
// .env copy in this folder (or the root .env) explicitly when the inherited
// value is not a mysql:// URL.
function ensureDatabaseUrl(): void {
  const cur = process.env.DATABASE_URL ?? ''
  if (cur.startsWith('mysql://')) return
  for (const candidate of [path.join(HERE, '.env'), path.join(HERE, '..', '..', '.env')]) {
    try {
      if (!existsSync(candidate)) continue
      const m = readFileSync(candidate, 'utf8').match(/^DATABASE_URL=(.+)$/m)
      if (!m) continue
      const url = m[1].trim().replace(/^["']|["']$/g, '')
      if (url.startsWith('mysql://')) {
        process.env.DATABASE_URL = url
        return
      }
    } catch {
      /* try the next candidate */
    }
  }
}
ensureDatabaseUrl()

const TOKEN = process.env.WHATSAPP_SERVICE_TOKEN ?? 'vendora-internal'
const prisma = new PrismaClient()

// ── Logger — pino (Baileys' own logger; silent keeps the service log clean)

const noopLogger = pino({ level: 'silent' })

// ── Service error with an HTTP status ──────────────────────────────────────

class ServiceError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

interface BoomLike {
  output?: { statusCode?: number }
  message?: string
}

// ── Session state ───────────────────────────────────────────────────────────

interface SenderSession {
  senderId: string
  phoneNumber: string // E.164 with +
  creds: AuthenticationCreds // mutated in place by Baileys (Object.assign on creds.update)
  store: MemoryKeyStore
  sock: WASocket | null
  connected: boolean
  pairing: boolean // waiting for the admin to type the code (not yet registered)
  dead: boolean // logged-out / replaced — never reconnect
  markedPaired: boolean // DB already flipped to PAIRED by this process
  lastSeen: Date
  lastError: string | null
  reconnectAttempts: number
  reconnectTimer: ReturnType<typeof setTimeout> | null
  persistTimer: ReturnType<typeof setTimeout> | null
  // ── Pairing-window state (user-reported "Unable to connect the phone"
  // 2026-10-05: WhatsApp drops unregistered sockets after ~2-3 min, which
  // silently invalidated the displayed code while the admin was typing it
  // on the phone). We now keep the window alive: auto-reconnect + fresh code.
  pairingCode: string | null
  codeIssuedAt: Date | null
  pairingStartedAt: Date | null // first code request of this pairing window
  refreshCount: number // codes issued in the current window
  qrString: string | null // latest Baileys QR (same session as the code)
  qrIssuedAt: Date | null
  refreshTimer: ReturnType<typeof setTimeout> | null
}

const sessions = new Map<string, SenderSession>()

// `bun --hot` re-runs this module on file change — tear the previous process's
// sockets down first so we never leak live WebSocket sessions across reloads.
const hotReloadGuard = globalThis as { __vendoraWhatsappSessions?: Map<string, SenderSession> }
if (hotReloadGuard.__vendoraWhatsappSessions) {
  for (const s of hotReloadGuard.__vendoraWhatsappSessions.values()) {
    s.dead = true
    if (s.reconnectTimer) clearTimeout(s.reconnectTimer)
    if (s.persistTimer) clearTimeout(s.persistTimer)
    if (s.refreshTimer) clearTimeout(s.refreshTimer)
    try {
      s.sock?.end(undefined)
    } catch {
      /* already closed */
    }
  }
}
hotReloadGuard.__vendoraWhatsappSessions = sessions

// ── Signal key store (in-memory, JSON-serializable for snapshots) ──────────

class MemoryKeyStore implements SignalKeyStore {
  readonly data = new Map<string, unknown>()
  onChange?: () => void

  async get<T extends keyof SignalDataTypeMap>(
    type: T,
    ids: string[]
  ): Promise<{ [id: string]: SignalDataTypeMap[T] }> {
    const out: Record<string, unknown> = {}
    for (const id of ids) {
      const v = this.data.get(`${String(type)}:${id}`)
      if (v !== undefined) out[id] = v
    }
    return out as { [id: string]: SignalDataTypeMap[T] }
  }

  async set(data: SignalDataSet): Promise<void> {
    const byType = data as unknown as Record<string, Record<string, unknown>>
    for (const type of Object.keys(byType)) {
      const entries = byType[type]
      for (const id of Object.keys(entries)) {
        this.data.set(`${type}:${id}`, entries[id])
      }
    }
    this.onChange?.()
  }
}

// ── Snapshot (de)serialization — Uint8Array/Buffer ⇄ base64 through JSON ────

function snapshotReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return { __u8: Buffer.from(value).toString('base64') }
  }
  return value
}

function snapshotReviver(_key: string, value: unknown): unknown {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as { __u8?: unknown }).__u8 === 'string'
  ) {
    return new Uint8Array(Buffer.from((value as { __u8: string }).__u8, 'base64'))
  }
  return value
}

function sessionFilePath(senderId: string): string {
  return path.join(SESSIONS_DIR, `${senderId}.json`)
}

function serializeSession(s: SenderSession): string {
  return JSON.stringify(
    { v: 1, phoneNumber: s.phoneNumber, creds: s.creds, keys: Object.fromEntries(s.store.data) },
    snapshotReplacer
  )
}

function readLocalSnapshot(senderId: string): string | null {
  try {
    const p = sessionFilePath(senderId)
    if (!existsSync(p)) return null
    const raw = readFileSync(p, 'utf8')
    JSON.parse(raw, snapshotReviver) // validate — corrupt file = fall back to DB
    return raw
  } catch {
    return null
  }
}

function persistNow(s: SenderSession): void {
  const json = serializeSession(s)
  try {
    writeFileSync(sessionFilePath(s.senderId), json)
  } catch (err) {
    console.error(`[wa-service] local snapshot write failed (${s.senderId}):`, err)
  }
  void prisma.whatsAppSender
    .update({ where: { id: s.senderId }, data: { credsJson: encryptBox(json) } }) // 6.6.8 — AES-256-GCM at rest
    .catch((err) => console.error(`[wa-service] creds DB write failed (${s.senderId}):`, err))
}

function schedulePersist(s: SenderSession): void {
  if (s.persistTimer) return
  s.persistTimer = setTimeout(() => {
    s.persistTimer = null
    try {
      persistNow(s)
    } catch (err) {
      console.error(`[wa-service] persist failed (${s.senderId}):`, err)
    }
  }, 500)
}

// ── WA version cache ────────────────────────────────────────────────────────

const FALLBACK_VERSION: [number, number, number] = [2, 3000, 1023353164]
let waVersionCache: { version: [number, number, number]; at: number } | null = null

async function getWaVersion(): Promise<[number, number, number]> {
  if (waVersionCache && Date.now() - waVersionCache.at < 10 * 60_000) return waVersionCache.version
  try {
    const { version } = await withTimeout(fetchLatestBaileysVersion(), 10_000, 'version-fetch-timeout')
    waVersionCache = { version: version as [number, number, number], at: Date.now() }
    return waVersionCache.version
  } catch {
    return FALLBACK_VERSION
  }
}

// ── Connection lifecycle ────────────────────────────────────────────────────

async function connect(s: SenderSession): Promise<void> {
  if (s.dead) return
  const version = await getWaVersion()
  const sock = makeWASocket({
    version,
    logger: noopLogger,
    browser: Browsers.ubuntu('Chrome'),
    auth: { creds: s.creds, keys: makeCacheableSignalKeyStore(s.store, noopLogger) },
    markOnlineOnConnect: false,
    syncFullHistory: false,
    // Default is wss://lnweb.whatsapp.com/ws/chat — some egress-filtered
    // environments DNS-block the lnweb/wN hosts while web.whatsapp.com works
    // for both HTTP and WebSocket. Overridable via WA_WS_URL.
    waWebSocketUrl: process.env.WA_WS_URL ?? 'wss://web.whatsapp.com/ws/chat',
  })
  s.sock = sock
  sock.ev.on('creds.update', (update: Partial<AuthenticationCreds>) => {
    if (update.registered === true && !s.markedPaired) {
      s.pairing = false
      s.markedPaired = true
      void markPaired(s)
    }
    schedulePersist(s)
  })
  sock.ev.on('connection.update', (u: Partial<ConnectionState>) => {
    void onConnectionUpdate(s, u)
  })
}

async function onConnectionUpdate(s: SenderSession, u: Partial<ConnectionState>): Promise<void> {
  if (u.qr) {
    // Unregistered connection — Baileys emitted a QR for the same noise keys
    // the pairing code is derived from, so BOTH the QR scan and the code
    // link the same socket. Keep the freshest one for the admin panel.
    s.qrString = u.qr
    s.qrIssuedAt = new Date()
    if (!s.connected) s.connected = true // QR emission implies a live socket
    return
  }

  if (u.connection === 'open') {
    s.connected = true
    s.reconnectAttempts = 0
    s.lastSeen = new Date()
    if (s.creds.registered && !s.markedPaired) {
      s.pairing = false
      s.markedPaired = true
      await markPaired(s)
    }
    schedulePersist(s)
    console.log(`[wa-service] session open (${s.phoneNumber})`)
    return
  }

  if (u.connection === 'close') {
    s.connected = false
    const err = (u.lastDisconnect?.error ?? undefined) as BoomLike | undefined
    const code = err?.output?.statusCode

    if (code === DisconnectReason.loggedOut) {
      await kill(s, 'DISCONNECTED', 'Logged out from WhatsApp — unpair this number here, then link it again.')
      return
    }
    if (code === DisconnectReason.forbidden) {
      await kill(s, 'FAILED', 'WhatsApp rejected the session (403) — the number may be restricted or banned.')
      return
    }
    if (code === DisconnectReason.connectionReplaced) {
      await kill(s, 'DISCONNECTED', 'Connection replaced — this number was linked from elsewhere.')
      return
    }

    // A pairing socket that dies before the code is entered: the code is dead.
    // AUTO-REFRESH (user-reported "Unable to connect the phone", 2026-10-05):
    // WhatsApp drops unregistered sockets after ~2-3 min. Instead of giving
    // up and leaving a dead code on screen, reconnect + issue a fresh code
    // automatically while the pairing window is still young.
    if (s.pairing && !s.creds.registered) {
      const windowMs = Date.now() - (s.pairingStartedAt?.getTime() ?? Date.now())
      if (windowMs <= PAIRING_WINDOW_MS && s.refreshCount < MAX_PAIRING_CODES && !s.dead) {
        s.lastError = 'Pairing connection dropped — issuing a fresh code automatically…'
        await dbUpdate(s, { status: 'PENDING_PAIRING', lastError: s.lastError })
        destroySession(s, false)
        console.warn(
          `[wa-service] pairing socket dropped (${s.phoneNumber}) — auto-refresh in 2s (code #${s.refreshCount + 1})`
        )
        schedulePairingRefresh(s)
        return
      }
      s.lastError =
        'Pairing window expired — click “Pair now” again to get a fresh code. Codes stay valid only a few minutes.'
      await dbUpdate(s, { status: 'PENDING_PAIRING', lastError: s.lastError })
      destroySession(s, false)
      console.warn(`[wa-service] pairing window closed (${s.phoneNumber})`)
      return
    }

    s.lastError = err?.message ?? `connection closed (${code ?? '?'})`
    scheduleReconnect(s)
    return
  }

  if (u.connection === 'connecting') {
    s.lastSeen = new Date()
  }
}

function scheduleReconnect(s: SenderSession): void {
  if (s.dead || s.reconnectTimer) return
  s.reconnectAttempts += 1
  const delay = Math.min(1_000 * 2 ** (s.reconnectAttempts - 1), 30_000)
  s.reconnectTimer = setTimeout(() => {
    s.reconnectTimer = null
    void connect(s).catch((err) => {
      console.error(`[wa-service] reconnect failed (${s.phoneNumber}):`, err)
      scheduleReconnect(s)
    })
  }, delay)
  console.log(
    `[wa-service] reconnecting ${s.phoneNumber} in ${Math.round(delay / 1000)}s (attempt ${s.reconnectAttempts})`
  )
}

async function markPaired(s: SenderSession): Promise<void> {
  try {
    const existingDefault = await prisma.whatsAppSender.findFirst({
      where: { isDefault: true, status: 'PAIRED', id: { not: s.senderId } },
      select: { id: true },
    })
    await prisma.whatsAppSender.update({
      where: { id: s.senderId },
      data: {
        status: 'PAIRED',
        lastError: null,
        // First working line becomes the default automatically.
        ...(existingDefault ? {} : { isDefault: true }),
      },
    })
    console.log(`[wa-service] PAIRED ✓ ${s.phoneNumber} (sender ${s.senderId})`)
  } catch (err) {
    console.error(`[wa-service] markPaired DB write failed (${s.phoneNumber}):`, err)
  }
}

async function kill(s: SenderSession, status: string, message: string): Promise<void> {
  s.dead = true
  s.lastError = message
  destroySession(s, false)
  try {
    await prisma.whatsAppSender.update({
      where: { id: s.senderId },
      data: { status, lastError: message, credsJson: null },
    })
  } catch (err) {
    console.error(`[wa-service] kill DB write failed (${s.phoneNumber}):`, err)
  }
  console.warn(`[wa-service] ${status}: ${s.phoneNumber} — ${message}`)
}

/** Remove a session from memory. `flush` writes the last snapshot first. */
function destroySession(s: SenderSession, flush: boolean): void {
  sessions.delete(s.senderId)
  if (s.reconnectTimer) {
    clearTimeout(s.reconnectTimer)
    s.reconnectTimer = null
  }
  if (s.persistTimer) {
    clearTimeout(s.persistTimer)
    s.persistTimer = null
  }
  if (s.refreshTimer) {
    clearTimeout(s.refreshTimer)
    s.refreshTimer = null
  }
  if (flush) {
    try {
      persistNow(s)
    } catch {
      /* snapshot best-effort */
    }
  }
  try {
    s.sock?.end(undefined)
  } catch {
    /* already closed */
  }
}

async function dbUpdate(s: SenderSession, data: Record<string, unknown>): Promise<void> {
  try {
    await prisma.whatsAppSender.update({ where: { id: s.senderId }, data })
  } catch (err) {
    console.error(`[wa-service] DB update failed (${s.phoneNumber}):`, err)
  }
}

// ── Pairing ──────────────────────────────────────────────────────────────────

// Pairing-window budget (user-reported "Unable to connect the phone"): WhatsApp
// drops unregistered sockets after ~2-3 min and codes expire with them. While
// the admin still has the pairing dialog open we auto-reconnect and issue a
// fresh code, for up to this long since the FIRST code request …
const PAIRING_WINDOW_MS = 15 * 60_000 // … 15 minutes …
const MAX_PAIRING_CODES = 8 // … and at most this many codes per window.

function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '')
}

function pairingWindowInfo(s: SenderSession): { refreshing: boolean; expiresAt: string | null } {
  const started = s.pairingStartedAt
  if (!started) return { refreshing: false, expiresAt: null }
  const expiresAt = new Date(started.getTime() + PAIRING_WINDOW_MS)
  return { refreshing: Date.now() <= expiresAt.getTime(), expiresAt: expiresAt.toISOString() }
}

/** Resolves once the socket is ready for a pairing request (QR emitted or the
 *  connection is open) — the WS handshake itself takes a beat. */
function waitForFirstConnectionState(s: SenderSession, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const sock = s.sock
    if (!sock) {
      resolve()
      return
    }
    if (s.qrString || s.connected) {
      resolve()
      return
    }
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        sock.ev.off('connection.update', onUpdate)
      } catch {
        /* listener already gone */
      }
      resolve()
    }
    const onUpdate = (u: Partial<ConnectionState>) => {
      // QR = noise handshake done, server awaiting pairing; open = already
      // registered session reconnected.
      if (u.qr || u.connection === 'open') finish()
    }
    const timer = setTimeout(finish, timeoutMs)
    sock.ev.on('connection.update', onUpdate)
  })
}

/** Core socket+code bootstrap shared by startPairing, the auto-refresher and
 *  the boot restore path. Connects `s` (fresh creds already set), waits for
 *  the noise handshake, requests a pairing code and records it everywhere.
 *  Returns the fresh code. Throws ServiceError on failure. */
async function connectAndRequestCode(
  s: SenderSession,
  opts: { firstWindow: boolean }
): Promise<string> {
  try {
    await connect(s)
  } catch (err) {
    destroySession(s, false)
    throw new ServiceError(502, `socket-start-failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  await waitForFirstConnectionState(s, 15_000)

  const sock = s.sock
  if (!sock || s.dead) {
    destroySession(s, false)
    throw new ServiceError(502, 'socket-not-available')
  }

  let pairingCode: string
  try {
    pairingCode = await withTimeout(
      sock.requestPairingCode(digitsOnly(s.phoneNumber)),
      30_000,
      'pairing-code-timeout'
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    s.lastError = msg
    destroySession(s, false)
    await dbUpdate(s, { status: 'PENDING_PAIRING', lastError: `Pairing code request failed: ${msg}` })
    throw new ServiceError(502, `pairing-code-failed: ${msg}`)
  }

  s.pairingCode = pairingCode
  s.codeIssuedAt = new Date()
  s.refreshCount += 1
  if (opts.firstWindow) s.pairingStartedAt = s.codeIssuedAt

  persistNow(s) // pairingCode + me.id land in creds — persist immediately
  await dbUpdate(s, {
    status: 'PENDING_PAIRING',
    pairingCode,
    codeIssuedAt: s.codeIssuedAt,
    lastError: null,
  })
  console.log(
    `[wa-service] pairing code #${s.refreshCount} issued for ${s.phoneNumber} (sender ${s.senderId}): ${pairingCode}`
  )
  return pairingCode
}

/** The pairing socket died before the code was entered — keep the window
 *  alive: fresh creds, fresh socket, fresh code (budget-capped). */
function schedulePairingRefresh(s: SenderSession): void {
  if (s.dead || s.refreshTimer) return
  const carried = {
    pairingStartedAt: s.pairingStartedAt,
    refreshCount: s.refreshCount,
  }
  s.refreshTimer = setTimeout(() => {
    s.refreshTimer = null
    if (s.dead || s.creds.registered) return
    // Fresh identity for the retry (the dropped noise key is burned server-
    // side); keep the window bookkeeping so the budget still applies.
    s.creds = initAuthCreds()
    s.store = new MemoryKeyStore()
    s.store.onChange = () => schedulePersist(s)
    s.pairingStartedAt = carried.pairingStartedAt
    s.refreshCount = carried.refreshCount
    s.qrString = null
    s.qrIssuedAt = null
    s.sock = null
    s.connected = false
    s.reconnectAttempts = 0
    sessions.set(s.senderId, s) // destroySession removed us from the map
    connectAndRequestCode(s, { firstWindow: !carried.pairingStartedAt })
      .then(() => {
        console.log(`[wa-service] pairing auto-refreshed (${s.phoneNumber}) — fresh code ${s.pairingCode}`)
      })
      .catch(async (err: unknown) => {
        // Refresh failed — if budget remains, try again (backoff); else stop.
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[wa-service] pairing refresh failed (${s.phoneNumber}): ${msg}`)
        if (s.dead || s.creds.registered) return
        const windowMs = Date.now() - (s.pairingStartedAt?.getTime() ?? Date.now())
        if (windowMs <= PAIRING_WINDOW_MS && s.refreshCount < MAX_PAIRING_CODES) {
          destroySession(s, false)
          schedulePairingRefresh(s)
        } else {
          s.lastError = 'Pairing window expired — click “Pair now” again to get a fresh code.'
          await dbUpdate(s, { status: 'PENDING_PAIRING', lastError: s.lastError })
          destroySession(s, false)
        }
      })
  }, 2_000)
}

async function startPairing(senderId: string, phoneNumber: string): Promise<string> {
  const prev = sessions.get(senderId)
  if (prev) {
    prev.dead = true
    destroySession(prev, false)
  }

  const digits = digitsOnly(phoneNumber)
  if (digits.length < 8 || digits.length > 15) {
    throw new ServiceError(400, 'invalid-phone-number')
  }

  const s: SenderSession = {
    senderId,
    phoneNumber: `+${digits}`,
    creds: initAuthCreds(),
    store: new MemoryKeyStore(),
    sock: null,
    connected: false,
    pairing: true,
    dead: false,
    markedPaired: false,
    lastSeen: new Date(),
    lastError: null,
    reconnectAttempts: 0,
    reconnectTimer: null,
    persistTimer: null,
    pairingCode: null,
    codeIssuedAt: null,
    pairingStartedAt: null,
    refreshCount: 0,
    qrString: null,
    qrIssuedAt: null,
    refreshTimer: null,
  }
  s.store.onChange = () => schedulePersist(s)
  sessions.set(senderId, s)

  return connectAndRequestCode(s, { firstWindow: true })
}

// ── Restore sessions from snapshots ─────────────────────────────────────────

function restoreFromSnapshot(senderId: string, phoneNumber: string, json: string): SenderSession | null {
  try {
    const parsed = JSON.parse(json, snapshotReviver) as {
      creds?: unknown
      keys?: Record<string, unknown>
    }
    if (!parsed.creds || typeof parsed.creds !== 'object') return null
    const creds = parsed.creds as AuthenticationCreds
    const store = new MemoryKeyStore()
    if (parsed.keys) {
      for (const [k, v] of Object.entries(parsed.keys)) store.data.set(k, v)
    }
    const s: SenderSession = {
      senderId,
      phoneNumber,
      creds,
      store,
      sock: null,
      connected: false,
      pairing: !creds.registered,
      dead: false,
      markedPaired: false,
      lastSeen: new Date(),
      lastError: null,
      reconnectAttempts: 0,
      reconnectTimer: null,
      persistTimer: null,
      pairingCode: null,
      codeIssuedAt: null,
      // A restart always kills the live pairing slot server-side, so the
      // persisted code/QR are dead by definition — start a fresh window.
      pairingStartedAt: null,
      refreshCount: 0,
      qrString: null,
      qrIssuedAt: null,
      refreshTimer: null,
    }
    store.onChange = () => schedulePersist(s)
    sessions.set(senderId, s)
    return s
  } catch (err) {
    console.error(`[wa-service] snapshot restore parse failed (${senderId}):`, err)
    return null
  }
}

async function restoreAllFromDb(): Promise<{ restored: number; failed: number }> {
  let restored = 0
  let failed = 0
  let rows: { id: string; phoneNumber: string; credsJson: string | null; status: string }[]
  try {
    rows = await prisma.whatsAppSender.findMany({
      where: {
        status: { in: ['PAIRED', 'PENDING_PAIRING'] },
        credsJson: { not: null },
      },
      select: { id: true, phoneNumber: true, credsJson: true, status: true },
    })
  } catch (err) {
    console.error('[wa-service] boot restore: DB read failed:', err)
    return { restored, failed }
  }

  for (const row of rows) {
    if (sessions.has(row.id)) continue
    // Local file is written in the same persist pass and never lags the DB —
    // prefer it (fresher on a crash), fall back to the DB blob when missing/corrupt.
    // 6.6.8 — DB credsJson is encrypted at rest; decrypt here (legacy
    // plaintext rows pass through and get re-encrypted on the next persist).
    let dbJson: string | null = null
    if (row.credsJson) {
      try {
        dbJson = decryptBox(row.credsJson)
      } catch (err) {
        console.error(`[wa-service] creds decrypt failed (${row.phoneNumber}):`, err)
        dbJson = null
      }
    }
    const json = readLocalSnapshot(row.id) ?? dbJson
    if (!json) continue
    const s = restoreFromSnapshot(row.id, row.phoneNumber, json)
    if (!s) {
      failed += 1
      continue
    }
    try {
      await connect(s)
      restored += 1
      console.log(`[wa-service] restored session ${row.phoneNumber} (${row.status})`)
      // Restored while still unpaired → the persisted pairing code died with
      // the previous process. Issue a fresh one automatically so the admin
      // panel shows a live code (+ QR) without clicking anything.
      if (!s.creds.registered && !s.dead) {
        void connectAndRequestCode(s, { firstWindow: true }).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err)
          console.warn(`[wa-service] boot fresh-code failed (${row.phoneNumber}): ${msg}`)
        })
      }
    } catch (err) {
      failed += 1
      console.error(`[wa-service] restore connect failed (${row.phoneNumber}):`, err)
    }
  }
  return { restored, failed }
}

// ── Sending ─────────────────────────────────────────────────────────────────

async function pickSender(senderId: string | null): Promise<SenderSession | null> {
  if (senderId) {
    const s = sessions.get(senderId)
    return s && s.creds.registered ? s : null
  }
  try {
    const row = await prisma.whatsAppSender.findFirst({
      where: { status: 'PAIRED', isDefault: true },
      select: { id: true },
    })
    const s = row ? sessions.get(row.id) : undefined
    if (s && s.creds.registered) return s
  } catch (err) {
    console.error('[wa-service] default sender lookup failed:', err)
  }
  for (const s of sessions.values()) {
    if (s.creds.registered) return s
  }
  return null
}

function waitForConnected(s: SenderSession, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve) => {
    const tick = () => {
      if (s.dead || !s.sock) return resolve(false)
      if (s.connected) return resolve(true)
      if (Date.now() >= deadline) return resolve(false)
      setTimeout(tick, 250)
    }
    tick()
  })
}

async function handleSend(payload: {
  toPhone?: unknown
  body?: unknown
  senderId?: unknown
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const toPhone = typeof payload.toPhone === 'string' ? payload.toPhone : ''
  const body = typeof payload.body === 'string' ? payload.body : ''
  const senderId =
    typeof payload.senderId === 'string' && payload.senderId.trim() ? payload.senderId : null

  const digits = digitsOnly(toPhone)
  if (!digits) return { status: 400, body: { ok: false, error: 'invalid-to-phone' } }
  if (!body.trim()) return { status: 400, body: { ok: false, error: 'empty-body' } }
  if (body.length > 4096) return { status: 400, body: { ok: false, error: 'body-too-long' } }

  const s = await pickSender(senderId)
  if (!s) return { status: 503, body: { ok: false, error: 'no-paired-sender' } }

  if (!s.connected) {
    const ok = await waitForConnected(s, 8_000)
    if (!ok) {
      await dbUpdate(s, { lastError: 'Send attempted while disconnected.' })
      return { status: 503, body: { ok: false, error: 'sender-not-connected' } }
    }
  }

  const jid = `${digits}@s.whatsapp.net`
  try {
    const result = await withTimeout(
      s.sock!.sendMessage(jid, { text: body }),
      25_000,
      'send-timeout'
    )
    if (!result) return { status: 502, body: { ok: false, error: 'send-returned-empty' } }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await dbUpdate(s, { lastError: `Send failed: ${msg}` })
    return { status: 502, body: { ok: false, error: `send-failed: ${msg}` } }
  }

  s.lastSeen = new Date()
  await dbUpdate(s, { lastUsedAt: new Date(), lastError: null })
  return { status: 200, body: { ok: true } }
}

// ── Small helpers ───────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(label)), ms)),
  ])
}

function findSessionByPayload(payload: { senderId?: unknown; phoneNumber?: unknown }): SenderSession | null {
  if (typeof payload.senderId === 'string' && payload.senderId) {
    return sessions.get(payload.senderId) ?? null
  }
  if (typeof payload.phoneNumber === 'string' && payload.phoneNumber) {
    const want = `+${digitsOnly(payload.phoneNumber)}`
    for (const s of sessions.values()) {
      if (s.phoneNumber === want) return s
    }
  }
  return null
}

// ── HTTP server ─────────────────────────────────────────────────────────────

function send(res: http.ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.end(JSON.stringify(body))
}

function readBody(req: http.IncomingMessage, limit = 512_000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > limit) {
        reject(new ServiceError(413, 'payload-too-large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      if (chunks.length === 0) return resolve({})
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>)
      } catch {
        reject(new ServiceError(400, 'invalid-json'))
      }
    })
    req.on('error', reject)
  })
}

const startedAt = Date.now()

function healthPayload(): Record<string, unknown> {
  let paired = 0
  for (const s of sessions.values()) {
    if (s.creds.registered && s.connected) paired += 1
  }
  return {
    ok: true,
    service: 'whatsapp',
    paired,
    sessions: sessions.size,
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
  }
}

const server = http.createServer((req, res) => {
  void handleRequest(req, res).catch((err) => {
    console.error('[wa-service] unhandled route error:', err)
    if (!res.headersSent) send(res, 500, { ok: false, error: 'internal-error' })
  })
})

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const method = (req.method ?? 'GET').toUpperCase()
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  const pathname = url.pathname
  res.setHeader('Content-Type', 'application/json')

  if (method === 'GET' && pathname === '/health') {
    return send(res, 200, healthPayload())
  }

  // Internal token guard for everything else.
  if (req.headers['x-internal-token'] !== TOKEN) {
    return send(res, 401, { ok: false, error: 'missing-or-invalid-internal-token' })
  }

  try {
    if (method === 'POST' && pathname === '/send') {
      const payload = await readBody(req)
      const { status, body } = await handleSend(payload)
      return send(res, status, body)
    }

    if (method === 'POST' && pathname === '/senders/start') {
      const payload = await readBody(req)
      const senderId = typeof payload.senderId === 'string' ? payload.senderId : ''
      const phoneNumber = typeof payload.phoneNumber === 'string' ? payload.phoneNumber : ''
      if (!senderId || !phoneNumber) {
        return send(res, 400, { ok: false, error: 'senderId-and-phoneNumber-required' })
      }
      const pairingCode = await startPairing(senderId, phoneNumber)
      return send(res, 200, { ok: true, pairingCode })
    }

    if (method === 'GET' && pathname === '/senders/status') {
      const senders = [...sessions.values()].map((s) => {
        const window = pairingWindowInfo(s)
        return {
          senderId: s.senderId,
          phoneNumber: s.phoneNumber,
          connected: s.connected,
          registered: !!s.creds.registered,
          pairing: s.pairing && !s.creds.registered,
          pairingCode: s.pairing && !s.creds.registered ? s.pairingCode : null,
          codeIssuedAt: s.pairing && !s.creds.registered ? s.codeIssuedAt?.toISOString() ?? null : null,
          refreshing: s.pairing && !s.creds.registered ? window.refreshing : false,
          windowExpiresAt: s.pairing && !s.creds.registered ? window.expiresAt : null,
          refreshCount: s.refreshCount,
          qr: s.pairing && !s.creds.registered && s.qrString ? s.qrString : null,
          lastSeen: s.lastSeen.toISOString(),
          lastError: s.lastError,
        }
      })
      return send(res, 200, { ok: true, senders })
    }

    if (method === 'POST' && pathname === '/senders/stop') {
      const payload = await readBody(req)
      const s = findSessionByPayload(payload)
      if (!s) return send(res, 200, { ok: true, note: 'no-active-session' })
      s.dead = true
      const reason = 'Disconnected by admin from Vendora.'
      try {
        if (s.connected) {
          await withTimeout(s.sock?.logout(reason) ?? Promise.resolve(), 10_000, 'logout-timeout')
        } else {
          s.sock?.end(new Error(reason))
        }
      } catch {
        try {
          s.sock?.end(new Error(reason))
        } catch {
          /* already closed */
        }
      }
      destroySession(s, false)
      await dbUpdate(s, { status: 'DISCONNECTED', lastError: reason, credsJson: null })
      console.log(`[wa-service] stopped ${s.phoneNumber} by admin`)
      return send(res, 200, { ok: true })
    }

    if (method === 'POST' && pathname === '/senders/restore') {
      const payload = await readBody(req)
      const sendersList = Array.isArray(payload.senders) ? payload.senders : []
      let restored = 0
      for (const raw of sendersList) {
        if (!raw || typeof raw !== 'object') continue
        const item = raw as { id?: unknown; phoneNumber?: unknown; credsJson?: unknown }
        if (typeof item.id !== 'string' || typeof item.credsJson !== 'string') continue
        if (sessions.has(item.id)) {
          restored += 1
          continue
        }
        const phone = typeof item.phoneNumber === 'string' ? item.phoneNumber : ''
        const s = restoreFromSnapshot(item.id, phone, item.credsJson)
        if (!s) continue
        try {
          await connect(s)
          restored += 1
        } catch (err) {
          console.error(`[wa-service] restore failed (${item.id}):`, err)
        }
      }
      return send(res, 200, { ok: true, restored })
    }

    if (method === 'POST' && pathname === '/senders/restore-all') {
      const result = await restoreAllFromDb()
      return send(res, 200, { ok: true, ...result })
    }

    return send(res, 404, { ok: false, error: 'not-found' })
  } catch (err) {
    if (err instanceof ServiceError) {
      return send(res, err.status, { ok: false, error: err.message })
    }
    throw err
  }
}

// ── Boot ────────────────────────────────────────────────────────────────────

mkdirSync(SESSIONS_DIR, { recursive: true })

// Single-instance guard: a second process that loses the port race (watchdog
// restart, manual start, sandbox duplicate) must EXIT instead of lingering as
// a zombie with its own session map — that split-brain is exactly what made
// pairing status flap and sockets replace each other (user-reported
// 2026-10-05).
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`[wa-service] port ${PORT} already in use — another instance is running, exiting.`)
    process.exit(0)
  }
  console.error('[wa-service] server error:', err)
  process.exit(1)
})

server.listen(PORT, () => {
  console.log(`[wa-service] Vendora WhatsApp service listening on :${PORT}`)
  // Rehydrate every PAIRED / PENDING_PAIRING sender from stored creds.
  void restoreAllFromDb().then(({ restored, failed }) => {
    if (restored || failed) console.log(`[wa-service] boot restore: ${restored} ok, ${failed} failed`)
  })
})

process.on('unhandledRejection', (err) => {
  console.error('[wa-service] unhandled rejection:', err)
})
process.on('uncaughtException', (err) => {
  console.error('[wa-service] uncaught exception:', err)
})
