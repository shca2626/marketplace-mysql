'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, PackageSearch, Search, X } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// ── API mutation helper ─────────────────────────────────────────────────────
// Wraps fetch + JSON parsing; never throws. Toasts are left to callers so
// success/UX copy stays contextual.

/** Shape returned by apiRequest — used by useStepUp and other wrappers.
 * `code` carries typed deny reasons (e.g. MFA_STEP_UP_REQUIRED) from the API. */
export type ApiResult<T = unknown> = { ok: boolean; data?: T; error?: string; code?: string }

export async function apiRequest<T = unknown>(
  url: string,
  init?: RequestInit
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: init?.body
        ? { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }
        : init?.headers,
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      return {
        ok: false,
        error: (json.error as string) ?? `Request failed (${res.status})`,
        ...(json.code ? { code: String(json.code) } : {}),
      }
    }
    return { ok: true, data: json as T }
  } catch {
    return { ok: false, error: 'Network error — please try again' }
  }
}

/** Toast shorthand for failed mutations. */
export function toastApiError(error: string | undefined, title = 'Something went wrong') {
  toast({ title, description: error ?? 'Unexpected error', variant: 'destructive' })
}

// ── Status badge palette (warm theme — no blue/indigo) ─────────────────────

type BadgeMap = Record<string, { label: string; badge: string }>

export const ORG_STATUS_MAP: BadgeMap = {
  PENDING_VERIFICATION: {
    label: 'Pending',
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
  PENDING_REVIEW: { label: 'In review', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  REJECTED: { label: 'Rejected', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
  ACCEPTED: { label: 'Accepted', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  DECLINED: { label: 'Declined', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
  EXPIRED: { label: 'Expired', badge: 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400' },
  CONVERTED: { label: 'Converted', badge: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300' },
  WITHDRAWN: { label: 'Withdrawn', badge: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
}

export const PL_STATUS_MAP: BadgeMap = {
  ACTIVE: { label: 'Active', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  DRAFT: { label: 'Draft', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  ARCHIVED: { label: 'Archived', badge: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
}

export const PL_SCOPE_MAP: BadgeMap = {
  ORG: { label: 'Org', badge: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300' },
  GROUP: { label: 'Group', badge: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300' },
  CHANNEL: { label: 'Channel', badge: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
}

export const ACTOR_TYPE_MAP: BadgeMap = {
  ADMIN: { label: 'Admin', badge: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300' },
  SELLER: { label: 'Seller', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  USER: { label: 'User', badge: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300' },
  SYSTEM: { label: 'System', badge: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
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

// ── Debounce hook (same 220ms cadence as the header search box) ────────────

export function useDebounced<T>(value: T, ms = 220): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

// ── Filter chips (matches the orders-view chip styling) ─────────────────────

export interface ChipOption {
  value: string
  label: string
  count?: number
}

export function FilterChips({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: ChipOption[]
  value: string
  onChange: (v: string) => void
  ariaLabel: string
}) {
  return (
    <div
      className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="tablist"
      aria-label={ariaLabel}
    >
      {options.map((opt) => {
        const selected = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(opt.value)}
            className={cn(
              'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors',
              selected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
            )}
          >
            {opt.label}
            {typeof opt.count === 'number' && <span className="ml-0.5 opacity-70">{opt.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

// ── Search input ─────────────────────────────────────────────────────────────

export function SearchInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  ariaLabel: string
  className?: string
}) {
  return (
    <div className={cn('relative max-w-sm flex-1', className)}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 rounded-full pl-10 pr-9 text-sm"
        aria-label={ariaLabel}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}

// ── Empty / error states ────────────────────────────────────────────────────

export function AdminEmptyState({
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

// ── Local datetime helpers (datetime-local input ↔ ISO strings) ──────────────

/** ISO string → value accepted by <input type="datetime-local"> (local time). */
export function isoToLocalInput(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** datetime-local input value → ISO string (null when empty/invalid). */
export function localInputToIso(v: string): string | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

// ── Product picker (search + result rows) ───────────────────────────────────

export interface PickedProduct {
  id: string
  title: string
  price: number
  image?: string | null
}

export function ProductPicker({
  onPick,
  placeholder = 'Search products by name…',
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
  // Only fetch once ≥2 chars; derive the visible list so stale results never show
  const active = query.trim().length >= 2 ? query.trim() : ''

  // Debounced + abortable product search (same pattern as the header search box)
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
        const json = (await res.json()) as { items?: { id: string; title: string; price: number; images: string[] }[] }
        setResult({ query: active, items: (json.items ?? []).map((p) => ({ id: p.id, title: p.title, price: p.price, image: p.images?.[0] ?? null })) })
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
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">No products match your search.</p>
          ) : (
            items.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onPick(p)}
                className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                aria-label={`Add ${p.title} to the list`}
              >
                <span className="h-9 w-9 shrink-0 overflow-hidden rounded-md border bg-muted">
                  {p.image ? (
                    <img src={p.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <PackageSearch size={15} className="m-auto block text-muted-foreground" />
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

// ── Small labeled field used inside dialogs ─────────────────────────────────

export function LabeledValue({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  )
}
