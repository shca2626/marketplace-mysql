'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AtSign,
  BadgeCheck,
  Check,
  Copy,
  FlaskConical,
  KeyRound,
  Loader2,
  Mail,
  MessageCircle,
  Phone,
  ShieldCheck,
  Smartphone,
  Store,
  Ticket,
  User as UserIcon,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'
import { clearPersistedUserState } from '@/lib/signout'
import type { SessionUser } from '@/lib/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { cn } from '@/lib/utils'

/**
 * PHASE 3 — phone-first auth modal (UX review: compact 2-step wizard).
 *   Login:    phone OR email + password (identifier auto-detected), MFA step.
 *   Register: step 1 — verify your WhatsApp number (phone + 6-digit code);
 *             step 2 — your details (name, intent, password, terms).
 * Merchant/Dealer companies and financiers use their dedicated doors
 * (register-company / register-financier views), not this modal.
 */

const PHONE_LOCAL_RE = /^(70|71|73|77|78)\d{7}$/

export function AuthModal() {
  const open = useMarketplace((s) => s.authModalOpen)
  const mode = useMarketplace((s) => s.authMode)
  const closeAuth = useMarketplace((s) => s.closeAuth)
  const setAuthMode = useMarketplace((s) => s.setAuthMode)
  const setUser = useMarketplace((s) => s.setUser)
  const navigate = useMarketplace((s) => s.navigate)
  const afterAuth = useMarketplace((s) => s.afterAuth)

  // TENANT-AUDIT H-1: the identity this browser held when the modal opened.
  // When finish() lands a DIFFERENT user, the previous user's commerce state
  // (cart / saved-for-later / recently-viewed) and persisted keys (chat
  // session, company draft, seen-ids, active org) are dropped — a shared
  // browser must never place the previous user's lines under the new login.
  const prevUserIdRef = useRef<string | null>(useMarketplace.getState().user?.id ?? null)

  // ── shared fields ──
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [name, setName] = useState('')
  const [role, setRole] = useState<'BUYER' | 'SELLER'>('BUYER')
  const [storeName, setStoreName] = useState('')
  const [loading, setLoading] = useState(false)

  // ── login: phone-or-email identifier ──
  const [identifier, setIdentifier] = useState('')

  // ── login: Phase 6 MFA challenge (6.7.9) ──
  const [mfaStep, setMfaStep] = useState(false)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaError, setMfaError] = useState<string | null>(null)

  // ── register: 2-step wizard ──
  const [regStep, setRegStep] = useState<1 | 2>(1)
  const [phone, setPhone] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otp, setOtp] = useState('')
  const [otpToken, setOtpToken] = useState<string | null>(null)
  const [sendingOtp, setSendingOtp] = useState(false)
  const [devCode, setDevCode] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(0)

  // ── register: dynamic validation (touched-first, short messages) ──
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const touch = (k: string) => setTouched((t) => ({ ...t, [k]: true }))

  // ── register: optional email / invitation ──
  const [showEmail, setShowEmail] = useState(false)
  const [email, setEmail] = useState('')
  const [showInvite, setShowInvite] = useState(false)
  const [inviteToken, setInviteToken] = useState('')

  // ── register: terms (required) ──
  const [agree, setAgree] = useState(false)

  const phoneValid = useMemo(() => PHONE_LOCAL_RE.test(phone.replace(/\D/g, '')), [phone])
  const otpVerified = Boolean(otpToken)
  const resendTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const nameError = touched.name && name.trim().length < 2
  const passwordError = touched.password && password.length < 6
  const storeNameError = role === 'SELLER' && touched.storeName && storeName.trim().length < 2
  const emailError = showEmail && touched.email && email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const phoneError = touched.phone && phone.length > 0 && !phoneValid

  // Resend countdown ticker
  useEffect(() => {
    if (resendIn <= 0 && resendTimer.current) {
      clearInterval(resendTimer.current)
      resendTimer.current = null
      return
    }
    if (resendIn > 0 && !resendTimer.current) {
      resendTimer.current = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000)
    }
    return () => {
      if (resendTimer.current) {
        clearInterval(resendTimer.current)
        resendTimer.current = null
      }
    }
  }, [resendIn])

  // Mode switches reset the OTP stage so stale states never leak across.
  useEffect(() => {
    setOtpSent(false)
    setOtp('')
    setOtpToken(null)
    setDevCode(null)
    setResendIn(0)
    setRegStep(1)
    setTouched({})
    setMfaStep(false)
    setMfaCode('')
    setMfaError(null)
  }, [mode])

  const finish = (user: SessionUser) => {
    // TENANT-AUDIT H-1: identity change → drop the previous user's state.
    if (prevUserIdRef.current && prevUserIdRef.current !== user.id) {
      useMarketplace.getState().clearUserCommerceState()
      clearPersistedUserState()
    }
    prevUserIdRef.current = user.id
    setUser(user)
    closeAuth()
    toast({
      title: `Welcome${mode === 'register' ? '' : ' back'}, ${user.name.split(' ')[0]}!`,
      ...(mode === 'register'
        ? {
            description: user.email
              ? 'Check your inbox to verify your email (optional extra security).'
              : 'Your phone is verified — you are all set.',
          }
        : {}),
    })
    // TENANT-AUDIT M-5: a seller-intent registration lands on the seller
    // console — never left staring at the page they were on. An explicit
    // afterAuth target always wins.
    if (afterAuth) {
      navigate(afterAuth.view, afterAuth.params)
    } else if (mode === 'register' && user.role === 'SELLER') {
      navigate('seller')
    }
    setPassword('')
    setMfaStep(false)
    setMfaCode('')
    setMfaError(null)
  }

  // ── OTP: request + verify ──
  const requestOtp = async (isResend = false) => {
    if (!phoneValid || sendingOtp) return
    setSendingOtp(true)
    try {
      const res = await fetch('/api/auth/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, purpose: 'REGISTER' }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Could not send the code', description: json.error, variant: 'destructive' })
        return
      }
      setOtpSent(true)
      setOtp('')
      setOtpToken(null)
      setDevCode(typeof json.devCode === 'string' ? json.devCode : null)
      setResendIn(json.resendAfterSec ?? 60)
      toast({ title: isResend ? 'New code sent' : 'Code sent', description: 'Valid for 5 minutes.' })
    } catch {
      toast({ title: 'Error', description: 'Network error — please try again', variant: 'destructive' })
    } finally {
      setSendingOtp(false)
    }
  }

  const verifyOtp = async (value: string) => {
    if (value.length !== 6) return
    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code: value, purpose: 'REGISTER' }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Verification failed', description: json.error, variant: 'destructive' })
        setOtp('')
        return
      }
      setOtpToken(json.otpToken)
      toast({ title: 'Phone verified', description: 'One more step — your details.' })
      // Auto-advance to step 2 the moment the number checks out.
      window.setTimeout(() => setRegStep(2), 450)
    } catch {
      toast({ title: 'Error', description: 'Network error — please try again', variant: 'destructive' })
      setOtp('')
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    if (mode === 'register') {
      // Dynamic validation gate: mark everything touched, then stop on errors.
      setTouched({ name: true, password: true, phone: true, storeName: true, email: true })
      if (!otpVerified || name.trim().length < 2 || password.length < 6 || (role === 'SELLER' && storeName.trim().length < 2)) return
      if (!agree) {
        toast({
          title: 'Accept the Terms to continue',
          description: 'Please agree to the Terms of Service and Privacy Policy.',
          variant: 'destructive',
        })
        return
      }
    }
    setLoading(true)
    try {
      if (mode === 'login') {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            mfaStep ? { identifier, password, code: mfaCode.trim() } : { identifier, password }
          ),
        })
        const json = await res.json()
        if (!res.ok) {
          if (json.mfaRequired) {
            const attemptedCode = mfaStep
            setMfaStep(true)
            setMfaCode('')
            if (attemptedCode) {
              setMfaError(json.error ?? 'That code is not valid — please try again.')
            }
            return
          }
          toast({ title: 'Sign in failed', description: json.error, variant: 'destructive' })
          return
        }
        finish(json.user)
      } else {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            phone,
            otpToken,
            password,
            role,
            storeName: storeName || undefined,
            email: showEmail && email.trim() ? email.trim() : undefined,
            ...(showInvite && inviteToken.trim() ? { inviteToken: inviteToken.trim() } : {}),
          }),
        })
        const json = await res.json()
        if (!res.ok) {
          toast({ title: 'Registration failed', description: json.error, variant: 'destructive' })
          return
        }
        finish(json.user)
      }
    } catch {
      toast({ title: 'Error', description: 'Network error — please try again', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const useDemo = () => {
    setIdentifier('demo@vendora.com')
    setPassword('demo1234')
    setMfaStep(false)
    setMfaCode('')
    setMfaError(null)
  }

  const formattedPhone = `+967 ${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6)}`.trim()

  // ── wizard step chips (register only) ──
  const stepChip = (n: 1 | 2, label: string) => {
    const active = regStep === n
    const done = n === 1 && otpVerified
    return (
      <span
        className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${
          active
            ? 'bg-primary text-primary-foreground'
            : done
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
              : 'bg-muted text-muted-foreground'
        }`}
      >
        {done ? <Check size={11} /> : <span aria-hidden>{n}</span>} {label}
      </span>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeAuth()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {mode === 'login'
              ? mfaStep
                ? 'Two-factor verification'
                : 'Welcome back'
              : regStep === 1
                ? 'Verify your number'
                : 'Your details'}
          </DialogTitle>
          {mode === 'login' ? (
            <DialogDescription>
              {mfaStep ? 'Enter the code from your authenticator app to finish signing in.' : 'Sign in with your phone number or email.'}
            </DialogDescription>
          ) : (
            <DialogDescription className="flex items-center gap-2">
              {stepChip(1, 'Phone')}
              <span aria-hidden className="h-px w-4 bg-border" />
              {stepChip(2, 'Details')}
            </DialogDescription>
          )}
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3.5">
          {mode === 'register' && regStep === 1 && (
            <>
              {/* ── STEP 1 — phone + WhatsApp OTP ── */}
              <div className="space-y-1.5">
                <Label htmlFor="auth-phone">Phone number</Label>
                <div className="flex gap-2">
                  <div className="flex items-center gap-1 rounded-lg border bg-muted/50 px-3 py-2 text-sm font-medium text-muted-foreground">
                    <Phone size={13} /> +967
                  </div>
                  <Input
                    id="auth-phone"
                    inputMode="numeric"
                    value={phone}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 9)
                      setPhone(digits)
                      setOtpToken(null)
                      setOtpSent(false)
                      setDevCode(null)
                    }}
                    onBlur={() => touch('phone')}
                    placeholder="77X XXX XXX"
                    className="flex-1 tracking-wide"
                    required
                    autoFocus
                    aria-invalid={phoneError || undefined}
                    aria-describedby={phoneError ? 'auth-phone-error' : undefined}
                  />
                </div>
                {phoneError && (
                  <p id="auth-phone-error" role="alert" className="text-xs font-medium text-destructive">
                    Enter a valid 9-digit Yemeni mobile (70, 71, 73, 77 or 78).
                  </p>
                )}
              </div>

              {otpSent && !otpVerified && (
                <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <MessageCircle size={14} className="text-primary" /> Enter the 6-digit code
                    </span>
                    <button
                      type="button"
                      onClick={() => requestOtp(true)}
                      disabled={resendIn > 0 || sendingOtp}
                      className="text-[11px] font-medium text-primary underline-offset-2 hover:underline disabled:text-muted-foreground disabled:no-underline"
                    >
                      {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
                    </button>
                  </div>
                  <div className="flex justify-center py-1">
                    <InputOTP
                      maxLength={6}
                      value={otp}
                      onChange={(value) => {
                        setOtp(value)
                        void verifyOtp(value)
                      }}
                      autoFocus
                    >
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className="truncate">Sent to {formattedPhone}</span>
                    {devCode && (
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard?.writeText(devCode).catch(() => undefined)
                          toast({ title: 'Code copied' })
                        }}
                        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 font-semibold text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        title="Sandbox delivery — no WhatsApp line is paired yet"
                      >
                        <FlaskConical size={11} /> {devCode}
                        <Copy size={10} />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {otpVerified && (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
                  <span className="flex items-center gap-2 truncate">
                    <BadgeCheck size={16} /> {formattedPhone} verified
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setOtpToken(null)
                      setOtpSent(false)
                      setOtp('')
                    }}
                    className="shrink-0 text-xs font-semibold text-emerald-800 underline-offset-2 hover:underline dark:text-emerald-300"
                  >
                    Change
                  </button>
                </div>
              )}

              {!otpVerified && (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full rounded-xl"
                  size="lg"
                  onClick={() => {
                    touch('phone')
                    void requestOtp()
                  }}
                  disabled={!phoneValid || sendingOtp || otpSent}
                >
                  {sendingOtp ? (
                    <Loader2 size={15} className="mr-1.5 animate-spin" />
                  ) : (
                    <MessageCircle size={15} className="mr-1.5" />
                  )}
                  {otpSent ? 'Code sent — enter it above' : 'Send WhatsApp code'}
                </Button>
              )}

              {otpVerified && (
                <Button type="button" className="w-full rounded-xl" size="lg" onClick={() => setRegStep(2)}>
                  Continue <Check size={15} className="ml-1.5" />
                </Button>
              )}
            </>
          )}

          {mode === 'register' && regStep === 2 && (
            <>
              {/* ── STEP 2 — details ── */}
              <div className="space-y-1.5">
                <Label htmlFor="auth-name">Full name</Label>
                <div className="relative">
                  <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="auth-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => touch('name')}
                    placeholder="Jane Doe"
                    className="pl-9"
                    required
                    minLength={2}
                    autoFocus
                    aria-invalid={nameError || undefined}
                  />
                </div>
                {nameError && (
                  <p role="alert" className="text-xs font-medium text-destructive">
                    Enter your full name (at least 2 characters).
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>I want to…</Label>
                <RadioGroup
                  value={role}
                  onValueChange={(v) => setRole(v as 'BUYER' | 'SELLER')}
                  className="grid grid-cols-2 gap-2"
                >
                  <Label
                    htmlFor="role-buyer"
                    className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 py-2.5 text-sm font-medium transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                  >
                    <RadioGroupItem value="BUYER" id="role-buyer" />
                    <span className="text-muted-foreground">🛍️</span> Shop
                  </Label>
                  <Label
                    htmlFor="role-seller"
                    className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 py-2.5 text-sm font-medium transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                  >
                    <RadioGroupItem value="SELLER" id="role-seller" />
                    <span className="text-muted-foreground">🏪</span> Sell
                  </Label>
                </RadioGroup>
              </div>

              {role === 'SELLER' && (
                <div className="space-y-1.5">
                  <Label htmlFor="auth-store">Store name</Label>
                  <div className="relative">
                    <Store className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="auth-store"
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                      onBlur={() => touch('storeName')}
                      placeholder="e.g. Sabri Solar"
                      className="pl-9"
                      aria-invalid={storeNameError || undefined}
                    />
                  </div>
                  {storeNameError && (
                    <p role="alert" className="text-xs font-medium text-destructive">
                      Give your store a name (at least 2 characters).
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="auth-password">Password</Label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onBlur={() => touch('password')}
                    placeholder="At least 6 characters"
                    className="px-9"
                    required
                    minLength={6}
                    aria-invalid={passwordError || undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
                {passwordError ? (
                  <p role="alert" className="text-xs font-medium text-destructive">
                    At least 6 characters.
                  </p>
                ) : password.length > 0 ? (
                  <div className="flex items-center gap-1.5" aria-hidden>
                    <span className="h-1 flex-1 rounded-full bg-border" />
                    <span className="h-1 flex-1 rounded-full bg-border" />
                    <span
                      className={cn(
                        'h-1 flex-1 rounded-full transition-colors',
                        password.length >= 6 ? (password.length >= 10 ? 'bg-emerald-500' : 'bg-amber-500') : 'bg-border'
                      )}
                    />
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {password.length >= 10 ? 'Strong' : password.length >= 6 ? 'Okay' : 'Weak'}
                    </span>
                  </div>
                ) : null}
              </div>

              {/* ── Optional email ── */}
              {showEmail ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="auth-email">Email (optional)</Label>
                    <button
                      type="button"
                      onClick={() => {
                        setShowEmail(false)
                        setEmail('')
                      }}
                      className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="auth-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onBlur={() => touch('email')}
                      placeholder="you@example.com"
                      className="pl-9"
                      aria-invalid={emailError || undefined}
                    />
                  </div>
                  {emailError && (
                    <p role="alert" className="text-xs font-medium text-destructive">
                      That email does not look right.
                    </p>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowEmail(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary underline-offset-2 hover:underline"
                >
                  <AtSign size={13} /> Add an email (optional)
                </button>
              )}

              {/* ── Invitation code ── */}
              {showInvite ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="auth-invite">Invitation code</Label>
                    <button
                      type="button"
                      onClick={() => {
                        setShowInvite(false)
                        setInviteToken('')
                      }}
                      className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="relative">
                    <Ticket className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="auth-invite"
                      value={inviteToken}
                      onChange={(e) => setInviteToken(e.target.value)}
                      placeholder="Paste the code from your invitation"
                      className="pl-9 font-mono text-xs"
                      autoComplete="off"
                    />
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowInvite(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary underline-offset-2 hover:underline"
                >
                  <Ticket size={13} /> I have an invitation code
                </button>
              )}

              {/* ── Terms (required) ── */}
              <div>
                <label
                  htmlFor="auth-terms"
                  className={cn(
                    'flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-xs leading-relaxed transition-colors',
                    touched.terms && !agree
                      ? 'border-destructive/50 bg-destructive/5'
                      : agree
                        ? 'border-primary/40 bg-primary/5'
                        : 'hover:bg-muted/40'
                  )}
                >
                  <Checkbox
                    id="auth-terms"
                    checked={agree}
                    onCheckedChange={(v) => {
                      setAgree(v === true)
                      touch('terms')
                    }}
                    className="mt-0.5"
                    aria-required="true"
                  />
                  <span>
                    I agree to the{' '}
                    <a href="/legal/terms" target="_blank" rel="noreferrer" className="font-semibold text-primary underline-offset-2 hover:underline">
                      Terms of Service
                    </a>{' '}
                    and{' '}
                    <a href="/legal/privacy" target="_blank" rel="noreferrer" className="font-semibold text-primary underline-offset-2 hover:underline">
                      Privacy Policy
                    </a>
                    <span className="text-destructive"> *</span>
                  </span>
                </label>
                {touched.terms && !agree && (
                  <p role="alert" className="mt-1 text-xs font-medium text-destructive">
                    Please accept the Terms and Privacy Policy to continue.
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full rounded-xl"
                size="lg"
                disabled={loading || !otpVerified}
              >
                {loading && <Loader2 size={15} className="mr-1.5 animate-spin" />}
                Create account
              </Button>

              <button
                type="button"
                onClick={() => setRegStep(1)}
                className="inline-flex w-full items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                ← {formattedPhone} — change number
              </button>

              <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                <ShieldCheck size={12} /> Your number is only used for verification and order updates.
              </p>
            </>
          )}

          {mode === 'login' && mfaStep && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl border bg-muted/30 p-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Smartphone size={16} />
                </span>
                <div className="min-w-0 text-sm">
                  <p className="font-semibold">Your account is protected</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    Signing in as{' '}
                    <span className="font-medium text-foreground">{identifier}</span> — the
                    password checked out.
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="auth-mfa-code">Verification code</Label>
                <Input
                  id="auth-mfa-code"
                  value={mfaCode}
                  onChange={(e) => {
                    setMfaCode(e.target.value)
                    setMfaError(null)
                  }}
                  maxLength={10}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  required
                  disabled={loading}
                  className="text-center font-mono text-base tracking-[0.3em]"
                  placeholder="······"
                  aria-invalid={!!mfaError}
                  aria-describedby={mfaError ? 'auth-mfa-error' : 'auth-mfa-hint'}
                />
                {mfaError ? (
                  <p
                    id="auth-mfa-error"
                    role="alert"
                    className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive"
                  >
                    {mfaError}
                  </p>
                ) : (
                  <p id="auth-mfa-hint" className="text-[11px] leading-snug text-muted-foreground">
                    6-digit code from your authenticator app — or an XXXX-XXXX backup code.
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setMfaStep(false)
                  setMfaCode('')
                  setMfaError(null)
                }}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                ← Back — use a different account
              </button>
            </div>
          )}

          {mode === 'login' && !mfaStep && (
            <div className="space-y-1.5">
              <Label htmlFor="auth-identifier">Phone or email</Label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="auth-identifier"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="77X XXX XXX or you@example.com"
                  className="pl-9"
                  required
                  autoComplete="username"
                  autoFocus
                />
              </div>
            </div>
          )}

          {!mfaStep && mode === 'login' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="auth-password">Password</Label>
                <button
                  type="button"
                  onClick={() => {
                    closeAuth()
                    navigate('forgot-password')
                  }}
                  className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="px-9"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
          )}

          {mode === 'login' && !mfaStep && (
            <Button type="submit" className="w-full rounded-xl" size="lg" disabled={loading}>
              {loading && <Loader2 size={15} className="mr-1.5 animate-spin" />}
              Sign in
            </Button>
          )}

          {/* Login ↔ register switch (keeps the post-auth navigation intent). */}
          <p className="text-center text-xs text-muted-foreground">
            {mode === 'login' ? (
              <>
                New to Vendora?{' '}
                <button
                  type="button"
                  onClick={() => setAuthMode('register')}
                  className="font-semibold text-primary underline-offset-2 hover:underline"
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already a member?{' '}
                <button
                  type="button"
                  onClick={() => setAuthMode('login')}
                  className="font-semibold text-primary underline-offset-2 hover:underline"
                >
                  Sign in
                </button>
              </>
            )}
          </p>

          {mode === 'register' && (
            <p className="text-center text-[11px] text-muted-foreground">
              Registering a company?{' '}
              <button
                type="button"
                onClick={() => {
                  closeAuth()
                  navigate('register-company')
                }}
                className="font-semibold text-primary underline-offset-2 hover:underline"
              >
                Merchant/Dealer signup
              </button>
              <span aria-hidden> · </span>
              <button
                type="button"
                onClick={() => {
                  closeAuth()
                  navigate('register-financier')
                }}
                className="font-semibold text-primary underline-offset-2 hover:underline"
              >
                Financial institution
              </button>
            </p>
          )}

          <Separator />

          {!mfaStep && (
            <div className="rounded-xl border border-dashed bg-muted/40 p-3 text-center">
              <p className="text-xs text-muted-foreground">
                {mode === 'login' ? 'Just exploring? Try the demo buyer:' : 'Demo buyer for quick testing:'}
              </p>
              <button
                type="button"
                onClick={useDemo}
                className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-background px-3 py-1.5 text-xs font-mono font-medium shadow-sm transition hover:bg-accent"
              >
                <AtSign size={12} className="text-primary" /> demo@vendora.com / demo1234
              </button>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}
