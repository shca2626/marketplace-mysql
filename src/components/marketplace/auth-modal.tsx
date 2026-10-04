'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AtSign,
  BadgeCheck,
  KeyRound,
  Loader2,
  Mail,
  MessageCircle,
  Phone,
  ShieldCheck,
  Smartphone,
  Store,
  Tag,
  Ticket,
  User as UserIcon,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'
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
import { Separator } from '@/components/ui/separator'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'

/**
 * PHASE 3 — phone-first auth modal.
 *   Login:    phone OR email + password (identifier auto-detected)
 *   Register: customer fast path — Yemeni mobile + WhatsApp OTP + password;
 *             email is OPTIONAL (receipts/recovery only).
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

  // ── shared fields ──
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<'BUYER' | 'SELLER'>('BUYER')
  const [storeName, setStoreName] = useState('')
  const [loading, setLoading] = useState(false)

  // ── login: phone-or-email identifier ──
  const [identifier, setIdentifier] = useState('')

  // ── login: Phase 6 MFA challenge (6.7.9) ──
  // A password-only login on an MFA-enrolled account returns 401 with
  // { mfaRequired: true } and NO session — the form swaps to a code step and
  // resubmits { identifier, password, code } (TOTP or XXXX-XXXX backup code).
  const [mfaStep, setMfaStep] = useState(false)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaError, setMfaError] = useState<string | null>(null)

  // ── register: phone + OTP flow ──
  const [phone, setPhone] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otp, setOtp] = useState('')
  const [otpToken, setOtpToken] = useState<string | null>(null)
  const [sendingOtp, setSendingOtp] = useState(false)
  const [resendIn, setResendIn] = useState(0)

  // ── register: optional email ──
  const [showEmail, setShowEmail] = useState(false)
  const [email, setEmail] = useState('')

  // RBAC Phase 2: staff invitations — the admin console issues a token per
  // invited email; pasting it here consumes the invitation and assigns the
  // scoped role on registration (server-side via consumeInvitation).
  const [showInvite, setShowInvite] = useState(false)
  const [inviteToken, setInviteToken] = useState('')

  const phoneValid = useMemo(() => PHONE_LOCAL_RE.test(phone.replace(/\D/g, '')), [phone])
  const otpVerified = Boolean(otpToken)
  const resendTimer = useRef<ReturnType<typeof setInterval> | null>(null)

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
    setResendIn(0)
    setMfaStep(false)
    setMfaCode('')
    setMfaError(null)
  }, [mode])

  const finish = (user: SessionUser) => {
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
    if (afterAuth) navigate(afterAuth.view, afterAuth.params)
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
      setResendIn(json.resendAfterSec ?? 60)
      toast({
        title: isResend ? 'New code sent' : 'Code sent to your WhatsApp',
        description: 'The 6-digit code is valid for 5 minutes.',
      })
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
      toast({ title: 'Phone verified', description: 'Finish creating your account below.' })
    } catch {
      toast({ title: 'Error', description: 'Network error — please try again', variant: 'destructive' })
      setOtp('')
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    try {
      if (mode === 'login') {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Only the code rides along once the MFA step is active — the
          // identifier/password stay in state and are never re-displayed.
          body: JSON.stringify(
            mfaStep ? { identifier, password, code: mfaCode.trim() } : { identifier, password }
          ),
        })
        const json = await res.json()
        if (!res.ok) {
          if (json.mfaRequired) {
            // Swap to (or stay on) the two-factor step. First entry (password
            // only) keeps the friendly hint; a rejected code shows the error.
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
        if (!otpVerified) {
          toast({
            title: 'Verify your phone first',
            description: 'Request a code and enter the 6 digits we sent to your WhatsApp.',
            variant: 'destructive',
          })
          return
        }
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

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeAuth()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {mode === 'login' ? (mfaStep ? 'Two-factor verification' : 'Welcome back') : 'Create your account'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'login'
              ? mfaStep
                ? 'Enter the code from your authenticator app to finish signing in.'
                : 'Sign in with your phone number or email.'
              : 'Join the marketplace — buy, review and sell. It takes about a minute.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {mode === 'register' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="auth-name">Full name</Label>
                <div className="relative">
                  <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="auth-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Doe"
                    className="pl-9"
                    required
                    minLength={2}
                  />
                </div>
              </div>

              {/* ── Phone + WhatsApp OTP (Phase 3) ── */}
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
                    }}
                    placeholder="77X XXX XXX"
                    className="flex-1 tracking-wide"
                    required
                    aria-invalid={phone.length > 0 && !phoneValid}
                    aria-describedby="auth-phone-hint"
                  />
                </div>
                <p id="auth-phone-hint" className="text-[11px] leading-snug text-muted-foreground">
                  A Yemeni mobile number (70, 71, 73, 77 or 78). We verify it with a WhatsApp code —
                  the +967 prefix is already included.
                </p>
              </div>

              {otpSent && !otpVerified && (
                <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <MessageCircle size={14} className="text-primary" />
                    Enter the 6-digit code
                  </div>
                  <div className="flex justify-center py-1">
                    <InputOTP maxLength={6} value={otp} onChange={verifyOtp} autoFocus>
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
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Sent to +967 {phone.slice(0, 3)} {phone.slice(3, 6)} {phone.slice(6)}</span>
                    <button
                      type="button"
                      onClick={() => requestOtp(true)}
                      disabled={resendIn > 0 || sendingOtp}
                      className="font-medium text-primary underline-offset-2 hover:underline disabled:text-muted-foreground disabled:no-underline"
                    >
                      {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
                    </button>
                  </div>
                </div>
              )}

              {otpVerified && (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
                  <BadgeCheck size={16} />
                  +967 {phone.slice(0, 3)} {phone.slice(3, 6)} {phone.slice(6)} verified
                </div>
              )}

              <div className="space-y-1.5">
                <Label>I want to…</Label>
                <RadioGroup
                  value={role}
                  onValueChange={(v) => setRole(v as 'BUYER' | 'SELLER')}
                  className="grid grid-cols-2 gap-2"
                >
                  <Label
                    htmlFor="role-buyer"
                    className="flex cursor-pointer items-center gap-2 rounded-xl border-2 p-3 transition-colors has-[[data-state=checked]]:border-primary"
                  >
                    <RadioGroupItem value="BUYER" id="role-buyer" />
                    <Tag size={15} className="text-muted-foreground" />
                    <span className="text-sm font-medium">Shop</span>
                  </Label>
                  <Label
                    htmlFor="role-seller"
                    className="flex cursor-pointer items-center gap-2 rounded-xl border-2 p-3 transition-colors has-[[data-state=checked]]:border-primary"
                  >
                    <RadioGroupItem value="SELLER" id="role-seller" />
                    <Store size={15} className="text-muted-foreground" />
                    <span className="text-sm font-medium">Sell</span>
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
                      placeholder="e.g. Willow & Pine"
                      className="pl-9"
                    />
                  </div>
                </div>
              )}

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
                      placeholder="you@example.com"
                      className="pl-9"
                    />
                  </div>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    For order receipts and account recovery — your phone stays the way you sign in.
                  </p>
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

              <div className="space-y-1.5">
                {showInvite ? (
                  <>
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
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      Invited by the Vendora team or your organization? Paste the code from the
                      invitation — your scoped staff role is assigned automatically.
                    </p>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowInvite(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-primary underline-offset-2 hover:underline"
                  >
                    <Ticket size={13} /> I have an invitation code
                  </button>
                )}
              </div>
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
                  // 6-digit TOTP or an XXXX-XXXX backup code — both fit.
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
                    Enter the 6-digit code from your authenticator app — or use a backup code
                    instead (they look like XXXX-XXXX, same field).
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
                />
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Example: 777555888 (Yemeni mobile) or your full email address.
              </p>
            </div>
          )}

          {!mfaStep && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="auth-password">Password</Label>
              {mode === 'login' && (
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
              )}
            </div>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="pl-9"
                required
                minLength={6}
              />
            </div>
          </div>
          )}

          {mode === 'register' && !otpVerified && (
            <Button
              type="button"
              variant="secondary"
              className="w-full rounded-xl"
              size="lg"
              disabled={!phoneValid || sendingOtp || otpSent}
              onClick={() => requestOtp()}
            >
              {sendingOtp ? (
                <Loader2 size={15} className="mr-1.5 animate-spin" />
              ) : (
                <MessageCircle size={15} className="mr-1.5" />
              )}
              {otpSent ? 'Code sent — enter it above' : 'Send WhatsApp code'}
            </Button>
          )}

          <Button
            type="submit"
            className="w-full rounded-xl"
            size="lg"
            disabled={loading || (mode === 'register' && !otpVerified)}
          >
            {loading && <Loader2 size={15} className="mr-1.5 animate-spin" />}
            {mode === 'login' ? (mfaStep ? 'Verify & sign in' : 'Sign in') : 'Create account'}
          </Button>

          {mode === 'register' && (
            <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
              <ShieldCheck size={12} /> Your number is only used for verification and order updates.
            </p>
          )}

          {/* Login ↔ register switch (keeps the post-auth navigation intent).
              The [mode] effect above resets the MFA step so it never leaks
              into the register form. */}
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
            <p className="space-y-1 text-center text-[11px] leading-relaxed text-muted-foreground">
              <span className="block">Registering a company?</span>
              <span className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
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
                <span aria-hidden>·</span>
                <span>Financial institution?</span>
                <button
                  type="button"
                  onClick={() => {
                    closeAuth()
                    navigate('register-financier')
                  }}
                  className="font-semibold text-primary underline-offset-2 hover:underline"
                >
                  Financier application
                </button>
              </span>
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
