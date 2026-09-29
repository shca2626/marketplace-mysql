'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  BadgePercent,
  CalendarClock,
  CheckCircle2,
  Copy,
  CreditCard,
  Hourglass,
  Landmark,
  Loader2,
  Lock,
  MailCheck,
  MapPin,
  ShieldCheck,
  Ticket,
  Wand2,
  X,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { useMarketplace } from '@/store/marketplace'
import type { OrderDTO } from '@/lib/types'
import { formatDate, formatUSD } from '@/lib/format'
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

// ── As-you-type input formatters (display only) ──

/** (555) 123-4567 — or +1 (555) 123-4567 when a leading 1/+1 is typed */
function formatPhoneInput(raw: string): string {
  const trimmed = raw.trim()
  const allDigits = trimmed.replace(/\D/g, '').slice(0, 11)
  let digits: string
  let prefix = ''
  if (allDigits.length === 11 && allDigits.startsWith('1')) {
    prefix = '+1 '
    digits = allDigits.slice(1)
  } else if (/^\+1/.test(trimmed)) {
    prefix = '+1 '
    digits = trimmed.replace(/\D/g, '').slice(1, 11)
  } else {
    digits = allDigits.slice(0, 10)
  }
  const a = digits.slice(0, 3)
  const b = digits.slice(3, 6)
  const c = digits.slice(6)
  let out = prefix
  if (a) out += a.length === 3 ? `(${a}) ` : a
  if (b) out += b.length === 3 ? `${b}-` : b
  return out + c
}

/** 1234 5678 9012 3456 — digits grouped in fours, max 16 */
function formatCardNumber(raw: string): string {
  return raw
    .replace(/\D/g, '')
    .slice(0, 16)
    .replace(/(\d{4})(?=\d)/g, '$1 ')
}

