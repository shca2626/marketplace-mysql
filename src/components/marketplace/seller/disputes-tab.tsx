'use client'

import { useMemo, useState } from 'react'
import { Scale } from 'lucide-react'
import { useMarketplace } from '@/store/marketplace'
import { useApi } from '@/hooks/use-api'
import type { DisputeDTO } from '@/lib/types'
import {
  DisputeCard,
  DisputeDetailDialog,
} from '../b2b/disputes'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

/**
 * Seller dashboard → Disputes tab.
 * Lists disputes raised against this seller (response queue) plus the ones
 * they already answered. The response form lives inside the dispute detail
 * dialog (shared with buyer + admin views).
 */
export function SellerDisputesTab({ focusId }: { focusId?: string | null }) {
  const user = useMarketplace((s) => s.user)
  const { data, loading, refetch } = useApi<{ against: DisputeDTO[]; raised: DisputeDTO[] }>(
    user ? '/api/disputes' : null,
    { skip: !user }
  )
  const [filter, setFilter] = useState<'NEEDS_RESPONSE' | 'ALL'>('NEEDS_RESPONSE')
  const [disputeDetail, setDisputeDetail] = useState<DisputeDTO | null>(null)

  const against = data?.against ?? []
  const awaiting = useMemo(
    () => against.filter((d) => d.status === 'OPEN'),
    [against]
  )

  // Deep-link (bell click with ?dispute=…): open the focused dispute once the
  // list loads — render-time derived state, the established pattern here.
  const focusPending = focusId && !disputeDetail
  const focused = focusPending ? (against.find((d) => d.id === focusId) ?? null) : null
  if (focused) setDisputeDetail(focused)

  const list = filter === 'NEEDS_RESPONSE' ? awaiting : against

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as 'NEEDS_RESPONSE' | 'ALL')}>
          <TabsList className="h-9 rounded-xl bg-muted/60 p-1">
            <TabsTrigger value="NEEDS_RESPONSE" className="rounded-lg px-3 text-xs">
              Needs response <span className="ml-1 opacity-70">{awaiting.length}</span>
            </TabsTrigger>
            <TabsTrigger value="ALL" className="rounded-lg px-3 text-xs">
              All <span className="ml-1 opacity-70">{against.length}</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {awaiting.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Respond within the response window — silence can auto-resolve against you.
          </p>
        )}
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">Loading disputes…</CardContent>
        </Card>
      ) : list.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-14 text-center">
            <Scale size={40} className="text-muted-foreground/40" />
            <p className="mt-4 text-sm font-semibold">
              {filter === 'NEEDS_RESPONSE' ? 'No disputes awaiting your response' : 'No disputes against you'}
            </p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              Buyers can raise a dispute when an order arrives damaged, late or not as described. Keep your
              fulfillment tight and this stays empty.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {list.map((d) => (
            <DisputeCard key={d.id} dispute={d} onOpen={setDisputeDetail} />
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
