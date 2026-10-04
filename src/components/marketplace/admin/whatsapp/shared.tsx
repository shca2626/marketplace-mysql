'use client'

// ─────────────────────────────────────────────────────────────────────────────
// WHATSAPP BUSINESS SUITE · shared kit (wa-biz-2).
// DTOs + badge palettes + tiny UI atoms shared by the Templates / Chatbot /
// Campaigns managers. Visual language: warm stone/orange — NO blue/indigo.
// ─────────────────────────────────────────────────────────────────────────────

import type { LucideIcon } from 'lucide-react'
import { CheckCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// ── DTOs (exact wa-biz-0 contract shapes) ───────────────────────────────────

export interface TemplateDTO {
  id: string
  name: string
  category: string
  language: string
  body: string
  status: string
  useCount: number
  createdAt: string
  updatedAt: string
}

export interface RuleDTO {
  id: string
  name: string
  matchType: string
  pattern: string
  reply: string
  active: boolean
  priority: number
  hits: number
  createdAt: string
  updatedAt: string
}

export interface CampaignDTO {
  id: string
  name: string
  body: string
  audience: string
  status: string
  total: number
  sent: number
  failed: number
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  templateId: string | null
  templateName?: string | null
}

/** Uniform loader props every manager receives from the tab shell — the shell
 *  owns the GET so the KPI strip and the tab body never drift apart. */
export interface ManagerLoaderProps<T> {
  data: T | null
  loading: boolean
  error: string | null
  refetch: (opts?: { silent?: boolean }) => Promise<void>
}

// ── Badge palettes ───────────────────────────────────────────────────────────

export const TEMPLATE_CATEGORY_MAP: Record<string, { label: string; badge: string }> = {
  MARKETING: {
    label: 'Marketing',
    badge: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  },
  UTILITY: {
    label: 'Utility',
    badge: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300',
  },
  NOTIFICATION: {
    label: 'Notification',
    badge: 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400',
  },
  CUSTOM: {
    label: 'Custom',
    badge: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  },
}

export const TEMPLATE_STATUS_MAP: Record<string, { label: string; badge: string }> = {
  APPROVED: {
    label: 'Approved',
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  },
  DRAFT: {
    label: 'Draft',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  },
  ARCHIVED: {
    label: 'Archived',
    badge: 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400',
  },
}

export const RULE_MATCH_MAP: Record<string, { label: string; badge: string }> = {
  CONTAINS: {
    label: 'Contains',
    badge: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  },
  EXACT: {
    label: 'Exact',
    badge: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300',
  },
  STARTS_WITH: {
    label: 'Starts with',
    badge: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  },
  REGEX: {
    label: 'Regex',
    badge: 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400',
  },
}

export const CAMPAIGN_STATUS_MAP: Record<string, { label: string; badge: string }> = {
  DRAFT: {
    label: 'Draft',
    badge: 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400',
  },
  QUEUED: {
    label: 'Queued',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  },
  SENDING: {
    label: 'Sending',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  },
  PAUSED: {
    label: 'Paused',
    badge: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  },
  COMPLETED: {
    label: 'Completed',
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  },
  CANCELLED: {
    label: 'Cancelled',
    badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  },
  FAILED: {
    label: 'Failed',
    badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  },
}

export const CAMPAIGN_AUDIENCE_MAP: Record<string, string> = {
  ALL_USERS: 'All users',
  BUYERS: 'Buyers',
  SELLERS: 'Sellers',
  CUSTOM: 'Custom list',
}

/** Statuses during which the campaigns list keeps live-refreshing (5s). */
export const CAMPAIGN_LIVE_STATUSES = ['QUEUED', 'SENDING', 'PAUSED']

/** Compact warm badge used across the suite (same shape as admin/shared's). */
export function WaBadge({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <Badge className={cn('shrink-0 rounded-full border-0 text-[11px] font-semibold', className)}>
      {children}
    </Badge>
  )
}

/** Amber pulsing dot for QUEUED/SENDING campaign states. */
export function PulsingDot({ className }: { className?: string }) {
  return (
    <span className={cn('relative flex h-1.5 w-1.5 shrink-0', className)} aria-hidden>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
    </span>
  )
}

// ── {{variable}} parsing + WhatsApp-style preview bubble ─────────────────────

const VAR_TOKEN_RE = /\{\{[^{}]+\}\}/g

/** All distinct {{token}}s in a template body, order preserved. */
export function extractTemplateVars(body: string): string[] {
  return [...new Set(body.match(VAR_TOKEN_RE)?.map((s) => s.trim()) ?? [])]
}

/** Renders text with {{tokens}} visually highlighted (used in live previews). */
export function HighlightVars({ text }: { text: string }) {
  const parts = text.split(/(\{\{[^{}]+\}\})/g)
  return (
    <>
      {parts.map((part, i) =>
        /^\{\{[^{}]+\}\}$/.test(part) ? (
          <mark
            key={i}
            className="rounded bg-emerald-300/60 px-0.5 font-mono text-[0.85em] font-semibold text-emerald-900 dark:bg-emerald-700/60 dark:text-emerald-50"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}

/** WhatsApp-style chat bubble: outgoing = green (right vibe), incoming = muted.
 *  dir="auto" so Arabic bodies align correctly; variables get highlighted. */
export function ChatBubble({
  body,
  incoming = false,
  showTime = true,
  className,
}: {
  body: string
  incoming?: boolean
  showTime?: boolean
  className?: string
}) {
  const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  return (
    <div
      dir="auto"
      className={cn(
        'w-fit max-w-full whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm',
        incoming
          ? 'rounded-tl-md bg-muted text-foreground'
          : 'rounded-tr-md bg-emerald-100 text-emerald-950 dark:bg-emerald-900/60 dark:text-emerald-50',
        className
      )}
    >
      <HighlightVars text={body} />
      {showTime && (
        <span className="mt-1 flex items-center justify-end gap-1 text-[10px] leading-none text-muted-foreground">
          {time}
          {!incoming && <CheckCheck size={12} className="text-emerald-500" aria-hidden />}
        </span>
      )}
    </div>
  )
}

// ── KPI strip card ────────────────────────────────────────────────────────────

const KPI_TONES: Record<string, string> = {
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  violet: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  orange: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
}

export function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  loading = false,
  tone = 'orange',
}: {
  icon: LucideIcon
  label: string
  value: string | number
  hint?: string
  loading?: boolean
  tone?: 'emerald' | 'amber' | 'violet' | 'orange'
}) {
  return (
    <Card className="rounded-xl">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <span
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
              KPI_TONES[tone] ?? KPI_TONES.orange
            )}
            aria-hidden
          >
            <Icon size={15} />
          </span>
        </div>
        {loading ? (
          <Skeleton className="mt-2.5 h-7 w-14" />
        ) : (
          <p className="mt-1.5 text-2xl font-bold tabular-nums leading-7">{value}</p>
        )}
        {hint && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}
