'use client'

import { useState } from 'react'
import { Check, ClipboardList, PackageCheck, PackageOpen, Star, Truck } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'
import { useApi } from '@/hooks/use-api'
import type { OrderDTO } from '@/lib/types'
import { formatDate, formatUSD } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const STATUS_STEPS = [
  { key: 'PAID', label: 'Order placed', icon: ClipboardList },
  { key: 'PROCESSING', label: 'Processing', icon: PackageOpen },
  { key: 'SHIPPED', label: 'Shipped', icon: Truck },
  { key: 'DELIVERED', label: 'Delivered', icon: PackageCheck },
]

const STATUS_COLORS: Record<string, string> = {
  PAID: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  PROCESSING: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  SHIPPED: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  DELIVERED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
}

export function OrdersView() {
  const user = useMarketplace((s) => s.user)
  const openAuth = useMarketplace((s) => s.openAuth)
  const navigate = useMarketplace((s) => s.navigate)
  const { data, loading } = useApi<{ orders: OrderDTO[] }>(user ? '/api/orders' : null, {
    skip: !user,
  })
  const [expanded, setExpanded] = useState<string | null>(null)

  if (!user) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <ClipboardList size={44} className="text-muted-foreground/40" />
        <h1 className="mt-4 text-xl font-bold">Sign in to see your orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your purchase history lives here.</p>
        <Button className="mt-6 rounded-xl" onClick={() => openAuth('login', { view: 'orders' })}>
          Sign in
        </Button>
      </div>
    )
  }

  const orders = data?.orders ?? []

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">My orders</h1>
      <p className="mt-1 text-sm text-muted-foreground">Track and review your purchases.</p>

      <div className="mt-6 space-y-5">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 w-full rounded-2xl" />)
        ) : orders.length === 0 ? (
          <Card className="flex flex-col items-center border-dashed py-16 text-center">
            <PackageCheck size={44} className="text-muted-foreground/40" />
            <h2 className="mt-4 text-lg font-semibold">No orders yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">When you place an order it will show up here.</p>
            <Button className="mt-5 rounded-full" onClick={() => navigate('catalog')}>
              Start shopping
            </Button>
          </Card>
        ) : (
          orders.map((order) => {
            const currentIdx = STATUS_STEPS.findIndex((s) => s.key === order.status)
            const isOpen = expanded === order.id
            return (
              <Card key={order.id} className="overflow-hidden">
                <button
                  className="flex w-full flex-wrap items-center justify-between gap-3 bg-muted/50 px-5 py-3.5 text-left transition hover:bg-muted"
                  onClick={() => setExpanded(isOpen ? null : order.id)}
                  aria-expanded={isOpen}
                >
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="font-mono text-xs font-bold tracking-wide text-muted-foreground">
                      #${order.id.slice(-8).toUpperCase()}
                    </span>
                    <span className="text-xs text-muted-foreground">{formatDate(order.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold">{formatUSD(order.total)}</span>
                    <Badge className={cn('rounded-full text-[11px] font-semibold', STATUS_COLORS[order.status])}>
                      {order.status}
                    </Badge>
                  </div>
                </button>

                <CardContent className="space-y-5 p-5">
                  {/* Progress timeline */}
                  <div className="flex items-start">
                    {STATUS_STEPS.map((step, i) => {
                      const done = i <= currentIdx
                      return (
                        <div key={step.key} className="relative flex flex-1 flex-col items-center">
                          {i > 0 && (
                            <span
                              className={cn(
                                'absolute right-1/2 top-4 -z-0 h-0.5 w-full',
                                i <= currentIdx ? 'bg-primary' : 'bg-muted'
                              )}
                            />
                          )}
                          <span
                            className={cn(
                              'z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 bg-background',
                              done ? 'border-primary text-primary' : 'border-muted text-muted-foreground/50'
                            )}
                          >
                            {done && i < currentIdx ? <Check size={13} /> : <step.icon size={13} />}
                          </span>
                          <span
                            className={cn(
                              'mt-1.5 text-center text-[10px] font-medium leading-tight sm:text-xs',
                              done ? 'text-foreground' : 'text-muted-foreground/60'
                            )}
                          >
                            {step.label}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  {/* Items */}
                  <div className="space-y-3">
                    {(isOpen ? order.items : order.items.slice(0, 2)).map((item) => (
                      <div key={item.id} className="flex items-center gap-3">
                        <button
                          className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border bg-muted"
                          onClick={() => navigate('product', { productId: item.productId })}
                          aria-label={`View ${item.title}`}
                        >
                          {item.image && <img src={item.image} alt="" className="h-full w-full object-cover" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-1 text-sm font-medium">{item.title}</p>
                          <p className="text-xs text-muted-foreground">
                            Qty {item.quantity} · {formatUSD(item.price)} each
                          </p>
                        </div>
                        {order.status === 'DELIVERED' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 rounded-full gap-1.5 text-xs"
                            onClick={() => navigate('product', { productId: item.productId })}
                          >
                            <Star size={12} /> Write review
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                  {order.items.length > 2 && (
                    <button
                      className="text-xs font-medium text-primary hover:underline"
                      onClick={() => setExpanded(isOpen ? null : order.id)}
                    >
                      {isOpen ? 'Show less' : `+ ${order.items.length - 2} more item(s)`}
                    </button>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-xs text-muted-foreground">
                    <span>
                      Ship to: {order.fullName}, {order.address}, {order.city} {order.zip}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 rounded-full text-xs"
                      onClick={() => {
                        navigator.clipboard?.writeText(order.id).then(() =>
                          toast({ title: 'Order ID copied', description: order.id })
                        )
                      }}
                    >
                      Copy order ID
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}
