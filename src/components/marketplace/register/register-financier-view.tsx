'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FINANCIER APPLICATION DOOR — ?view=register-financier (Phase 3).
//
// Application-only, admin-approved: NO instant self-serve financier account
// capabilities. Submitting creates (or uses) the contact's user account, a
// BANK/MFI/EWALLET Organization with status PENDING_VERIFICATION (+ the
// FinancierProfile facts that map cleanly) and an OWNER membership — but the
// institution stays invisible to the marketplace (services public only when
// the org is ACTIVE) until the Vendora team verifies it.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Clock,
  Landmark,
  Loader2,
  LogOut,
  Plus,
  Send,
  ShieldCheck,
  Wallet,
  X,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'
import type { SessionUser } from '@/lib/types'
import { apiRequest } from '@/components/marketplace/financing/financing-shared'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { GovernorateSelect, PasswordInput, PhoneOtpField, RadioCard, RegisterDoorShell, TermsCheckbox } from './shared'

const SERVICE_PRESETS = [
  'Working capital',
  'Invoice financing',
  'Purchase-order financing',
  'Equipment leasing',
  'Murabaha retail',
  'Islamic bonds (Sukuk)',
  'Microenterprise loans',
  'Agriculture financing',
] as const

type FinOrgType = 'BANK' | 'MFI' | 'EWALLET'

const ORG_TYPE_CARDS: { value: FinOrgType; title: string; description: string; icon: React.ReactNode }[] = [
  { value: 'BANK', title: 'Bank', description: 'Licensed commercial or Islamic bank', icon: <Landmark size={18} /> },
  { value: 'MFI', title: 'Microfinance institution', description: 'MFI licensed to lend', icon: <Building2 size={18} /> },
  { value: 'EWALLET', title: 'E-wallet', description: 'Digital wallet / payment provider', icon: <Wallet size={18} /> },
]

