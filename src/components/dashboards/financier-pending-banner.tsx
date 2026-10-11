'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FINANCIER PENDING BANNER — the bridge between a financier applicant's buyer
// account and their institution application.
//
// Why this exists (audit feedback): after submitting the financier application
// the user still signs in as a plain buyer (global role stays BUYER — financier
// access comes from organization membership, not the role). Before the admin
// verifies the institution, the only hint of the application was a tiny
// "Financier console" entry in the account dropdown. This banner surfaces the
// pending (or rejected) institution wherever the buyer looks at their account,
// and links straight to the status tracker (ActivationSection).
// ─────────────────────────────────────────────────────────────────────────────

import { AlertTriangle, ArrowRight, Clock, Landmark, ShieldAlert } from 'lucide-react'
import { useMarketplace } from '@/store/marketplace'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'

interface FinancierContextResponse {
  context: {
    organizationId: string
    organizationName: string
    organizationType?: string
    organizationStatus?: string
  } | null
}

/** TENANT-AUDIT M-4: the statuses that must surface to the applicant/staff
 *  on every account surface (not just inside the console). */
const SURFACED_STATUSES = ['PENDING_VERIFICATION', 'REJECTED', 'SUSPENDED'] as const

/**
 * Amber call-out for a pending financing-institution application. Renders
 * nothing when the user is not financier staff or their institution is already
 * ACTIVE (the console takes over at that point). Rejected applications get a
 * red variant — the applicant must act. SUSPENDED institutions get the same
 * red treatment with suspension-specific copy (M-4: the console alone would
 * only show a misleading "not staff" screen). `compact` fits the banner
 * inside cards (the business console org panel).
 */
export function FinancierPendingBanner({ compact = false }: { compact?: boolean }) {
  const user = useMarketplace((s) => s.user)
  const navigate = useMarketplace((s) => s.navigate)
  const { data } = useApi<FinancierContextResponse>(user ? '/api/financier/context' : null, {
    skip: !user,
  })

  const ctx = data?.context
  const status = ctx?.organizationStatus
  if (!ctx || !(SURFACED_STATUSES as readonly string[]).includes(status ?? '')) return null

  const negative = status === 'REJECTED' || status === 'SUSPENDED'

  return (
    <div
      role="status"
      className={
        compact
          ? 'flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40'
          : 'flex flex-wrap items-center gap-4 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 shadow-sm dark:border-amber-900 dark:bg-amber-950/40'
      }
    >
      <span
        aria-hidden
        className={
          'flex shrink-0 items-center justify-center rounded-xl ' +
          (compact ? 'h-9 w-9' : 'h-11 w-11') +
          ' ' +
          (negative
            ? 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400'
            : 'bg-amber-100 text-amber-600 dark:bg-amber-900 dark:text-amber-400')
        }
      >
        {status === 'SUSPENDED' ? <ShieldAlert size={18} /> : negative ? <AlertTriangle size={18} /> : <Clock size={19} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-amber-900 dark:text-amber-200">
          <Landmark size={14} className="shrink-0" aria-hidden />
          {status === 'SUSPENDED'
            ? 'Your institution is suspended'
            : status === 'REJECTED'
              ? 'Institution application was declined'
              : 'Financing institution application in review'}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-amber-800/90 dark:text-amber-300/90">
          {status === 'SUSPENDED'
            ? `${ctx.organizationName} was suspended by the Vendora team — financing actions are paused while the review is ongoing. Open the tracker for details.`
            : status === 'REJECTED'
              ? `${ctx.organizationName} was declined by the Vendora team — open the tracker for the reason and how to reapply.`
              : `${ctx.organizationName} is pending Vendora verification. Your account works as a buyer until the institution is activated — that is expected, nothing failed.`}
        </p>
      </div>
      <Button
        size="sm"
        className="shrink-0 rounded-xl"
        variant={negative ? 'destructive' : 'default'}
        onClick={() => navigate('financier')}
      >
        View application status <ArrowRight size={14} className="ml-1" />
      </Button>
    </div>
  )
}
