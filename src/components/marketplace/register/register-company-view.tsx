'use client'

// ─────────────────────────────────────────────────────────────────────────────
// MERCHANT/DEALER COMPANY REGISTRATION WIZARD — ?view=register-company (Phase 3)
//
// The company door. A "customer" is an individual with no commercial entity;
// someone holding products is a Merchant/Dealer (Exclusive Agent, Authorized
// Agent, Distributor, Wholesaler, Retailer) and registers a COMPANY here.
//
// 5 steps, resumable (localStorage draft 'register-company-draft'):
//   1. Account        — owner name + Yemeni phone (WhatsApp OTP) + password.
//                       Completing step 1 CREATES the account (customer fast
//                       path API, role BUYER) and signs the wizard in — steps
//                       2-5 run as a signed-in user, so KYB uploads go to the
//                       user's document vault. Abandoning leaves a customer
//                       account they can continue from later.
//   2. Business profile — legal name, trade name, merchant type, registration
//                       number, tax card, industry, governorate, address.
//   3. KYB documents   — COMMERCIAL_REG (required) + TAX_CARD + BUSINESS_LICENSE
//                       through the universal vault upload pipeline.
//   4. Store intent    — Sell / Buy / Both; SELL or BOTH asks for store name,
//                       main category and description.
//   5. Review & submit — every value rendered with Edit links; consent;
//                       POST /api/auth/register/company creates the
//                       Organization (PENDING_VERIFICATION) + OWNER membership.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  Building2,
  CheckCircle2,
  Crown,
  FileCheck2,
  Landmark,
  Loader2,
  LogOut,
  Network,
  Send,
  ShieldCheck,
  ShoppingBag,
  Store,
  Tag,
  Upload,
  User as UserIcon,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'
import type { SessionUser } from '@/lib/types'
import { MERCHANT_TYPES, type MerchantType } from '@/lib/phone'
import { apiRequest } from '@/components/marketplace/financing/financing-shared'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { GovernorateSelect, PasswordInput, PhoneOtpField, RadioCard, RegisterDoorShell, TermsCheckbox, savedAgo } from './shared'

// ── Draft (localStorage) ─────────────────────────────────────────────────────

const DRAFT_KEY = 'register-company-draft'

interface CompanyDraft {
  v: 1
  savedAt: string
  step: number
  account: { name: string; phone: string; email: string }
  profile: {
    legalName: string
    tradeName: string
    merchantType: MerchantType | ''
    registrationNumber: string
    taxId: string
    industry: string
    governorate: string
    address: string
  }
  docs: Partial<Record<KybDocType, { id: string; title: string }>>
  intent: { mode: '' | 'SELL' | 'BUY' | 'BOTH'; storeName: string; storeCategorySlug: string; storeDescription: string }
}

const EMPTY_DRAFT: CompanyDraft = {
  v: 1,
  savedAt: new Date().toISOString(),
  step: 1,
  account: { name: '', phone: '', email: '' },
  profile: { legalName: '', tradeName: '', merchantType: '', registrationNumber: '', taxId: '', industry: '', governorate: '', address: '' },
  docs: {},
  intent: { mode: '', storeName: '', storeCategorySlug: '', storeDescription: '' },
}

const STEP_TITLES = [
  { n: 1, label: 'Account' },
  { n: 2, label: 'Business profile' },
  { n: 3, label: 'KYB documents' },
  { n: 4, label: 'Store intent' },
  { n: 5, label: 'Review & submit' },
]

const MERCHANT_TYPE_ICONS: Record<MerchantType, React.ReactNode> = {
  EXCLUSIVE_AGENT: <Crown size={18} />,
  AUTHORIZED_AGENT: <ShieldCheck size={18} />,
  DISTRIBUTOR: <Network size={18} />,
  WHOLESALER: <Boxes size={18} />,
  RETAILER: <Store size={18} />,
}

const MERCHANT_TYPE_DESCRIPTIONS: Record<MerchantType, string> = {
  EXCLUSIVE_AGENT: 'Sole appointed agent for a brand or line in your territory',
  AUTHORIZED_AGENT: 'Appointed (non-exclusive) agent reselling a principal’s products',
  DISTRIBUTOR: 'Buys in bulk from manufacturers and resells to the trade',
  WHOLESALER: 'Sells goods in bulk to retailers and resellers',
  RETAILER: 'Sells directly to end customers',
}

// ── KYB document slots ───────────────────────────────────────────────────────

type KybDocType = 'COMMERCIAL_REG' | 'TAX_CARD' | 'BUSINESS_LICENSE'

