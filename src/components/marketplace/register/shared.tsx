'use client'

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRATION DOORS — shared kit (Phase 3, compacted per UX review).
// The customer fast path lives in auth-modal.tsx; companies (Merchant/Dealer)
// and financial institutions use the dedicated doors built on this kit:
//   · RegisterDoorShell  — full-page warm shell on the storefront (like AuthShell)
//   · PhoneOtpField      — Yemeni mobile + WhatsApp OTP (prefix chip, InputOTP
//                          6 CONTROLLED slots, resend countdown, sandbox-code
//                          chip, verified badge, dynamic validation)
//   · GovernorateSelect  — shared Yemeni governorate select
//   · RadioCard          — accessible radio card (icons + label, sr-only input)
//   · FieldError         — short inline validation message (rendered ONLY when
//                          needed — the "dynamic validation" rule)
//   · TermsCheckbox      — required Terms of Service + Privacy Policy agreement
//   · PasswordInput      — password field with visibility toggle
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  BadgeCheck,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  FlaskConical,
  Loader2,
  MapPin,
  MessageCircle,
  Phone,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { YEMEN_GOVERNORATES } from '@/lib/geo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const fadeIn = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: 'easeOut' as const },
}

/** Full-page shell for the public registration doors (header/footer stay). */
export function RegisterDoorShell({
  icon,
  eyebrow,
  title,
  description,
  wide,
  children,
}: {
  icon: React.ReactNode
  eyebrow: string
  title: string
  description?: string
  /** Wizard pages use the wider card; single forms stay compact. */
  wide?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="bg-gradient-to-br from-orange-50 via-amber-50/50 to-rose-50/40 py-8 dark:from-orange-950/20 dark:via-transparent dark:to-rose-950/10 sm:py-12">
      <div className={`mx-auto px-4 ${wide ? 'max-w-3xl' : 'max-w-xl'}`}>
        <motion.div {...fadeIn} className="rounded-3xl border bg-card p-5 shadow-xl shadow-orange-900/5 sm:p-7">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary sm:h-12 sm:w-12">
              {icon}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">{eyebrow}</p>
              <h1 className="truncate text-xl font-extrabold tracking-tight sm:text-2xl">{title}</h1>
            </div>
          </div>
          {description && <p className="mb-4 text-sm leading-relaxed text-muted-foreground">{description}</p>}
          {children}
        </motion.div>
      </div>
    </div>
  )
}

/** Human "saved X ago" for draft-restore notes. */
export function savedAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms) || ms < 0) return 'earlier'
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} hr ago`
  return `${Math.floor(hr / 24)} d ago`
}

// ── Dynamic validation primitives ───────────────────────────────────────────

/**
 * Short inline validation message — rendered ONLY when `show` is true so the
 * form stays clean until the field actually needs attention.
 */
export function FieldError({ show, children, id }: { show: boolean; children: React.ReactNode; id?: string }) {
  if (!show) return null
  return (
    <p id={id} role="alert" className="text-xs font-medium text-destructive">
      {children}
    </p>
  )
}

/** Required Terms of Service + Privacy Policy agreement with error state. */
export function TermsCheckbox({
  id,
  checked,
  onChange,
  error,
  className,
}: {
  id: string
  checked: boolean
  onChange: (checked: boolean) => void
  error?: boolean
  className?: string
}) {
  return (
    <div className={className}>
      <label
        htmlFor={id}
        className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-xs leading-relaxed transition-colors ${
          error
            ? 'border-destructive/50 bg-destructive/5'
            : checked
              ? 'border-primary/40 bg-primary/5'
              : 'hover:bg-muted/40'
        }`}
      >
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={(v) => onChange(v === true)}
          className="mt-0.5"
          aria-invalid={error || undefined}
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
      <FieldError show={Boolean(error)}>You must accept the Terms and Privacy Policy to continue.</FieldError>
    </div>
  )
}

/** Password input with a visibility toggle. */
export function PasswordInput({
  id,
  value,
  onChange,
  placeholder = '••••••••',
  autoComplete = 'new-password',
  className,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoComplete?: string
  className?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        minLength={6}
        required
        autoComplete={autoComplete}
        className={`pr-10 ${className ?? ''}`}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
      >
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  )
}

// ── Yemeni phone + WhatsApp OTP ────────────────────────────────────────────

export interface PhoneOtpFieldProps {
  /** Unique prefix for element ids (two OTP fields never share a page). */
  idPrefix: string
  phone: string
  onPhoneChange: (digits: string) => void
  /** Signed OTP proof — null until the 6-digit code is verified. */
  otpToken: string | null
  onOtpTokenChange: (token: string | null) => void
  label?: string
  /** Validation only shows after the field was touched (dynamic rule). */
  showValidation?: boolean
  /** 'REGISTER' for both doors (account creation). */
  purpose?: 'REGISTER'
}

/**
 * Prefix chip + 9-digit input + "Send WhatsApp code" + InputOTP 6 slots +
 * resend countdown + sandbox-code chip + verified badge.
 */
