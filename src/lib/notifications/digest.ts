import { db } from '@/lib/db'
import { timeAgo } from '@/lib/format'
import { getStorefrontSettings } from '@/lib/settings/server'

/**
 * NOTIFICATION EMAIL DIGEST (DIGEST-13, SMTP-wired PRODENV-1, EMAILTRACK-1)
 * ─────────────────────────────────────────────────────────────────────────────
 * Builds branded HTML digest emails from the same server-side notification
 * feed the bell consumes, stores the rendered result (NotificationDigest), and
 * hands delivery to a pluggable transport. When mail is configured the resend
 * transport is the default: the shared mailer tries the Resend REST API first
 * (capturing the provider message id for delivery tracking, stored via the
 * digest-provider-store sidecar) and falls back to the SMTP pool. Without any
 * mail configuration the dev transport only logs and rows stay LOGGED.
 *
 * Email HTML is 100% inline-styled tables: email clients strip <style> blocks
 * and run no external CSS. All dynamic text is HTML-escaped before it touches
 * the template.
 */

export type DigestKind = 'DAILY' | 'WEEKLY'
export type DigestFrequency = 'OFF' | 'DAILY' | 'WEEKLY'

const DAY_MS = 24 * 60 * 60 * 1000
/** Max items shown per family card before the "+N more" row kicks in. */
const TOP_ITEMS_PER_FAMILY = 6

// ── Family grouping ──────────────────────────────────────────────────────────
// Mirrors the color clusters the bell's NOTIF_META uses in
// src/components/marketplace/notifications-bell.tsx (quotes=orange family,
// approvals=rose, recurring=teal, financing=emerald…), translated into the
// email-safe inline hex tones below. Unknown types fall into the neutral
// "platform" family, exactly like the bell's FALLBACK_META.

interface DigestFamilyMeta {
  label: string
  color: string // strong tone — dots, chips, accents
  tint: string // soft background — count chips, card washes
}

const FAMILIES: Record<string, DigestFamilyMeta> = {
  quotes: { label: 'RFQs & Quotes', color: '#ea580c', tint: '#fff7ed' },
  messages: { label: 'Negotiation messages', color: '#78716c', tint: '#f5f5f4' },
  approvals: { label: 'Purchase approvals', color: '#e11d48', tint: '#fff1f2' },
  disputes: { label: 'Disputes', color: '#d97706', tint: '#fffbeb' },
  recurring: { label: 'Recurring RFQs', color: '#0d9488', tint: '#f0fdfa' },
  financing: { label: 'Financing', color: '#059669', tint: '#ecfdf5' },
  platform: { label: 'Platform & payments', color: '#57534e', tint: '#fafaf9' },
}

const FAMILY_BY_TYPE: Record<string, string> = {
  // quotes — the bell's orange/teal/emerald quote cluster
  RFQ_SUBMITTED_SELLER: 'quotes',
  RFQ_QUOTE_RECEIVED: 'quotes',
  RFQ_QUOTE_ACCEPTED: 'quotes',
  RFQ_QUOTE_DECLINED: 'quotes',
  RFQ_QUOTE_WITHDRAWN: 'quotes',
  RFQ_QUOTE_CONVERTED: 'quotes',
  RFQ_QUOTE_REVIEW: 'quotes',
  RFQ_QUOTE_REJECTED: 'quotes',
  RFQ_STATUS: 'quotes',
  // messages — the bell's stone cluster
  RFQ_MESSAGE: 'messages',
  // approvals — the bell's rose/emerald cluster
  APPROVAL_REQUESTED: 'approvals',
  APPROVAL_DECIDED: 'approvals',
  // disputes — the bell's rose/amber cluster
  RFQ_DISPUTE: 'disputes',
  RFQ_DISPUTE_STATUS: 'disputes',
  // recurring — the bell's teal/emerald cluster
  RECURRING_PREVIEW: 'recurring',
  RECURRING_PUBLISHED: 'recurring',
  RECURRING_PAUSED: 'recurring',
  // financing module (FINANCIER_SCHEMA v5 §6)
  PLATFORM_RETURNED_REQUEST: 'financing',
  PLATFORM_FORWARDED_REQUEST: 'financing',
  REQUIREMENT_VERIFIED: 'financing',
  REQUIREMENT_REJECTED: 'financing',
  DOCUMENT_VERIFIED: 'financing',
  DOCUMENT_REJECTED: 'financing',
  FINANCING_REQUEST_RECEIVED: 'financing',
  OFFER_RECEIVED: 'financing',
  OFFER_ACCEPTED: 'financing',
  OFFER_DECLINED: 'financing',
  OFFER_WITHDRAWN: 'financing',
  ACCREDITATION_RECEIVED: 'financing',
  ACCREDITATION_GRANTED: 'financing',
  ACCREDITATION_REJECTED: 'financing',
  ACCREDITATION_REVOKED: 'financing',
  ACCREDITATION_EXPIRING: 'financing',
  FEE_ACCRUED: 'financing',
  AGREEMENT_STATUS_CHANGED: 'financing',
  FINANCING_STATUS_CHANGED: 'financing',
  // platform / payment lifecycle — the bell's fallback cluster
  VENDOR_STATUS: 'platform',
  PAYMENT_STATUS: 'platform',
  PAYOUT_STATUS: 'platform',
}

