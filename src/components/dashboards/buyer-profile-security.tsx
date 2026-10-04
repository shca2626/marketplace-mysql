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

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import {
  AtSign,
  BadgeCheck,
  CalendarDays,
  Check,
  Copy,
  KeyRound,
  Loader2,
  LogOut,
  MailCheck,
  MessageCircle,
  Monitor,
  MonitorSmartphone,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Smartphone,
  Tablet,
  UserCog,
  X,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { useMarketplace } from '@/store/marketplace'
import { formatDate, initials, timeAgo } from '@/lib/format'
import type { ApplicantProfileDTO, SessionUser } from '@/lib/types'
import { PageHeader } from './dashboard-layout'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface MePayload {
  user: SessionUser | null
  applicant: ApplicantProfileDTO | null
}

// ── Phase 6 (lastplan v5 6.7) — MFA + session registry payloads ────────────

interface MfaStatus {
  enrolled: boolean
  required: boolean
  backupCodesRemaining: number
}

interface SessionRow {
  id: string
  current: boolean
  userAgent: string | null
  ip: string | null
  createdAt: string
  lastUsedAt: string
  revokedAt: string | null
  revokedReason: string | null
  mfaSatisfiedAt: string | null
}

const REVOKED_REASON_LABEL: Record<string, string> = {
  REVOKED_BY_USER: 'signed out by you',
  LOGOUT: 'signed out',
  ALL_SESSIONS: 'signed out everywhere',
}

function revokedReasonLabel(reason: string | null): string {
  if (!reason) return 'revoked'
  return REVOKED_REASON_LABEL[reason] ?? reason.replaceAll('_', ' ').toLowerCase()
}

/** Friendly “browser on OS” summary parsed from the raw user-agent. */
function describeDevice(ua: string | null): {
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
} {
  if (!ua) return { label: 'Unknown device', icon: Monitor }
  let browser = 'Unknown browser'
  if (/edg\//i.test(ua)) browser = 'Edge'
  else if (/opr\/|opera/i.test(ua)) browser = 'Opera'
  else if (/firefox\//i.test(ua)) browser = 'Firefox'
  else if (/chrome\//i.test(ua)) browser = 'Chrome'
  else if (/safari\//i.test(ua)) browser = 'Safari'
  else if (/msie|trident/i.test(ua)) browser = 'Internet Explorer'
  let os = 'Unknown OS'
  if (/windows nt/i.test(ua)) os = 'Windows'
  else if (/android/i.test(ua)) os = 'Android'
  else if (/iphone|ipod/i.test(ua)) os = 'iPhone'
  else if (/ipad/i.test(ua)) os = 'iPad'
  else if (/mac os x|macintosh/i.test(ua)) os = 'macOS'
  else if (/linux/i.test(ua)) os = 'Linux'
  const mobile = /iphone|ipod|windows phone/i.test(ua) || /android.*mobile/i.test(ua)
  const tablet = /ipad/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua))
  return { label: `${browser} on ${os}`, icon: mobile ? Smartphone : tablet ? Tablet : Monitor }
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

  // ── Two-factor authentication (Phase 6 · 6.7.2/6.7.3) ───────────────────
  const mfaQ = useApi<MfaStatus>('/api/auth/mfa')
  const mfa = mfaQ.data

  // Enrollment wizard: start → scan QR / copy secret → confirm code → codes.
  const [enrollOpen, setEnrollOpen] = useState(false)
  const [enrollStep, setEnrollStep] = useState<'setup' | 'codes'>('setup')
  const [enrollSecret, setEnrollSecret] = useState<{ secret: string; otpauthUri: string } | null>(null)
  const [enrollCode, setEnrollCode] = useState('')
  const [enrollError, setEnrollError] = useState<string | null>(null)
  const [enrollBusy, setEnrollBusy] = useState(false)
  const [enrollStarting, setEnrollStarting] = useState(false)
  const [enrollCodes, setEnrollCodes] = useState<string[]>([])
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  // QR is rendered client-side from the one-time otpauthUri.
  useEffect(() => {
    if (!enrollSecret) return
    let cancelled = false
    setQrDataUrl(null)
    QRCode.toDataURL(enrollSecret.otpauthUri, { width: 220, margin: 1 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [enrollSecret])

  const resetEnrollment = (success: boolean) => {
    setEnrollStep('setup')
    setEnrollSecret(null)
    setEnrollCode('')
    setEnrollError(null)
    setEnrollCodes([])
    setQrDataUrl(null)
    if (success) {
      void mfaQ.refetch()
      toast({
        title: 'Two-factor authentication enabled',
        description: 'You will be asked for a code at your next sign-in.',
      })
    }
  }

  const startEnrollment = async () => {
    if (enrollStarting) return
    setEnrollStarting(true)
    try {
      const res = await fetch('/api/auth/mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        secret?: string
        otpauthUri?: string
        error?: string
      }
      if (!res.ok || !json.secret || !json.otpauthUri) {
        toast({
          title: 'Could not start enrollment',
          description: json.error ?? 'Please try again.',
          variant: 'destructive',
        })
        return
      }
      setEnrollSecret({ secret: json.secret, otpauthUri: json.otpauthUri })
      setEnrollCode('')
      setEnrollError(null)
      setEnrollStep('setup')
      setEnrollOpen(true)
    } catch {
      toast({ title: 'Network error', description: 'Please try again.', variant: 'destructive' })
    } finally {
      setEnrollStarting(false)
    }
  }

  const confirmEnrollment = async () => {
    if (enrollBusy || !enrollCode.trim()) return
    setEnrollBusy(true)
    setEnrollError(null)
    try {
      const res = await fetch('/api/auth/mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', code: enrollCode.trim() }),
      })
      const json = (await res.json().catch(() => ({}))) as { backupCodes?: string[]; error?: string }
      if (!res.ok || !json.backupCodes) {
        setEnrollError(json.error ?? 'That code did not match — check your authenticator and try again.')
        return
      }
      setEnrollCodes(json.backupCodes)
      setEnrollStep('codes')
    } catch {
      setEnrollError('Network error — please try again.')
    } finally {
      setEnrollBusy(false)
    }
  }

  // ── Disable / regenerate-backup-codes — both re-verify the password ──────
  const [mfaPwOpen, setMfaPwOpen] = useState<null | 'disable' | 'regenerate'>(null)
  const [mfaPwInput, setMfaPwInput] = useState('')
  const [mfaPwBusy, setMfaPwBusy] = useState(false)
  const [mfaPwError, setMfaPwError] = useState<string | null>(null)
  // After a successful regenerate the dialog swaps to the one-time codes view.
  const [mfaPwCodes, setMfaPwCodes] = useState<string[] | null>(null)

  const closePwDialog = () => {
    const showedCodes = mfaPwCodes !== null
    setMfaPwOpen(null)
    setMfaPwInput('')
    setMfaPwError(null)
    setMfaPwCodes(null)
    if (showedCodes) {
      void mfaQ.refetch()
      toast({
        title: 'New backup codes active',
        description: 'The previous codes no longer work — the new ones are shown once.',
      })
    }
  }

  const submitPasswordAction = async () => {
    if (mfaPwBusy || !mfaPwOpen || !mfaPwInput) return
    setMfaPwBusy(true)
    setMfaPwError(null)
    try {
      const res = await fetch('/api/auth/mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mfaPwOpen === 'disable'
            ? { action: 'disable', password: mfaPwInput }
            : { action: 'regenerate-backup-codes', password: mfaPwInput }
        ),
      })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; backupCodes?: string[]; error?: string }
      if (!res.ok) {
        // 403 MFA_REQUIRED_BY_POLICY (and any other refusal) surfaces verbatim
        // — there is never a UI path around the policy.
        setMfaPwError(json.error ?? 'Action failed — please try again.')
        return
      }
      if (mfaPwOpen === 'disable') {
        closePwDialog()
        toast({
          title: 'Two-factor authentication disabled',
          description: 'Your sign-in is back to password-only.',
        })
        void mfaQ.refetch()
      } else {
        setMfaPwCodes(json.backupCodes ?? [])
      }
    } catch {
      setMfaPwError('Network error — please try again.')
    } finally {
      setMfaPwBusy(false)
    }
  }

  // ── Devices & sessions (Phase 6 · 6.7.7) ────────────────────────────────
  const sessionsQ = useApi<{ sessions: SessionRow[] }>('/api/auth/sessions')
  const sessions = sessionsQ.data?.sessions ?? []
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [revokingAll, setRevokingAll] = useState(false)

  const activeSessions = sessions.filter((s) => !s.revokedAt)
  const otherActive = activeSessions.filter((s) => !s.current)

  const revokeSession = async (row: SessionRow) => {
    if (revokingId) return
    const device = describeDevice(row.userAgent).label
    const ok = confirm(
      row.current
        ? 'Sign out THIS device? You will need to sign in again to keep using your account here.'
        : `Sign out "${device}"? They will need your password (and MFA code) to sign back in.`
    )
    if (!ok) return
    setRevokingId(row.id)
    try {
      const res = await fetch('/api/auth/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast({ title: 'Action failed', description: json.error ?? 'Please try again.', variant: 'destructive' })
        return
      }
      if (row.current) {
        // Revoking the current session clears the cookie — treat as logged out.
        setUser(null)
        navigate('home')
        toast({ title: 'Signed out', description: 'This device was disconnected from your account.' })
        return
      }
      toast({ title: 'Device signed out', description: `${device} can no longer use your account.` })
      void sessionsQ.refetch()
    } catch {
      toast({ title: 'Network error', description: 'Please try again.', variant: 'destructive' })
    } finally {
      setRevokingId(null)
    }
  }

  const revokeOthers = async () => {
    if (revokingAll || otherActive.length === 0) return
    if (!confirm(`Sign out ${otherActive.length} other device${otherActive.length === 1 ? '' : 's'}? This keeps this browser signed in.`)) return
    setRevokingAll(true)
    try {
      const res = await fetch('/api/auth/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
      const json = (await res.json().catch(() => ({}))) as { revoked?: number; error?: string }
      if (!res.ok) {
        toast({ title: 'Action failed', description: json.error ?? 'Please try again.', variant: 'destructive' })
        return
      }
      toast({
        title: 'Other devices signed out',
        description: `${json.revoked ?? otherActive.length} session${(json.revoked ?? otherActive.length) === 1 ? '' : 's'} revoked — you stay signed in here.`,
      })
      void sessionsQ.refetch()
    } catch {
      toast({ title: 'Network error', description: 'Please try again.', variant: 'destructive' })
    } finally {
      setRevokingAll(false)
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

        {/* ── Two-factor authentication (Phase 6 · 6.7) ── */}
        <Card className="border-bh-border shadow-card lg:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base text-bh-navy">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-bh-bg-gold text-bh-gold-dark">
                <ShieldCheck size={16} />
              </span>
              Two-factor authentication
              {mfaQ.loading && !mfa ? (
                <Skeleton className="h-5 w-24 rounded-full" />
              ) : mfa?.enrolled ? (
                <Badge className="rounded-full bg-emerald-500 text-[11px] font-semibold text-white hover:bg-emerald-500">
                  <BadgeCheck size={11} className="mr-1" /> Enabled
                </Badge>
              ) : (
                <Badge variant="secondary" className="rounded-full bg-bh-soft-blue text-[11px] font-semibold text-bh-navy">
                  Not set up
                </Badge>
              )}
              {mfa?.required && (
                <Badge className="rounded-full border-0 bg-amber-100 text-[11px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  Required by policy
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {mfaQ.loading && !mfa ? (
              <Skeleton className="h-14 w-full rounded-xl" />
            ) : mfaQ.error ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-bh-muted">Couldn’t load your MFA status — {mfaQ.error}</p>
                <Button variant="outline" size="sm" className="rounded-xl" onClick={() => void mfaQ.refetch()}>
                  <RefreshCw size={13} className="mr-1.5" /> Try again
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="max-w-2xl space-y-1.5">
                  <p className="text-sm leading-relaxed text-bh-muted">
                    {mfa?.enrolled
                      ? 'Your sign-in is protected with a second step — a rotating 6-digit code from your authenticator app, with backup codes as a spare key.'
                      : 'Add a second step at sign-in: a rotating 6-digit code from an authenticator app (Google Authenticator, Authy, 1Password…). Even if your password leaks, nobody can sign in without your device.'}
                  </p>
                  {mfa?.enrolled ? (
                    <p className="flex items-center gap-1.5 text-xs text-bh-muted">
                      <KeyRound size={12} className="text-bh-gold-dark" />
                      <strong className="font-semibold text-bh-ink">{mfa.backupCodesRemaining}</strong>
                      {mfa.backupCodesRemaining === 1 ? 'backup code' : 'backup codes'} remaining — each works once.
                    </p>
                  ) : mfa?.required ? (
                    <p className="text-xs font-semibold leading-relaxed text-amber-700 dark:text-amber-400">
                      Your account is required to have MFA — sensitive actions stay locked until you enroll.
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {mfa?.enrolled ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        onClick={() => {
                          setMfaPwInput('')
                          setMfaPwError(null)
                          setMfaPwOpen('regenerate')
                        }}
                      >
                        <RefreshCw size={13} className="mr-1.5" /> Regenerate backup codes
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl border-destructive/40 text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          setMfaPwInput('')
                          setMfaPwError(null)
                          setMfaPwOpen('disable')
                        }}
                      >
                        <X size={13} className="mr-1.5" /> Disable
                      </Button>
                    </>
                  ) : (
                    <Button className="rounded-xl" onClick={() => void startEnrollment()} disabled={enrollStarting}>
                      {enrollStarting ? (
                        <Loader2 size={14} className="mr-1.5 animate-spin" />
                      ) : (
                        <Plus size={14} className="mr-1.5" />
                      )}
                      Enable two-factor authentication
                    </Button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Devices & sessions (Phase 6 · 6.7.7) ── */}
        <Card className="border-bh-border shadow-card lg:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-bh-navy">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-bh-bg-gold text-bh-gold-dark">
                <MonitorSmartphone size={16} />
              </span>
              Devices &amp; sessions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-2xl text-xs leading-relaxed text-bh-muted">
                Every place your account is signed in. See something you don’t recognize? Sign that
                device out — it takes effect immediately.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-lg px-2.5 text-xs"
                  onClick={() => void sessionsQ.refetch()}
                  disabled={sessionsQ.loading}
                >
                  <RefreshCw size={13} className={cn('mr-1.5', sessionsQ.loading && 'animate-spin')} />
                  Refresh
                </Button>
                {otherActive.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => void revokeOthers()}
                    disabled={revokingAll}
                  >
                    {revokingAll ? (
                      <Loader2 size={13} className="mr-1.5 animate-spin" />
                    ) : (
                      <LogOut size={13} className="mr-1.5" />
                    )}
                    Sign out other devices ({otherActive.length})
                  </Button>
                )}
              </div>
            </div>

            {sessionsQ.loading && !sessionsQ.data ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : sessionsQ.error ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
                <p className="text-sm text-bh-muted">Couldn’t load your sessions — {sessionsQ.error}</p>
                <Button variant="outline" size="sm" className="rounded-xl" onClick={() => void sessionsQ.refetch()}>
                  <RefreshCw size={13} className="mr-1.5" /> Try again
                </Button>
              </div>
            ) : sessions.length === 0 ? (
              <p className="rounded-xl border border-dashed px-4 py-6 text-center text-xs text-bh-muted">
                No sessions on record yet — they appear as you sign in.
              </p>
            ) : (
              <ul className="space-y-2">
                {sessions.map((s) => {
                  const device = describeDevice(s.userAgent)
                  const DeviceIcon = device.icon
                  const revoked = !!s.revokedAt
                  return (
                    <li
                      key={s.id}
                      className={cn(
                        'flex flex-wrap items-center gap-3 rounded-xl border border-bh-border bg-bh-soft-blue/60 px-4 py-3',
                        revoked && 'opacity-60'
                      )}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-bh-gold-dark shadow-sm">
                        <DeviceIcon size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-bh-ink">{device.label}</p>
                          {s.current && !revoked && (
                            <Badge className="rounded-full border-0 bg-bh-gold-pale text-[10px] font-bold text-bh-gold-dark">
                              This device
                            </Badge>
                          )}
                          {revoked && (
                            <Badge variant="secondary" className="rounded-full text-[10px]">
                              Signed out
                            </Badge>
                          )}
                          {s.mfaSatisfiedAt && !revoked && (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400"
                              title={`MFA verified on this session (${formatDate(s.mfaSatisfiedAt)})`}
                            >
                              <ShieldCheck size={11} /> MFA verified
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-bh-muted">
                          <span>IP {s.ip ?? 'unknown'}</span>
                          <span aria-hidden>·</span>
                          <span title={new Date(s.lastUsedAt).toLocaleString()}>
                            {revoked ? `Last used ${timeAgo(s.lastUsedAt)}` : `Active ${timeAgo(s.lastUsedAt)}`}
                          </span>
                          <span aria-hidden>·</span>
                          <span>Signed in {formatDate(s.createdAt)}</span>
                          {revoked && (
                            <>
                              <span aria-hidden>·</span>
                              <span className="italic">{revokedReasonLabel(s.revokedReason)}</span>
                            </>
                          )}
                        </p>
                      </div>
                      {!revoked && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 rounded-lg px-2.5 text-[11px] text-destructive hover:bg-destructive/10"
                          onClick={() => void revokeSession(s)}
                          disabled={revokingId === s.id}
                          aria-label={`Sign out ${device.label}${s.current ? ' (this device)' : ''}`}
                        >
                          {revokingId === s.id ? (
                            <Loader2 size={13} className="mr-1 animate-spin" />
                          ) : (
                            <LogOut size={13} className="mr-1" />
                          )}
                          Sign out
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── MFA enrollment wizard (QR → code → backup codes) ── */}
      <Dialog
        open={enrollOpen}
        onOpenChange={(o) => {
          if (o) return
          // Closing at the codes step means enrollment completed — the codes
          // are gone from the server; warn + refresh so the card reflects it.
          if (enrollStep === 'codes') {
            toast({
              title: 'Backup codes hidden',
              description: 'Lost them? Regenerate new ones from this card (requires your password).',
            })
            resetEnrollment(true)
            return
          }
          resetEnrollment(false)
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
          {enrollStep === 'setup' ? (
            <>
              <DialogHeader>
                <DialogTitle>Enable two-factor authentication</DialogTitle>
                <DialogDescription>
                  Scan the QR code with your authenticator app, then enter the 6-digit code it
                  shows to confirm.
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-center rounded-xl border border-bh-border bg-white p-3 dark:bg-white">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="QR code — scan it with your authenticator app"
                    className="h-44 w-44"
                    width={176}
                    height={176}
                  />
                ) : (
                  <Skeleton className="h-44 w-44" />
                )}
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">
                  Can’t scan? Enter this setup key manually in your app:
                </p>
                <div className="flex items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2.5">
                  <code className="min-w-0 flex-1 select-all break-all font-mono text-sm tracking-wider">
                    {enrollSecret
                      ? enrollSecret.secret.replace(/(.{4})/g, '$1 ').trim()
                      : '—'}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 rounded-lg"
                    onClick={async () => {
                      if (!enrollSecret) return
                      try {
                        await navigator.clipboard.writeText(enrollSecret.secret)
                        toast({ title: 'Setup key copied' })
                      } catch {
                        toast({
                          title: 'Could not copy',
                          description: 'Select the key text manually.',
                          variant: 'destructive',
                        })
                      }
                    }}
                    aria-label="Copy the manual setup key"
                  >
                    <Copy size={13} />
                  </Button>
                </div>
              </div>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  void confirmEnrollment()
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="mfa-confirm-code">Verification code</Label>
                  <Input
                    id="mfa-confirm-code"
                    value={enrollCode}
                    onChange={(e) => {
                      setEnrollCode(e.target.value)
                      setEnrollError(null)
                    }}
                    maxLength={10}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    disabled={enrollBusy}
                    className="text-center font-mono text-base tracking-[0.3em]"
                    placeholder="••••••"
                    aria-invalid={!!enrollError}
                    aria-describedby={enrollError ? 'mfa-confirm-error' : 'mfa-confirm-hint'}
                  />
                  {enrollError ? (
                    <p
                      id="mfa-confirm-error"
                      role="alert"
                      className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive"
                    >
                      {enrollError}
                    </p>
                  ) : (
                    <p id="mfa-confirm-hint" className="text-[11px] leading-snug text-muted-foreground">
                      Enter the 6-digit code your app shows right now.
                    </p>
                  )}
                </div>
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => {
                      setEnrollOpen(false)
                      resetEnrollment(false)
                    }}
                    disabled={enrollBusy}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className="rounded-xl" disabled={enrollBusy || !enrollCode.trim()}>
                    {enrollBusy ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : <ShieldCheck size={15} className="mr-1.5" />}
                    Verify &amp; enable
                  </Button>
                </DialogFooter>
              </form>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <BadgeCheck size={18} className="text-emerald-600 dark:text-emerald-400" />
                  Two-factor is on
                </DialogTitle>
                <DialogDescription>
                  Save your backup codes now — this is the only time they are shown.
                </DialogDescription>
              </DialogHeader>
              <BackupCodesView codes={enrollCodes} />
              <Button className="w-full rounded-xl" onClick={() => resetEnrollment(true)}>
                <Check size={15} className="mr-1.5" /> I saved these codes
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Disable / regenerate backup codes (password re-verification) ── */}
      <Dialog open={mfaPwOpen !== null} onOpenChange={(o) => !o && closePwDialog()}>
        <DialogContent className="sm:max-w-sm">
          {mfaPwCodes ? (
            <>
              <DialogHeader>
                <DialogTitle>New backup codes</DialogTitle>
                <DialogDescription>
                  Your old codes no longer work. Save these — this is the only time they are shown.
                </DialogDescription>
              </DialogHeader>
              <BackupCodesView codes={mfaPwCodes} />
              <Button className="w-full rounded-xl" onClick={closePwDialog}>
                <Check size={15} className="mr-1.5" /> I saved these codes
              </Button>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>
                  {mfaPwOpen === 'disable' ? 'Disable two-factor authentication?' : 'Regenerate backup codes'}
                </DialogTitle>
                <DialogDescription>
                  {mfaPwOpen === 'disable'
                    ? 'Enter your password to confirm. Your sign-in goes back to password-only — less protection for this account.'
                    : 'Enter your password to confirm. Your current backup codes stop working immediately.'}
                </DialogDescription>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  void submitPasswordAction()
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="mfa-pw">Password</Label>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="mfa-pw"
                      type="password"
                      value={mfaPwInput}
                      onChange={(e) => {
                        setMfaPwInput(e.target.value)
                        setMfaPwError(null)
                      }}
                      disabled={mfaPwBusy}
                      required
                      minLength={6}
                      autoComplete="current-password"
                      className="rounded-xl pl-9"
                      placeholder="••••••••"
                      aria-invalid={!!mfaPwError}
                      aria-describedby={mfaPwError ? 'mfa-pw-error' : undefined}
                    />
                  </div>
                  {mfaPwError && (
                    <p
                      id="mfa-pw-error"
                      role="alert"
                      className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive"
                    >
                      {mfaPwError}
                    </p>
                  )}
                </div>
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button type="button" variant="outline" className="rounded-xl" onClick={closePwDialog} disabled={mfaPwBusy}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant={mfaPwOpen === 'disable' ? 'destructive' : 'default'}
                    className="rounded-xl"
                    disabled={mfaPwBusy || !mfaPwInput}
                  >
                    {mfaPwBusy ? (
                      <Loader2 size={15} className="mr-1.5 animate-spin" />
                    ) : mfaPwOpen === 'disable' ? (
                      <X size={15} className="mr-1.5" />
                    ) : (
                      <RefreshCw size={15} className="mr-1.5" />
                    )}
                    {mfaPwOpen === 'disable' ? 'Disable MFA' : 'Regenerate'}
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

// ── One-time backup codes display (shared by enrollment + regenerate) ───────

function BackupCodesView({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false)
  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'))
      setCopied(true)
      toast({ title: 'Backup codes copied', description: 'Store them somewhere safe — each works once.' })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast({
        title: 'Could not copy',
        description: 'Select the codes manually and copy them.',
        variant: 'destructive',
      })
    }
  }
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
        <strong className="font-semibold">One-time display.</strong> Save these somewhere safe (password
        manager or printed). Each code works once if you lose access to your authenticator app.
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {codes.map((c) => (
          <code
            key={c}
            className="select-all rounded-lg border border-bh-border bg-bh-soft-blue/70 px-3 py-2 text-center font-mono text-sm font-semibold tracking-wider text-bh-ink"
          >
            {c}
          </code>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" className="w-full rounded-lg" onClick={() => void copyAll()}>
        {copied ? <Check size={13} className="mr-1.5 text-emerald-600" /> : <Copy size={13} className="mr-1.5" />}
        {copied ? 'Copied' : 'Copy all codes'}
      </Button>
    </div>
  )
}