const KYB_DOC_SLOTS: { type: KybDocType; label: string; description: string; required: boolean }[] = [
  { type: 'COMMERCIAL_REG', label: 'Commercial registration', description: 'Required for verification.', required: true },
  { type: 'TAX_CARD', label: 'Tax card', description: 'If you hold one.', required: false },
  { type: 'BUSINESS_LICENSE', label: 'Business license', description: 'If you hold one.', required: false },
]

function DocUploadSlot({
  slot,
  doc,
  onUploaded,
}: {
  slot: (typeof KYB_DOC_SLOTS)[number]
  doc: { id: string; title: string } | undefined
  onUploaded: (doc: { id: string; title: string }) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const upload = async (file: File) => {
    if (busy) return
    setBusy(true)
    setError(null)
    const form = new FormData()
    form.append('file', file)
    form.append('documentType', slot.type)
    form.append('title', slot.label)
    const res = await apiRequest<{ document: { id: string; title: string | null; media: { originalName: string } | null } }>(
      '/api/documents',
      { method: 'POST', body: form }
    )
    setBusy(false)
    if (!res.ok || !res.data) {
      setError(res.error ?? 'Upload failed')
      return
    }
    onUploaded({
      id: res.data.document.id,
      title: res.data.document.title || res.data.document.media?.originalName || slot.label,
    })
    toast({ title: 'Document uploaded', description: `${slot.label} is in your vault — the platform verifies it once.` })
  }

  return (
    <Card className={cn(slot.required && !doc && 'border-amber-300 dark:border-amber-800')}>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="mt-0.5 rounded-xl bg-primary/10 p-2 text-primary">
            {doc ? <FileCheck2 size={16} /> : <Upload size={16} />}
          </span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
              {slot.label}
              <Badge variant="outline" className="rounded-full px-1.5 text-[10px] font-medium">
                {slot.required ? 'Required' : 'Optional'}
              </Badge>
            </p>
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{slot.description}</p>
            {doc && (
              <p className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 size={12} /> {doc.title}
              </p>
            )}
            {error && <p className="mt-1 text-xs font-medium text-destructive">{error}</p>}
          </div>
        </div>
        {doc ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-lg"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            {busy ? <Loader2 size={13} className="mr-1 animate-spin" /> : <Upload size={13} className="mr-1" />}
            Replace
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            className="rounded-lg"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            {busy ? <Loader2 size={13} className="mr-1 animate-spin" /> : <Upload size={13} className="mr-1" />}
            {busy ? 'Uploading…' : 'Upload'}
          </Button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.pdf"
          className="sr-only"
          aria-label={`Upload ${slot.label}`}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void upload(file)
            e.target.value = ''
          }}
        />
      </CardContent>
    </Card>
  )
}

// ── The wizard ────────────────────────────────────────────────────────────────

interface CategoryOption {
  id: string
  name: string
  slug: string
}

