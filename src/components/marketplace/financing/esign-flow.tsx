'use client'

// ─────────────────────────────────────────────────────────────────────────────
// E-SIGNATURE FLOW (Phase 10 — lastplan v5 §10.4, buyer side)
// The applicant-facing agreement execution, rendered INSIDE the buyer's
// agreements card (compact — no page navigation):
//   • fetches the execution context (cheap 404/null when the financier has
//     no ACTIVE template → renders nothing);
//   • shows an "Executed <date> ✓" chip when an execution already exists;
//   • the contract preview (rendered for THIS agreement, scrollable),
//     the exact consent sentence, a typed-name signature box and the
//     step-up MFA code field (428 → guidance to enroll in Account security);
//   • submit walks the server's fail-closed chain — every typed error
//     (esp. DOCUMENT_HASH_MISMATCH) is surfaced inline.
// Owner: Task 10-c.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { BadgeCheck, CheckCircle2, KeyRound, Loader2, PenLine, ShieldCheck } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { apiRequest } from '@/components/marketplace/financing/financing-shared'

// ── DTOs (local — mirrors the service serializers) ─────────────────────────

interface EsignContextDTO {
  template: {
    id: string
    kind: string
    version: number
    title: string
    renderedBody: string
    sha256: string
    unresolved: string[]
  }
  consentText: string
  existingExecution: {
    id: string
    acceptedAt: string
    documentSha256: string
    signerMfaVerifiedAt: string | null
    template: { id: string; kind: string; version: number; title: string }
  } | null
  mfaEnrolled: boolean
}

interface ExecutionResult {
  id: string
  agreementNumber: string
  acceptedAt: string
  documentSha256: string
  signerMfaVerifiedAt: string | null
  template: { id: string; kind: string; version: number; title: string }
  evidence: Record<string, unknown>
}

// ── Component ───────────────────────────────────────────────────────────────

