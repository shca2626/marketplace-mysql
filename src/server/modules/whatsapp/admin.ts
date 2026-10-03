import { db } from '@/lib/db'
import { sendWhatsAppText } from '@/lib/whatsapp'
import { normalizeE164, normalizeYemeniPhone } from '@/lib/phone'

// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp channel administration (Phase 3 — admin console "WhatsApp Channels").
//
// DB write ownership contract (see mini-services/whatsapp-service/index.ts):
//   • The MINI-SERVICE owns everything driven by live Baileys events —
//     WhatsAppSender.status transitions, credsJson, pairingCode, lastError,
//     lastUsedAt. It sees pairing success/logouts directly.
//   • THESE routes own sender row CRUD (create/delete, label, isDefault) and
//     the WhatsAppMessage ledger (via src/lib/whatsapp.ts). The /check route is
//     a fallback reconciler: if the service reports the line connected but the
//     row is stale (e.g. the service's own DB write failed), it repairs the row.
// ─────────────────────────────────────────────────────────────────────────────

const SERVICE_URL = process.env.WHATSAPP_SERVICE_URL ?? 'http://localhost:3031'
const SERVICE_TOKEN = process.env.WHATSAPP_SERVICE_TOKEN ?? 'vendora-internal'

export class WhatsAppAdminError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** JSON call into the Baileys mini-service (server-to-server, direct localhost). */
export async function waService<T = Record<string, unknown>>(
  path: string,
  opts?: { method?: string; body?: unknown; timeoutMs?: number }
): Promise<{ ok: boolean; status: number; data: T }> {
  try {
    const res = await fetch(`${SERVICE_URL}${path}`, {
      method: opts?.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': SERVICE_TOKEN,
      },
      body: opts?.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: AbortSignal.timeout(opts?.timeoutMs ?? 8_000),
      cache: 'no-store',
    })
    const data = (await res.json().catch(() => ({}))) as T
    return { ok: res.ok, status: res.status, data }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new WhatsAppAdminError(502, `WhatsApp service unreachable (${msg})`)
  }
}

// ── DTO ─────────────────────────────────────────────────────────────────────

export interface WhatsAppSenderDTO {
  id: string
  label: string
  phoneNumber: string
  status: string
  isDefault: boolean
  pairingCode: string | null
  lastUsedAt: string | null
  lastError: string | null
  createdAt: string
}

type SenderRow = {
  id: string
  label: string
  phoneNumber: string
  status: string
  isDefault: boolean
  pairingCode: string | null
  lastUsedAt: Date | null
  lastError: string | null
  createdAt: Date
}

export function serializeWhatsAppSender(row: SenderRow): WhatsAppSenderDTO {
  return {
    id: row.id,
    label: row.label,
    phoneNumber: row.phoneNumber,
    status: row.status,
    isDefault: row.isDefault,
    pairingCode: row.pairingCode,
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
  }
}

const SENDER_SELECT = {
  id: true,
  label: true,
  phoneNumber: true,
  status: true,
  isDefault: true,
  pairingCode: true,
  lastUsedAt: true,
  lastError: true,
  createdAt: true,
} as const

export async function listSenders(): Promise<WhatsAppSenderDTO[]> {
  const rows = await db.whatsAppSender.findMany({
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    select: SENDER_SELECT,
  })
  return rows.map(serializeWhatsAppSender)
}

/**
 * Normalize a sender phone typed by the admin — ANY international number
 * (+967…, +966…, +1…). Yemeni locals without + are accepted as a convenience.
 */
export function normalizeSenderPhone(raw: string): string | null {
  return normalizeE164(raw) ?? normalizeYemeniPhone(raw)
}

// ── Create + begin pairing ─────────────────────────────────────────────────

export interface CreateSenderResult {
  sender: WhatsAppSenderDTO
  pairingCode: string | null
  /** When the row was created but the service could not issue a pairing code. */
  warning?: string
}

