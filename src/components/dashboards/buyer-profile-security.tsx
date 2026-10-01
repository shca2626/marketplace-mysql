'use client'

// ─────────────────────────────────────────────────────────────────────────────
// BUYER · PROFILE & SECURITY PANEL (BUY-211 / §12.1 / IA-100)
// The account console's dedicated settings tab (?view=account&tab=profile):
//   • editable identity — name + phone + WhatsApp (PATCH /api/auth/me),
//   • password change from inside the app (POST /api/auth/change-password —
//     proves the current password, bumps the session epoch, keeps this
//     browser signed in while every other device signs out),
//   • email + verification status (+ resend link) and global sign-out.
// Style: bh tokens — white cards (shadow-card), gold icon tiles, soft-blue
// rows, navy headings; identical visual language to the account overview.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import {
  AtSign,
  BadgeCheck,
  CalendarDays,
  KeyRound,
  Loader2,
  LogOut,
  MailCheck,
  MessageCircle,
  Pencil,
  Phone,
  RefreshCw,
  Save,
  ShieldCheck,
  UserCog,
  X,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { useMarketplace } from '@/store/marketplace'
import { formatDate, initials } from '@/lib/format'
import type { ApplicantProfileDTO, SessionUser } from '@/lib/types'
import { PageHeader } from './dashboard-layout'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

interface MePayload {
  user: SessionUser | null
  applicant: ApplicantProfileDTO | null
}

const PHONE_HINT = '6–20 digits, optional leading +'

