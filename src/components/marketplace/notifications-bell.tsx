'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Ban,
  Bell,
  CalendarCheck,
  CalendarClock,
  CalendarX,
  CheckCheck,
  ClipboardList,
  FileText,
  Handshake,
  MessageSquareText,
  PackageCheck,
  PackageOpen,
  Scale,
  ShieldCheck,
  ShieldQuestion,
  Truck,
  Undo2,
} from 'lucide-react'
import { useMarketplace } from '@/store/marketplace'
import { useApi } from '@/hooks/use-api'
import type { NotificationDTO, OrderDTO } from '@/lib/types'
import { formatUSD, timeAgo } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

/**
 * Unified notifications inbox.
 *
 * Two event sources merge into one feed:
 * 1. Server-persisted notifications (/api/notifications — RFQ events, quote
 *    outcomes, negotiation messages, approval queue events). Read state lives
 *    in the database; polled every 45s and on panel open.
 * 2. Client-derived order events (/api/orders), whose read state is tracked in
 *    localStorage as `${orderId}:${status}` keys (no backend dependency).
 */

const SEEN_KEY = 'vendora-notifications-seen'
const POLL_MS = 45_000

type BellIcon = typeof Bell

interface OrderEvent {
  key: string
  createdAt: string
  title: string
  detail: string
  icon: BellIcon
  iconClass: string
  navigate: 'orders'
}

const STATUS_EVENT: Record<string, { title: string; icon: BellIcon; iconClass: string }> = {
  PAID: {
    title: 'Order confirmed',
    icon: ClipboardList,
    iconClass: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  },
  PROCESSING: {
    title: 'Order is being prepared',
    icon: PackageOpen,
    iconClass: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  },
  SHIPPED: {
    title: 'Order has shipped',
    icon: Truck,
    iconClass: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  },
  DELIVERED: {
    title: 'Order delivered',
    icon: PackageCheck,
    iconClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  },
  CANCELLED: {
    title: 'Order cancelled',
    icon: Ban,
    iconClass: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
  },
}

const NOTIF_META: Record<string, { icon: BellIcon; iconClass: string }> = {
  RFQ_SUBMITTED_SELLER: {
    icon: FileText,
    iconClass: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  },
  RFQ_QUOTE_RECEIVED: {
    icon: FileText,
    iconClass: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
  },
  RFQ_QUOTE_ACCEPTED: {
    icon: Handshake,
    iconClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  },
  RFQ_QUOTE_DECLINED: {
    icon: Ban,
    iconClass: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
  },
  RFQ_QUOTE_WITHDRAWN: {
    icon: Undo2,
    iconClass: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
  },
  RFQ_QUOTE_REVIEW: {
    icon: ShieldQuestion,
    iconClass: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  },
  RFQ_QUOTE_REJECTED: {
    icon: Ban,
    iconClass: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  },
  RFQ_QUOTE_CONVERTED: {
    icon: PackageCheck,
    iconClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  },
  RFQ_STATUS: {
    icon: FileText,
    iconClass: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  },
  RFQ_MESSAGE: {
    icon: MessageSquareText,
    iconClass: 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300',
  },
  APPROVAL_REQUESTED: {
    icon: ShieldCheck,
    iconClass: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  },
  APPROVAL_DECIDED: {
    icon: ShieldCheck,
    iconClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  },
  RFQ_DISPUTE: {
    icon: ShieldQuestion,
    iconClass: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  },
  RFQ_DISPUTE_STATUS: {
    icon: Scale,
    iconClass: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  },
  RECURRING_PREVIEW: {
    icon: CalendarClock,
    iconClass: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
  },
  RECURRING_PUBLISHED: {
    icon: CalendarCheck,
    iconClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  },
  RECURRING_PAUSED: {
    icon: CalendarX,
    iconClass: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
  },
}
const FALLBACK_META = {
  icon: Bell,
  iconClass: 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
}

