'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Ban,
  Bell,
  CheckCheck,
  ClipboardList,
  PackageCheck,
  PackageOpen,
  Truck,
} from 'lucide-react'
import { useMarketplace } from '@/store/marketplace'
import { useApi } from '@/hooks/use-api'
import type { OrderDTO } from '@/lib/types'
import { formatUSD, timeAgo } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

/**
 * Buyer notifications inbox — fully derived from /api/orders (no schema, no
 * new endpoints). Each order produces ONE event describing its current state.
 * Read/unread state is tracked in localStorage as `${orderId}:${status}` keys,
 * so the badge clears only after the buyer actually looks at the update.
 */

const SEEN_KEY = 'vendora-notifications-seen'

interface OrderEvent {
  key: string
  orderId: string
  shortId: string
  title: string
  detail: string
  icon: typeof Bell
  iconClass: string
  createdAt: string
  total: number
}

const STATUS_EVENT: Record<
  string,
  { title: string; icon: typeof Bell; iconClass: string }
> = {
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
        orderId: o.id,
        shortId: `#${o.id.slice(-8).toUpperCase()}`,
        title: meta.title,
        detail: `${itemsLabel} · ${formatUSD(o.total)}`,
        icon: meta.icon,
        iconClass: meta.iconClass,
        createdAt: o.createdAt,
        total: o.total,
      }
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
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

export function NotificationsBell() {
  const user = useMarketplace((s) => s.user)
  const navigate = useMarketplace((s) => s.navigate)
  const { data, refetch } = useApi<{ orders: OrderDTO[] }>(user ? '/api/orders' : null, {
    skip: !user,
  })

  const [open, setOpen] = useState(false)
  // Lazy SSR-safe initializer: the bell renders null on the server (user is
  // null before auth), so this only reads localStorage on real client mounts.
  const [seen, setSeen] = useState<Set<string>>(() =>
    typeof window === 'undefined' ? new Set() : loadSeen()
  )

  // Refresh when the panel is opened so status advances show up promptly
  useEffect(() => {
    if (open) void refetch()
  }, [open, refetch])

  const events = useMemo(() => deriveEvents(data?.orders ?? []), [data])
  const unread = useMemo(() => events.filter((e) => !seen.has(e.key)), [events, seen])

  const markAllRead = useCallback(() => {
    const next = new Set(seen)
    for (const e of events) next.add(e.key)
    setSeen(next)
    storeSeen(next)
  }, [events, seen])

  const markRead = useCallback(
    (key: string) => {
      setSeen((prev) => {
        const next = new Set(prev)
        next.add(key)
        storeSeen(next)
        return next
      })
    },
    []
  )

  if (!user) return null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 text-muted-foreground hover:text-foreground"
          aria-label={`Notifications${unread.length ? ` — ${unread.length} unread` : ''}`}
        >
          <Bell size={19} />
          {unread.length > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground shadow-sm"
              aria-hidden
            >
              {unread.length > 9 ? '9+' : unread.length}
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
          {unread.length > 0 && (
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
          {events.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <Bell size={28} className="text-muted-foreground/40" />
              <p className="text-sm font-medium">You're all caught up</p>
              <p className="text-xs text-muted-foreground">
                Order updates will appear here.
              </p>
            </div>
          ) : (
            events.map((e) => {
              const isUnread = !seen.has(e.key)
              return (
                <button
                  key={e.key}
                  className={cn(
                    'flex w-full items-start gap-3 border-b last:border-b-0 px-4 py-3 text-left transition-colors hover:bg-muted/60',
                    isUnread && 'bg-primary/5'
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
                      <span className={cn('truncate text-sm', isUnread ? 'font-semibold' : 'font-medium')}>
                        {e.title}
                      </span>
                      {isUnread && (
                        <span className="h-2 w-2 shrink-0 self-center rounded-full bg-primary" aria-hidden />
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {e.shortId} · {e.detail}
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
