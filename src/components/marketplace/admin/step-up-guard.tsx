'use client'

// ─────────────────────────────────────────────────────────────────────────────
// STEP-UP GUARD (lastplan v5 6.7.5) — shared helper for admin mutations.
//
// Sensitive admin mutations (role create/edit/delete, assignments, invitations,
// module activation, payout generate/cancel/mark-paid/config, the MFA policy
// toggles) return 403 with { code: 'MFA_STEP_UP_REQUIRED' } once the 5-minute
// freshness window has expired, or { code: 'MFA_ENROLLMENT_REQUIRED' } when the
// account has MFA required by policy but never enrolled.
//
// useStepUp() gives every call site a tiny wrapper:
//
//   const { guard, node } = useStepUp()
//   const res = await guard(() => apiRequest<T>('/api/admin/…', init))
//   if (!res) return                      // user cancelled / must enroll first
//   if (!res.ok) { toastApiError(res.error); return }
//   …res.data is the typed T…
//   return <>{node}{rest of the tab}</>    // the dialog itself
//
//  • MFA_STEP_UP_REQUIRED → a dialog asks for the MFA code (TOTP or backup
//    code), POSTs /api/auth/mfa {action:'step-up'}, and on success retries the
//    ORIGINAL mutation exactly once. A second consecutive step-up block is
//    surfaced as an error instead of looping.
//  • MFA_ENROLLMENT_REQUIRED → an informational dialog points the user at
//    their profile security settings to enroll first (no retry).
//  • Any other error passes straight through — the caller's existing
//    toastApiError handling keeps working unchanged.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useRef, useState } from 'react'
import { Loader2, ShieldAlert, ShieldCheck } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ApiResult } from './shared'

type StepUpMode = 'code' | 'enroll'

export function useStepUp() {
  const navigate = useMarketplace((s) => s.navigate)

  const [mode, setMode] = useState<StepUpMode | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)

  // The original mutation (retried once after a successful step-up) and the
  // promise the caller is awaiting — held in refs, resolved when the dialog
  // finishes one way or the other. The generic payload type lives on the
  // `guard` call (see below); the refs carry the erased shape.
  const retryRef = useRef<(() => Promise<ApiResult<unknown>>) | null>(null)
  const resolveRef = useRef<((res: ApiResult<unknown> | null) => void) | null>(null)

  const settle = (res: ApiResult<unknown> | null) => {
    setMode(null)
    setCode('')
    setError(null)
    setVerifying(false)
    retryRef.current = null
    const resolve = resolveRef.current
    resolveRef.current = null
    resolve?.(res)
  }

  const submitCode = async () => {
    if (verifying || !code.trim()) return
    setVerifying(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'step-up', code: code.trim() }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(json.error ?? 'That code is not valid — please try again.')
        setCode('')
        return
      }
      // Freshness window re-opened — retry the original mutation ONCE.
      toast({ title: 'Identity confirmed', description: 'Verifying your action now…' })
      const retry = retryRef.current
      if (!retry) {
        settle(null)
        return
      }
      const retried = await retry()
      if (!retried.ok && retried.code === 'MFA_STEP_UP_REQUIRED') {
        // Should not happen right after a verified step-up — fail loudly
        // instead of looping.
        toastApiErrorSafe(
          'The verification did not stick — please try the action again in a moment.'
        )
        settle(null)
        return
      }
      settle(retried)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setVerifying(false)
    }
  }

  /**
   * Runs the mutation; when it is blocked by step-up MFA (or a missing
   * enrollment) the dialog takes over and this resolves only after the user
   * finishes: `null` = cancelled / enrollment required, otherwise the final
   * (possibly retried) result for the caller's normal handling. Generic in
   * the API payload so `res.data` keeps the caller's `apiRequest<T>` type.
   */
  const guard = useCallback(
    async <T,>(run: () => Promise<ApiResult<T>>): Promise<ApiResult<T> | null> => {
      const res = await run()
      if (res.ok) return res
      if (res.code === 'MFA_STEP_UP_REQUIRED' || res.code === 'MFA_ENROLLMENT_REQUIRED') {
        setCode('')
        setError(null)
        setMode(res.code === 'MFA_STEP_UP_REQUIRED' ? 'code' : 'enroll')
        return new Promise<ApiResult<T> | null>((resolve) => {
          // Same `run` closure retries with the same payload type — the casts
          // just erase it for the shared dialog plumbing.
          retryRef.current =
            res.code === 'MFA_STEP_UP_REQUIRED'
              ? (run as () => Promise<ApiResult<unknown>>)
              : null
          resolveRef.current = resolve as (res: ApiResult<unknown> | null) => void
        })
      }
      return res
    },
    []
  )

  const node = (
    <Dialog
      open={mode !== null}
      onOpenChange={(o) => {
        if (!o) settle(null)
      }}
    >
      <DialogContent className="sm:max-w-sm">
        {mode === 'code' ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-primary" /> Confirm your identity
              </DialogTitle>
              <DialogDescription>
                This action needs a fresh multi-factor check. Enter the 6-digit code from your
                authenticator app — or paste one of your backup codes.
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                void submitCode()
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="stepup-code">Verification code</Label>
                <Input
                  id="stepup-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  // maxLength 10 → 6-digit TOTP or a XXXX-XXXX backup code.
                  maxLength={10}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  disabled={verifying}
                  className="rounded-xl text-center font-mono text-base tracking-[0.3em]"
                  placeholder="••••••"
                  aria-invalid={!!error}
                  aria-describedby={error ? 'stepup-code-error' : undefined}
                />
                {error && (
                  <p
                    id="stepup-code-error"
                    role="alert"
                    className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive"
                  >
                    {error}
                  </p>
                )}
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Lost your authenticator? A backup code works in the same field.
                </p>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => settle(null)}
                  disabled={verifying}
                >
                  Cancel
                </Button>
                <Button type="submit" className="rounded-xl" disabled={verifying || !code.trim()}>
                  {verifying ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : null}
                  Verify
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          mode === 'enroll' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ShieldAlert size={18} className="text-amber-600 dark:text-amber-400" />{' '}
                  Multi-factor authentication required
                </DialogTitle>
                <DialogDescription>
                  Your account must have two-factor authentication enrolled before you can
                  perform this action. Set it up in your profile security settings — it takes
                  about a minute.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => settle(null)}
                >
                  Not now
                </Button>
                <Button
                  type="button"
                  className="rounded-xl"
                  onClick={() => {
                    settle(null)
                    navigate('account', { accountTab: 'profile' })
                  }}
                >
                  Open security settings
                </Button>
              </DialogFooter>
            </>
          )
        )}
      </DialogContent>
    </Dialog>
  )

  return { guard, node }
}

function toastApiErrorSafe(description: string) {
  toast({ title: 'Action not completed', description, variant: 'destructive' })
}