export async function createSenderAndStartPairing(input: {
  label: string
  phoneNumber: string
  isDefault: boolean
}): Promise<CreateSenderResult> {
  const existing = await db.whatsAppSender.findUnique({
    where: { phoneNumber: input.phoneNumber },
    select: { id: true },
  })
  if (existing) {
    throw new WhatsAppAdminError(409, 'A sender with this phone number already exists')
  }

  const row = await db.whatsAppSender.create({
    data: {
      label: input.label,
      phoneNumber: input.phoneNumber,
      status: 'PENDING_PAIRING',
      isDefault: input.isDefault,
    },
    select: SENDER_SELECT,
  })
  if (input.isDefault) {
    await db.whatsAppSender.updateMany({
      where: { id: { not: row.id } },
      data: { isDefault: false },
    })
  }

  // Begin pairing in the service. This can take ~30-60s (it waits for the
  // WhatsApp socket, then issues the code) — long timeout on purpose.
  try {
    const res = await waService<{ ok: boolean; pairingCode?: string; error?: string }>(
      '/senders/start',
      {
        method: 'POST',
        body: { senderId: row.id, phoneNumber: row.phoneNumber },
        timeoutMs: 70_000,
      }
    )
    if (res.ok && res.data.pairingCode) {
      const updated = await db.whatsAppSender.update({
        where: { id: row.id },
        data: { pairingCode: res.data.pairingCode },
        select: SENDER_SELECT,
      })
      return { sender: serializeWhatsAppSender(updated), pairingCode: res.data.pairingCode }
    }
    const msg = (res.data as { error?: string })?.error ?? `service responded ${res.status}`
    const updated = await db.whatsAppSender.update({
      where: { id: row.id },
      data: { lastError: `Pairing failed to start: ${msg}` },
      select: SENDER_SELECT,
    })
    return {
      sender: serializeWhatsAppSender(updated),
      pairingCode: null,
      warning: `Sender saved, but pairing could not start: ${msg}. Check the service and try again.`,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const updated = await db.whatsAppSender.update({
      where: { id: row.id },
      data: { lastError: `Pairing failed to start: ${msg}` },
      select: SENDER_SELECT,
    })
    return {
      sender: serializeWhatsAppSender(updated),
      pairingCode: null,
      warning: `Sender saved, but the WhatsApp service could not be reached: ${msg}.`,
    }
  }
}

// ── Per-sender actions ──────────────────────────────────────────────────────

export interface ServiceStatusEntry {
  senderId?: string
  phoneNumber?: string
  connected?: boolean
  registered?: boolean
  pairing?: boolean
  lastError?: string | null
}

/**
 * Fallback reconciler: reads live state from the service and repairs a stale
 * row (the service is the primary status writer — see the ownership contract).
 */
export async function checkSenderPairing(
  senderId: string
): Promise<{ sender: WhatsAppSenderDTO; connected: boolean }> {
  const row = await db.whatsAppSender.findUnique({ where: { id: senderId }, select: SENDER_SELECT })
  if (!row) throw new WhatsAppAdminError(404, 'Sender not found')

  let live: ServiceStatusEntry | null = null
  try {
    const res = await waService<{ senders?: ServiceStatusEntry[] }>('/senders/status')
    live =
      res.data.senders?.find((s) => s.senderId === senderId || s.phoneNumber === row.phoneNumber) ??
      null
  } catch {
    live = null // service down — row state is all we have
  }

  if (live?.connected && live?.registered && row.status !== 'PAIRED') {
    const updated = await db.whatsAppSender.update({
      where: { id: senderId },
      data: { status: 'PAIRED', lastError: null },
      select: SENDER_SELECT,
    })
    return { sender: serializeWhatsAppSender(updated), connected: true }
  }

  return { sender: serializeWhatsAppSender(row), connected: !!(live?.connected && live.registered) }
}

export async function disconnectSender(senderId: string): Promise<WhatsAppSenderDTO> {
  const row = await db.whatsAppSender.findUnique({ where: { id: senderId }, select: SENDER_SELECT })
  if (!row) throw new WhatsAppAdminError(404, 'Sender not found')

  // Stop the live session first (the service also writes DISCONNECTED itself;
  // a service-down error is non-fatal — there is no live session to stop then).
  try {
    await waService('/senders/stop', {
      method: 'POST',
      body: { senderId: row.id, phoneNumber: row.phoneNumber },
      timeoutMs: 15_000,
    })
  } catch {
    /* service unreachable — mark the row locally */
  }

  const updated = await db.whatsAppSender.update({
    where: { id: senderId },
    data: {
      status: 'DISCONNECTED',
      lastError: 'Disconnected by admin.',
    },
    select: SENDER_SELECT,
  })
  return serializeWhatsAppSender(updated)
}

export async function setDefaultSender(senderId: string): Promise<WhatsAppSenderDTO> {
  const row = await db.whatsAppSender.findUnique({ where: { id: senderId }, select: SENDER_SELECT })
  if (!row) throw new WhatsAppAdminError(404, 'Sender not found')
  await db.$transaction([
    db.whatsAppSender.updateMany({ where: { id: { not: senderId } }, data: { isDefault: false } }),
    db.whatsAppSender.update({ where: { id: senderId }, data: { isDefault: true } }),
  ])
  const updated = await db.whatsAppSender.findUnique({
    where: { id: senderId },
    select: SENDER_SELECT,
  })
  if (!updated) throw new WhatsAppAdminError(404, 'Sender not found')
  return serializeWhatsAppSender(updated)
}

export async function deleteSender(senderId: string): Promise<void> {
  const row = await db.whatsAppSender.findUnique({ where: { id: senderId }, select: SENDER_SELECT })
  if (!row) throw new WhatsAppAdminError(404, 'Sender not found')
  try {
    await waService('/senders/stop', {
      method: 'POST',
      body: { senderId: row.id, phoneNumber: row.phoneNumber },
      timeoutMs: 15_000,
    })
  } catch {
    /* service unreachable — row deletion still proceeds */
  }
  await db.whatsAppSender.delete({ where: { id: senderId } })
}

/**
 * Admin "Send test" — routes through the chosen sender when it is PAIRED,
 * otherwise falls back to the default line / DEV delivery (same semantics as
 * sendWhatsAppText, so flows stay testable before any number is paired).
 */
export async function sendSenderTest(
  senderId: string,
  toPhone: string
): Promise<{ delivered: 'whatsapp' | 'dev'; error?: string }> {
  const row = await db.whatsAppSender.findUnique({ where: { id: senderId }, select: SENDER_SELECT })
  if (!row) throw new WhatsAppAdminError(404, 'Sender not found')

  const body = '✅ Vendora test message — your WhatsApp channel is working.'

  if (row.status === 'PAIRED') {
    let res: { ok: boolean; status: number; data: { error?: string } }
    try {
      res = await waService<{ ok: boolean; error?: string }>('/send', {
        method: 'POST',
        body: { toPhone, body, senderId: row.id },
        timeoutMs: 30_000,
      })
    } catch (err) {
      throw new WhatsAppAdminError(502, err instanceof Error ? err.message : String(err))
    }
    await db.whatsAppMessage
      .create({
        data: {
          senderId: row.id,
          toPhone,
          template: 'TEST',
          body,
          status: res.ok ? 'SENT' : 'FAILED',
          error: res.ok ? null : (res.data.error ?? `service responded ${res.status}`),
          sentAt: res.ok ? new Date() : null,
        },
      })
      .catch(() => undefined)
    if (res.ok) return { delivered: 'whatsapp' }
    throw new WhatsAppAdminError(502, res.data.error ?? 'send-failed')
  }

  // Not paired yet — exercise the shared dispatch client (default line → DEV).
  const result = await sendWhatsAppText({ toPhone, body, template: 'TEST' })
  return { delivered: result.delivered, error: result.error }
}

// ── Message ledger ─────────────────────────────────────────────────────────

export interface WhatsAppMessageDTO {
  id: string
  toPhone: string
  template: string
  status: string
  error: string | null
  createdAt: string
  sentAt: string | null
  bodyPreview: string
}

export async function listWhatsAppMessages(take = 50): Promise<WhatsAppMessageDTO[]> {
  const rows = await db.whatsAppMessage.findMany({
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(take, 1), 100),
    select: {
      id: true,
      toPhone: true,
      template: true,
      body: true,
      status: true,
      error: true,
      createdAt: true,
      sentAt: true,
    },
  })
  return rows.map((r) => ({
    id: r.id,
    toPhone: r.toPhone,
    template: r.template,
    status: r.status,
    error: r.error,
    createdAt: r.createdAt.toISOString(),
    sentAt: r.sentAt ? r.sentAt.toISOString() : null,
    bodyPreview: r.body.length > 90 ? `${r.body.slice(0, 90)}…` : r.body,
  }))
}
