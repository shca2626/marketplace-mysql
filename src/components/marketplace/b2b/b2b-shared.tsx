'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, MessageSquareText, PackageSearch, Search, Send } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import type { RfqMessageDTO } from '@/lib/types'
import { timeAgo } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// ── API mutation helper ─────────────────────────────────────────────────────
// Wraps fetch + JSON parsing; never throws. Toasts are left to callers so
// success/UX copy stays contextual (same pattern as the admin console).

export async function apiRequest<T = unknown>(
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: init?.body
        ? { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }
        : init?.headers,
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      return { ok: false, error: (json.error as string) ?? `Request failed (${res.status})` }
    }
    return { ok: true, data: json as T }
  } catch {
    return { ok: false, error: 'Network error — please try again' }
  }
}

// ── Status badge palette (warm theme — no blue/indigo) ──────────────────────

type BadgeMap = Record<string, { label: string; badge: string }>

export const ORG_STATUS_MAP: BadgeMap = {
  PENDING_VERIFICATION: {
    label: 'Pending verification',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  },
  ACTIVE: {
    label: 'Active',
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  },
  SUSPENDED: {
    label: 'Suspended',
    badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  },
  REJECTED: {
    label: 'Rejected',
    badge: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
  },
}

export const RFQ_STATUS_MAP: BadgeMap = {
  DRAFT: { label: 'Draft', badge: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
  SUBMITTED: { label: 'Submitted', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  UNDER_REVIEW: { label: 'Under review', badge: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300' },
  QUOTED: { label: 'Quoted', badge: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300' },
  ACCEPTED: { label: 'Accepted', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  ORDERED: { label: 'Ordered', badge: 'bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-300' },
  REJECTED: { label: 'Rejected', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
  CANCELLED: { label: 'Cancelled', badge: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
  EXPIRED: { label: 'Expired', badge: 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400' },
}

export const QUOTE_STATUS_MAP: BadgeMap = {
  SENT: { label: 'Sent', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  PENDING_REVIEW: { label: 'In platform review', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  REJECTED: { label: 'Rejected', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
  ACCEPTED: { label: 'Accepted', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  DECLINED: { label: 'Declined', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
  EXPIRED: { label: 'Expired', badge: 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400' },
  CONVERTED: { label: 'Converted', badge: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300' },
  WITHDRAWN: { label: 'Withdrawn', badge: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
}

export const ORG_ROLE_MAP: BadgeMap = {
  OWNER: { label: 'Owner', badge: 'bg-primary/15 text-primary' },
  ADMIN: { label: 'Admin', badge: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300' },
  BUYER: { label: 'Buyer', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  APPROVER: { label: 'Approver', badge: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300' },
  VIEWER: { label: 'Viewer', badge: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
}

export function StatusBadge({
  status,
  map,
  className,
}: {
  status: string
  map: BadgeMap
  className?: string
}) {
  const entry = map[status]
  return (
    <Badge
      className={cn(
        'shrink-0 rounded-full border-0 text-[11px] font-semibold',
        entry?.badge ?? 'bg-muted text-muted-foreground',
        className
      )}
    >
      {entry?.label ?? status}
    </Badge>
  )
}

// ── Active-org memory (localStorage, NOT the store) ─────────────────────────

const ACTIVE_ORG_KEY = 'vendora_active_org'

/** First ACTIVE org from the list (falls back to first org at all). */
export function defaultActiveOrg<T extends { id: string; status: string }>(orgs: T[]): T | null {
  if (!orgs.length) return null
  const remembered = typeof window !== 'undefined' ? window.localStorage.getItem(ACTIVE_ORG_KEY) : null
  const rememberedOrg = orgs.find((o) => o.id === remembered)
  if (rememberedOrg && rememberedOrg.status === 'ACTIVE') return rememberedOrg
  return orgs.find((o) => o.status === 'ACTIVE') ?? orgs[0]
}

export function rememberActiveOrg(id: string) {
  try {
    window.localStorage.setItem(ACTIVE_ORG_KEY, id)
  } catch {
    /* private mode — non-fatal */
  }
}

// ── RFQ prefill handoff (product page → create form, no store involvement) ──

export const RFQ_PREFILL_KEY = 'rfq-prefill'

export interface RfqPrefill {
  productId: string
  title: string
  price: number
}

export function readRfqPrefill(): RfqPrefill | null {
  try {
    const raw = window.sessionStorage.getItem(RFQ_PREFILL_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as RfqPrefill
    if (!parsed?.productId || !parsed.title) return null
    return parsed
  } catch {
    return null
  }
}

export function clearRfqPrefill() {
  try {
    window.sessionStorage.removeItem(RFQ_PREFILL_KEY)
  } catch {
    /* non-fatal */
  }
}

// ── Quote validity countdown ────────────────────────────────────────────────

export function validityLeft(iso?: string | null): { text: string; urgent: boolean; expired: boolean } {
  if (!iso) return { text: '', urgent: false, expired: false }
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return { text: 'Expired', urgent: true, expired: true }
  const minutes = Math.floor(ms / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const months = Math.floor(days / 30)
  const years = Math.floor(days / 365)
  let text: string
  if (minutes < 60) text = `${minutes}m left`
  else if (hours < 24) text = `${hours}h left`
  else if (days < 31) text = `${days}d left`
  else if (months < 24) text = `${months}mo left`
  else text = `${years}y left`
  return { text, urgent: ms < 48 * 3600 * 1000, expired: false }
}

// ── Debounce hook (same 220ms cadence as the header search box) ─────────────

export function useDebounced<T>(value: T, ms = 220): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

// ── Product picker (search + result rows) ───────────────────────────────────

export interface PickedProduct {
  id: string
  title: string
  price: number
  image?: string | null
  moq?: number | null
  stock?: number | null
  variants?: { id: string; name: string; price: number | null; stock: number }[]
}

export function ProductPicker({
  onPick,
  placeholder = 'Search Vendora products…',
  label,
}: {
  onPick: (p: PickedProduct) => void
  placeholder?: string
  label: string
}) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<{ query: string; items: PickedProduct[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  // Only search once ≥2 chars are typed; hide the dropdown below that
  const active = query.trim().length >= 2 ? query.trim() : ''

  useEffect(() => {
    if (!active) return
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      abortRef.current?.abort()
      abortRef.current = ctrl
      setLoading(true)
      try {
        const res = await fetch(`/api/products?q=${encodeURIComponent(active)}&limit=10`, {
          signal: ctrl.signal,
        })
        if (!res.ok) return
        const json = (await res.json()) as {
          items?: {
            id: string
            title: string
            price: number
            images: string[]
            moq?: number | null
            stock?: number
            variants?: { id: string; name: string; price: number | null; stock: number; isActive: boolean }[]
          }[]
        }
        setResult({
          query: active,
          items: (json.items ?? []).map((p) => ({
            id: p.id,
            title: p.title,
            price: p.price,
            image: p.images?.[0] ?? null,
            moq: p.moq ?? null,
            stock: p.stock ?? null,
            variants: (p.variants ?? [])
              .filter((v) => v.isActive)
              .map((v) => ({ id: v.id, name: v.name, price: v.price, stock: v.stock })),
          })),
        })
      } catch {
        /* aborted or offline — keep previous result */
      } finally {
        if (!ctrl.signal.aborted) setLoading(false)
      }
    }, 220)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [active])

  const items = result && result.query === active ? result.items : []
  const stale = !result || result.query !== active

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="h-10 rounded-xl pl-10 text-sm"
          aria-label={label}
        />
        {loading && (
          <Loader2 size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      {active && (
        <div className="max-h-52 space-y-1 overflow-y-auto rounded-xl border bg-card p-1.5">
          {stale || loading ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">Searching…</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
              No products match — switch the line to “Open item” to quote it by name.
            </p>
          ) : (
            items.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onPick(p)}
                className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                aria-label={`Add ${p.title} to this RFQ`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                  {p.image ? (
                    <img src={p.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <PackageSearch size={15} className="text-muted-foreground" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    Retail {p.price.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Empty / inline states ───────────────────────────────────────────────────

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  title: string
  description?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-12 text-center">
      <Icon size={34} className="text-muted-foreground/40" />
      <p className="mt-3 text-sm font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}

// ── RFQ negotiation thread (shared: buyer detail + seller inbox) ───────────

export function RfqThread({
  rfqId,
  rfqStatus,
  title = 'Negotiation',
}: {
  rfqId: string
  rfqStatus: string
  title?: string
}) {
  const [messages, setMessages] = useState<RfqMessageDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [draft, setDraft] = useState('')
  const [fresh, setFresh] = useState<{ rfqId: string; count: number }>({ rfqId: '', count: 0 })
  const scrollRef = useRef<HTMLDivElement>(null)
  const knownIds = useRef<Set<string>>(new Set())
  const userAtBottom = useRef(true)

  const threadClosed = ['CANCELLED', 'REJECTED', 'EXPIRED', 'ORDERED'].includes(rfqStatus)
  const POLL_MS = 12_000

  useEffect(() => {
    let alive = true
    knownIds.current = new Set()
    const apply = (list: RfqMessageDTO[]) => {
      if (!alive) return
      const isFirstLoad = knownIds.current.size === 0
      const newOnes = list.filter((m) => !knownIds.current.has(m.id))
      for (const m of list) knownIds.current.add(m.id)
      // Only messages that arrive AFTER the initial load count as "new";
      // the rfqId key resets the counter when the thread component is reused.
      if (!isFirstLoad && newOnes.length > 0) {
        setFresh((prev) =>
          prev.rfqId === rfqId
            ? { rfqId, count: prev.count + newOnes.length }
            : { rfqId, count: newOnes.length }
        )
      }
      setMessages(list)
      setLoading(false)
    }
    const load = async () => {
      const res = await apiRequest<{ messages: RfqMessageDTO[] }>(`/api/rfqs/${rfqId}/messages`)
      if (!alive) return
      if (res.ok && res.data) apply(res.data.messages)
    }
    void load()
    // Live thread: poll while the RFQ is open and the tab is visible
    const timer = setInterval(() => {
      if (!threadClosed && typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void load()
      }
    }, POLL_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [rfqId, threadClosed])

  useEffect(() => {
    if (userAtBottom.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
    }
  }, [messages.length])

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    const clean = draft.trim()
    if (!clean || sending) return
    setSending(true)
    const res = await apiRequest<{ message: RfqMessageDTO }>(`/api/rfqs/${rfqId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body: clean }),
    })
    setSending(false)
    if (!res.ok || !res.data) {
      toast({ title: 'Could not send', description: res.error ?? 'Please try again', variant: 'destructive' })
      return
    }
    knownIds.current.add(res.data.message.id)
    setMessages((m) => [...m, res.data!.message])
    setDraft('')
  }

  return (
    <section aria-label="Negotiation thread">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <MessageSquareText size={14} className="text-primary" /> {title}
        {!threadClosed && (
          <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
            <span className="relative flex h-1.5 w-1.5" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            live
            {fresh.rfqId === rfqId && fresh.count > 0 && (
              <span className="ml-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-primary">
                {fresh.count} new
              </span>
            )}
          </span>
        )}
      </h3>
      {loading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : (
        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget
            userAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
          }}
          className="max-h-64 space-y-2.5 overflow-y-auto rounded-xl border bg-muted/30 p-3"
        >
          {messages.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No messages yet — ask about specs, deadlines or bulk terms.
            </p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className="flex flex-col">
                <p className="mb-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="font-semibold text-foreground">{m.author.name}</span>
                  <span className="uppercase tracking-wide">
                    {m.author.role === 'ADMIN' ? 'Platform' : m.author.role === 'BUYER' ? 'Buyer' : 'Seller'}
                  </span>
                  <span aria-hidden>·</span>
                  <time dateTime={m.createdAt}>{timeAgo(m.createdAt)}</time>
                </p>
                <p className="w-fit max-w-[92%] whitespace-pre-line rounded-lg border bg-background px-3 py-2 text-sm leading-relaxed shadow-sm">
                  {m.body}
                </p>
              </div>
            ))
          )}
        </div>
      )}
      {!threadClosed ? (
        <form onSubmit={send} className="mt-2 flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask a question or share availability…"
            maxLength={4000}
            aria-label="Write a message"
          />
          <Button type="submit" size="icon" className="shrink-0 rounded-lg" disabled={sending || !draft.trim()}>
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </Button>
        </form>
      ) : (
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          This RFQ is closed — the thread is read-only.
        </p>
      )}
    </section>
  )
}