function familyOf(type: string): { key: string; meta: DigestFamilyMeta } {
  const key = FAMILY_BY_TYPE[type] ?? 'platform'
  return { key, meta: FAMILIES[key] }
}

// ── HTML escaping + formatting ───────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Short single-line body preview (emails have no reliable line-clamp). */
function clipBody(body: string, max = 120): string {
  const oneLine = body.replace(/\s+/g, ' ').trim()
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine
}

function formatPeriodBound(date: Date): string {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// ── Digest build ─────────────────────────────────────────────────────────────

export interface BuiltDigest {
  userId: string
  recipientEmail: string
  kind: DigestKind
  periodStart: Date
  periodEnd: Date
  itemCount: number
  subject: string
  html: string
}

interface FamilyGroup {
  key: string
  meta: DigestFamilyMeta
  count: number
  items: {
    title: string
    body: string | null
    createdAt: Date
    readAt: Date | null
  }[]
}

/**
 * Collect + render one user's digest for the DAILY (24h) or WEEKLY (7d) period.
 * Returns null when there is nothing to digest — callers skip empty inboxes.
 */
export async function buildDigestForUser(userId: string, kind: DigestKind): Promise<BuiltDigest | null> {
  const periodEnd = new Date()
  const periodStart = new Date(periodEnd.getTime() - (kind === 'DAILY' ? DAY_MS : 7 * DAY_MS))

  const [user, rows, settings] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true } }),
    db.notification.findMany({
      where: { userId, createdAt: { gte: periodStart, lt: periodEnd } },
      orderBy: { createdAt: 'desc' },
    }),
    getStorefrontSettings(),
  ])
  if (!user) return null

  // Group by the bell's family clusters, preserving newest-first order inside
  // each family. Cards themselves render in descending total-count order.
  const groups = new Map<string, FamilyGroup>()
  for (const n of rows) {
    const { key, meta } = familyOf(n.type)
    let group = groups.get(key)
    if (!group) {
      group = { key, meta, count: 0, items: [] }
      groups.set(key, group)
    }
    group.count += 1
    group.items.push({ title: n.title, body: n.body, createdAt: n.createdAt, readAt: n.readAt })
  }
  if (groups.size === 0) return null

  const itemCount = rows.length
  const siteName = settings.general.siteName
  const accent = settings.theme.accent
  const tagline = settings.general.tagline
  const periodWord = kind === 'DAILY' ? 'day' : 'week'

  const subject = `${siteName} — ${itemCount} update${itemCount === 1 ? '' : 's'} from your ${periodWord}`
  const html = renderDigestEmail({
    siteName,
    tagline,
    accent,
    kind,
    itemCount,
    periodStart,
    periodEnd,
    groups: [...groups.values()].sort((a, b) => b.count - a.count),
  })

  return {
    userId: user.id,
    recipientEmail: user.email,
    kind,
    periodStart,
    periodEnd,
    itemCount,
    subject,
    html,
  }
}

