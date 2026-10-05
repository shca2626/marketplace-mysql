'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN · WHATSAPP SUITE — shared types, badge palettes and editor helpers
// (agent 8-a). Local shapes mirror the API responses; nothing here is global.
// ─────────────────────────────────────────────────────────────────────────────

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  TEMPLATE_VARIABLES,
  exampleVars,
  renderTemplateBody,
} from '@/server/modules/whatsapp/variables'

// ── API response shapes ──────────────────────────────────────────────────────

export interface WTemplate {
  id: string
  name: string
  category: string
  language: string
  body: string
  status: string
  useCount: number
  campaignCount: number
  createdAt: string
  updatedAt: string
}

export interface WRule {
  id: string
  name: string
  matchType: string
  pattern: string
  reply: string
  priority: number
  active: boolean
  hits: number
  createdAt: string
  updatedAt: string
}

export interface WCampaign {
  id: string
  name: string
  templateId: string | null
  templateName: string | null
  body: string
  audience: string
  status: string
  total: number
  sent: number
  failed: number
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
}

export interface WCampaignMessage {
  id: string
  toNumber: string
  body: string
  direction: string
  status: string
  error: string | null
  sentAt: string | null
  createdAt: string
}

export interface WLogMessage {
  id: string
  campaignId: string | null
  toNumber: string
  fromNumber: string | null
  body: string
  direction: string
  status: string
  error: string | null
  waMessageId: string | null
  sentAt: string | null
  createdAt: string
}

export interface WSession {
  up: boolean
  connected: boolean
  phone: string | null
  since: string | null
  qr: string | null
}

export interface InboxRow {
  id: string
  kind: string
  channelRef: string | null
  visitorName: string | null
  visitorPhone: string | null
  visitorEmail: string | null
  sellerStoreName: string | null
  subject: string | null
  lastMessageAt: string
  lastMessagePreview: string | null
  unreadStaff: number
  status: string
  messageCount: number
}

export interface ChatMsg {
  id: string
  senderRole: string
  senderName: string | null
  body: string
  readAt?: string | null
  createdAt: string
}

export interface InboxConversation {
  id: string
  kind: string
  channelRef: string | null
  buyerId: string | null
  visitorName: string | null
  visitorPhone: string | null
  visitorEmail: string | null
  sellerOrgId: string | null
  subject: string | null
  lastMessageAt: string
  lastMessagePreview: string | null
  unreadStaff: number
  status: string
  createdAt: string
}

export interface InboxDetail {
  conversation: InboxConversation
  messages: ChatMsg[]
  sellerStoreName: string | null
}

// ── Badge palettes (warm theme — navy/gold/stone, no blue/indigo) ─────────────

type BadgeMap = Record<string, { label: string; badge: string }>

export const TEMPLATE_CATEGORY_MAP: BadgeMap = {
  MARKETING: { label: 'Marketing', badge: 'bg-bh-bg-gold text-bh-gold-dark' },
  UTILITY: { label: 'Utility', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  AUTHENTICATION: { label: 'Auth', badge: 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300' },
}

export const TEMPLATE_STATUS_MAP: BadgeMap = {
  DRAFT: { label: 'Draft', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  APPROVED: { label: 'Approved', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
}

export const LANGUAGE_MAP: BadgeMap = {
  en: { label: 'EN', badge: 'bg-bh-navy text-bh-gold' },
  ar: { label: 'عربي', badge: 'bg-bh-navy text-white' },
}

export const MATCH_TYPE_MAP: BadgeMap = {
  CONTAINS: { label: 'Contains', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  EXACT: { label: 'Exact', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  STARTS_WITH: { label: 'Starts with', badge: 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300' },
  REGEX: { label: 'Regex', badge: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300' },
}

export const AUDIENCE_MAP: BadgeMap = {
  ALL_USERS: { label: 'All users', badge: 'bg-bh-navy text-bh-gold' },
  BUYERS: { label: 'Buyers', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  SELLERS: { label: 'Sellers', badge: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300' },
  CUSTOM: { label: 'Custom list', badge: 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300' },
}

export const CAMPAIGN_STATUS_MAP: BadgeMap = {
  DRAFT: { label: 'Draft', badge: 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300' },
  QUEUED: { label: 'Queued', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  SENDING: { label: 'Sending', badge: 'bg-bh-bg-gold text-bh-gold-dark' },
  PAUSED: { label: 'Paused', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  COMPLETED: { label: 'Completed', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  CANCELLED: { label: 'Cancelled', badge: 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400' },
  FAILED: { label: 'Failed', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
}

export const MSG_STATUS_MAP: BadgeMap = {
  QUEUED: { label: 'Queued', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  SENT: { label: 'Sent', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  FAILED: { label: 'Failed', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
  RECEIVED: { label: 'Received', badge: 'bg-bh-navy text-bh-gold' },
}

export const CONVERSATION_KIND_MAP: BadgeMap = {
  WHATSAPP: { label: 'WhatsApp', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  WIDGET: { label: 'Widget', badge: 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300' },
}

export const CONVERSATION_STATUS_MAP: BadgeMap = {
  OPEN: { label: 'Open', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  CLOSED: { label: 'Closed', badge: 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400' },
}

export function WaBadge({
  value,
  map,
  className,
}: {
  value: string
  map: BadgeMap
  className?: string
}) {
  const entry = map[value]
  return (
    <Badge
      className={cn(
        'shrink-0 rounded-full border-0 text-[11px] font-semibold',
        entry?.badge ?? 'bg-muted text-muted-foreground',
        className
      )}
    >
      {entry?.label ?? value}
    </Badge>
  )
}

// ── Template editor helpers ───────────────────────────────────────────────────

/** Render `body` with the registry example values (admin live preview). */
export function previewBody(body: string): string {
  return renderTemplateBody(body, exampleVars())
}

/**
 * Row of variable chips. Clicking inserts `{{key}}` at the cursor of the
 * focused Textarea (falls back to appending at the end).
 */
export function VariableChips({
  textareaRef,
  value,
  onChange,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  value: string
  onChange: (next: string) => void
}) {
  const insert = (key: string) => {
    const token = `{{${key}}}`
    const el = textareaRef.current
    if (!el) {
      onChange(value + token)
      return
    }
    const start = el.selectionStart ?? value.length
    const end = el.selectionEnd ?? start
    const next = value.slice(0, start) + token + value.slice(end)
    onChange(next)
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + token.length
      el.setSelectionRange(pos, pos)
    })
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {TEMPLATE_VARIABLES.map((v) => (
        <button
          key={v.key}
          type="button"
          title={v.description}
          aria-label={`Insert variable ${v.key} at the cursor`}
          onClick={() => insert(v.key)}
          className="rounded-full border border-bh-gold/40 bg-bh-bg-gold px-2.5 py-1 font-mono text-[11px] font-semibold text-bh-gold-dark transition-colors hover:border-bh-gold hover:bg-bh-gold/25"
        >
          {`{{${v.key}}}`}
        </button>
      ))}
    </div>
  )
}

/** Small header used by the five section tabs. */
export function SectionHeader({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h3 className="text-base font-bold text-bh-navy">{title}</h3>
        <p className="mt-0.5 max-w-2xl text-sm text-bh-muted">{description}</p>
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}
