'use client'

import { useState } from 'react'
import { Scale, SearchX } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import type { DisputeDTO } from '@/lib/types'
import { formatDate } from '@/lib/format'
import {
  DisputeCard,
  DISPUTE_REASON_LABELS,
  DISPUTE_STATUS_MAP,
  DisputeDetailDialog,
} from '../b2b/disputes'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { AdminEmptyState, FilterChips } from './shared'

/**
 * Admin control tower → Disputes tab (mediation queue).
 * Status-filtered list of every dispute on the platform; the outcome form
 * lives inside the shared dispute detail dialog (admin section).
 */
const FILTERS = [
  { value: 'OPEN', label: 'Open' },
  { value: 'SELLER_RESPONDED', label: 'Seller responded' },
  { value: 'ESCALATED', label: 'Escalated' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'ALL', label: 'All' },
]

export function DisputesTab() {
  const [status, setStatus] = useState('OPEN')
  const query = status === 'ALL' ? '' : `?status=${status}`
  const { data, loading, refetch } = useApi<{ disputes: DisputeDTO[] }>(
    `/api/admin/disputes${query}`
  )
  const [disputeDetail, setDisputeDetail] = useState<DisputeDTO | null>(null)

  const disputes = data?.disputes ?? []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Scale size={18} className="text-primary" /> Dispute mediation queue
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Buyer–seller disputes on delivered orders. Escalated cases need an outcome.
          </p>
        </div>
        {disputes.some((d) => d.status === 'ESCALATED') && (
          <Badge className="rounded-full border-0 bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
            {disputes.filter((d) => d.status === 'ESCALATED').length} escalated
          </Badge>
        )}
      </div>

      <FilterChips
        options={FILTERS}
        value={status}
        onChange={setStatus}
        ariaLabel="Filter disputes by status"
      />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : disputes.length === 0 ? (
        <AdminEmptyState
          icon={SearchX}
          title="No disputes in this state"
          description="When buyers raise disputes on orders they land here for mediation."
        />
      ) : (
        <div className="space-y-3">
          {disputes.map((d) => (
            <button
              key={d.id}
              className="block w-full text-left"
              onClick={() => setDisputeDetail(d)}
            >
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold tracking-wide text-muted-foreground">
                        {d.number}
                      </span>
                      <Badge
                        className={cn(
                          'rounded-full border-0 text-[11px] font-semibold',
                          DISPUTE_STATUS_MAP[d.status]?.badge
                        )}
                      >
                        {DISPUTE_STATUS_MAP[d.status]?.label ?? d.status}
                      </Badge>
                      {d.escalateAt && ['OPEN', 'SELLER_RESPONDED'].includes(d.status) && (
                        <span className="text-[11px] text-muted-foreground">
                          escalates {formatDate(d.escalateAt)}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm font-medium">
                      {DISPUTE_REASON_LABELS[d.reason] ?? d.reason}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {d.buyer.name} vs {d.seller.name} · order {d.orderNumber} ·{' '}
                      {formatDate(d.createdAt)}
                    </p>
                  </div>
                  <span className="text-sm font-bold tabular-nums">{`$${d.orderTotal.toFixed(2)}`}</span>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      )}

      {disputeDetail && (
        <DisputeDetailDialog
          dispute={disputeDetail}
          autoOpen
          onChanged={(d) => {
            setDisputeDetail(d)
            void refetch()
          }}
        >
          {() => <span />}
        </DisputeDetailDialog>
      )}
    </div>
  )
}