// ── Email template (inline styles only — email clients run no CSS) ───────────

const FONT = `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;`

interface RenderInput {
  siteName: string
  tagline: string
  accent: string
  kind: DigestKind
  itemCount: number
  periodStart: Date
  periodEnd: Date
  groups: FamilyGroup[]
}

function renderDigestEmail(input: RenderInput): string {
  const { siteName, tagline, accent, kind, itemCount, periodStart, periodEnd, groups } = input
  const periodWord = kind === 'DAILY' ? 'day' : 'week'
  const preheader = `Your ${periodWord} in review — ${itemCount} update${itemCount === 1 ? '' : 's'} across ${groups.length} categor${groups.length === 1 ? 'y' : 'ies'}.`

  const familyCards = groups
    .map((g) => renderFamilyCard(g))
    .join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="support-color-scheme" content="light">
<title>${escapeHtml(`${siteName} — your ${periodWord} in review`)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f4;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f5f5f4;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f4;padding:28px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;${FONT}">
  <tr><td style="padding:0 8px 12px 12px;">
    <span style="font-size:12px;color:#a8a29e;letter-spacing:0.4px;">${escapeHtml(siteName)} digest</span>
  </td></tr>
  <tr><td style="background-color:${accent};border-radius:16px 16px 0 0;padding:26px 32px;">
    <span style="font-size:22px;font-weight:bold;color:#ffffff;letter-spacing:0.5px;">${escapeHtml(siteName)}</span>
    <span style="display:block;margin-top:6px;font-size:13px;color:rgba(255,255,255,0.85);">${escapeHtml(tagline)}</span>
  </td></tr>
  <tr><td style="background-color:#ffffff;border-left:1px solid #e7e5e4;border-right:1px solid #e7e5e4;padding:30px 32px 8px;">
    <h1 style="margin:0;font-size:21px;line-height:1.3;color:#1c1917;">Your ${escapeHtml(periodWord)} on ${escapeHtml(siteName)}</h1>
    <p style="margin:10px 0 26px;font-size:14px;line-height:1.6;color:#57534e;">
      ${itemCount} notification update${itemCount === 1 ? '' : 's'} landed in your inbox bell this ${escapeHtml(periodWord)}.
    </p>
${familyCards}
  </td></tr>
  <tr><td style="background-color:#fafaf9;border:1px solid #e7e5e4;border-top:none;border-radius:0 0 16px 16px;padding:22px 32px;">
    <p style="margin:0;font-size:12px;line-height:1.6;color:#78716c;">
      <strong style="color:#57534e;">Period:</strong> ${escapeHtml(formatPeriodBound(periodStart))} – ${escapeHtml(formatPeriodBound(periodEnd))}
    </p>
    <p style="margin:8px 0 0;font-size:12px;line-height:1.6;color:#a8a29e;">
      Manage your email preferences anytime from the notifications bell &rarr; Email digest.
      You are receiving this because you enabled ${kind === 'DAILY' ? 'daily' : 'weekly'} digests.
    </p>
    <p style="margin:14px 0 0;font-size:11px;color:#d6d3d1;">&copy; ${new Date().getFullYear()} ${escapeHtml(siteName)}</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

function renderFamilyCard(group: FamilyGroup): string {
  const { meta } = group
  const top = group.items.slice(0, TOP_ITEMS_PER_FAMILY)
  const more = group.count - top.length

  const rowsHtml = top
    .map((item) => {
      const dot = item.readAt ? '#d6d3d1' : meta.color
      const bodyHtml = item.body
        ? `<div style="margin:3px 0 0 18px;font-size:12.5px;line-height:1.5;color:#78716c;">${escapeHtml(clipBody(item.body))}</div>`
        : ''
      return `<tr><td style="padding:9px 0;border-top:1px solid #f0efee;">
      <span style="display:inline-block;width:8px;height:8px;border-radius:999px;background-color:${dot};"></span>
      <span style="font-size:13.5px;font-weight:600;color:#1c1917;">${escapeHtml(item.title)}</span>
      <span style="font-size:11.5px;color:#a8a29e;"> &middot; ${escapeHtml(timeAgo(item.createdAt.toISOString()))}</span>
      ${bodyHtml}
    </td></tr>`
    })
    .join('\n')

  const moreHtml =
    more > 0
      ? `<tr><td style="padding:8px 0 2px 18px;border-top:1px solid #f0efee;font-size:12px;color:#a8a29e;">+${more} more in this category</td></tr>`
      : ''

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;">
  <tr><td style="background-color:${meta.tint};border:1px solid #e7e5e4;border-radius:12px;padding:16px 20px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="font-size:14px;font-weight:bold;color:#1c1917;">${escapeHtml(meta.label)}</td>
        <td align="right" style="width:64px;">
          <span style="display:inline-block;background-color:${meta.color};color:#ffffff;font-size:12px;font-weight:bold;padding:3px 11px;border-radius:999px;">${group.count}</span>
        </td>
      </tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;">
${rowsHtml}
${moreHtml}
    </table>
  </td></tr>
</table>`
}

// ── Pluggable transport ──────────────────────────────────────────────────────

import { isMailerConfigured, sendMail } from '@/lib/mailer'
import { storeDigestProviderId } from '@/lib/notifications/digest-provider-store'

/** What a transport reports back after a successful delivery. */
export interface DigestDeliveryInfo {
  /** Provider message id when the transport got one back (Resend email id). */
  providerMessageId?: string
}

export interface DigestTransport {
  /** Stable identifier — 'dev-console' keeps the stored status LOGGED. */
  name: string
  deliver(input: { to: string; subject: string; html: string }): Promise<DigestDeliveryInfo>
}

/** Sandbox transport: no mail configured — logs the delivery instead of faking a send. */
export const devConsoleTransport: DigestTransport = {
  name: 'dev-console',
  async deliver({ to, subject }) {
    console.log(`digest delivered (dev transport) → recipient: ${to} · subject: ${subject}`)
    return {}
  },
}

/** Real transport: Resend via the shared mailer — REST API first, SMTP fallback. */
export const resendTransport: DigestTransport = {
  name: 'resend',
  async deliver(input) {
    const result = await sendMail(input)
    if (!result.ok) throw new Error(result.error)
    console.log(
      `[mailer] digest sent via ${result.via} → recipient: ${input.to}` +
        (result.providerMessageId ? ` · id: ${result.providerMessageId}` : '')
    )
    // Only Resend REST API ids are pollable — SMTP message ids have no
    // status endpoint, so they are not worth storing for tracking.
    return result.via === 'resend-api' && result.providerMessageId
      ? { providerMessageId: result.providerMessageId }
      : {}
  },
}

let activeTransport: DigestTransport = isMailerConfigured() ? resendTransport : devConsoleTransport

/** Swap the transport (tests / future providers); rows persist with status SENT. */
export function setDigestTransport(transport: DigestTransport): void {
  activeTransport = transport
}

export function getDigestTransport(): DigestTransport {
  return activeTransport
}

// ── Persistence + delivery ───────────────────────────────────────────────────

type DigestRow = {
  id: string
  kind: string
  periodStart: Date
  periodEnd: Date
  itemCount: number
  subject: string
  status: string
  createdAt: Date
}

export interface DigestRowDTO {
  id: string
  kind: string
  periodStart: string
  periodEnd: string
  itemCount: number
  subject: string
  status: string
  createdAt: string
}

function toDigestRowDTO(row: DigestRow): DigestRowDTO {
  return {
    id: row.id,
    kind: row.kind,
    periodStart: row.periodStart.toISOString(),
    periodEnd: row.periodEnd.toISOString(),
    itemCount: row.itemCount,
    subject: row.subject,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  }
}

/**
 * Deliver through the active transport, then persist the rendered digest.
 * A failed send (API/SMTP rejection, provider outage) does NOT lose the digest:
 * the row is still stored with status FAILED and the error is logged — the
 * user sees the honest status in their digest history and can retry.
 * When the transport returns a provider message id (Resend API sends), it is
 * recorded in the digest-provider-store sidecar so the status endpoint can
 * poll the provider's real delivery event later.
 */
export async function persistAndDeliverDigest(digest: BuiltDigest): Promise<DigestRowDTO> {
  let status = 'SENT'
  let deliveryInfo: DigestDeliveryInfo = {}
  try {
    deliveryInfo = await activeTransport.deliver({
      to: digest.recipientEmail,
      subject: digest.subject,
      html: digest.html,
    })
  } catch (err) {
    status = 'FAILED'
    console.error(
      `[mailer] digest delivery failed → recipient: ${digest.recipientEmail} · subject: "${digest.subject}" ·`,
      err instanceof Error ? `${err.message}` : err
    )
  }
  const row = await db.notificationDigest.create({
    data: {
      userId: digest.userId,
      kind: digest.kind,
      periodStart: digest.periodStart,
      periodEnd: digest.periodEnd,
      itemCount: digest.itemCount,
      subject: digest.subject,
      html: digest.html,
      // Dev transport logs only; a real transport earns SENT (or FAILED).
      status: activeTransport.name === 'dev-console' ? 'LOGGED' : status,
    },
    select: {
      id: true,
      kind: true,
      periodStart: true,
      periodEnd: true,
      itemCount: true,
      subject: true,
      status: true,
      createdAt: true,
    },
  })
  if (deliveryInfo.providerMessageId) {
    await storeDigestProviderId(row.id, deliveryInfo.providerMessageId)
  }
  return toDigestRowDTO(row)
}

/** Most recent digests for the settings dialog (never ships the HTML blob). */
export async function listDigestHistory(userId: string, limit = 10): Promise<DigestRowDTO[]> {
  const rows = await db.notificationDigest.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 20),
    select: {
      id: true,
      kind: true,
      periodStart: true,
      periodEnd: true,
      itemCount: true,
      subject: true,
      status: true,
      createdAt: true,
    },
  })
  return rows.map(toDigestRowDTO)
}

// ── Preferences ──────────────────────────────────────────────────────────────

export async function getDigestFrequency(userId: string): Promise<DigestFrequency> {
  const pref = await db.userDigestPref.findUnique({ where: { userId } })
  const freq = pref?.frequency
  return freq === 'DAILY' || freq === 'WEEKLY' ? freq : 'OFF'
}

export async function setDigestFrequency(userId: string, frequency: DigestFrequency): Promise<DigestFrequency> {
  await db.userDigestPref.upsert({
    where: { userId },
    update: { frequency },
    create: { userId, frequency },
  })
  return frequency
}

// ── Batch runner (cron entry point) ──────────────────────────────────────────

export interface DigestBatchResult {
  processed: number
  generated: number
  skipped: number
}

/**
 * Iterate every ACTIVE user with a DAILY/WEEKLY preference, build + deliver +
 * persist their digest, and skip empty inboxes. Sequential on purpose — SQLite
 * single-writer; a queue/worker split can parallelize per-user later.
 */
export async function runDigestBatch(): Promise<DigestBatchResult> {
  const prefs = await db.userDigestPref.findMany({
    where: { frequency: { in: ['DAILY', 'WEEKLY'] } },
    include: { user: { select: { id: true, status: true } } },
  })

  let generated = 0
  let skipped = 0
  for (const pref of prefs) {
    if (pref.user.status !== 'ACTIVE') {
      skipped += 1
      continue
    }
    const kind: DigestKind = pref.frequency === 'WEEKLY' ? 'WEEKLY' : 'DAILY'
    try {
      const digest = await buildDigestForUser(pref.user.id, kind)
      if (!digest) {
        skipped += 1
        continue
      }
      await persistAndDeliverDigest(digest)
      generated += 1
    } catch (err) {
      // One user's failure must not abort the batch.
      skipped += 1
      console.error('[digest] batch user failed:', err instanceof Error ? err.message : err)
    }
  }

  return { processed: prefs.length, generated, skipped }
}
