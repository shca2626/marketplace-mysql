'use client'

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRATION DOORS — shared kit (Phase 3).
// The customer fast path lives in auth-modal.tsx; companies (Merchant/Dealer)
// and financial institutions use the dedicated doors built on this kit:
//   · RegisterDoorShell  — full-page warm shell on the storefront (like AuthShell)
//   · PhoneOtpField      — Yemeni mobile + WhatsApp OTP, the EXACT pattern from
//                          auth-modal.tsx (prefix chip, InputOTP 6 slots,
//                          resend countdown, verified badge)
//   · GovernorateSelect  — shared Yemeni governorate select
//   · RadioCard          — accessible radio card (icons + label, sr-only input)
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { BadgeCheck, ChevronDown, Loader2, MapPin, MessageCircle, Phone } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { YEMEN_GOVERNORATES } from '@/lib/geo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  description: string
  /** Wizard pages use the wider card; single forms stay compact. */
  wide?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="bg-gradient-to-br from-orange-50 via-amber-50/50 to-rose-50/40 py-10 dark:from-orange-950/20 dark:via-transparent dark:to-rose-950/10 sm:py-14">
      <div className={`mx-auto px-4 ${wide ? 'max-w-3xl' : 'max-w-xl'}`}>
        <motion.div {...fadeIn} className="rounded-3xl border bg-card p-6 shadow-xl shadow-orange-900/5 sm:p-8">
          <div className="mb-5 flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary sm:h-14 sm:w-14">
              {icon}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">{eyebrow}</p>
              <h1 className="truncate text-xl font-extrabold tracking-tight sm:text-2xl">{title}</h1>
            </div>
          </div>
          <p className="mb-6 text-sm leading-relaxed text-muted-foreground">{description}</p>
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

// ── Yemeni phone + WhatsApp OTP (pattern copied from auth-modal.tsx) ─────────

export interface PhoneOtpFieldProps {
  /** Unique prefix for element ids (two OTP fields never share a page). */
  idPrefix: string
  phone: string
  onPhoneChange: (digits: string) => void
  /** Signed OTP proof — null until the 6-digit code is verified. */
  otpToken: string | null
  onOtpTokenChange: (token: string | null) => void
  label?: string
  hint?: string
  /** 'REGISTER' for both doors (account creation). */
  purpose?: 'REGISTER'
}

/**
 * Prefix chip + 9-digit input + "Send WhatsApp code" + InputOTP 6 slots +
 * resend countdown + verified badge — the auth-modal pattern, extracted so
 * the registration doors reuse it verbatim.
 */
export function PhoneOtpField({
  idPrefix,
  phone,
  onPhoneChange,
  otpToken,
  onOtpTokenChange,
  label = 'Phone number',
  hint = 'A Yemeni mobile number (70, 71, 73, 77 or 78). We verify it with a WhatsApp code — the +967 prefix is already included.',
  purpose = 'REGISTER',
}: PhoneOtpFieldProps) {
  const [otpSent, setOtpSent] = useState(false)
  const [otp, setOtp] = useState('')
  const [sendingOtp, setSendingOtp] = useState(false)
  const [resendIn, setResendIn] = useState(0)
  const resendTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const phoneValid = /^(70|71|73|77|78)\d{7}$/.test(phone.replace(/\D/g, ''))
  const otpVerified = Boolean(otpToken)

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
      onOtpTokenChange(null)
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
        body: JSON.stringify({ phone, code: value, purpose }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Verification failed', description: json.error, variant: 'destructive' })
        setOtp('')
        return
      }
      onOtpTokenChange(json.otpToken)
      toast({ title: 'Phone verified', description: 'Your number is confirmed — carry on below.' })
    } catch {
      toast({ title: 'Error', description: 'Network error — please try again', variant: 'destructive' })
      setOtp('')
    }
  }

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
          }}
          placeholder="77X XXX XXX"
          className="flex-1 tracking-wide"
          required
          aria-invalid={phone.length > 0 && !phoneValid}
          aria-describedby={`${idPrefix}-phone-hint`}
        />
      </div>
      <p id={`${idPrefix}-phone-hint`} className="text-[11px] leading-snug text-muted-foreground">
        {hint}
      </p>

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
            <span>
              Sent to +967 {phone.slice(0, 3)} {phone.slice(3, 6)} {phone.slice(6)}
            </span>
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

      {!otpVerified && (
        <Button
          type="button"
          variant="secondary"
          className="w-full rounded-xl"
          size="lg"
          disabled={!phoneValid || sendingOtp || otpSent}
          onClick={() => requestOtp()}
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
      className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-3.5 transition-colors ${
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
