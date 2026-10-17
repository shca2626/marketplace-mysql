'use client'

import { useState } from 'react'
import { AtSign, Building2, Gift, KeyRound, Landmark, Loader2, Mail, Ticket, User as UserIcon } from 'lucide-react'
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
import { Separator } from '@/components/ui/separator'

export function AuthModal() {
  const open = useMarketplace((s) => s.authModalOpen)
  const mode = useMarketplace((s) => s.authMode)
  const closeAuth = useMarketplace((s) => s.closeAuth)
  const setAuthMode = useMarketplace((s) => s.setAuthMode)
  const setUser = useMarketplace((s) => s.setUser)
  const navigate = useMarketplace((s) => s.navigate)
  const afterAuth = useMarketplace((s) => s.afterAuth)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  // RBAC Phase 2: staff invitations — the admin console issues a token per
  // invited email; pasting it here consumes the invitation and assigns the
  // scoped role on registration (server-side via consumeInvitation).
  const [showInvite, setShowInvite] = useState(false)
  const [inviteToken, setInviteToken] = useState('')
  // NETW-1: referral code — prefilled from ?ref= (captured on landing) or typed
  const [referralCode, setReferralCode] = useState(() => {
    if (typeof window === 'undefined') return ''
    const url = new URL(window.location.href)
    return url.searchParams.get('ref')?.toUpperCase().slice(0, 24) ?? window.localStorage.getItem('vendora:ref') ?? ''
  })
  const [showReferral, setShowReferral] = useState(() => referralCode.trim().length > 0)
  const [loading, setLoading] = useState(false)

  const finish = (user: SessionUser) => {
    setUser(user)
    closeAuth()
    toast({
      title: `Welcome${mode === 'register' ? '' : ' back'}, ${user.name.split(' ')[0]}!`,
      ...(mode === 'register'
        ? {
            description: user.emailVerifiedAt
              ? undefined
              : 'Check your inbox to verify your email (Account → Security can resend it).',
          }
        : {}),
    })
    if (afterAuth) navigate(afterAuth.view, afterAuth.params)
    setPassword('')
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
          body: JSON.stringify({ email, password }),
        })
        const json = await res.json()
        if (!res.ok) {
          toast({ title: 'Sign in failed', description: json.error, variant: 'destructive' })
          return
        }
        finish(json.user)
      } else {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Customer fast path — individuals are always BUYERs (no C2C).
          // Companies (merchants) and financiers use the dedicated wizards:
          // ?view=register-company / ?view=register-financier.
          body: JSON.stringify({
            name,
            email,
            password,
            ...(showInvite && inviteToken.trim() ? { inviteToken: inviteToken.trim() } : {}),
            ...(showReferral && referralCode.trim() ? { referralCode: referralCode.trim() } : {}),
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
    setEmail('demo@vendora.com')
    setPassword('demo1234')
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeAuth()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {mode === 'login' ? 'Welcome back' : 'Create your customer account'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'login'
              ? 'Sign in to continue shopping on Vendora.'
              : 'Shop solar gear, review products and track your orders.'}
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

              {/* NETW-1: referral code (optional, ?ref-prefilled) */}
              <div className="space-y-1.5">
                {showReferral ? (
                  <>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="auth-referral">Referral code</Label>
                      <button
                        type="button"
                        onClick={() => {
                          setShowReferral(false)
                          setReferralCode('')
                        }}
                        className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="relative">
                      <Gift className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="auth-referral"
                        value={referralCode}
                        onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                        placeholder="e.g. 7KDPWXAQ"
                        maxLength={24}
                        className="pl-9 font-mono tracking-wider"
                        autoComplete="off"
                      />
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowReferral(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-primary underline-offset-2 hover:underline"
                  >
                    <Gift size={13} /> I have a referral code
                  </button>
                )}
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="auth-email">Email</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="pl-9"
                required
              />
            </div>
          </div>

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

          <Button type="submit" className="w-full rounded-xl" size="lg" disabled={loading}>
            {loading && <Loader2 size={15} className="mr-1.5 animate-spin" />}
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </Button>

          {/* Login ↔ register switch (keeps the post-auth navigation intent) */}
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

          <Separator />

          {mode === 'register' && (
            <div className="rounded-xl border bg-muted/30 p-3">
              {/* ── Business doors — companies & financiers have dedicated wizards ── */}
              <p className="text-xs font-semibold text-foreground">Registering a business?</p>
              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                Selling on Vendora happens through registered companies — customers shop, companies sell.
              </p>
              <div className="mt-2 grid gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    closeAuth()
                    navigate('register-company')
                  }}
                  className="flex items-center gap-2 rounded-lg bg-background px-3 py-2 text-left text-xs font-medium shadow-sm transition hover:bg-accent"
                >
                  <Building2 size={14} className="shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    Merchant / Company
                    <span className="block font-normal text-muted-foreground">
                      Register a company to sell and buy in bulk
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    closeAuth()
                    navigate('register-financier')
                  }}
                  className="flex items-center gap-2 rounded-lg bg-background px-3 py-2 text-left text-xs font-medium shadow-sm transition hover:bg-accent"
                >
                  <Landmark size={14} className="shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    Financing entity
                    <span className="block font-normal text-muted-foreground">
                      Bank, MFI or e-wallet — offer financing on the platform
                    </span>
                  </span>
                </button>
              </div>
            </div>
          )}

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
        </form>
      </DialogContent>
    </Dialog>
  )
}
