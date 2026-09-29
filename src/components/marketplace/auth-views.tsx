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
  KeyRound,
  Loader2,
  Lock,
  Mail,
  MailCheck,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Couldn\u2019t send the email', description: json.error, variant: 'destructive' })
        return
      }
      setSent(true)
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
      description="Enter the email you signed up with and we'll send you a link to choose a new password."
    >
      {sent ? (
        <div className="space-y-5 text-center">
          <CheckCircle2 size={40} className="mx-auto text-emerald-500" />
          <p className="text-sm leading-relaxed text-muted-foreground">
            If an account exists for <span className="font-semibold text-foreground">{email}</span>, a
            reset link is on its way. Check your inbox (and spam folder) — the link expires in 60
            minutes.
          </p>
          <Button variant="outline" className="w-full rounded-xl" onClick={() => navigate('home')}>
            <ArrowLeft size={15} className="mr-1.5" /> Back to the marketplace
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="forgot-email">Email</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="forgot-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-11 rounded-xl pl-9"
                required
                autoFocus
              />
            </div>
          </div>
          <Button type="submit" className="w-full rounded-xl" size="lg" disabled={loading}>
            {loading && <Loader2 size={15} className="mr-1.5 animate-spin" />}
            Send reset link
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    if (password !== confirm) {
      toast({ title: 'Passwords don\u2019t match', description: 'Re-enter the same password in both fields.' })
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
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

  if (!token) {
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
            Your password is updated. Sign in from the header with your new password — and check your
            inbox for the confirmation email.
          </p>
          <Button className="w-full rounded-xl" size="lg" onClick={() => navigate('home')}>
            Back to the marketplace
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
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
                autoFocus
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
          <Button type="submit" className="w-full rounded-xl" size="lg" disabled={loading}>
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