export function ProfileSecurityPanel() {
  const user = useMarketplace((s) => s.user)
  const navigate = useMarketplace((s) => s.navigate)
  const setUser = useMarketplace((s) => s.setUser)
  const { data: meData, setData: setMeData } = useApi<MePayload>('/api/auth/me')

  // ── Identity form (name / phone / WhatsApp) ──────────────────────────────
  const [editing, setEditing] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', whatsappNumber: '' })

  const applicant = meData?.applicant ?? null

  const startEditing = () => {
    setForm({
      name: user?.name ?? '',
      phone: applicant?.phone ?? '',
      whatsappNumber: applicant?.whatsappNumber ?? '',
    })
    setEditing(true)
  }

  const saveProfile = async () => {
    if (!user || savingProfile) return
    const name = form.name.trim()
    if (name.length < 2) {
      toast({ title: 'Name is too short', description: 'Use at least 2 characters.', variant: 'destructive' })
      return
    }
    if (name.length > 100) {
      toast({ title: 'Name is too long', description: 'Up to 100 characters.', variant: 'destructive' })
      return
    }
    setSavingProfile(true)
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone: form.phone.trim() || null,
          whatsappNumber: form.whatsappNumber.trim() || null,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as MePayload & { error?: string }
      if (!res.ok) {
        toast({ title: 'Could not save your details', description: json.error ?? 'Please try again.', variant: 'destructive' })
        return
      }
      // Store + cached /me payload stay in sync — the header, topbar and
      // wizard all show the new values immediately.
      if (json.user) setUser(json.user)
      setMeData({ user: json.user ?? user, applicant: json.applicant ?? null })
      setEditing(false)
      toast({ title: 'Profile updated', description: 'Your contact details were saved.' })
    } catch {
      toast({ title: 'Network error', description: 'Please try again.', variant: 'destructive' })
    } finally {
      setSavingProfile(false)
    }
  }

  // ── Password change ──────────────────────────────────────────────────────
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [pwError, setPwError] = useState<string | null>(null)
  const [savingPw, setSavingPw] = useState(false)

  const changePassword = async () => {
    if (savingPw) return
    setPwError(null)
    if (!pwForm.current) {
      setPwError('Enter your current password first.')
      return
    }
    if (pwForm.next.length < 8) {
      setPwError('The new password must be at least 8 characters.')
      return
    }
    if (pwForm.next.length > 100) {
      setPwError('The new password must be at most 100 characters.')
      return
    }
    if (pwForm.next !== pwForm.confirm) {
      setPwError('The two new-password fields do not match.')
      return
    }
    setSavingPw(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.next }),
      })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string }
      if (!res.ok) {
        setPwError(json.error ?? 'Could not change your password — please try again.')
        return
      }
      setPwForm({ current: '', next: '', confirm: '' })
      toast({
        title: 'Password updated',
        description: json.message ?? 'Other devices were signed out; you stay signed in here.',
      })
    } catch {
      setPwError('Network error — please try again.')
    } finally {
      setSavingPw(false)
    }
  }

  // ── Email verification + global sign-out ─────────────────────────────────
  const [sendingVerify, setSendingVerify] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  const resendVerification = async () => {
    if (sendingVerify) return
    setSendingVerify(true)
    try {
      const res = await fetch('/api/auth/verify-email/request', { method: 'POST' })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast({ title: 'Couldn\u2019t send the email', description: json.error, variant: 'destructive' })
        return
      }
      toast({
        title: 'Verification email sent',
        description: 'Check your inbox (and spam folder) — the link is valid for 48 hours.',
      })
    } catch {
      toast({ title: 'Error', description: 'Network error — please try again', variant: 'destructive' })
    } finally {
      setSendingVerify(false)
    }
  }

  const signOutEverywhere = async () => {
    if (signingOut) return
    setSigningOut(true)
    try {
      const res = await fetch('/api/auth/sign-out-everywhere', { method: 'POST' })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast({ title: 'Action failed', description: json.error, variant: 'destructive' })
        return
      }
      setUser(null)
      navigate('home')
      toast({
        title: 'Signed out everywhere',
        description: 'All devices were disconnected from your account.',
      })
    } catch {
      toast({ title: 'Error', description: 'Network error — please try again', variant: 'destructive' })
    } finally {
      setSigningOut(false)
    }
  }

  if (!user) return null

  const detailRows: { icon: typeof AtSign; label: string; value: string | null }[] = [
    { icon: AtSign, label: 'Email', value: user.email },
    { icon: Phone, label: 'Phone', value: applicant?.phone ?? null },
    { icon: MessageCircle, label: 'WhatsApp', value: applicant?.whatsappNumber ?? null },
  ]

  return (
    <>
      <PageHeader
        icon={UserCog}
        title="Profile & Security"
        description="Your identity, contact details and sign-in security — editable in one place."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ── Account details ── */}
        <Card className="border-bh-border shadow-card lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-bh-navy">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-bh-bg-gold text-bh-gold-dark">
                <BadgeCheck size={16} />
              </span>
              Account details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap items-center gap-5">
              <Avatar className="h-16 w-16 border-2 border-bh-border">
                <AvatarFallback className="bg-bh-soft-blue text-lg font-bold text-bh-navy">
                  {initials(user.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold text-bh-ink">{user.name}</h2>
                  <Badge variant="secondary" className="rounded-full bg-bh-soft-blue text-bh-navy">
                    {user.role === 'SELLER' ? 'Seller' : user.role === 'ADMIN' ? 'Admin' : 'Buyer'}
                  </Badge>
                </div>
                {user.createdAt && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-bh-muted">
                    <CalendarDays size={12} /> Member since {formatDate(user.createdAt)}
                  </p>
                )}
              </div>
              {!editing && (
                <Button size="sm" variant="outline" className="rounded-xl" onClick={startEditing}>
                  <Pencil size={13} className="mr-1.5" /> Edit details
                </Button>
              )}
            </div>

            {editing ? (
              <div className="space-y-4 rounded-xl border border-dashed border-bh-gold/50 bg-bh-gold-pale/60 p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="pf-name">Full name</Label>
                    <Input
                      id="pf-name"
                      className="rounded-xl"
                      value={form.name}
                      maxLength={100}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. Ahmed Al-Sabri"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pf-phone">Phone</Label>
                    <Input
                      id="pf-phone"
                      className="rounded-xl"
                      value={form.phone}
                      inputMode="tel"
                      placeholder="e.g. +967 77 123 4567"
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    />
                    <p className="text-[11px] text-bh-muted">{PHONE_HINT} · used for financing applications</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pf-whatsapp">WhatsApp number</Label>
                    <Input
                      id="pf-whatsapp"
                      className="rounded-xl"
                      value={form.whatsappNumber}
                      inputMode="tel"
                      placeholder="e.g. +967 77 123 4567"
                      onChange={(e) => setForm((f) => ({ ...f, whatsappNumber: e.target.value }))}
                    />
                    <p className="text-[11px] text-bh-muted">{PHONE_HINT} · optional</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-bh-muted">
                    Your email is your sign-in identity — it can&apos;t be changed here.
                  </p>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" className="rounded-xl" onClick={() => setEditing(false)} disabled={savingProfile}>
                      <X size={13} className="mr-1.5" /> Cancel
                    </Button>
                    <Button size="sm" className="rounded-xl" onClick={() => void saveProfile()} disabled={savingProfile}>
                      {savingProfile ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Save size={13} className="mr-1.5" />}
                      Save changes
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-bh-border overflow-hidden rounded-xl border border-bh-border">
                {detailRows.map((row) => (
                  <li key={row.label} className="flex items-center gap-3 bg-bh-soft-blue/60 px-4 py-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-bh-gold-dark shadow-sm">
                      <row.icon size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-bh-muted">{row.label}</p>
                      <p className="truncate text-sm font-semibold text-bh-ink">{row.value ?? '—'}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* ── Email & sessions ── */}
        <Card className="border-bh-border shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-bh-navy">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-bh-bg-gold text-bh-gold-dark">
                <ShieldCheck size={16} />
              </span>
              Email & sessions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-bh-muted">Email verification</span>
                {user.emailVerifiedAt ? (
                  <Badge className="rounded-full bg-emerald-500 text-[11px] font-semibold text-white hover:bg-emerald-500">
                    <MailCheck size={11} className="mr-1" /> Verified
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="rounded-full text-[11px]">
                    Not verified
                  </Badge>
                )}
              </div>
              {!user.emailVerifiedAt && (
                <div className="space-y-2 rounded-xl bg-bh-soft-blue/70 p-3">
                  <p className="text-xs leading-relaxed text-bh-muted">
                    Verify your email to secure account recovery and order notifications.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full rounded-lg"
                    disabled={sendingVerify}
                    onClick={() => void resendVerification()}
                  >
                    {sendingVerify ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <MailCheck size={13} className="mr-1.5" />}
                    Resend verification email
                  </Button>
                </div>
              )}
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-2">
              <span className="text-bh-muted">Session</span>
              <Badge className="rounded-full bg-emerald-500 text-xs hover:bg-emerald-500">Active</Badge>
            </div>
            <Separator />
            <p className="text-xs leading-relaxed text-bh-muted">
              Signing out everywhere disconnects every device — including this one — by invalidating all
              active sessions.
            </p>
            <Button
              size="sm"
              variant="destructive"
              className="w-full rounded-lg"
              disabled={signingOut}
              onClick={() => void signOutEverywhere()}
            >
              {signingOut ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <LogOut size={13} className="mr-1.5" />}
              Sign out of all devices
            </Button>
          </CardContent>
        </Card>

        {/* ── Change password ── */}
        <Card className="border-bh-border shadow-card lg:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-bh-navy">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-bh-bg-gold text-bh-gold-dark">
                <KeyRound size={16} />
              </span>
              Change password
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="pw-current">Current password</Label>
                <Input
                  id="pw-current"
                  type="password"
                  autoComplete="current-password"
                  className="rounded-xl"
                  value={pwForm.current}
                  onChange={(e) => setPwForm((f) => ({ ...f, current: e.target.value }))}
                  placeholder="••••••••"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pw-next">New password</Label>
                <Input
                  id="pw-next"
                  type="password"
                  autoComplete="new-password"
                  className="rounded-xl"
                  value={pwForm.next}
                  onChange={(e) => setPwForm((f) => ({ ...f, next: e.target.value }))}
                  placeholder="At least 8 characters"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pw-confirm">Repeat new password</Label>
                <Input
                  id="pw-confirm"
                  type="password"
                  autoComplete="new-password"
                  className="rounded-xl"
                  value={pwForm.confirm}
                  onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))}
                  placeholder="Once more"
                />
              </div>
            </div>
            {pwError && (
              <p role="alert" className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">
                {pwError}
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-1.5 text-xs text-bh-muted">
                <RefreshCw size={12} className="text-bh-gold-dark" />
                Changing your password signs out every other device — this browser stays signed in.
              </p>
              <Button className="rounded-xl" onClick={() => void changePassword()} disabled={savingPw}>
                {savingPw ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <KeyRound size={14} className="mr-1.5" />}
                Update password
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