function deriveEvents(orders: OrderDTO[]): OrderEvent[] {
  return orders
    .filter((o) => STATUS_EVENT[o.status])
    .slice(0, 12)
    .map((o) => {
      const meta = STATUS_EVENT[o.status]
      const itemsLabel =
        o.items.length === 1 ? o.items[0].title : `${o.items.length} items`
      return {
        key: `${o.id}:${o.status}`,
        createdAt: o.createdAt,
        title: meta.title,
        detail: `${itemsLabel} · ${formatUSD(o.total)}`,
        icon: meta.icon,
        iconClass: meta.iconClass,
        navigate: 'orders' as const,
      }
    })
}

function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function storeSeen(seen: Set<string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-200)))
  } catch {
    /* private mode — badge simply won't persist */
  }
}

type FeedItem =
  | { kind: 'server'; n: NotificationDTO; unread: boolean }
  | { kind: 'order'; e: OrderEvent; unread: boolean }

export function NotificationsBell() {
  const user = useMarketplace((s) => s.user)
  const navigate = useMarketplace((s) => s.navigate)
  const { data, refetch } = useApi<{ orders: OrderDTO[] }>(user ? '/api/orders' : null, {
    skip: !user,
  })
  // Server-side notification feed, polled every 45s (visible tabs only)
  const { data: serverFeed, refetch: refetchServer } = useApi<{
    notifications: NotificationDTO[]
    unreadCount: number
  }>(user ? '/api/notifications?limit=20' : null, {
    skip: !user,
    pollMs: POLL_MS,
  })

  const [open, setOpen] = useState(false)
  // Lazy SSR-safe initializer: the bell renders null on the server (user is
  // null before auth), so this only reads localStorage on real client mounts.
  const [seen, setSeen] = useState<Set<string>>(() =>
    typeof window === 'undefined' ? new Set() : loadSeen()
  )

  useEffect(() => {
    if (open) {
      void refetch()
      void refetchServer()
    }
  }, [open, refetch, refetchServer])

  const server = serverFeed ?? null

  const orderEvents = useMemo(() => deriveEvents(data?.orders ?? []), [data])

  const markServerRead = useCallback(
    async (id: string) => {
      // Fire-and-forget — the next poll re-syncs the feed if the POST fails
      try {
        await fetch('/api/notifications/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        })
      } catch {
        /* next poll will re-sync */
      }
    },
    []
  )

  const markAllRead = useCallback(() => {
    const next = new Set(seen)
    for (const e of orderEvents) next.add(e.key)
    setSeen(next)
    storeSeen(next)
    void fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    })
      .then(() => refetchServer({ silent: true }))
      .catch(() => undefined)
  }, [orderEvents, seen, refetchServer])

  const feed: FeedItem[] = useMemo(() => {
    const serverItems: FeedItem[] = (server?.notifications ?? []).map((n) => ({
      kind: 'server',
      n,
      unread: !n.readAt,
    }))
    const orderItems: FeedItem[] = orderEvents
      .filter((e) => !seen.has(e.key))
      .concat(orderEvents.filter((e) => seen.has(e.key)))
      .map((e) => ({ kind: 'order', e, unread: !seen.has(e.key) }))
    return [...serverItems, ...orderItems]
      .sort((a, b) => new Date(b.kind === 'server' ? b.n.createdAt : b.e.createdAt).getTime() - new Date(a.kind === 'server' ? a.n.createdAt : a.e.createdAt).getTime())
      .slice(0, 24)
  }, [server, orderEvents, seen])

  const unreadCount = (server?.unreadCount ?? 0) + orderEvents.filter((e) => !seen.has(e.key)).length

  const openItem = useCallback(
    (item: FeedItem) => {
      setOpen(false)
      if (item.kind === 'order') {
        navigate('orders')
        return
      }
      void markServerRead(item.n.id)
      switch (item.n.linkView) {
        case 'rfq':
          // Deep-link straight to the RFQ detail when we know which one
          navigate('rfqs', item.n.linkId ? { rfqId: item.n.linkId } : undefined)
          break
        case 'orders':
          navigate('orders')
          break
        case 'business':
          navigate('business')
          break
        case 'seller':
          navigate('seller')
          break
        case 'disputes':
          // Sellers land on their dashboard's dispute tab; buyers on orders
          navigate(user?.role === 'SELLER' ? 'seller' : 'orders', {
            disputeId: item.n.linkId ?? undefined,
          })
          break
        case 'admin':
          navigate('admin')
          break
        case 'financing':
          // Applicant surface — my financing requests (deep-link to the request when known)
          navigate('financing', item.n.linkId ? { requestId: item.n.linkId } : undefined)
          break
        case 'financier':
          // Financier console inbox
          navigate('financier')
          break
        default:
          navigate('orders')
      }
    },
    [navigate, markServerRead, user?.role]
  )

  const markRead = useCallback((key: string) => {
    setSeen((prev) => {
      const next = new Set(prev)
      next.add(key)
      storeSeen(next)
      return next
    })
  }, [])

  if (!user) return null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 text-muted-foreground hover:text-foreground"
          aria-label={`Notifications${unreadCount ? ` — ${unreadCount} unread` : ''}`}
        >
          <Bell size={19} />
          {unreadCount > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground shadow-sm"
              aria-hidden
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 p-0 shadow-xl ring-1 ring-black/5"
        aria-describedby={undefined}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 rounded-full px-2 text-xs text-primary"
              onClick={markAllRead}
            >
              <CheckCheck size={13} /> Mark all read
            </Button>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto">
          {feed.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <Bell size={28} className="text-muted-foreground/40" />
              <p className="text-sm font-medium">You're all caught up</p>
              <p className="text-xs text-muted-foreground">
                Order updates, quotes and approvals will appear here.
              </p>
            </div>
          ) : (
            feed.map((item) => {
              if (item.kind === 'server') {
                const n = item.n
                const meta = NOTIF_META[n.type] ?? FALLBACK_META
                return (
                  <button
                    key={n.id}
                    className={cn(
                      'flex w-full items-start gap-3 border-b last:border-b-0 px-4 py-3 text-left transition-colors hover:bg-muted/60',
                      item.unread && 'bg-primary/5'
                    )}
                    onClick={() => openItem(item)}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                        meta.iconClass
                      )}
                    >
                      <meta.icon size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className={cn('truncate text-sm', item.unread ? 'font-semibold' : 'font-medium')}>
                          {n.title}
                        </span>
                        {item.unread && (
                          <span className="h-2 w-2 shrink-0 self-center rounded-full bg-primary" aria-hidden />
                        )}
                      </span>
                      {n.body && (
                        <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">
                          {n.body}
                        </span>
                      )}
                      <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                        {timeAgo(n.createdAt)}
                      </span>
                    </span>
                  </button>
                )
              }
              const e = item.e
              return (
                <button
                  key={e.key}
                  className={cn(
                    'flex w-full items-start gap-3 border-b last:border-b-0 px-4 py-3 text-left transition-colors hover:bg-muted/60',
                    item.unread && 'bg-primary/5'
                  )}
                  onClick={() => {
                    markRead(e.key)
                    setOpen(false)
                    navigate('orders')
                  }}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                      e.iconClass
                    )}
                  >
                    <e.icon size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className={cn('truncate text-sm', item.unread ? 'font-semibold' : 'font-medium')}>
                        {e.title}
                      </span>
                      {item.unread && (
                        <span className="h-2 w-2 shrink-0 self-center rounded-full bg-primary" aria-hidden />
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {e.detail}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                      {timeAgo(e.createdAt)}
                    </span>
                  </span>
                </button>
              )
            })
          )}
        </div>

        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-full rounded-lg text-xs text-muted-foreground"
            onClick={() => {
              setOpen(false)
              navigate('orders')
            }}
          >
            View all orders
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
