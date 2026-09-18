'use client'

import { Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import { useMarketplace } from '@/store/marketplace'
import { formatUSD } from '@/lib/format'
import { FREE_SHIPPING_THRESHOLD, SHIPPING_FEE } from '@/lib/pricing'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'

export function CartView() {
  const cart = useMarketplace((s) => s.cart)
  const updateQuantity = useMarketplace((s) => s.updateQuantity)
  const removeFromCart = useMarketplace((s) => s.removeFromCart)
  const navigate = useMarketplace((s) => s.navigate)
  const user = useMarketplace((s) => s.user)
  const openAuth = useMarketplace((s) => s.openAuth)

  const subtotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const freeShipping = subtotal >= FREE_SHIPPING_THRESHOLD
  const total = subtotal + (freeShipping ? 0 : SHIPPING_FEE)

  if (cart.length === 0) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-center px-4 py-24 text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-muted">
          <ShoppingCart size={38} className="text-muted-foreground" />
        </div>
        <h1 className="mt-6 text-2xl font-bold">Your cart is empty</h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Browse the marketplace and find something you love.
        </p>
        <Button size="lg" className="mt-6 rounded-xl" onClick={() => navigate('catalog')}>
          Explore products
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Shopping cart</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {cart.reduce((sum, i) => sum + i.quantity, 0)} items in your cart
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Items */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Items</CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              {cart.map((item) => (
                <div key={item.productId} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                  <button
                    className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border bg-muted"
                    onClick={() => navigate('product', { productId: item.productId })}
                    aria-label={`View ${item.title}`}
                  >
                    {item.image ? (
                      <img src={item.image} alt={item.title} className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        No image
                      </span>
                    )}
                  </button>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="line-clamp-2 font-medium leading-5">{item.title}</p>
                        {item.sellerName && (
                          <button
                            className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary"
                            onClick={() => navigate('store', { sellerId: item.sellerId })}
                            aria-label={`Visit ${item.sellerName} store`}
                          >
                            Sold by {item.sellerName}
                          </button>
                        )}
                        <p className="mt-1 text-sm text-muted-foreground">{formatUSD(item.price)} each</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeFromCart(item.productId)}
                        aria-label={`Remove ${item.title}`}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                    <div className="mt-auto flex items-center justify-between pt-2">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 rounded-lg"
                          disabled={item.quantity <= 1}
                          onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                          aria-label="Decrease quantity"
                        >
                          <Minus size={13} />
                        </Button>
                        <span className="w-8 text-center text-sm font-semibold tabular-nums">
                          {item.quantity}
                        </span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 rounded-lg"
                          disabled={item.quantity >= item.stock}
                          onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                          aria-label="Increase quantity"
                        >
                          <Plus size={13} />
                        </Button>
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          {item.stock} available
                        </span>
                      </div>
                      <span className="text-base font-bold tabular-nums">
                        {formatUSD(item.price * item.quantity)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Summary */}
        <div>
          <Card className="sticky top-36">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Order summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="font-medium text-foreground">{formatUSD(subtotal)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Shipping</span>
                <span className="font-medium text-foreground">
                  {freeShipping ? (
                    <span className="text-emerald-600 dark:text-emerald-400">Free</span>
                  ) : (
                    formatUSD(SHIPPING_FEE)
                  )}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between text-lg font-bold">
                <span>Total</span>
                <span>{formatUSD(total)}</span>
              </div>
              <Button
                size="lg"
                className="mt-2 w-full rounded-xl text-base"
                onClick={() => (user ? navigate('checkout') : openAuth('login', { view: 'checkout' }))}
              >
                Proceed to checkout
              </Button>
              <Button
                variant="ghost"
                className="w-full rounded-xl text-muted-foreground"
                onClick={() => navigate('catalog')}
              >
                Continue shopping
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
