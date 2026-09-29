'use client'

import { useState } from 'react'
import { AtSign, KeyRound, Loader2, Mail, Store, Tag, User as UserIcon } from 'lucide-react'
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
  const [role, setRole] = useState<'BUYER' | 'SELLER'>('BUYER')
  const [storeName, setStoreName] = useState('')
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
          body: JSON.stringify({ name, email, password, role, storeName: storeName || undefined }),
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
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'login'
              ? 'Sign in to continue shopping on Vendora.'
              : 'Join the marketplace — buy, review and sell.'}
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