export function RegisterFinancierView() {
  const user = useMarketplace((s) => s.user)
  const authChecked = useMarketplace((s) => s.authChecked)
  const setUser = useMarketplace((s) => s.setUser)
  const navigate = useMarketplace((s) => s.navigate)

  // institution facts
  const [legalName, setLegalName] = useState('')
  const [legalNameEn, setLegalNameEn] = useState('')
  const [orgType, setOrgType] = useState<FinOrgType | ''>('')
  const [licenseNumber, setLicenseNumber] = useState('')
  const [licenseExpiry, setLicenseExpiry] = useState('')
  const [cbyNumber, setCbyNumber] = useState('')
  const [governorate, setGovernorate] = useState('')
  const [website, setWebsite] = useState('')

  // contact person
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')

  // account creation (only when NOT signed in)
  const [contactPhone, setContactPhone] = useState('')
  const [otpToken, setOtpToken] = useState<string | null>(null)
  const [password, setPassword] = useState('')

  // offering
  const [services, setServices] = useState<string[]>([])
  const [customService, setCustomService] = useState('')
  const [description, setDescription] = useState('')

  const [consent, setConsent] = useState(false)
  const [authorized, setAuthorized] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState<{ name: string } | null>(null)

  // signed-in users get their name pre-filled once the session resolves
  // (deferred a tick — never re-render synchronously from an effect body)
  useEffect(() => {
    const t = setTimeout(() => {
      if (user && !contactName) setContactName(user.name)
    }, 0)
    return () => clearTimeout(t)
  }, [user, contactName])

  const toggleService = (s: string) =>
    setServices((list) => (list.includes(s) ? list.filter((x) => x !== s) : [...list, s]))

  const addCustomService = () => {
    const v = customService.trim()
    if (!v) return
    if (!services.includes(v)) setServices((list) => [...list, v])
    setCustomService('')
  }

  const signOut = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // best-effort
    }
    setUser(null)
    setContactName('')
    toast({ title: 'Signed out', description: 'File the application with a fresh account below.' })
  }

  const validate = (): string[] => {
    const errs: string[] = []
    if (legalName.trim().length < 2) errs.push('Institution legal name must be at least 2 characters.')
    if (!orgType) errs.push('Pick the institution type — bank, microfinance or e-wallet.')
    if (contactName.trim().length < 2) errs.push('Contact person name must be at least 2 characters.')
    if (!user) {
      if (!otpToken) errs.push('Verify the contact phone first — request a WhatsApp code and enter the 6 digits.')
      if (password.length < 6) errs.push('Password must be at least 6 characters.')
      if (contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim()))
        errs.push('Contact email does not look like a valid address.')
    }
    if (website.trim() && !/^https?:\/\/.+\..+/.test(website.trim()) && !/^[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(website.trim()))
      errs.push('Website must be a valid URL (e.g. https://bank.example.com).')
    if (!consent) errs.push('Accept the Terms of Service and Privacy Policy to continue.')
    if (!authorized) errs.push('Confirm you are authorized to apply on behalf of the institution.')
    return errs
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    const errs = validate()
    setErrors(errs)
    if (errs.length > 0) {
      toast({
        title: 'A few fields still need attention',
        description: errs[0],
        variant: 'destructive',
      })
      return
    }
    setSubmitting(true)
    const res = await apiRequest<{ organization: { name: string }; user?: SessionUser }>('/api/auth/register/financier', {
      method: 'POST',
      body: JSON.stringify({
        legalName: legalName.trim(),
        legalNameEn: legalNameEn.trim() || undefined,
        orgType,
        licenseNumber: licenseNumber.trim() || undefined,
        licenseExpiry: licenseExpiry || undefined,
        cbyRegistrationNumber: cbyNumber.trim() || undefined,
        governorate: governorate || undefined,
        website: website.trim() || undefined,
        contactName: contactName.trim(),
        contactPhone: user ? undefined : contactPhone,
        otpToken: user ? undefined : otpToken,
        password: user ? undefined : password,
        contactEmail: contactEmail.trim() || undefined,
        services,
        description: description.trim() || undefined,
        acceptsTerms: true,
      }),
    })
    setSubmitting(false)
    if (!res.ok || !res.data) {
      toast({ title: 'Application failed', description: res.error ?? 'Unexpected error', variant: 'destructive' })
      return
    }
    // The applicant account may have been created by this very request —
    // sync the client session (plain BUYER; no financier capabilities).
    if (res.data.user) setUser(res.data.user)
    setSubmitted({ name: res.data.organization.name })
    toast({
      title: 'Application received',
      description: 'Vendora will review and activate your institution — we’ll be in touch.',
    })
  }

  // ── render ──

  if (!authChecked) {
    return (
      <RegisterDoorShell
        icon={<Landmark size={24} />}
        eyebrow="For institutions"
        title="Join Vendora's financing network"
        description="Loading…"
      >
        <div className="space-y-3">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-10 w-40 rounded-xl" />
        </div>
      </RegisterDoorShell>
    )
  }

  if (submitted) {
    return (
      <RegisterDoorShell
        icon={<CheckCircle2 size={26} />}
        eyebrow="For institutions"
        title="Application received"
        description={`${submitted.name} is now pending Vendora's review.`}
      >
        <div className="space-y-5">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/40">
            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 size={16} /> Institution application submitted — status: pending verification
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-emerald-700 dark:text-emerald-400">
              Applications are reviewed by the Vendora team. You&apos;ll be contacted on WhatsApp/email once your
              institution is activated — until then, no financier console capabilities are granted.
            </p>
          </div>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <Clock size={15} className="mt-0.5 shrink-0 text-primary" />
              Review typically takes a few business days — we may ask for supporting documents.
            </li>
            <li className="flex gap-2">
              <ShieldCheck size={15} className="mt-0.5 shrink-0 text-primary" />
              Once activated, your team configures financing and accreditation services from the financier console.
            </li>
          </ul>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="flex-1 rounded-xl" size="lg" onClick={() => navigate('financier')}>
              Track application status <ArrowRight size={15} className="ml-1.5" />
            </Button>
            <Button variant="outline" className="rounded-xl" size="lg" onClick={() => navigate('home')}>
              Back to the marketplace
            </Button>
          </div>
          <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
            The status tracker (also reachable from the account menu → “Financier console”) shows where the review
            stands and the license documents on file. Your account stays a buyer account until the institution is
            activated — that is expected, nothing failed.
          </p>
        </div>
      </RegisterDoorShell>
    )
  }

  return (
    <RegisterDoorShell
      icon={<Landmark size={24} />}
      eyebrow="For institutions"
      title="Join Vendora's financing network"
      description="Reach verified, platform-gated solar financing demand. Reviewed by the Vendora team."
    >
      <form onSubmit={submit} className="space-y-5">
        {/* ── institution identity ── */}
        <section className="space-y-3.5">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <Landmark size={15} className="text-primary" /> Institution
          </h2>
          <div className="space-y-1.5">
            <Label htmlFor="rf-legal">Legal name (Arabic)</Label>
            <Input
              id="rf-legal"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder="الاسم القانوني للمؤسسة"
              minLength={2}
              required
              dir="auto"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rf-legal-en">Legal name (English, optional)</Label>
            <Input
              id="rf-legal-en"
              value={legalNameEn}
              onChange={(e) => setLegalNameEn(e.target.value)}
              placeholder="Institution legal name in English"
            />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Institution type</legend>
            <div className="grid gap-2">
              {ORG_TYPE_CARDS.map((t) => (
                <RadioCard
                  key={t.value}
                  name="orgType"
                  value={t.value}
                  checked={orgType === t.value}
                  onCheck={() => setOrgType(t.value)}
                  icon={t.icon}
                  title={t.title}
                  description={t.description}
                />
              ))}
            </div>
          </fieldset>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rf-license">License number</Label>
              <Input
                id="rf-license"
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
                placeholder="Banking/MFI license number"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rf-expiry">License expiry</Label>
              <Input
                id="rf-expiry"
                type="date"
                value={licenseExpiry}
                onChange={(e) => setLicenseExpiry(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rf-cby">CBY registration number</Label>
              <Input
                id="rf-cby"
                value={cbyNumber}
                onChange={(e) => setCbyNumber(e.target.value)}
                placeholder="Central Bank of Yemen registration"
              />
            </div>
            <GovernorateSelect id="rf-gov" value={governorate} onChange={setGovernorate} label="HQ governorate" />
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="rf-website">Website (optional)</Label>
              <Input
                id="rf-website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://…"
                inputMode="url"
              />
            </div>
          </div>
        </section>

        {/* ── contact person + account ── */}
        <section className="space-y-3.5">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <Building2 size={15} className="text-primary" /> Contact person
          </h2>
          {user ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/40">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                    <BadgeCheck size={15} /> Application filed by {user.name}
                  </p>
                  <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-400">
                    {user.phone ? `Verified phone ${user.phone}` : user.email} — you&apos;ll be the institution owner.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
                >
                  <LogOut size={12} /> Not you? Sign out
                </button>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rf-contact">Contact person name</Label>
                <Input
                  id="rf-contact"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Who we should reach on WhatsApp"
                  minLength={2}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rf-email">Contact email (optional)</Label>
                <Input
                  id="rf-email"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="you@institution.com"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="rf-contact">Contact person name</Label>
                <Input
                  id="rf-contact"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Who we should reach on WhatsApp"
                  minLength={2}
                  required
                />
              </div>
              <PhoneOtpField
                idPrefix="rf"
                phone={contactPhone}
                onPhoneChange={setContactPhone}
                otpToken={otpToken}
                onOtpTokenChange={setOtpToken}
                label="Contact phone"
              />
              <div className="space-y-1.5">
                <Label htmlFor="rf-password">Password</Label>
                <PasswordInput id="rf-password" value={password} onChange={setPassword} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rf-email">Contact email (optional)</Label>
                <Input
                  id="rf-email"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="you@institution.com"
                />
              </div>
            </div>
          )}
        </section>

        {/* ── intended services ── */}
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <Wallet size={15} className="text-primary" /> Intended services
          </h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Intended services">
            {SERVICE_PRESETS.map((preset) => {
              const active = services.includes(preset)
              return (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleService(preset)}
                  className={cn(
                    'min-h-11 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors',
                    active
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:border-primary/40 hover:text-foreground'
                  )}
                >
                  {active && <CheckCircle2 size={12} className="mr-1 inline" />}
                  {preset}
                </button>
              )
            })}
            {services
              .filter((s) => !(SERVICE_PRESETS as readonly string[]).includes(s))
              .map((custom) => (
                <button
                  key={custom}
                  type="button"
                  aria-pressed
                  onClick={() => toggleService(custom)}
                  className="min-h-11 rounded-full border border-primary bg-primary/10 px-3.5 py-1.5 text-xs font-medium text-primary"
                >
                  <CheckCircle2 size={12} className="mr-1 inline" />
                  {custom}
                  <X size={11} className="ml-1 inline opacity-60" />
                </button>
              ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={customService}
              onChange={(e) => setCustomService(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addCustomService()
                }
              }}
              placeholder="Add a service not listed…"
              aria-label="Add a custom service"
              className="h-10"
            />
            <Button type="button" variant="outline" className="h-10 shrink-0 rounded-xl px-3" onClick={addCustomService} aria-label="Add custom service">
              <Plus size={14} />
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rf-desc">About the institution</Label>
            <Textarea
              id="rf-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A short description of your institution and its financing focus"
              rows={4}
            />
          </div>
        </section>

        {/* ── consent + submit ── */}
        <TermsCheckbox
          id="rf-consent"
          checked={consent}
          onChange={setConsent}
        />
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 text-xs leading-relaxed transition-colors hover:bg-muted/40">
          <Checkbox checked={authorized} onCheckedChange={(v) => setAuthorized(v === true)} id="rf-authorized" className="mt-0.5" />
          <span className="text-muted-foreground">
            I am authorized to apply on behalf of this institution and the license information above is accurate.
          </span>
        </label>

        {errors.length > 0 && (
          <div role="alert" className="space-y-1 rounded-xl border border-destructive/40 bg-destructive/10 p-3.5 text-sm">
            {errors.map((e) => (
              <p key={e} className="flex items-start gap-2 font-medium text-destructive">
                <ArrowRight size={14} className="mt-0.5 shrink-0" /> {e}
              </p>
            ))}
          </div>
        )}

        <Button type="submit" className="min-h-12 w-full rounded-xl text-base" size="lg" disabled={submitting}>
          {submitting ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Send size={16} className="mr-2" />}
          {submitting ? 'Submitting application…' : 'Submit application'}
        </Button>

        <p className="text-center text-[11px] text-muted-foreground">
          Registering a company that sells products instead?{' '}
          <button
            type="button"
            onClick={() => navigate('register-company')}
            className="font-semibold text-primary underline-offset-2 hover:underline"
          >
            Merchant/Dealer signup
          </button>
        </p>
      </form>
    </RegisterDoorShell>
  )
}