/** 02/29 → MM/YY with auto-slash, max 4 digits */
function formatExpiry(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}/${digits.slice(2)}`
}

/** Uppercase alphanumeric postal code (US ZIP / intl) */
function formatZip(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9 -]/g, '')
    .slice(0, 10)
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
  const [placedPendingApproval, setPlacedPendingApproval] = useState(false)
  const [placedPendingPayment, setPlacedPendingPayment] = useState(false)
  const [placedPayment, setPlacedPayment] = useState<{
    method: string
    status: string
    instructions: string | null
    dueAt: string | null
  } | null>(null)
  const [placedPricing, setPlacedPricing] = useState<{ discount: number; couponCode: string | null } | null>(null)

  // ── Coupon state ──
  const [couponInput, setCouponInput] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null)
  const [couponError, setCouponError] = useState<string | null>(null)
  const [applyingCoupon, setApplyingCoupon] = useState(false)

  // ── Payment state (demo card fields — display only, never stored) ──
  // 'card' → paymentMethod CARD (simulated gateway, instant confirmation)
  // 'bank' → paymentMethod BANK_TRANSFER (order parks in PENDING_PAYMENT)
  const [payMethod, setPayMethod] = useState<'card' | 'bank'>('card')
  const [card, setCard] = useState({ number: '', expiry: '', cvc: '' })
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [paidWith, setPaidWith] = useState<{ method: 'card'; last4?: string } | null>(null)

  // Payment options offered by the platform — CARD runs on the simulated
  // gateway; a manual-only deployment (PAYMENT_DRIVER=manual) lists bank
  // transfer alone and we auto-select it.
  const { data: methodsData } = useApi<{
    methods: { id: string; label: string; manual: boolean; description: string }[]
  }>('/api/payments/methods')
  const methods = methodsData?.methods ?? null
  const cardAvailable = methods ? methods.some((m) => m.id === 'CARD') : true
  const bankDescription =
    methods?.find((m) => m.id === 'BANK_TRANSFER')?.description ??
    'Wire the total to the platform account; an operator confirms receipt.'
  if (!cardAvailable && payMethod === 'card') {
    setPayMethod('bank')
  }

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

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setFieldErrors((errs) => {
      if (!errs[key]) return errs
      const next = { ...errs }
      delete next[key]
      return next
    })
  }

  // Formatted variants — auto-format as the user types and clear errors on edit
  const setPhone = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, phone: formatPhoneInput(e.target.value) }))
  }
  const setZip = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, zip: formatZip(e.target.value) }))
    setFieldErrors((errs) => {
      if (!errs.zip) return errs
      const next = { ...errs }
      delete next.zip
      return next
    })
  }
  const setCardField = (key: keyof typeof card, format: (v: string) => string) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setCard((c) => ({ ...c, [key]: format(e.target.value) }))
      setFieldErrors((errs) => {
        if (!errs[key]) return errs
        const next = { ...errs }
        delete next[key]
        return next
      })
    }

  const fillDemoCard = () => {
    setCard({ number: '4242 4242 4242 4242', expiry: '12/28', cvc: '424' })
    setFieldErrors((errs) => {
      const next = { ...errs }
      delete next.cardNumber
      delete next.cardExpiry
      delete next.cardCvc
      return next
    })
  }

  /** Field-level validation; returns a map of field → message. */
  const validateFields = (): Record<string, string> => {
    const errs: Record<string, string> = {}
    if (!form.fullName.trim()) errs.fullName = 'Enter the recipient name'
    if (!form.address.trim()) errs.address = 'Enter a street address'
    if (!form.city.trim()) errs.city = 'Enter a city'
    if (!form.zip.trim()) errs.zip = 'Enter a ZIP / postal code'
    else if (form.zip.trim().length < 3) errs.zip = 'That postal code looks too short'
    if (!form.country.trim()) errs.country = 'Enter a country'
    if (payMethod === 'card') {
      if (card.number.replace(/\s/g, '').length !== 16) errs.cardNumber = 'Enter the 16-digit card number'
      const m = card.expiry.match(/^(0[1-9]|1[0-2])\/(\d{2})$/)
      if (!m) errs.cardExpiry = 'Use MM/YY'
      else {
        // expires at the END of the month shown
        const exp = new Date(2000 + Number(m[2]), Number(m[1]), 1)
        if (exp.getTime() <= Date.now()) errs.cardExpiry = 'This card looks expired'
      }
      if (!/^\d{3,4}$/.test(card.cvc)) errs.cardCvc = '3–4 digits'
    }
    return errs
  }

  const placeOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) {
      openAuth('login', { view: 'checkout' })
      return
    }
    if (cart.length === 0) return
    // Inline validation — mark invalid fields, focus the first one
    const errs = validateFields()
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs)
      const firstKey = Object.keys(errs)[0]
      document.getElementById(firstKey)?.focus()
      document.getElementById(firstKey)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      toast({
        title: 'Check your details',
        description: 'A few fields need attention before placing the order.',
        variant: 'destructive',
      })
      return
    }
    setPaidWith(
      payMethod === 'card'
        ? { method: 'card', last4: card.number.replace(/\s/g, '').slice(-4) }
        : null
    )
    setPlacing(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            variantId: i.variantId ?? null,
          })),
          ...form,
          phone: form.phone || null,
          couponCode: appliedCoupon?.code ?? null,
          paymentMethod: payMethod === 'card' ? 'CARD' : 'BANK_TRANSFER',
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Checkout failed', description: json.error, variant: 'destructive' })
        return
      }
      setPlacedOrder(json.order)
      setPlacedPricing(json.pricing ?? null)
      setPlacedPendingApproval(!!json.pendingApproval)
      setPlacedPendingPayment(!!json.pendingPayment)
      setPlacedPayment(json.payment ?? null)
      clearCart()
      toast(
        json.pendingApproval
          ? {
              title: 'Sent for approval 🕐',
              description: 'Your organization must approve this order before it reaches the seller.',
            }
          : json.pendingPayment
            ? {
                title: 'Order placed — awaiting your bank transfer',
                description:
                  'Wire the total using the bank details on the confirmation screen. Transfers are confirmed by an operator on business days.',
              }
            : { title: 'Order placed! 🎉', description: 'A confirmation has been sent to your email' }
      )
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
            {placedPendingApproval ? (
              <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-2 border-teal-500/40 bg-teal-500/10">
                <Hourglass size={36} className="text-teal-600 dark:text-teal-400" />
              </div>
            ) : placedPendingPayment ? (
              <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-2 border-amber-500/40 bg-amber-500/10">
                <Landmark size={36} className="text-amber-600 dark:text-amber-400" />
              </div>
            ) : (
              <CheckCircle2 size={72} className="text-emerald-500" />
            )}
          </motion.div>
          <h1 className="mt-6 text-3xl font-extrabold tracking-tight">
            {placedPendingApproval
              ? 'Sent for approval'
              : placedPendingPayment
                ? 'Order placed — awaiting your bank transfer'
                : 'Order confirmed!'}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {placedPendingApproval ? (
              <>
                Thanks, {placedOrder.fullName.split(' ')[0]}! Your order is on hold until an approver in your
                organization clears it — we&apos;ll move it to the seller the moment it&apos;s approved.
              </>
            ) : placedPendingPayment ? (
              <>
                Thanks, {placedOrder.fullName.split(' ')[0]}! Your order is reserved. Wire the total using the
                bank details below — an operator confirms receipt on business days.
              </>
            ) : (
              <>
                Thanks, {placedOrder.fullName.split(' ')[0]}! Your order has been placed and is being processed.
              </>
            )}
          </p>

          {/* Simulated confirmation email */}
          {user?.email && !placedPendingApproval && !placedPendingPayment && (
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
                <Badge
                  className={cn(
                    placedPendingApproval
                      ? 'bg-teal-500 hover:bg-teal-500'
                      : placedPendingPayment
                        ? 'bg-amber-500 hover:bg-amber-500'
                        : 'bg-emerald-500 hover:bg-emerald-500'
                  )}
                >
                  {placedPendingApproval
                    ? 'AWAITING APPROVAL'
                    : placedPendingPayment
                      ? 'AWAITING PAYMENT'
                      : placedOrder.status}
                </Badge>
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
                      <p className="text-xs text-muted-foreground">
                        Qty {item.quantity}
                        {item.variantName ? ` · ${item.variantName}` : ''}
                      </p>
                    </div>
                    <span className="text-sm font-semibold">{formatUSD(item.price * item.quantity)}</span>
                  </li>
                ))}
              </ul>
              <Separator />
              <div className="flex justify-between text-base font-bold">
                <span>{placedPendingApproval || placedPendingPayment ? 'Order total' : 'Total paid'}</span>
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

              {/* Bank transfer — wire instructions + reference */}
              {placedPendingPayment && (
                <div className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-left">
                  <div className="flex items-center gap-2">
                    <Landmark size={15} className="shrink-0 text-amber-600 dark:text-amber-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                      Bank transfer details
                    </p>
                  </div>
                  <pre className="whitespace-pre-wrap rounded-lg border bg-background/60 p-3 font-mono text-[11px] leading-relaxed">
                    {placedPayment?.instructions ??
                      'The platform bank account details will be sent to your email.'}
                  </pre>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Transfer reference</span>
                    <span className="rounded-md bg-amber-500/10 px-2 py-1 font-mono text-xs font-bold text-amber-700 dark:text-amber-300">
                      {placedOrder.id.slice(-8).toUpperCase()}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        navigator.clipboard
                          ?.writeText(placedOrder.id.slice(-8).toUpperCase())
                          .then(() => toast({ title: 'Reference copied' }))
                          .catch(() => {})
                      }
                      className="rounded-full p-1 text-muted-foreground transition hover:text-foreground"
                      aria-label="Copy transfer reference"
                    >
                      <Copy size={13} />
                    </button>
                  </div>
                  {placedPayment?.dueAt && (
                    <p className="text-xs text-muted-foreground">
                      Please complete the transfer by {formatDate(placedPayment.dueAt)}.
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    You can also pay later from My Orders — the order stays reserved until the transfer is
                    confirmed.
                  </p>
                </div>
              )}

              {paidWith && (
                <div className="flex items-center gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
                  <CreditCard size={14} className="shrink-0" />
                  <span>
                    Paid by card <span className="font-mono font-semibold">•••• {paidWith.last4}</span>
                  </span>
                </div>
              )}
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
                <Input
                  id="fullName"
                  value={form.fullName}
                  onChange={set('fullName')}
                  placeholder="Jane Doe"
                  required
                  autoComplete="name"
                  aria-invalid={!!fieldErrors.fullName}
                  className={cn('h-11 rounded-xl', fieldErrors.fullName && 'border-destructive focus-visible:ring-destructive')}
                />
                {fieldErrors.fullName && (
                  <p className="text-xs font-medium text-destructive" role="alert">{fieldErrors.fullName}</p>
                )}
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="address">Street address</Label>
                <Input
                  id="address"
                  value={form.address}
                  onChange={set('address')}
                  placeholder="123 Main Street, Apt 4"
                  required
                  autoComplete="street-address"
                  aria-invalid={!!fieldErrors.address}
                  className={cn('h-11 rounded-xl', fieldErrors.address && 'border-destructive focus-visible:ring-destructive')}
                />
                {fieldErrors.address && (
                  <p className="text-xs font-medium text-destructive" role="alert">{fieldErrors.address}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={form.city}
                  onChange={set('city')}
                  placeholder="Portland"
                  required
                  autoComplete="address-level2"
                  aria-invalid={!!fieldErrors.city}
                  className={cn('h-11 rounded-xl', fieldErrors.city && 'border-destructive focus-visible:ring-destructive')}
                />
                {fieldErrors.city && (
                  <p className="text-xs font-medium text-destructive" role="alert">{fieldErrors.city}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="zip">
                  ZIP code
                  <span className="ml-1 text-[10px] font-normal text-muted-foreground">auto-formatted</span>
                </Label>
                <Input
                  id="zip"
                  value={form.zip}
                  onChange={setZip}
                  placeholder="97201"
                  required
                  autoComplete="postal-code"
                  aria-invalid={!!fieldErrors.zip}
                  className={cn('h-11 rounded-xl uppercase', fieldErrors.zip && 'border-destructive focus-visible:ring-destructive')}
                />
                {fieldErrors.zip && (
                  <p className="text-xs font-medium text-destructive" role="alert">{fieldErrors.zip}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  value={form.country}
                  onChange={set('country')}
                  required
                  autoComplete="country-name"
                  aria-invalid={!!fieldErrors.country}
                  className={cn('h-11 rounded-xl', fieldErrors.country && 'border-destructive focus-visible:ring-destructive')}
                />
                {fieldErrors.country && (
                  <p className="text-xs font-medium text-destructive" role="alert">{fieldErrors.country}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">
                  Phone <span className="text-xs text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={setPhone}
                  placeholder="(555) 000-0000"
                  inputMode="tel"
                  autoComplete="tel"
                  aria-invalid={!!fieldErrors.phone}
                  className="h-11 rounded-xl"
                />
                {fieldErrors.phone && (
                  <p className="text-xs font-medium text-destructive" role="alert">{fieldErrors.phone}</p>
                )}
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
              <RadioGroup
                value={payMethod}
                onValueChange={(v) => setPayMethod(v as 'card' | 'bank')}
                className="gap-3"
              >
                {cardAvailable && (
                  <Label
                    htmlFor="pay-card"
                    className="flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-colors has-[[data-state=checked]]:border-primary"
                  >
                    <RadioGroupItem value="card" id="pay-card" />
                    <CreditCard size={18} className="text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Credit / debit card</p>
                      <p className="text-xs text-muted-foreground">
                        Visa, Mastercard, Amex — confirmed instantly
                      </p>
                    </div>
                    <span className="text-[10px] font-semibold uppercase text-muted-foreground">Demo</span>
                  </Label>
                )}
                <Label
                  htmlFor="pay-bank"
                  className="flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-colors has-[[data-state=checked]]:border-primary"
                >
                  <RadioGroupItem value="bank" id="pay-bank" />
                  <Landmark size={18} className="text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Bank transfer</p>
                    <p className="text-xs text-muted-foreground">{bankDescription}</p>
                  </div>
                  <span className="text-[10px] font-semibold uppercase text-muted-foreground">Manual</span>
                </Label>
              </RadioGroup>

              {/* Card details — demo-only, formatted as-you-type, never stored */}
              {payMethod === 'card' ? (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 space-y-4 rounded-xl border bg-muted/30 p-4"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Card details
                    </p>
                    <button
                      type="button"
                      onClick={fillDemoCard}
                      className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/20"
                    >
                      <Wand2 size={12} /> Autofill demo card
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cardNumber">Card number</Label>
                    <div className="relative">
                      <CreditCard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="cardNumber"
                        value={card.number}
                        onChange={setCardField('number', formatCardNumber)}
                        placeholder="4242 4242 4242 4242"
                        inputMode="numeric"
                        autoComplete="cc-number"
                        aria-invalid={!!fieldErrors.cardNumber}
                        className={cn('h-11 rounded-xl pl-9 tabular-nums', fieldErrors.cardNumber && 'border-destructive focus-visible:ring-destructive')}
                      />
                    </div>
                    {fieldErrors.cardNumber && (
                      <p className="text-xs font-medium text-destructive" role="alert">{fieldErrors.cardNumber}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="cardExpiry">Expiry</Label>
                      <div className="relative">
                        <CalendarClock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="cardExpiry"
                          value={card.expiry}
                          onChange={setCardField('expiry', formatExpiry)}
                          placeholder="MM/YY"
                          inputMode="numeric"
                          autoComplete="cc-exp"
                          aria-invalid={!!fieldErrors.cardExpiry}
                          className={cn('h-11 rounded-xl pl-9 tabular-nums', fieldErrors.cardExpiry && 'border-destructive focus-visible:ring-destructive')}
                        />
                      </div>
                      {fieldErrors.cardExpiry && (
                        <p className="text-xs font-medium text-destructive" role="alert">{fieldErrors.cardExpiry}</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cardCvc">CVC</Label>
                      <div className="relative">
                        <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="cardCvc"
                          value={card.cvc}
                          onChange={setCardField('cvc', (v) => v.replace(/\D/g, '').slice(0, 4))}
                          placeholder="123"
                          inputMode="numeric"
                          autoComplete="cc-csc"
                          aria-invalid={!!fieldErrors.cardCvc}
                          className={cn('h-11 rounded-xl pl-9 tabular-nums', fieldErrors.cardCvc && 'border-destructive focus-visible:ring-destructive')}
                        />
                      </div>
                      {fieldErrors.cardCvc && (
                        <p className="text-xs font-medium text-destructive" role="alert">{fieldErrors.cardCvc}</p>
                      )}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                      <Landmark size={15} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">Order now, wire later</p>
                      <p className="text-xs text-muted-foreground">
                        Your order is placed immediately and the items are reserved. We&apos;ll show the
                        platform bank account details on the next screen — wire the total and an operator
                        confirms receipt on business days.
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
              <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck size={13} /> This is a demo checkout — no real payment is processed and card details are
                never stored.
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
                        {item.variantLabel && (
                          <span className="mt-0.5 inline-block rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {item.variantLabel}
                          </span>
                        )}
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
                        placeholder="Promo code (try SUN10)"
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
