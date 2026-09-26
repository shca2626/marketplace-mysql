'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FINANCIER · OFFERS — the offer pipeline view: requests where an offer can
// be composed or has already been sent. Reuses the request detail (composer
// + withdraw) from the inbox section.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { HandCoins } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import type { FinancingRequestSummaryDTO } from '@/lib/types'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/marketplace/financing/financing-shared'
import { FinancierRequestDetail, RequestCard } from './inbox-section'

const ACTIONABLE = ['FORWARDED_TO_FINANCIER', 'UNDER_FINANCIER_REVIEW', 'OFFERED']

export function OffersSection() {
  const { data, loading, error, refetch } = useApi<{ requests: FinancingRequestSummaryDTO[] }>(
    '/api/financier/requests?limit=100'
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (selectedId) {
    return (
      <FinancierRequestDetail
        requestId={selectedId}
        onBack={() => {
          setSelectedId(null)
          void refetch()
        }}
      />
    )
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    )
  }
  if (error) {
    return (
      <EmptyState icon={HandCoins} title="Could not load offers" description={error}>
        <button type="button" className="rounded-xl border px-4 py-2 text-sm" onClick={() => void refetch()}>
          Retry
        </button>
      </EmptyState>
    )
  }

  const requests = (data?.requests ?? []).filter((r) => ACTIONABLE.includes(r.status) || (r.offerCount ?? 0) > 0)

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Requests awaiting your offer + requests with offers already on the table. Draft offers are invisible to
        applicants until sent (DP-12 revisions create a new row).
      </p>
      {requests.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title="No offer work yet"
          description="Open a forwarded request from your inbox and compose the first offer — amount, rate, tenor, validity and an installment schedule."
        />
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <RequestCard key={r.id} request={r} onOpen={() => setSelectedId(r.id)} />
          ))}
        </div>
      )}
    </div>
  )
}
