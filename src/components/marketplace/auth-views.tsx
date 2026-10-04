'use client'

// ─────────────────────────────────────────────────────────────────────────────
// AUTHSEC-1 — public auth-flow views: forgot-password, reset-password,
// verify-email. All three live on the storefront shell (header + footer)
// because email links land here cold, before any session exists.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  FlaskConical,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  MailCheck,
  MessageCircle,
  Phone,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'

const fadeIn = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: 'easeOut' as const },
}

function AuthShell({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-gradient-to-br from-orange-50 via-amber-50/50 to-rose-50/40 py-16 dark:from-orange-950/20 dark:via-transparent dark:to-rose-950/10">
      <div className="mx-auto max-w-md px-4">
        <motion.div
          {...fadeIn}
          className="rounded-3xl border bg-card p-8 shadow-xl shadow-orange-900/5"
        >
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            {icon}
          </div>
          <h1 className="text-center text-2xl font-extrabold tracking-tight">{title}</h1>
          <p className="mt-2 text-center text-sm leading-relaxed text-muted-foreground">{description}</p>
          <div className="mt-7">{children}</div>
        </motion.div>
      </div>
    </div>
  )
}

/** ── Forgot password ────────────────────────────────────────────────────── */
export function ForgotPasswordView() {
  const navigate = useMarketplace((s) => s.navigate)
  const [identifier, setIdentifier] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState<null | 'email' | 'phone'>(null)

  const isPhone = !identifier.includes('@')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Couldn\u2019t send the reset', description: json.error, variant: 'destructive' })
        return
      }
      setSent(json.via === 'phone' ? 'phone' : 'email')
    } catch {
      toast({ title: 'Error', description: 'Network error — please try again', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      icon={<KeyRound size={26} />}
      title="Forgot your password?"
      description="Enter the phone number or email you signed up with — we'll send a reset code or link."
    >
      {sent === 'email' ? (
        <div className="space-y-5 text-center">
          <CheckCircle2 size={40} className="mx-auto text-emerald-500" />
          <p className="text-sm leading-relaxed text-muted-foreground">
            If an account exists for <span className="font-semibold text-foreground">{identifier}</span>, a
            reset link is on its way. Check your inbox (and spam folder) — the link expires in 60
            minutes.
          </p>
          <Button variant="outline" className="w-full rounded-xl" onClick={() => navigate('home')}>
            <ArrowLeft size={15} className="mr-1.5" /> Back to the marketplace
          </Button>
        </div>
      ) : sent === 'phone' ? (
        <div className="space-y-5 text-center">
          <CheckCircle2 size={40} className="mx-auto text-emerald-500" />
          <p className="text-sm leading-relaxed text-muted-foreground">
            If an account exists for <span className="font-semibold text-foreground">{identifier}</span>, a
            6-digit reset code was sent to its WhatsApp. It is valid for 5 minutes.
          </p>
          <Button className="w-full rounded-xl" onClick={() => navigate('reset-password', { resetVia: 'phone' })}>
            <MessageCircle size={15} className="mr-1.5" /> Enter the code now
          </Button>
          <Button variant="outline" className="w-full rounded-xl" onClick={() => navigate('home')}>
            <ArrowLeft size={15} className="mr-1.5" /> Back to the marketplace
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="forgot-identifier">Phone or email</Label>
            <div className="relative">
              {isPhone ? (
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              ) : (
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              )}
              <Input
                id="forgot-identifier"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="77X XXX XXX or you@example.com"
                className="h-11 rounded-xl pl-9"
                required
                autoFocus
              />
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              Phone → a WhatsApp code. Email → a reset link. Yemeni mobiles: 9 digits, no +967 needed.
            </p>
          </div>
          <Button type="submit" className="w-full rounded-xl" size="lg" disabled={loading}>
            {loading && <Loader2 size={15} className="mr-1.5 animate-spin" />}
            Send reset {isPhone ? 'code' : 'link'}
          </Button>
          <button
            type="button"
            onClick={() => navigate('home')}
            className="mx-auto flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft size={13} /> Back to sign in from the header
          </button>
        </form>
      )}
    </AuthShell>
  )
}

/** ── Reset password (email-link landing) ─────────────────────────────────── */
export function ResetPasswordView() {
  const params = useMarketplace((s) => s.params)
  const navigate = useMarketplace((s) => s.navigate)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const token = params.authToken ?? ''

  // ── Phase 3 phone-OTP flow state ──
  const [flow, setFlow] = useState<'link' | 'phone'>(params.resetVia === 'phone' || !token ? 'phone' : 'link')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otpToken, setOtpToken] = useState<string | null>(null)
  const [sendingOtp, setSendingOtp] = useState(false)
  const [devCode, setDevCode] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(0)
  const resendTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const phoneValid = /^(70|71|73|77|78)\d{7}$/.test(phone.replace(/\D/g, ''))

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

  const requestOtp = async () => {
    if (!phoneValid || sendingOtp) return
    setSendingOtp(true)
    try {
      const res = await fetch('/api/auth/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, purpose: 'RESET' }),
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
      toast({ title: 'Code sent', description: 'Enter the 6-digit code from WhatsApp.' })
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
        body: JSON.stringify({ phone, code: value, purpose: 'RESET' }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Verification failed', description: json.error, variant: 'destructive' })
        setOtp('')
        return
      }
      setOtpToken(json.otpToken)
      toast({ title: 'Phone verified', description: 'Choose your new password below.' })
    } catch {
      toast({ title: 'Error', description: 'Network error — please try again', variant: 'destructive' })
      setOtp('')
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    if (password !== confirm) {
      toast({ title: 'Passwords don\u2019t match', description: 'Re-enter the same password in both fields.' })
      return
    }
    if (flow === 'phone' && !otpToken) {
      toast({
        title: 'Verify your phone first',
        description: 'Request a code and enter the 6 digits we sent to your WhatsApp.',
        variant: 'destructive',
      })
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(flow === 'phone' ? { phone, otpToken, password } : { token, password }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Reset failed', description: json.error, variant: 'destructive' })
        return
      }
      setDone(true)
    } catch {
      toast({ title: 'Error', description: 'Network error — please try again', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  if (flow === 'link' && !token) {
    return (
      <AuthShell
        icon={<ShieldAlert size={26} />}
        title="Reset link missing"
        description="This page needs a valid reset link from your email. Request a fresh one below."
      >
        <Button className="w-full rounded-xl" size="lg" onClick={() => navigate('forgot-password')}>
          Request a reset link
        </Button>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      icon={<Lock size={26} />}
      title="Choose a new password"
      description="Pick something strong — at least 8 characters. Every device signed into your account will be signed out."
    >
      {done ? (
        <div className="space-y-5 text-center">
          <CheckCircle2 size={40} className="mx-auto text-emerald-500" />
          <p className="text-sm leading-relaxed text-muted-foreground">
            Your password is updated. Sign in from the header with your new password.
          </p>
          <Button className="w-full rounded-xl" size="lg" onClick={() => navigate('home')}>
            Back to the marketplace
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {/* Flow switch — phone reset is the Phase 3 default; email link stays for link landings */}
          <div className="flex rounded-xl border bg-muted/40 p-1 text-xs font-medium" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={flow === 'phone'}
              onClick={() => setFlow('phone')}
              className={`flex-1 rounded-lg px-3 py-2 transition-colors ${
                flow === 'phone' ? 'bg-background shadow-sm' : 'text-muted-foreground'
              }`}
            >
              <MessageCircle size={13} className="mr-1.5 inline" /> Via phone code
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={flow === 'link'}
              onClick={() => setFlow('link')}
              className={`flex-1 rounded-lg px-3 py-2 transition-colors ${
                flow === 'link' ? 'bg-background shadow-sm' : 'text-muted-foreground'
              }`}
            >
              <Mail size={13} className="mr-1.5 inline" /> Via email link
            </button>
          </div>

          {flow === 'phone' ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="reset-phone">Phone number</Label>
                <div className="flex gap-2">
                  <div className="flex items-center gap-1 rounded-lg border bg-muted/50 px-3 py-2 text-sm font-medium text-muted-foreground">
                    <Phone size={13} /> +967
                  </div>
                  <Input
                    id="reset-phone"
                    inputMode="numeric"
                    value={phone}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 9)
                      setPhone(digits)
                      setOtpToken(null)
                      setOtpSent(false)
                      setDevCode(null)
                    }}
                    placeholder="77X XXX XXX"
                    className="h-11 flex-1 rounded-xl tracking-wide"
                    required
                    aria-invalid={phone.length > 0 && !phoneValid}
                  />
                </div>
              </div>

              {otpSent && !otpToken && (
                <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Enter the 6-digit code</span>
                    <button
                      type="button"
                      onClick={requestOtp}
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
                  {devCode && (
                    <div className="flex justify-center">
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard?.writeText(devCode).catch(() => undefined)
                          toast({ title: 'Code copied' })
                        }}
                        className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        title="Sandbox delivery — no WhatsApp line is paired yet"
                      >
                        <FlaskConical size={11} /> {devCode}
                        <Copy size={10} />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {otpToken && (
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
                  <ShieldCheck size={13} className="mr-1 inline" />
                  +967 {phone.slice(0, 3)} {phone.slice(3, 6)} {phone.slice(6)} verified — set your new password below.
                </p>
              )}

              {!otpSent && (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full rounded-xl"
                  size="lg"
                  disabled={!phoneValid || sendingOtp}
                  onClick={requestOtp}
                >
                  {sendingOtp ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : <MessageCircle size={15} className="mr-1.5" />}
                  Send WhatsApp code
                </Button>
              )}
            </>
          ) : (
            <p className="rounded-xl border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
              Using the reset link from your email. If it has expired,{' '}
              <button
                type="button"
                onClick={() => navigate('forgot-password')}
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                request a fresh one
              </button>
              .
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="new-password">New password</Label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-11 rounded-xl pl-9"
                required
                minLength={8}
                autoFocus={flow === 'link'}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Confirm password</Label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="confirm-password"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                className="h-11 rounded-xl pl-9"
                required
                minLength={8}
              />
            </div>
          </div>
          <Button
            type="submit"
            className="w-full rounded-xl"
            size="lg"
            disabled={loading || (flow === 'phone' && !otpToken)}
          >
            {loading && <Loader2 size={15} className="mr-1.5 animate-spin" />}
            Update password
          </Button>
        </form>
      )}
    </AuthShell>
  )
}

/** ── Verify email (email-link landing — auto-confirms on mount) ──────────── */
export function VerifyEmailView() {
  const params = useMarketplace((s) => s.params)
  const navigate = useMarketplace((s) => s.navigate)
  const setUser = useMarketplace((s) => s.setUser)
  const user = useMarketplace((s) => s.user)
  const token = params.authToken ?? ''
  const [state, setState] = useState<'working' | 'ok' | 'error'>(() => (token ? 'working' : 'error'))
  const [message, setMessage] = useState(token ? '' : 'No verification token found in the link.')
  const attempted = useRef(false)

  useEffect(() => {
    if (attempted.current) return
    attempted.current = true
    if (!token) return
    void (async () => {
      try {
        const res = await fetch('/api/auth/verify-email/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        const json = await res.json()
        if (!res.ok) {
          setState('error')
          setMessage(json.error ?? 'Verification failed.')
          return
        }
        setState('ok')
        setMessage(json.message)
        // Refresh the session so the account page instantly shows the badge.
        if (user) {
          try {
            const me = await fetch('/api/auth/me', { cache: 'no-store' })
            const meJson = (await me.json()) as { user: typeof user | null }
            if (meJson.user) setUser(meJson.user)
          } catch {
            /* non-fatal */
          }
        }
      } catch {
        setState('error')
        setMessage('Network error — please try the link again.')
      }
    })()
  }, [token])

  return (
    <AuthShell
      icon={state === 'ok' ? <MailCheck size={26} /> : state === 'error' ? <ShieldAlert size={26} /> : <Mail size={26} />}
      title={state === 'ok' ? 'Email verified!' : state === 'error' ? 'Verification problem' : 'Verifying your email…'}
      description={message || 'Hang on a second while we confirm your email address.'}
    >
      <div className="space-y-4 text-center">
        {state === 'working' && <Loader2 size={36} className="mx-auto animate-spin text-primary" />}
        {state === 'ok' && <ShieldCheck size={40} className="mx-auto text-emerald-500" />}
        {state === 'error' && (
          <p className="text-sm text-muted-foreground">
            You can request a fresh link anytime from Account → Security.
          </p>
        )}
        <Button className="w-full rounded-xl" size="lg" onClick={() => navigate(state === 'ok' ? 'account' : 'home')}>
          {state === 'ok' ? 'Go to my account' : 'Back to the marketplace'}
        </Button>
      </div>
    </AuthShell>
  )
}