export function RegisterCompanyView() {
  const user = useMarketplace((s) => s.user)
  const authChecked = useMarketplace((s) => s.authChecked)
  const setUser = useMarketplace((s) => s.setUser)
  const navigate = useMarketplace((s) => s.navigate)
  const openAuth = useMarketplace((s) => s.openAuth)

  const [draftRestored, setDraftRestored] = useState<{ ago: string; step: number } | null>(null)
  const [draftReady, setDraftReady] = useState(false)
  const draftStepRef = useRef<number | null>(null)
  const [step, setStep] = useState(1)

  // step 1 — owner account
  const [account, setAccount] = useState({ name: '', phone: '', email: '' })
  const [password, setPassword] = useState('')
  const [otpToken, setOtpToken] = useState<string | null>(null)
  const [creatingAccount, setCreatingAccount] = useState(false)

  // step 2 — business profile
  const [profile, setProfile] = useState(EMPTY_DRAFT.profile)

  // step 3 — KYB docs (vault AccountDocument ids, keyed by type)
  const [docs, setDocs] = useState<CompanyDraft['docs']>({})

  // step 4 — store intent
  const [intent, setIntent] = useState(EMPTY_DRAFT.intent)

  // step 5 — review + submit
  const [consent, setConsent] = useState(false)
  const [consentError, setConsentError] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState<{ name: string } | null>(null)

  // step 1 — dynamic validation (touched-first, short messages)
  const [step1Touched, setStep1Touched] = useState<{ name?: boolean; password?: boolean; terms?: boolean }>({})
  const [agree, setAgree] = useState(false)
  const nameError = step1Touched.name === true && account.name.trim().length < 2
  const passwordError = step1Touched.password === true && password.length < 6
  const agreeError = step1Touched.terms === true && !agree

  // categories for the store-intent picker
  const [categories, setCategories] = useState<CategoryOption[] | null>(null)

  // field-level blockers surfaced next to the Continue button (Phase 0 rule)
  const [stepErrors, setStepErrors] = useState<string[]>([])

  // ── draft restore (once, client-side; deferred a tick so the hydration
  // render is never re-triggered synchronously from an effect) ──
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(DRAFT_KEY)
        if (raw) {
          const draft = JSON.parse(raw) as CompanyDraft
          if (draft?.v === 1) {
            setAccount({ name: draft.account?.name ?? '', phone: draft.account?.phone ?? '', email: draft.account?.email ?? '' })
            if (draft.profile) setProfile({ ...EMPTY_DRAFT.profile, ...draft.profile })
            if (draft.docs) setDocs(draft.docs)
            if (draft.intent) setIntent({ ...EMPTY_DRAFT.intent, ...draft.intent })
            const savedStep = Math.min(Math.max(draft.step ?? 1, 1), 5)
            if (savedStep > 1 || draft.profile?.legalName || draft.intent?.storeName) {
              setDraftRestored({ ago: savedAgo(draft.savedAt ?? new Date().toISOString()), step: savedStep })
            }
            // Step jump is applied after the session resolves (below) — KYB
            // uploads and later steps need the signed-in step-1 account.
            draftStepRef.current = savedStep
          }
        }
      } catch {
        // corrupt draft — ignore
      }
      // Persisting starts only after the restore lands (never clobber a draft
      // with the pre-restore default state on the very first commit).
      setDraftReady(true)
    }, 0)
    return () => clearTimeout(t)
  }, [])

  // After the session check resolves, jump a signed-in returning user to the
  // step they left (steps ≥2 require the session created in step 1).
  useEffect(() => {
    if (!authChecked || !user) return
    if (draftStepRef.current && draftStepRef.current >= 2) {
      const t = setTimeout(() => {
        setStep(draftStepRef.current ?? 1)
        draftStepRef.current = null
      }, 0)
      return () => clearTimeout(t)
    }
  }, [authChecked, user])

  // ── draft persist (every change, after restore) ──
  useEffect(() => {
    if (!draftReady || submitted) return
    const draft: CompanyDraft = {
      ...EMPTY_DRAFT,
      savedAt: new Date().toISOString(),
      step,
      account,
      profile,
      docs,
      intent,
    }
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    } catch {
      // storage full / disabled — the wizard still works, just not resumable
    }
  }, [draftReady, step, account, profile, docs, intent, submitted])

  // Categories load (step 4 needs them; fetch lazily when first relevant)
  useEffect(() => {
    if (step < 4 || categories) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/categories', { cache: 'no-store' })
        if (!res.ok) return
        const json = (await res.json()) as { categories: CategoryOption[] }
        if (!cancelled) setCategories(json.categories ?? [])
      } catch {
        // picker falls back to free text-less select with no options
      }
    })()
    return () => {
      cancelled = true
    }
  }, [step, categories])

  // ── does the signed-in user already own an organization? ──
  const [orgCheck, setOrgCheck] = useState<'loading' | 'owned' | 'clear' | null>(null)
  useEffect(() => {
    if (!authChecked || !user) return
    let cancelled = false
    const t = setTimeout(() => {
      setOrgCheck('loading')
      void (async () => {
        try {
          const res = await fetch('/api/organizations', { cache: 'no-store' })
          if (!res.ok) {
            if (!cancelled) setOrgCheck('clear')
            return
          }
          const json = (await res.json()) as { organizations: { myRole?: string }[] }
          if (!cancelled) setOrgCheck(json.organizations?.some((o) => o.myRole === 'OWNER') ? 'owned' : 'clear')
        } catch {
          if (!cancelled) setOrgCheck('clear')
        }
      })()
    }, 0)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [authChecked, user, submitted])
  // Derived (no reset effect needed when the session drops): the owned-guard
  // only applies while a user is actually signed in.
  const ownsOrganization = Boolean(user) && orgCheck === 'owned'
  const checkingOrganization = Boolean(user) && orgCheck === 'loading'

  const clearDraft = () => {
    try {
      window.localStorage.removeItem(DRAFT_KEY)
    } catch {
      // ignore
    }
  }

  const startOver = () => {
    clearDraft()
    setAccount({ name: '', phone: '', email: '' })
    setProfile(EMPTY_DRAFT.profile)
    setDocs({})
    setIntent(EMPTY_DRAFT.intent)
    setConsent(false)
    setStepErrors([])
    setDraftRestored(null)
    setStep(1)
  }

  const signOut = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // best-effort
    }
    setUser(null)
    toast({ title: 'Signed out', description: 'Create a fresh owner account for the company below.' })
  }

  // ── step 1 → create the owner account (customer fast path, role BUYER) ──
  const createAccount = async () => {
    if (creatingAccount) return
    setStep1Touched({ name: true, password: true, terms: true })
    if (account.name.trim().length < 2) {
      setStepErrors(['Enter the owner’s full name.'])
      return
    }
    if (!otpToken) {
      setStepErrors(['Verify the phone first — request a code and enter the 6 digits.'])
      return
    }
    if (password.length < 6) {
      setStepErrors(['Password must be at least 6 characters.'])
      return
    }
    if (!agree) {
      setStepErrors(['Accept the Terms of Service and Privacy Policy to continue.'])
      return
    }
    setStepErrors([])
    setCreatingAccount(true)
    const res = await apiRequest<{ user: SessionUser }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: account.name.trim(),
        phone: account.phone,
        otpToken,
        password,
        email: account.email.trim() || undefined,
        role: 'BUYER',
      }),
    })
    setCreatingAccount(false)
    if (!res.ok || !res.data) {
      toast({ title: 'Account creation failed', description: res.error ?? 'Unexpected error', variant: 'destructive' })
      return
    }
    setUser(res.data.user)
    toast({
      title: `Welcome, ${res.data.user.name.split(' ')[0]}!`,
      description: 'Your sign-in is ready — now register the company itself.',
    })
    setStep(2)
  }

  // ── step validation (Continue gates, field-level messages) ──
  const validateStep = (target: number): string[] => {
    if (target === 2) {
      if (profile.legalName.trim().length < 2) return ['Legal name must be at least 2 characters.']
      if (profile.tradeName.trim().length < 2) return ['Trade name must be at least 2 characters.']
      if (!profile.merchantType) return ['Pick your Merchant/Dealer type — Exclusive Agent, Authorized Agent, Distributor, Wholesaler or Retailer.']
      return []
    }
    if (target === 3) {
      if (!docs.COMMERCIAL_REG) return ['Upload the commercial registration certificate (required for company verification).']
      return []
    }
    if (target === 4) {
      if (!intent.mode) return ['Choose what you will do on Vendora — sell, buy, or both.']
      if (intent.mode !== 'BUY' && intent.storeName.trim().length < 2) return ['Store name is required when you intend to sell.']
      return []
    }
    if (target === 5) {
      if (!consent) return ['Accept the Terms and confirm your business information is accurate.']
      return []
    }
    return []
  }

  const goNext = () => {
    // Validate the step being LEFT (step 1's gate is the account creation
    // itself; step 5's gate is the submit button + consent).
    const errors = step >= 2 && step <= 4 ? validateStep(step) : []
    setStepErrors(errors)
    if (errors.length > 0) return
    setStep((s) => Math.min(5, s + 1))
  }

  const goBack = () => {
    setStepErrors([])
    setStep((s) => Math.max(1, s - 1))
  }

  const goToStep = (n: number) => {
    setStepErrors([])
    setStep(n)
  }

  // ── final submit → POST /api/auth/register/company ──
  const submit = async () => {
    if (submitting || !user) return
    const errors = validateStep(5)
    if (errors.length > 0) {
      setStepErrors(errors)
      setConsentError(!consent)
      return
    }
    setSubmitting(true)
    const res = await apiRequest<{ organization: { name: string }; user?: SessionUser }>('/api/auth/register/company', {
      method: 'POST',
      body: JSON.stringify({
        legalName: profile.legalName.trim(),
        tradeName: profile.tradeName.trim(),
        merchantType: profile.merchantType,
        registrationNumber: profile.registrationNumber.trim() || undefined,
        taxId: profile.taxId.trim() || undefined,
        industry: profile.industry.trim() || undefined,
        governorate: profile.governorate || undefined,
        address: profile.address.trim() || undefined,
        intent: intent.mode,
        storeName: intent.mode !== 'BUY' ? intent.storeName.trim() : undefined,
        storeCategorySlug: intent.storeCategorySlug || undefined,
        docIds: Object.values(docs)
          .filter((d): d is { id: string; title: string } => Boolean(d))
          .map((d) => d.id),
        acceptsTerms: true,
      }),
    })
    setSubmitting(false)
    if (!res.ok || !res.data) {
      toast({ title: 'Submission failed', description: res.error ?? 'Unexpected error', variant: 'destructive' })
      return
    }
    // Role may have flipped BUYER → SELLER (sell intent) — keep the client in sync.
    if (res.data.user) setUser(res.data.user)
    clearDraft()
    setSubmitted({ name: res.data.organization.name })
    toast({
      title: 'Application submitted',
      description: 'Your merchant application is under review — we’ll reach out on WhatsApp.',
    })
  }

  // ── render ──

  if (!authChecked || checkingOrganization) {
    return (
      <RegisterDoorShell
        icon={<Building2 size={24} />}
        eyebrow="Merchant / Dealer"
        title="Register your company"
        description="Loading…"
        wide
      >
        <div className="space-y-3">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-10 w-40 rounded-xl" />
        </div>
      </RegisterDoorShell>
    )
  }

  if (ownsOrganization && !submitted) {
    return (
      <RegisterDoorShell
        icon={<Building2 size={24} />}
        eyebrow="Merchant / Dealer"
        title="You already own a business"
        description="One user account can own a single organization. Manage your existing company from the business console."
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/40">
            <Building2 size={18} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="leading-relaxed">
              This account is already the owner of an organization. To register another company, sign in with a
              different owner account.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="flex-1 rounded-xl" size="lg" onClick={() => navigate('business')}>
              Open the business console <ArrowRight size={15} className="ml-1.5" />
            </Button>
            <Button variant="outline" className="rounded-xl" size="lg" onClick={() => navigate('home')}>
              Back to the marketplace
            </Button>
          </div>
        </div>
      </RegisterDoorShell>
    )
  }

  if (submitted) {
    return (
      <RegisterDoorShell
        icon={<CheckCircle2 size={26} />}
        eyebrow="Merchant / Dealer"
        title="Application received"
        description={`${submitted.name} is now pending verification.`}
      >
        <div className="space-y-5">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/40">
            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 size={16} /> Organization created — status: pending verification
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-emerald-700 dark:text-emerald-400">
              The Vendora team reviews your business details and documents. You&apos;ll be notified here and on
              WhatsApp once your company is verified.
            </p>
          </div>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <ShieldCheck size={15} className="mt-0.5 shrink-0 text-primary" />
              Documents you uploaded live in your vault — verified once, reused everywhere.
            </li>
            <li className="flex gap-2">
              <Tag size={15} className="mt-0.5 shrink-0 text-primary" />
              {intent.mode !== 'BUY'
                ? 'Your seller console is ready — listings can be prepared while verification completes.'
                : 'You can start buying for the company right away.'}
            </li>
          </ul>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="flex-1 rounded-xl" size="lg" onClick={() => navigate('business')}>
              Open the business console <ArrowRight size={15} className="ml-1.5" />
            </Button>
            <Button variant="outline" className="rounded-xl" size="lg" onClick={() => navigate('home')}>
              Back to the marketplace
            </Button>
          </div>
        </div>
      </RegisterDoorShell>
    )
  }

  return (
    <RegisterDoorShell
      icon={<Building2 size={24} />}
      eyebrow="Merchant / Dealer"
      title="Register your company"
      description="5 steps · saved as you go · about 5 minutes"
      wide
    >
      {/* progress indicator */}
      <nav aria-label="Wizard progress" className="mb-4">
        <ol className="flex flex-wrap items-center gap-1.5">
          {STEP_TITLES.map((s) => (
            <li key={s.n}>
              <button
                type="button"
                onClick={() => (s.n < step ? goToStep(s.n) : undefined)}
                aria-current={step === s.n ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors',
                  step === s.n
                    ? 'bg-primary text-primary-foreground'
                    : step > s.n
                      ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-muted text-muted-foreground'
                )}
                disabled={s.n > step}
              >
                {step > s.n ? '✓' : s.n} {s.label}
              </button>
            </li>
          ))}
        </ol>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={5} aria-label={`Step ${step} of 5`}>
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(step / 5) * 100}%` }} />
        </div>
      </nav>

      {/* draft restore note */}
      {draftRestored && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs dark:border-amber-800 dark:bg-amber-950/40">
          <p className="font-medium text-amber-900 dark:text-amber-300">
            Continue where you left off — draft from {draftRestored.ago}
            {user ? ` (step ${draftRestored.step})` : ' — verify your account to pick up at the step you reached'}.
          </p>
          <button type="button" onClick={startOver} className="font-semibold text-amber-900 underline-offset-2 hover:underline dark:text-amber-300">
            Start over
          </button>
        </div>
      )}

      {/* ── STEP 1 — owner account ── */}
      {step === 1 && (
        <motion.div key="s1" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3.5">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <UserIcon size={15} className="text-primary" /> Owner account
          </h2>
          {user ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 dark:border-emerald-900 dark:bg-emerald-950/40">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                    <CheckCircle2 size={15} /> Signed in as {user.name}
                  </p>
                  <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-400">{user.phone ?? user.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
                >
                  <LogOut size={12} /> Not you? Sign out
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="rc-name">Owner full name</Label>
                <Input
                  id="rc-name"
                  value={account.name}
                  onChange={(e) => setAccount((a) => ({ ...a, name: e.target.value }))}
                  onBlur={() => setStep1Touched((t) => ({ ...t, name: true }))}
                  placeholder="e.g. Mohammed Al-Sabri"
                  minLength={2}
                  required
                  autoFocus
                  aria-invalid={nameError || undefined}
                />
                {nameError && (
                  <p role="alert" className="text-xs font-medium text-destructive">
                    Enter the owner’s full name (at least 2 characters).
                  </p>
                )}
              </div>
              <PhoneOtpField
                idPrefix="rc"
                phone={account.phone}
                onPhoneChange={(digits) => setAccount((a) => ({ ...a, phone: digits }))}
                otpToken={otpToken}
                onOtpTokenChange={setOtpToken}
              />
              <div className="space-y-1.5">
                <Label htmlFor="rc-password">Password</Label>
                <PasswordInput
                  id="rc-password"
                  value={password}
                  onChange={setPassword}
                />
                {passwordError && (
                  <p role="alert" className="text-xs font-medium text-destructive">
                    At least 6 characters.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="rc-email">Email (optional)</Label>
                  {account.email && (
                    <button
                      type="button"
                      onClick={() => setAccount((a) => ({ ...a, email: '' }))}
                      className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <Input
                  id="rc-email"
                  type="email"
                  value={account.email}
                  onChange={(e) => setAccount((a) => ({ ...a, email: e.target.value }))}
                  placeholder="company@example.com"
                />
              </div>
              <TermsCheckbox
                id="rc-terms"
                checked={agree}
                onChange={(v) => {
                  setAgree(v)
                  setStep1Touched((t) => ({ ...t, terms: true }))
                }}
                error={agreeError}
              />
              <p className="text-xs text-muted-foreground">
                Already have an account?{' '}
                <button
                  type="button"
                  className="font-semibold text-primary underline-offset-2 hover:underline"
                  onClick={() => openAuth('login', { view: 'register-company' })}
                >
                  Sign in first
                </button>
              </p>
            </div>
          )}
        </motion.div>
      )}

      {/* ── STEP 2 — business profile ── */}
      {step === 2 && (
        <motion.div key="s2" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3.5">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <Building2 size={15} className="text-primary" /> Business profile
          </h2>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rc-legal">Legal name</Label>
              <Input
                id="rc-legal"
                value={profile.legalName}
                onChange={(e) => setProfile((p) => ({ ...p, legalName: e.target.value }))}
                placeholder="As on the commercial registration"
                minLength={2}
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rc-trade">Trade name</Label>
              <Input
                id="rc-trade"
                value={profile.tradeName}
                onChange={(e) => setProfile((p) => ({ ...p, tradeName: e.target.value }))}
                placeholder="The name customers see"
                minLength={2}
                required
              />
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Merchant/Dealer type</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {MERCHANT_TYPES.map((t) => (
                <RadioCard
                  key={t.value}
                  name="merchantType"
                  value={t.value}
                  checked={profile.merchantType === t.value}
                  onCheck={() => setProfile((p) => ({ ...p, merchantType: t.value }))}
                  icon={MERCHANT_TYPE_ICONS[t.value]}
                  title={t.label}
                  description={MERCHANT_TYPE_DESCRIPTIONS[t.value]}
                />
              ))}
            </div>
          </fieldset>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rc-reg">Commercial registration no.</Label>
              <Input
                id="rc-reg"
                value={profile.registrationNumber}
                onChange={(e) => setProfile((p) => ({ ...p, registrationNumber: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rc-tax">Tax card no.</Label>
              <Input
                id="rc-tax"
                value={profile.taxId}
                onChange={(e) => setProfile((p) => ({ ...p, taxId: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rc-industry">Industry</Label>
              <Input
                id="rc-industry"
                value={profile.industry}
                onChange={(e) => setProfile((p) => ({ ...p, industry: e.target.value }))}
                placeholder="e.g. Solar equipment"
              />
            </div>
            <GovernorateSelect
              id="rc-gov"
              value={profile.governorate}
              onChange={(v) => setProfile((p) => ({ ...p, governorate: v }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rc-address">Address</Label>
            <Textarea
              id="rc-address"
              value={profile.address}
              onChange={(e) => setProfile((p) => ({ ...p, address: e.target.value }))}
              placeholder="Street, district, city"
              rows={2}
            />
          </div>
        </motion.div>
      )}

      {/* ── STEP 3 — KYB documents ── */}
      {step === 3 && (
        <motion.div key="s3" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3.5">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <FileCheck2 size={15} className="text-primary" /> Company documents
          </h2>
          <p className="text-xs text-muted-foreground">PDF or image, up to 10 MB — verified once, reused everywhere.</p>
          <div className="space-y-3">
            {KYB_DOC_SLOTS.map((slot) => (
              <DocUploadSlot
                key={slot.type}
                slot={slot}
                doc={docs[slot.type]}
                onUploaded={(doc) => setDocs((d) => ({ ...d, [slot.type]: doc }))}
              />
            ))}
          </div>
        </motion.div>
      )}

      {/* ── STEP 4 — store intent ── */}
      {step === 4 && (
        <motion.div key="s4" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <Store size={15} className="text-primary" /> What will you do on Vendora?
          </h2>
          <div className="grid gap-2 sm:grid-cols-3">
            <RadioCard
              name="intent"
              value="SELL"
              checked={intent.mode === 'SELL'}
              onCheck={() => setIntent((i) => ({ ...i, mode: 'SELL' }))}
              icon={<Store size={18} />}
              title="Sell"
              description="Open a storefront and list products"
            />
            <RadioCard
              name="intent"
              value="BUY"
              checked={intent.mode === 'BUY'}
              onCheck={() => setIntent((i) => ({ ...i, mode: 'BUY' }))}
              icon={<ShoppingBag size={18} />}
              title="Buy"
              description="Procure for the company with RFQs and contract pricing"
            />
            <RadioCard
              name="intent"
              value="BOTH"
              checked={intent.mode === 'BOTH'}
              onCheck={() => setIntent((i) => ({ ...i, mode: 'BOTH' }))}
              icon={<Network size={18} />}
              title="Both"
              description="A storefront plus company procurement"
            />
          </div>

          {intent.mode !== '' && intent.mode !== 'BUY' && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 rounded-2xl border bg-muted/30 p-4">
              <div className="space-y-1.5">
                <Label htmlFor="rc-store">Store name</Label>
                <Input
                  id="rc-store"
                  value={intent.storeName}
                  onChange={(e) => setIntent((i) => ({ ...i, storeName: e.target.value }))}
                  placeholder="e.g. Sabri Solar Wholesale"
                  minLength={2}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rc-category">Main category</Label>
                <Select
                  value={intent.storeCategorySlug || undefined}
                  onValueChange={(v) => setIntent((i) => ({ ...i, storeCategorySlug: v }))}
                >
                  <SelectTrigger id="rc-category" className="w-full">
                    <SelectValue placeholder={categories === null ? 'Loading categories…' : 'Pick your main category'} />
                  </SelectTrigger>
                  <SelectContent>
                    {(categories ?? []).map((c) => (
                      <SelectItem key={c.slug} value={c.slug}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rc-desc">Store description</Label>
                <Textarea
                  id="rc-desc"
                  value={intent.storeDescription}
                  onChange={(e) => setIntent((i) => ({ ...i, storeDescription: e.target.value }))}
                  placeholder="What your store offers, in a sentence or two"
                  rows={3}
                />
              </div>
            </motion.div>
          )}
        </motion.div>
      )}

      {/* ── STEP 5 — review & submit ── */}
      {step === 5 && (
        <motion.div key="s5" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <ShieldCheck size={15} className="text-primary" /> Review & submit
          </h2>

          <ReviewSection
            title="Owner account"
            onEdit={() => goToStep(1)}
            rows={[
              ['Owner', user?.name ?? account.name],
              ['Phone', user?.phone ? `+967 ${user.phone.slice(4, 7)} ${user.phone.slice(7, 10)} ${user.phone.slice(10)}` : account.phone],
              ['Email', (user?.email ?? account.email) || '—'],
            ]}
          />
          <ReviewSection
            title="Business profile"
            onEdit={() => goToStep(2)}
            rows={[
              ['Legal name', profile.legalName],
              ['Trade name', profile.tradeName],
              ['Merchant/Dealer type', MERCHANT_TYPES.find((t) => t.value === profile.merchantType)?.label ?? '—'],
              ['Commercial registration no.', profile.registrationNumber || '—'],
              ['Tax card no.', profile.taxId || '—'],
              ['Industry', profile.industry || '—'],
              ['Governorate', profile.governorate || '—'],
              ['Address', profile.address || '—'],
            ]}
          />
          <ReviewSection
            title="Company documents"
            onEdit={() => goToStep(3)}
            rows={KYB_DOC_SLOTS.map((slot) => [
              slot.label,
              docs[slot.type] ? docs[slot.type]!.title : slot.required ? 'MISSING' : '—',
            ])}
          />
          <ReviewSection
            title="Store intent"
            onEdit={() => goToStep(4)}
            rows={[
              ['Intent', intent.mode === 'SELL' ? 'Sell' : intent.mode === 'BUY' ? 'Buy' : 'Both'],
              ...(intent.mode !== 'BUY'
                ? ([
                    ['Store name', intent.storeName],
                    ['Main category', categories?.find((c) => c.slug === intent.storeCategorySlug)?.name ?? intent.storeCategorySlug ?? '—'],
                    ['Store description', intent.storeDescription || '—'],
                  ] as [string, string][])
                : []),
            ]}
          />

          <label
            className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors hover:bg-muted/40 ${
              consentError ? 'border-destructive/50 bg-destructive/5' : consent ? 'border-primary/40 bg-primary/5' : ''
            }`}
          >
            <Checkbox
              checked={consent}
              onCheckedChange={(v) => {
                setConsent(v === true)
                setConsentError(false)
              }}
              id="rc-consent"
              aria-required="true"
            />
            <span className="text-sm leading-relaxed">
              I agree to the{' '}
              <a href="/legal/terms" target="_blank" rel="noreferrer" className="font-semibold text-primary underline-offset-2 hover:underline">
                Terms of Service
              </a>{' '}
              and{' '}
              <a href="/legal/privacy" target="_blank" rel="noreferrer" className="font-semibold text-primary underline-offset-2 hover:underline">
                Privacy Policy
              </a>, and confirm the business information above is accurate and I am authorized to register this
              company on Vendora.
            </span>
          </label>
          {consentError && (
            <p role="alert" className="text-xs font-medium text-destructive">
              Please accept the Terms to submit the application.
            </p>
          )}
        </motion.div>
      )}

      {/* field-level blockers (Phase 0 rule) */}
      {stepErrors.length > 0 && (
        <div role="alert" className="mt-5 space-y-1 rounded-xl border border-destructive/40 bg-destructive/10 p-3.5 text-sm">
          {stepErrors.map((e) => (
            <p key={e} className="flex items-start gap-2 font-medium text-destructive">
              <ArrowRight size={14} className="mt-0.5 shrink-0" /> {e}
            </p>
          ))}
        </div>
      )}

      {/* nav */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" className="rounded-xl" onClick={goBack} disabled={step === 1}>
          <ArrowLeft size={15} className="mr-1.5" /> Back
        </Button>
        {step < 5 ? (
          <Button type="button" className="min-h-11 rounded-xl px-6" onClick={step === 1 && !user ? createAccount : goNext} disabled={creatingAccount}>
            {creatingAccount && <Loader2 size={15} className="mr-1.5 animate-spin" />}
            {step === 1 && !user ? (creatingAccount ? 'Creating your account…' : 'Create account & continue') : `Continue`}
            {step !== 1 && <ArrowRight size={15} className="ml-1.5" />}
          </Button>
        ) : (
          <Button type="button" className="min-h-11 rounded-xl px-6" onClick={submit} disabled={submitting || !user}>
            {submitting ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : <Send size={15} className="mr-1.5" />}
            {submitting ? 'Submitting…' : 'Submit application'}
          </Button>
        )}
      </div>

      <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <Landmark size={12} /> Reviewed by the Vendora team before the company goes active.
      </p>
    </RegisterDoorShell>
  )
}

function ReviewSection({
  title,
  rows,
  onEdit,
}: {
  title: string
  rows: [string, string | undefined][]
  onEdit: () => void
}) {
  return (
    <section className="rounded-2xl border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <h3 className="text-sm font-bold">{title}</h3>
        <button
          type="button"
          onClick={onEdit}
          className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
        >
          Edit
        </button>
      </div>
      <dl className="divide-y">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-3 px-4 py-2 text-sm">
            <dt className="shrink-0 text-muted-foreground">{label}</dt>
            <dd className={cn('text-right font-medium', value === 'MISSING' && 'text-destructive')}>{value || '—'}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
