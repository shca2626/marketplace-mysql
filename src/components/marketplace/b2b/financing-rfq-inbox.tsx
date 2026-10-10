'use client'

// ─────────────────────────────────────────────────────────────────────────────
// B2B SELLING · FINANCING RFQ INBOX (supplier-facing, W-SUP-INBOX) —
// financing-linked sourcing RFQs routed to this company because it holds a LIVE
// accreditation from the financing institution. Minimum disclosure: items,
// quantities, target prices only — applicant identity and financing documents
// never appear here. Quoting requires the company's ACTIVE offers on the
// referenced catalog products (org-context quoting).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import {
  BadgeCheck,
  Inbox,
  Loader2,
  Quote as QuoteIcon,
  Send,
  ShieldCheck,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { Skeleton } from '@/components/ui/skeleton'
import { apiRequest, toastApiError } from '@/components/marketplace/financing/financing-shared'
import { EmptyState, formatMoney } from '@/components/marketplace/financing/financing-shared'

interface InboxRfq {
  id: string
  number: string
  title: string | null
  description: string | null
  status: string
  version: number
  createdAt: string
  lines: { productId: string | null; productName: string; quantity: number; targetPrice: number | null }[]
  quoteCount: number
  myQuoteIds: string[]
}

export function FinancingRfqInboxSub({ organizationId }: { organizationId: string }) {
  const { data, loading, error, refetch } = useApi<{ rfqs: InboxRfq[] }>(
    `/api/supplier-rfqs/inbox?organizationId=${organizationId}`
  )
  const [quoting, setQuoting] = useState<InboxRfq | null>(null)

  const rfqs = useMemo(() => data?.rfqs ?? [], [data])

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </div>
    )
  }
  if (error) {
    return (
      <EmptyState icon={Inbox} title="Could not load the financing inbox" description={error}>
        <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
          Retry
        </Button>
      </EmptyState>
    )
  }

  return (
    <div className="space-y-3">
      <p className="flex items-start gap-2 rounded-xl border bg-primary/5 px-3.5 py-3 text-xs text-foreground/80">
        <ShieldCheck size={14} className="mt-0.5 shrink-0 text-primary" />
        Financing-linked requests reach your company through a live accreditation with the financing institution. You see
        the items, quantities and target prices — nothing about the applicant or their financing file. Quote from your
        company&apos;s active catalog offers.
      </p>

      {rfqs.length === 0 ? (
        <EmptyState
          icon={BadgeCheck}
          title="No financing-linked requests right now"
          description="When a financier's accredited customer sources goods you offer, the request appears here."
        />
      ) : (
        rfqs.map((rfq) => (
          <Card key={rfq.id}>
            <CardContent className="space-y-3 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-bold">
                    {rfq.number}
                    <span className="ml-2 rounded-md bg-neutral-100 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                      v{rfq.version}
                    </span>
                    {rfq.myQuoteIds.length > 0 && (
                      <span className="ml-2 rounded-md bg-emerald-100 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        quoted
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {rfq.title ?? 'Sourcing request'} · {rfq.quoteCount} quote{rfq.quoteCount === 1 ? '' : 's'} received
                  </p>
                </div>
                <Button size="sm" className="h-10 rounded-xl" onClick={() => setQuoting(rfq)}>
                  <QuoteIcon size={13} className="mr-1.5" />
                  {rfq.myQuoteIds.length > 0 ? 'Quote again' : 'Submit quote'}
                </Button>
              </div>

              <div className="overflow-hidden rounded-xl border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Item</th>
                      <th className="px-3 py-2 text-right font-semibold">Qty</th>
                      <th className="px-3 py-2 text-right font-semibold">Target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rfq.lines.map((l, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2">{l.productName}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{l.quantity}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {l.targetPrice ? formatMoney(l.targetPrice) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ))
      )}

      <SupplierQuoteDialog
        rfq={quoting}
        onOpenChange={(open) => !open && setQuoting(null)}
        onDone={() => {
          setQuoting(null)
          void refetch()
        }}
      />
    </div>
  )
}

// ── Quote composer (company-context quoting on the org's offers) ────────────

function SupplierQuoteDialog({
  rfq,
  onOpenChange,
  onDone,
}: {
  rfq: InboxRfq | null
  onOpenChange: (open: boolean) => void
  onDone: () => void
}) {
  const [unitPrices, setUnitPrices] = useState<Record<number, string>>({})
  const [paymentTerms, setPaymentTerms] = useState('NET-30')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  const lines = rfq?.lines ?? []
  const withProduct = lines.map((l, i) => ({ ...l, index: i })).filter((l) => !!l.productId)

  const submit = async () => {
    if (!rfq) return
    const quoteLines = withProduct
      .map((l) => ({
        productId: l.productId as string,
        quantity: l.quantity,
        unitPrice: Number(unitPrices[l.index] ?? 0),
      }))
      .filter((l) => l.unitPrice > 0)
    if (quoteLines.length === 0) {
      toast({ title: 'Enter at least one unit price', variant: 'destructive' })
      return
    }
    setBusy(true)
    const res = await apiRequest<{ quote: { number: string } }>(`/api/rfqs/${rfq.id}/quotes`, {
      method: 'POST',
      body: JSON.stringify({ lines: quoteLines, paymentTerms, notes: notes || null }),
    })
    setBusy(false)
    if (!res.ok) return toastApiError(res.error, 'Could not submit the quote')
    toast({ title: 'Quote submitted', description: `${res.data?.quote.number} — the applicant can now compare offers.` })
    onDone()
  }

  const total = withProduct.reduce((sum, l) => sum + (Number(unitPrices[l.index]) || 0) * l.quantity, 0)

  return (
    <Dialog open={!!rfq} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Quote {rfq?.number}</DialogTitle>
          <DialogDescription>
            Price the items from your company&apos;s catalog offers. The applicant sees your company, totals and payment
            terms — never your margins or stock levels.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Item</th>
                  <th className="px-3 py-2 text-right font-semibold">Qty</th>
                  <th className="px-3 py-2 text-right font-semibold">$/unit</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2">
                      {l.productName}
                      {!l.productId && (
                        <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400">(open item)</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.quantity}</td>
                    <td className="px-2 py-1.5 text-right">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        className="h-9 rounded-lg text-right"
                        placeholder={l.targetPrice ? String(l.targetPrice) : ''}
                        disabled={!l.productId}
                        value={unitPrices[i] ?? ''}
                        onChange={(e) => setUnitPrices((p) => ({ ...p, [i]: e.target.value }))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pay-terms">Payment terms</Label>
              <Input
                id="pay-terms"
                className="rounded-xl"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                maxLength={24}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-notes">Notes (optional)</Label>
              <Input id="q-notes" className="rounded-xl" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
            </div>
          </div>

          <p className="text-right text-xs font-semibold">
            Quote total: <span className="tabular-nums text-primary">{formatMoney(total)}</span>
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" className="h-11 rounded-xl" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="h-11 rounded-xl" disabled={busy || withProduct.length === 0} onClick={submit}>
            {busy ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Send size={14} className="mr-1.5" />} Submit
            quote
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