export function PhoneOtpField({
  idPrefix,
  phone,
  onPhoneChange,
  otpToken,
  onOtpTokenChange,
  label = 'Phone number',
  showValidation = true,
  purpose = 'REGISTER',
}: PhoneOtpFieldProps) {
  const [touched, setTouched] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
  const [otp, setOtp] = useState('')
  const [sendingOtp, setSendingOtp] = useState(false)
  const [devCode, setDevCode] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(0)
  const resendTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const phoneValid = /^(70|71|73|77|78)\d{7}$/.test(phone.replace(/\D/g, ''))
  const otpVerified = Boolean(otpToken)
  const showError = showValidation && touched && phone.length > 0 && !phoneValid

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

  const requestOtp = async (isResend = false) => {
    if (!phoneValid || sendingOtp) return
    setSendingOtp(true)
    try {
      const res = await fetch('/api/auth/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, purpose }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Could not send the code', description: json.error, variant: 'destructive' })
        return
      }
      setOtpSent(true)
      setOtp('')
      setDevCode(typeof json.devCode === 'string' ? json.devCode : null)
      onOtpTokenChange(null)
      setResendIn(json.resendAfterSec ?? 60)
      toast({ title: isResend ? 'New code sent' : 'Code sent', description: 'It is valid for 5 minutes.' })
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
        body: JSON.stringify({ phone, code: value, purpose }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Verification failed', description: json.error, variant: 'destructive' })
        setOtp('')
        return
      }
      onOtpTokenChange(json.otpToken)
      toast({ title: 'Phone verified', description: 'Carry on below.' })
    } catch {
      toast({ title: 'Error', description: 'Network error — please try again', variant: 'destructive' })
      setOtp('')
    }
  }

  const formatted = `+967 ${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6)}`.trim()

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${idPrefix}-phone`}>{label}</Label>
      <div className="flex gap-2">
        <div className="flex items-center gap-1 rounded-lg border bg-muted/50 px-3 py-2 text-sm font-medium text-muted-foreground">
          <Phone size={13} /> +967
        </div>
        <Input
          id={`${idPrefix}-phone`}
          inputMode="numeric"
          value={phone}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '').slice(0, 9)
            onPhoneChange(digits)
            onOtpTokenChange(null)
            setOtpSent(false)
            setDevCode(null)
          }}
          onBlur={() => setTouched(true)}
          placeholder="77X XXX XXX"
          className="flex-1 tracking-wide"
          required
          aria-invalid={showError || undefined}
          aria-describedby={showError ? `${idPrefix}-phone-error` : undefined}
        />
      </div>
      <FieldError show={showError} id={`${idPrefix}-phone-error`}>
        Enter a valid 9-digit Yemeni mobile (70, 71, 73, 77 or 78).
      </FieldError>

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
            <span className="truncate">Sent to {formatted}</span>
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
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-sm font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
          <BadgeCheck size={15} /> {formatted} verified
        </div>
      )}

      {!otpVerified && (
        <Button
          type="button"
          variant={otpSent ? 'outline' : 'secondary'}
          className="w-full rounded-xl"
          onClick={() => {
            setTouched(true)
            void requestOtp()
          }}
          disabled={!phoneValid || sendingOtp || otpSent}
        >
          {sendingOtp ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : <MessageCircle size={15} className="mr-1.5" />}
          {otpSent ? 'Code sent — enter it above' : 'Send WhatsApp code'}
        </Button>
      )}
    </div>
  )
}

// ── Governorate select ───────────────────────────────────────────────────────

export function GovernorateSelect({
  id,
  value,
  onChange,
  label = 'Governorate',
}: {
  id: string
  value: string
  onChange: (v: string) => void
  label?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full" aria-label={label}>
          <span className="flex min-w-0 items-center gap-1.5">
            <MapPin size={14} className="shrink-0 text-muted-foreground" />
            <SelectValue placeholder="Select a governorate" />
          </span>
          <ChevronDown size={14} className="shrink-0 opacity-50" />
        </SelectTrigger>
        <SelectContent>
          {YEMEN_GOVERNORATES.map((g) => (
            <SelectItem key={g} value={g}>
              {g}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** Radio-card used by merchant type / org type / intent pickers. */
export function RadioCard({
  checked,
  onCheck,
  icon,
  title,
  description,
  name,
  value,
  disabled,
}: {
  checked: boolean
  onCheck: () => void
  icon: React.ReactNode
  title: string
  description?: string
  name: string
  value: string
  disabled?: boolean
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-3 transition-colors ${
        checked ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
      } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onCheck}
        disabled={disabled}
        className="sr-only"
        aria-label={title}
      />
      <span className="mt-0.5 text-primary">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-tight">{title}</span>
        {description && <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{description}</span>}
      </span>
      {checked && <BadgeCheck size={16} className="ml-auto mt-0.5 shrink-0 text-primary" />}
    </label>
  )
}
