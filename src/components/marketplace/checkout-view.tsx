'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, BadgePercent, CheckCircle2, CreditCard, Loader2, Lock, MailCheck, MapPin, ShieldCheck, Ticket, X } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'
import type { OrderDTO } from '@/lib/types'
import { formatUSD } from '@/lib/format'
import { FREE_SHIPPING_THRESHOLD, SHIPPING_FEE } from '@/lib/pricing'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

interface AppliedCoupon {
  code: string
  percentOff: number
  description: string
}

export function CheckoutView() {
  const cart = useMarketplace((s) => s.cart)
  const user = useMarketplace((s) => s.user)
  const navigate = useMarketplace((s) => s.navigate)
  const clearCart = useMarketplace((s) => s.clearCart)
  const openAuth = useMarketplace((s) => s.openAuth)

  const [form, setForm] = useState({
    fullName: user?.name ?? '',
    address: '',
    city: '',
    country: 'United States',
    zip: '',
    phone: '',
  })
  const [placing, setPlacing] = useState(false)
  const [placedOrder, setPlacedOrder] = useState<OrderDTO | null>(null)
  const [placedPricing, setPlacedPricing] = useState<{ discount: number; couponCode: string | null } | null>(null)

  // ── Coupon state ──
  const [couponInput, setCouponInput] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null)
  const [couponError, setCouponError] = useState<string | null>(null)
  const [applyingCoupon, setApplyingCoupon] = useState(false)

  const subtotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const freeShipping = subtotal >= FREE_SHIPPING_THRESHOLD
  const discount = appliedCoupon
    ? Math.round(subtotal * (appliedCoupon.percentOff / 100) * 100) / 100
    : 0
  const total = subtotal - discount + (freeShipping ? 0 : SHIPPING_FEE)

  const applyCoupon = async () => {
    const code = couponInput.trim()
    if (!code) return
    setApplyingCoupon(true)
    setCouponError(null)
    try {
      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, subtotal }),
      })
      const json = await res.json()
      if (!res.ok) {
        setAppliedCoupon(null)
        setCouponError(json.error ?? 'Could not apply this code')
        return
      }
      setAppliedCoupon(json.coupon)
      setCouponInput('')
      toast({ title: 'Coupon applied 🎟️', description: `${json.coupon.code} — ${json.coupon.description}` })
    } catch {
      setCouponError('Network error — please try again')
    } finally {
      setApplyingCoupon(false)
    }
  }

  const removeCoupon = () => {
    setAppliedCoupon(null)
    setCouponError(null)
  }

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const placeOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) {
      openAuth('login', { view: 'checkout' })
      return
    }
    if (cart.length === 0) return
    if (!form.fullName || !form.address || !form.city || !form.zip) {
      toast({ title: 'Missing information', description: 'Please fill in all shipping fields', variant: 'destructive' })
      return
    }
    setPlacing(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          ...form,
          phone: form.phone || null,
          couponCode: appliedCoupon?.code ?? null,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Checkout failed', description: json.error, variant: 'destructive' })
        return
      }
      setPlacedOrder(json.order)
      setPlacedPricing(json.pricing ?? null)
      clearCart()
      toast({ title: 'Order placed! 🎉', description: 'A confirmation has been sent to your email' })
    } catch {
      toast({ title: 'Checkout failed', description: 'Network error — please try again', variant: 'destructive' })
    } finally {
      setPlacing(false)
    }
  }

  // ── Success state ──
  if (placedOrder) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.15, stiffness: 200 }}
          >
            <CheckCircle2 size={72} className="text-emerald-500" />
          </motion.div>
          <h1 className="mt-6 text-3xl font-extrabold tracking-tight">Order confirmed!</h1>
          <p className="mt-2 text-muted-foreground">
            Thanks, {placedOrder.fullName.split(' ')[0]}! Your order has been placed and is being processed.
          </p>

          {/* Simulated confirmation email */}
          {user?.email && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.35 }}
              className="mt-5 flex items-center gap-2.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-400"
            >
              <MailCheck size={15} className="shrink-0" />
              <span>
                Confirmation email sent to <strong>{user.email}</strong>
              </span>
            </motion.div>
          )}

          <Card className="mt-8 w-full">
            <CardContent className="space-y-4 p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Order number</p>
                  <p className="font-mono text-sm font-bold">{placedOrder.id.slice(-8).toUpperCase()}</p>
                </div>
                <Badge className="bg-emerald-500 hover:bg-emerald-500">{placedOrder.status}</Badge>
              </div>
              <Separator />
              <ul className="space-y-3">
                {placedOrder.items.map((item) => (
                  <li key={item.id} className="flex items-center gap-3">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border bg-muted">
                      {item.image && <img src={item.image} alt="" className="h-full w-full object-cover" />}
                    </div>
                    <div className="min-w-0 flex-1 text-left">
                      <p className="line-clamp-1 text-sm font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">Qty {item.quantity}</p>
                    </div>
                    <span className="text-sm font-semibold">{formatUSD(item.price * item.quantity)}</span>
                  </li>
                ))}
              </ul>
              <Separator />
              <div className="flex justify-between text-base font-bold">
                <span>Total paid</span>
                <span>{formatUSD(placedOrder.total)}</span>
              </div>
              {placedPricing && placedPricing.discount > 0 && placedPricing.couponCode && (
                <div className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500/10 p-2.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <BadgePercent size={14} />
                  You saved {formatUSD(placedPricing.discount)} with code {placedPricing.couponCode}
                </div>
              )}
              <div className="flex items-center gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
                <MapPin size={14} className="shrink-0" />
                <span>
                  Shipping to {placedOrder.address}, {placedOrder.city}, {placedOrder.country} {placedOrder.zip}
                </span>
              </div>
            </CardContent>
          </Card>

          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button size="lg" className="rounded-xl" onClick={() => navigate('orders')}>
              View my orders
            </Button>
            <Button size="lg" variant="outline" className="rounded-xl" onClick={() => navigate('catalog')}>
              Continue shopping
            </Button>
          </div>
        </motion.div>
      </div>
    )
  }

  // ── Empty cart guard ──
  if (cart.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="text-2xl font-bold">Nothing to checkout</h1>
        <p className="mt-2 text-sm text-muted-foreground">Your cart is empty.</p>
        <Button className="mt-6 rounded-xl" onClick={() => navigate('catalog')}>
          Browse products
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <button
        className="flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-primary"
        onClick={() => navigate('cart')}
      >
        <ArrowLeft size={15} /> Back to cart
      </button>
      <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Checkout</h1>

      <form onSubmit={placeOrder} className="mt-6 grid gap-6 lg:grid-cols-5">
        {/* Left: shipping + payment */}
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin size={16} className="text-primary" /> Shipping address
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="fullName">Full name</Label>
                <Input id="fullName" value={form.fullName} onChange={set('fullName')} placeholder="Jane Doe" required />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="address">Street address</Label>
                <Input id="address" value={form.address} onChange={set('address')} placeholder="123 Main Street, Apt 4" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="city">City</Label>
                <Input id="city" value={form.city} onChange={set('city')} placeholder="Portland" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="zip">ZIP code</Label>
                <Input id="zip" value={form.zip} onChange={set('zip')} placeholder="97201" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="country">Country</Label>
                <Input id="country" value={form.country} onChange={set('country')} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">
                  Phone <span className="text-xs text-muted-foreground">(optional)</span>
                </Label>
                <Input id="phone" value={form.phone} onChange={set('phone')} placeholder="+1 (555) 000-0000" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <CreditCard size={16} className="text-primary" /> Payment method
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RadioGroup defaultValue="card" className="gap-3">
                <Label
                  htmlFor="pay-card"
                  className="flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-colors has-[[data-state=checked]]:border-primary"
                >
                  <RadioGroupItem value="card" id="pay-card" />
                  <CreditCard size={18} className="text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Credit / debit card</p>
                    <p className="text-xs text-muted-foreground">Visa, Mastercard, Amex</p>
                  </div>
                  <span className="text-[10px] font-semibold uppercase text-muted-foreground">Demo</span>
                </Label>
                <Label
                  htmlFor="pay-wallet"
                  className="flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-colors has-[[data-state=checked]]:border-primary"
                >
                  <RadioGroupItem value="wallet" id="pay-wallet" />
                  <Lock size={18} className="text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Vendora wallet</p>
                    <p className="text-xs text-muted-foreground">Pay with your balance</p>
                  </div>
                </Label>
              </RadioGroup>
              <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck size={13} /> This is a demo checkout — no real payment is processed.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Right: summary */}
        <div className="lg:col-span-2">
          <Card className="sticky top-36">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Order summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ScrollArea className="max-h-64 pr-3">
                <ul className="space-y-3">
                  {cart.map((item) => (
                    <li key={item.productId} className="flex gap-3">
                      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border bg-muted">
                        {item.image && <img src={item.image} alt="" className="h-full w-full object-cover" />}
                        <Badge
                          variant="secondary"
                          className="absolute -right-0.5 -top-0.5 h-4.5 min-w-4.5 rounded-full px-1 text-[10px] font-bold"
                        >
                          {item.quantity}
                        </Badge>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-xs font-medium leading-4">{item.title}</p>
                      </div>
                      <span className="text-xs font-bold tabular-nums">
                        {formatUSD(item.price * item.quantity)}
                      </span>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
              <Separator />
              {/* Coupon input / applied state */}
              {appliedCoupon ? (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                      <Ticket size={14} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-emerald-700 dark:text-emerald-300">
                        {appliedCoupon.code} · −{appliedCoupon.percentOff}%
                      </p>
                      <p className="truncate text-xs text-emerald-600/80 dark:text-emerald-400/80">
                        {appliedCoupon.description}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={removeCoupon}
                    className="shrink-0 rounded-full p-1.5 text-emerald-700/70 transition hover:bg-emerald-500/15 hover:text-emerald-700 dark:text-emerald-300/70 dark:hover:text-emerald-300"
                    aria-label="Remove coupon"
                  >
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Ticket className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={couponInput}
                        onChange={(e) => {
                          setCouponInput(e.target.value)
                          setCouponError(null)
                        }}
                        placeholder="Promo code (try WELCOME10)"
                        className="h-10 pl-9 uppercase placeholder:normal-case"
                        aria-label="Promo code"
                        maxLength={24}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 shrink-0 rounded-xl px-4"
                      disabled={!couponInput.trim() || applyingCoupon}
                      onClick={() => void applyCoupon()}
                    >
                      {applyingCoupon ? <Loader2 size={14} className="animate-spin" /> : 'Apply'}
                    </Button>
                  </div>
                  {couponError && (
                    <p className="mt-1.5 text-xs font-medium text-destructive">{couponError}</p>
                  )}
                </div>
              )}
              <div className="space-y-2 text-sm">
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
                {discount > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <BadgePercent size={13} /> {appliedCoupon?.code}
                    </span>
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">
                      −{formatUSD(discount)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax</span>
                  <span className="font-medium text-foreground">Included</span>
                </div>
                <Separator />
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span>{formatUSD(total)}</span>
                </div>
              </div>
              <Button type="submit" size="lg" className="w-full rounded-xl text-base" disabled={placing}>
                {placing ? (
                  'Placing order…'
                ) : (
                  <>
                    <Lock size={15} className="mr-1.5" /> Place order · {formatUSD(total)}
                  </>
                )}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                By placing this order you agree to our demo Terms of Service
              </p>
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  )
}