export function EsignFlow({
  agreementId,
  agreementNumber,
  onSigned,
}: {
  agreementId: string
  agreementNumber: string
  onSigned?: () => void
}) {
  // Context fetch via useApi (the project's effect-safe fetch hook). Any
  // failure — 404 TEMPLATE_INACTIVE, 403, network — renders NOTHING (quiet).
  const { data, loading, refetch } = useApi<EsignContextDTO>(
    `/api/financing/agreements/${agreementId}/contract`
  )
  const ctx = data ?? null
  const [error, setError] = useState<string | null>(null)
  const [mfaHint, setMfaHint] = useState<string | null>(null)

  const [consent, setConsent] = useState(false)
  const [typedName, setTypedName] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ExecutionResult | null>(null)

  // Nothing to render while loading-less unavailable (financier has no active
  // template, viewer is not the applicant, or the request failed quietly).
  if (!loading && !ctx) return null
  if (loading && !ctx) return <Skeleton className="h-16 rounded-xl" />

  // Already executed — just the confirmation chip.
  if (result || ctx?.existingExecution) {
    const acceptedAt = result?.acceptedAt ?? ctx?.existingExecution?.acceptedAt ?? null
    const version = result?.template.version ?? ctx?.existingExecution?.template.version ?? 0
    const sha = result?.documentSha256 ?? ctx?.existingExecution?.documentSha256 ?? ''
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2 dark:border-emerald-900 dark:bg-emerald-950/40">
          <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400" />
          <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            Executed{' '}
            {acceptedAt
              ? new Date(acceptedAt).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : ''}{' '}
            ✓
          </span>
          {sha && (
            <Badge variant="outline" className="rounded-full text-[10px] text-muted-foreground">
              template v{version} · sha256 {sha.slice(0, 10)}…
            </Badge>
          )}
        </div>
        {result?.evidence && (
          <details className="rounded-xl border px-3 py-2 text-xs">
            <summary className="cursor-pointer font-medium text-muted-foreground">Evidence package</summary>
            <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-muted-foreground">
              {JSON.stringify(result.evidence, null, 2)}
            </pre>
          </details>
        )}
      </div>
    )
  }

  const submit = async () => {
    if (!ctx) return
    setBusy(true)
    setError(null)
    setMfaHint(null)
    const res = await apiRequest<{ execution: ExecutionResult }>(
      `/api/financing/agreements/${agreementId}/sign`,
      {
        method: 'POST',
        body: JSON.stringify({
          documentSha256: ctx.template.sha256,
          consentAccepted: consent,
          mfaCode,
          typedName,
        }),
      }
    )
    setBusy(false)
    if (!res.ok) {
      const json = res as unknown as { code?: string; error?: string }
      setError(res.error ?? 'Signing failed')
      if (json.code === 'MFA_ENROLLMENT_REQUIRED') {
        setMfaHint('Enable two-factor authentication first: open the user menu → Account → Security, enroll your authenticator app, then come back to sign.')
      } else if (json.code === 'DOCUMENT_HASH_MISMATCH') {
        // the document changed between view and sign — reload the context
        setMfaHint('The agreement text was updated by the financier. We are reloading the latest version — review it and sign again.')
        void refetch()
      } else if (json.code === 'MFA_CODE_INVALID') {
        setMfaHint('Codes rotate every 30 seconds — enter the current one from your authenticator app.')
      }
      return
    }
    setResult(res.data?.execution ?? null)
    toast({
      title: `Agreement ${agreementNumber} signed`,
      description: 'Your e-signature evidence package (identity, document hash, consent + MFA) was recorded.',
    })
    onSigned?.()
  }

  // Definitive narrowing for the JSX below (belt-and-braces after the
  // loading-aware early returns above).
  if (!ctx) return null

  // The signing card (ctx is non-null here — handled above).
  return (
    <div className="rounded-xl border border-bh-gold/40 bg-bh-gold/5 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <PenLine size={15} className="text-bh-gold-dark" />
        <p className="text-sm font-semibold">Sign your financing agreement</p>
        <Badge variant="outline" className="ml-auto rounded-full text-[10px] text-muted-foreground">
          template v{ctx.template.version} · sha256 {ctx.template.sha256.slice(0, 10)}…
        </Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {ctx.template.title} — signing binds to this exact document version and records a full evidence
        package (identity, consent, two-factor verification).
      </p>

      {/* Contract preview */}
      <div className="mt-3 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-background p-3 font-mono text-[11px] leading-relaxed">
        {ctx.template.renderedBody}
      </div>
      {ctx.template.unresolved.length > 0 && (
        <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
          Note: {ctx.template.unresolved.join(', ')} left as-is by the financier&apos;s template.
        </p>
      )}

      {/* Consent */}
      <label
        htmlFor={`esign-consent-${agreementId}`}
        className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-xs leading-relaxed"
      >
        <Checkbox
          id={`esign-consent-${agreementId}`}
          checked={consent}
          onCheckedChange={(v) => setConsent(v === true)}
          className="mt-0.5"
          aria-label="Accept the consent statement"
        />
        <span>{ctx.consentText}</span>
      </label>

      {/* Signature + MFA */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`esign-name-${agreementId}`} className="text-xs">
            Type your full name (your signature)
          </Label>
          <Input
            id={`esign-name-${agreementId}`}
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            placeholder="e.g. Alex Rivera"
            className="rounded-lg"
            autoComplete="off"
          />
          {typedName.trim() && (
            <div className="flex h-12 items-center justify-center rounded-lg border border-bh-gold/50 bg-background/60">
              <span
                className="text-lg text-foreground"
                style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontStyle: 'italic' }}
                aria-label="Signature preview"
              >
                {typedName.trim()}
              </span>
            </div>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`esign-mfa-${agreementId}`} className="text-xs">
            Two-factor code (required)
          </Label>
          <div className="relative">
            <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              id={`esign-mfa-${agreementId}`}
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6-digit code"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="rounded-lg pl-9 tracking-[0.3em]"
              aria-describedby={mfaHint ? `esign-mfa-hint-${agreementId}` : undefined}
            />
          </div>
          {!ctx.mfaEnrolled ? (
            <p id={`esign-mfa-hint-${agreementId}`} className="text-[11px] text-amber-700 dark:text-amber-400">
              You are not enrolled in two-factor authentication yet — enable it in the user menu → Account →
              Security before signing.
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Open your authenticator app and enter the current code — it proves it is you at this moment.
            </p>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </p>
      )}
      {mfaHint && !error && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          {mfaHint}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck size={13} className="text-emerald-600 dark:text-emerald-400" />
          Fail-closed: identity, document hash, consent and 2FA are verified server-side.
        </p>
        <Button
          size="sm"
          className="rounded-xl"
          disabled={busy || !consent || !typedName.trim() || mfaCode.length !== 6}
          onClick={() => void submit()}
        >
          {busy ? (
            <>
              <Loader2 size={14} className="mr-1 animate-spin" /> Signing…
            </>
          ) : (
            <>
              <BadgeCheck size={14} className="mr-1" /> Sign agreement
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
