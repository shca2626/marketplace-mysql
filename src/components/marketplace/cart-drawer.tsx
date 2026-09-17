'use client'

import { Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import { useMarketplace } from '@/store/marketplace'
import { formatUSD } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

export const FREE_SHIPPING_THRESHOLD = 75
export const SHIPPING_FEE = 6.99

export function CartDrawer() {
  const open = useMarketplace((s) => s.cartOpen)
  const setCartOpen = useMarketplace((s) => s.setCartOpen)
  const cart = useMarketplace((s) => s.cart)
  const updateQuantity = useMarketplace((s) => s.updateQuantity)
  const removeFromCart = useMarketplace((s) => s.removeFromCart)
  const navigate = useMarketplace((s) => s.navigate)
  const user = useMarketplace((s) => s.user)
  const openAuth = useMarketplace((s) => s.openAuth)

  const subtotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const freeShipping = subtotal >= FREE_SHIPPING_THRESHOLD
  const remaining = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal)

  const goToCheckout = () => {
    if (!user) {
      setCartOpen(false)
      openAuth('login', { view: 'checkout' })
      return
    }
    navigate('checkout')
  }

  return (
    <Sheet open={open} onOpenChange={setCartOpen}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md" aria-describedby={undefined}>
        <SheetHeader className="border-b p-4">
          <SheetTitle className="flex items-center gap-2 text-left">
            <ShoppingCart size={18} className="text-primary" />
            Your cart
            <Badge variant="secondary" className="rounded-full">
              {cart.reduce((sum, i) => sum + i.quantity, 0)}
            </Badge>
          </SheetTitle>
        </SheetHeader>

        {cart.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
              <ShoppingCart size={30} className="text-muted-foreground" />
            </div>
            <div>
              <p className="font-semibold">Your cart is empty</p>
              <p className="mt-1 text-sm text-muted-foreground">Looks like you haven’t added anything yet.</p>
            </div>
            <Button
              className="rounded-full"
              onClick={() => {
                setCartOpen(false)
                navigate('catalog')
              }}
            >
              Start shopping
            </Button>
          </div>
        ) : (
          <>
            {/* Free shipping progress */}
            <div className="border-b bg-muted/40 px-4 py-3">
              {freeShipping ? (
                <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  🎉 You’ve unlocked <strong>free shipping</strong>!
                </p>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">
                    Add <strong className="text-foreground">{formatUSD(remaining)}</strong> more for free shipping
                  </p>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${Math.min(100, (subtotal / FREE_SHIPPING_THRESHOLD) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Items */}
            <div className="scrollbar-thin flex-1 overflow-y-auto p-4">
              <ul className="space-y-4">
                {cart.map((item) => (
                  <li key={item.productId} className="flex gap-3">
                    <button
                      className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border bg-muted"
                      onClick={() => {
                        setCartOpen(false)
                        navigate('product', { productId: item.productId })
                      }}
                      aria-label={`View ${item.title}`}
                    >
                      {item.image ? (
                        <img src={item.image} alt={item.title} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-xs text-muted-foreground">No image</span>
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-medium leading-5">{item.title}</p>
                      {item.sellerName && (
                        <p className="mt-0.5 text-xs text-muted-foreground">by {item.sellerName}</p>
                      )}
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-0.5">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7 rounded-lg"
                            disabled={item.quantity <= 1}
                            onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                            aria-label="Decrease quantity"
                          >
                            <Minus size={12} />
                          </Button>
                          <span className="w-7 text-center text-sm font-semibold tabular-nums">
                            {item.quantity}
                          </span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7 rounded-lg"
                            disabled={item.quantity >= item.stock}
                            onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                            aria-label="Increase quantity"
                          >
                            <Plus size={12} />
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold tabular-nums">
                            {formatUSD(item.price * item.quantity)}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => removeFromCart(item.productId)}
                            aria-label={`Remove ${item.title} from cart`}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Footer */}
            <SheetFooter className="border-t p-4">
              <div className="w-full space-y-1.5 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="font-medium text-foreground">{formatUSD(subtotal)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Shipping</span>
                  <span className="font-medium text-foreground">
                    {freeShipping ? 'Free' : formatUSD(SHIPPING_FEE)}
                  </span>
                </div>
                <Separator className="my-2" />
                <div className="flex justify-between text-base font-bold">
                  <span>Total</span>
                  <span>{formatUSD(subtotal + (freeShipping ? 0 : SHIPPING_FEE))}</span>
                </div>
              </div>
              <div className="mt-3 grid w-full grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => {
                    setCartOpen(false)
                    navigate('cart')
                  }}
                >
                  View cart
                </Button>
                <Button className="rounded-xl" onClick={goToCheckout}>
                  Checkout
                </Button>
              </div>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
