'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ORG STATUS BANNER (merchant companies) — the H-4 twin of FinancierPendingBanner.
//
// Why this exists (tenant audit): a merchant applicant who registered their
// company lands on the business console ONCE (the registration CTA) and sees
// the amber "We're reviewing your business" card there. After they navigate
// away, the buyer dashboard showed NOTHING about their pending company — the
// exact asymmetry UX-FIN-1 fixed for financing institutions. This banner
// surfaces PENDING_VERIFICATION / REJECTED / SUSPENDED companies (and any
// non-financier org type) wherever the buyer looks at their account, with a
// CTA straight into the business console (the org status lives there).
// Financier institutions are intentionally excluded — the financier banner
// + ActivationSection tracker cover them.
// ─────────────────────────────────────────────────────────────────────────────

import { AlertTriangle, ArrowRight, Building2, Clock, ShieldAlert } from 'lucide-react'
import { useMarketplace } from '@/store/marketplace'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'

const FINANCIER_ORG_TYPES = ['BANK', 'MFI', 'EWALLET'] as const

interface OrgDTO {
  id: string
  name: string
  orgType: string
  status: string
}

interface OrgsResponse {
  organizations: OrgDTO[]
}

const SURFACED = ['PENDING_VERIFICATION', 'REJECTED', 'SUSPENDED'] as const

/**
 * Amber call-out for the user's non-financier organizations that are pending
 * review, rejected or suspended. Renders nothing when every company org is
 * ACTIVE (or the user has none).
 */
export function OrgStatusBanner() {
  const user = useMarketplace((s) => s.user)
  const navigate = useMarketplace((s) => s.navigate)
  const { data } = useApi<OrgsResponse>(user ? '/api/organizations' : null, { skip: !user })

  const orgs = (data?.organizations ?? []).filter(
    (o) =>
      !(FINANCIER_ORG_TYPES as readonly string[]).includes(o.orgType) &&
      (SURFACED as readonly string[]).includes(o.status)
  )
  if (orgs.length === 0) return null

  const org = orgs[0]
  const more = orgs.length - 1
  const negative = org.status !== 'PENDING_VERIFICATION'

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-4 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 shadow-sm dark:border-amber-900 dark:bg-amber-950/40"
    >
      <span
        aria-hidden
        className={
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ' +
          (negative
            ? 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400'
            : 'bg-amber-100 text-amber-600 dark:bg-amber-900 dark:text-amber-400')
        }
      >
        {org.status === 'SUSPENDED' ? (
          <ShieldAlert size={18} />
        ) : negative ? (
          <AlertTriangle size={18} />
        ) : (
          <Clock size={19} />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-amber-900 dark:text-amber-200">
          <Building2 size={14} className="shrink-0" aria-hidden />
          {org.status === 'SUSPENDED'
            ? 'Your business account is suspended'
            : org.status === 'REJECTED'
              ? 'Business application was declined'
              : 'Business application in review'}
          {more > 0 && <span className="font-normal">(+{more} more)</span>}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-amber-800/90 dark:text-amber-300/90">
          {org.status === 'SUSPENDED'
            ? `${org.name} was suspended by the Vendora team — buying as the company is paused while the review is ongoing.`
            : org.status === 'REJECTED'
              ? `${org.name} was declined by the Vendora team — open the business console for the reason and how to reapply.`
              : `${org.name} is pending Vendora verification. You keep full buyer access in the meantime — that is expected, nothing failed.`}
        </p>
      </div>
      <Button
        size="sm"
        className="shrink-0 rounded-xl"
        variant={negative ? 'destructive' : 'default'}
        onClick={() => navigate('business')}
      >
        Open business console <ArrowRight size={14} className="ml-1" />
      </Button>
    </div>
  )
}
