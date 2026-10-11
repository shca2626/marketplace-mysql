'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FINANCING · SUPPLIER SOURCING (applicant-facing, W-SUP-SRC) — the link
// between a financing request and its supplier RFQ:
//   • create the sourcing RFQ once the platform gate passed (routed ONLY to
//     the financier's accredited suppliers)
//   • consent to supplier routing (consent ≠ agreement — renewed after every
//     material revision; previous versions preserved in the version history)
//   • compare supplier quotes, accept one (a selected quote is NOT financing
//     approval), and convert it to the financed order once the financing
//     agreement is ACTIVE
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileSignature,
  Handshake,
  History,
  Inbox,
  Loader2,
  PackageSearch,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Truck,
  X,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import type { ProductDTO } from '@/lib/types'
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
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  apiRequest,
  EmptyState,
  formatDateTime,
  formatMoney,
  toastApiError,
} from '@/components/marketplace/financing/financing-shared'

interface SourcingQuote {
  id: string
  number: string
  status: string
  total: number
  paymentTerms: string | null
  validUntil: string | null
  createdAt: string
  supplierName: string
  supplierOrgId: string | null
}

interface SourcingState {
  rfq:
    | {
        id: string
        number: string
        title: string | null
        status: string
        version: number
        consentAt: string | null
        createdAt: string
        expiresAt: string | null
        lines: { id: string; productId: string | null; productName: string; quantity: number; targetPrice: number | null; variantName: string | null }[]
        quotes: SourcingQuote[]
      }
    | null
  financing: {
    requestStatus: string
    gatePassed: boolean
    agreementActive: boolean
    agreementNumber: string | null
    accreditedSupplierCount: number
    financierOrgName: string
    financierOrgStatus: string
  }
  history: { id: string; number: string; version: number; consentAt: string | null; status: string; supersededById: string | null; createdAt: string }[]
}

interface DraftLine {
  key: number
  productId: string
  quantity: number
  targetPrice: number | null
  notes: string
}

export function SupplierSourcingPanel({ requestId }: { requestId: string }) {
  const { data, loading, error, refetch } = useApi<SourcingState>(
    `/api/financing/requests/${requestId}/supplier-rfq`
  )
  const [createOpen, setCreateOpen] = useState(false)
  const [reviseOpen, setReviseOpen] = useState(false)
  const [consentBusy, setConsentBusy] = useState(false)
  const [quoteBusy, setQuoteBusy] = useState<string | null>(null)

  const state = data
  const rfq = state?.rfq ?? null
  const fin = state?.financing
  const gatePassed = fin?.gatePassed ?? false

  const recordConsent = async () => {
    if (!rfq) return
    setConsentBusy(true)
    const res = await apiRequest(`/api/rfqs/${rfq.id}/consent`, { method: 'POST' })
    setConsentBusy(false)
    if (!res.ok) return toastApiError(res.error, 'Could not record consent')
    toast({
      title: 'Consent recorded',
      description: `Routing to ${fin?.accreditedSupplierCount ?? 0} accredited supplier(s) of ${fin?.financierOrgName ?? 'the financier'} is now open for v${rfq.version}.`,
    })
    void refetch()
  }

  const actOnQuote = async (quote: SourcingQuote, action: 'accept' | 'decline') => {
    if (!rfq) return
    setQuoteBusy(quote.id)
    // Canonical routes: /api/quotes/[id]/accept | /decline (no body — the
    // previous `/respond` call 404'd and silently blocked quote selection).
    const res = await apiRequest(`/api/quotes/${quote.id}/${action === 'accept' ? 'accept' : 'decline'}`, {
      method: 'POST',
    })
    setQuoteBusy(null)
    if (!res.ok) return toastApiError(res.error, `Could not ${action} the quote`)
    toast({ title: action === 'accept' ? 'Supplier quote accepted' : 'Quote declined' })
    void refetch()
  }

  const convertToOrder = async (quote: SourcingQuote) => {
    if (!rfq) return
    setQuoteBusy(quote.id)
    const res = await apiRequest<{ order: { number: string } }>(`/api/quotes/${quote.id}/convert`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    setQuoteBusy(null)
    if (!res.ok) return toastApiError(res.error, 'Could not create the order')
    toast({
      title: 'Financed order created',
      description: `Order ${res.data?.order.number ?? ''} — fulfillment and repayment now follow the financing agreement.`,
    })
    void refetch()
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="space-y-3 p-4 sm:p-6">
          <Skeleton className="h-6 w-56 rounded-lg" />
          <Skeleton className="h-20 rounded-xl" />
        </CardContent>
      </Card>
    )
  }
  if (error || !fin) {
    return (
      <Card>
        <CardContent className="p-4 sm:p-6">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <AlertTriangle size={14} /> Sourcing state unavailable — {error ?? 'not found'}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 font-mono text-sm font-bold">
              <Truck size={15} className="text-primary" /> Supplier sourcing
              {rfq && (
                <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                  v{rfq.version}
                </span>
              )}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Route this request to the accredited suppliers of {fin.financierOrgName} — they see only the items,
              quantities and target prices. Your financing file stays with the financier.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!rfq && (
              <Button
                className="h-10 rounded-xl"
                disabled={!gatePassed}
                title={gatePassed ? undefined : 'The platform document gate must pass first'}
                onClick={() => setCreateOpen(true)}
              >
                <PackageSearch size={14} className="mr-1.5" /> Source suppliers
              </Button>
            )}
            {rfq && rfq.status !== 'ORDERED' && (
              <Button variant="outline" className="h-10 rounded-xl" onClick={() => setReviseOpen(true)}>
                <History size={14} className="mr-1.5" /> Revise requirement
              </Button>
            )}
          </div>
        </div>

        {!gatePassed && !rfq && (
          <p className="flex items-start gap-2 rounded-xl border bg-muted/40 px-3.5 py-3 text-xs text-muted-foreground">
            <ShieldCheck size={14} className="mt-0.5 shrink-0 text-primary" />
            Supplier sourcing unlocks after the platform completeness gate passes. Finish the required checklist items
            first — routing before the gate would leak an unverified request.
          </p>
        )}

        {gatePassed && !rfq && (
          <p className="flex items-start gap-2 rounded-xl border bg-primary/5 px-3.5 py-3 text-xs text-foreground/80">
            <Send size={14} className="mt-0.5 shrink-0 text-primary" />
            {fin.accreditedSupplierCount} accredited supplier{fin.accreditedSupplierCount === 1 ? '' : 's'} of{' '}
            {fin.financierOrgName} will receive this RFQ once created. You consent to the routing per version.
          </p>
        )}

        {rfq && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
              <span className="font-mono text-xs font-bold text-foreground">{rfq.number}</span>
              <span>Created {formatDateTime(rfq.createdAt)}</span>
              {rfq.expiresAt && (
                <span className="flex items-center gap-1">
                  <Clock3 size={12} /> Expires {formatDateTime(rfq.expiresAt)}
                </span>
              )}
              <span>Status {rfq.status}</span>
            </div>

            {!rfq.consentAt && rfq.status !== 'ORDERED' && (
              <div className="rounded-xl border border-amber-300/70 bg-amber-50 p-3.5 dark:border-amber-900 dark:bg-amber-950/40">
                <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
                  <FileSignature size={13} className="mr-1 inline" /> Renewed consent required for v{rfq.version}
                </p>
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300/90">
                  This version changed materially — suppliers cannot see it until you consent again. Consent only
                  covers routing this RFQ version; it is not the financing agreement.
                </p>
                <Button size="sm" className="mt-2.5 h-9 rounded-xl" disabled={consentBusy} onClick={recordConsent}>
                  {consentBusy ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <CheckCircle2 size={13} className="mr-1.5" />}
                  Consent & open routing
                </Button>
              </div>
            )}

            {/* sourcing lines */}
            <div>
              <p className="mb-2 text-xs font-bold">Items to source</p>
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
                    {rfq.lines.map((l) => (
                      <tr key={l.id} className="border-t">
                        <td className="px-3 py-2">
                          <span className="font-medium">{l.productName}</span>
                          {l.variantName && <span className="text-muted-foreground"> · {l.variantName}</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{l.quantity}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {l.targetPrice ? formatMoney(l.targetPrice) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* quotes */}
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold">
                <Inbox size={13} /> Supplier quotes
                <span className="font-normal text-muted-foreground">({rfq.quotes.length})</span>
              </p>
              {rfq.quotes.length === 0 ? (
                <p className="rounded-xl border border-dashed px-3.5 py-4 text-center text-xs text-muted-foreground">
                  No supplier quotes yet — accredited suppliers respond from their company workspace.
                </p>
              ) : (
                <div className="space-y-2">
                  {rfq.quotes.map((q) => (
                    <div
                      key={q.id}
                      className={cn(
                        'flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3.5 py-3',
                        q.status === 'ACCEPTED' && 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30'
                      )}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold">
                          <Handshake size={12} className="mr-1 inline text-primary" />
                          {q.supplierName}
                          <span className="ml-2 font-mono text-[11px] text-muted-foreground">{q.number}</span>
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {formatMoney(q.total)} total
                          {q.paymentTerms ? ` · ${q.paymentTerms}` : ''}
                          {q.validUntil ? ` · valid until ${formatDateTime(q.validUntil)}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {q.status === 'SENT' && (
                          <>
                            <Button
                              size="sm"
                              className="h-9 rounded-xl"
                              disabled={quoteBusy === q.id}
                              onClick={() => actOnQuote(q, 'accept')}
                            >
                              {quoteBusy === q.id && <Loader2 size={12} className="mr-1 animate-spin" />} Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-9 rounded-xl"
                              disabled={quoteBusy === q.id}
                              onClick={() => actOnQuote(q, 'decline')}
                            >
                              Decline
                            </Button>
                          </>
                        )}
                        {q.status === 'ACCEPTED' && (
                          <Button
                            size="sm"
                            className="h-9 rounded-xl"
                            disabled={!fin.agreementActive || quoteBusy === q.id}
                            title={
                              fin.agreementActive
                                ? 'Create the financed order'
                                : 'Financing is not finalized — accept a financier offer first (selected quote ≠ financing approval)'
                            }
                            onClick={() => convertToOrder(q)}
                          >
                            {quoteBusy === q.id ? (
                              <Loader2 size={12} className="mr-1 animate-spin" />
                            ) : (
                              <ClipboardList size={12} className="mr-1.5" />
                            )}
                            Create order
                          </Button>
                        )}
                        {['DECLINED', 'CONVERTED'].includes(q.status) && (
                          <span className="text-[11px] font-medium text-muted-foreground">{q.status.toLowerCase()}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {rfq.quotes.some((q) => q.status === 'ACCEPTED') && !fin.agreementActive && (
                <p className="mt-2 flex items-start gap-2 rounded-xl border border-amber-300/70 bg-amber-50 px-3.5 py-2.5 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  A selected supplier quote is NOT financing approval — the order unlocks after you accept a financier
                  offer and the agreement {fin.agreementNumber ? `(${fin.agreementNumber})` : ''} becomes active.
                </p>
              )}
            </div>

            {/* version history */}
            {state && state.history.length > 1 && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold">
                  <History size={13} /> Version history
                </p>
                <ul className="space-y-1.5 text-[11px] text-muted-foreground">
                  {state.history.map((h) => (
                    <li key={h.id} className="flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-1.5">
                      <span className="font-mono font-semibold text-foreground">v{h.version}</span>
                      <span className="font-mono">{h.number}</span>
                      <span>{h.status}</span>
                      <span>{h.consentAt ? `consented ${formatDateTime(h.consentAt)}` : 'consent pending'}</span>
                      {h.supersededById && <span className="text-amber-700 dark:text-amber-400">superseded</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>

      <SourcingRfqDialog
        key={`create-${createOpen}`}
        open={createOpen}
        onOpenChange={setCreateOpen}
        requestId={requestId}
        onCreated={() => {
          setCreateOpen(false)
          void refetch()
        }}
        mode="create"
      />
      <SourcingRfqDialog
        key={`revise-${reviseOpen}`}
        open={reviseOpen}
        onOpenChange={setReviseOpen}
        requestId={requestId}
        rfqId={rfq?.id}
        initialLines={rfq?.lines}
        onCreated={() => {
          setReviseOpen(false)
          void refetch()
        }}
        mode="revise"
      />
    </Card>
  )
}

// ── Create / revise dialog ───────────────────────────────────────────────────

function SourcingRfqDialog({
  open,
  onOpenChange,
  requestId,
  rfqId,
  initialLines,
  onCreated,
  mode,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  requestId: string
  rfqId?: string
  initialLines?: { productId: string | null; productName: string; quantity: number; targetPrice: number | null }[]
  onCreated: () => void
  mode: 'create' | 'revise'
}) {
  const { data: catalog } = useApi<{ items: ProductDTO[] }>('/api/products?limit=200&status=ACTIVE', { skip: !open })
  // Initial state derives from props at MOUNT — the parent keys this dialog
  // per-open so remounting resets it (no effects needed).
  const [lines, setLines] = useState<DraftLine[]>(() =>
    mode === 'revise' && initialLines?.length
      ? initialLines.map((l, i) => ({
          key: Date.now() + i,
          productId: l.productId ?? '',
          quantity: l.quantity,
          targetPrice: l.targetPrice,
          notes: '',
        }))
      : [{ key: Date.now(), productId: '', quantity: 1, targetPrice: null, notes: '' }]
  )
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  const products = useMemo(() => catalog?.items ?? [], [catalog])

  const addLine = () => setLines((ls) => [...ls, { key: Date.now(), productId: '', quantity: 1, targetPrice: null, notes: '' }])
  const removeLine = (key: number) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls))
  const patchLine = (key: number, patch: Partial<DraftLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  const valid = lines.length > 0 && lines.every((l) => l.productId && l.quantity >= 1)

  const submit = async () => {
    setBusy(true)
    const payload = {
      title: title.trim() || null,
      description: description.trim() || null,
      lines: lines.map((l) => {
        const p = products.find((x) => x.id === l.productId)
        return {
          productId: l.productId,
          productName: p?.title ?? 'Item',
          quantity: l.quantity,
          targetPrice: l.targetPrice,
          notes: l.notes || null,
        }
      }),
      expiresInDays: 14,
    }
    let res: { ok: boolean; data?: { number: string; routedOrgCount?: number; version?: number }; error?: string }
    if (mode === 'create') {
      res = await apiRequest(`/api/financing/requests/${requestId}/supplier-rfq`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    } else {
      res = await apiRequest(`/api/rfqs/${rfqId}/revise`, {
        method: 'POST',
        body: JSON.stringify({ ...payload, reason: 'Material requirement change' }),
      })
    }
    setBusy(false)
    if (!res.ok) return toastApiError(res.error, mode === 'create' ? 'Could not create the sourcing RFQ' : 'Could not revise')
    toast({
      title: mode === 'create' ? 'Sourcing RFQ created' : 'Revision created',
      description:
        mode === 'create'
          ? `${res.data?.number} — routed to ${res.data?.routedOrgCount ?? 0} accredited supplier(s).`
          : `${res.data?.number} (v${res.data?.version}) — renewed consent required before routing.`,
    })
    onCreated()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Source suppliers for this financing request' : 'Revise the sourcing requirement'}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Pick catalog items, quantities and target prices. Only accredited suppliers of the financier see it — and only the items, never your financing file.'
              : 'A material revision creates a new version and pauses routing until you consent again. Previous versions stay on record.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="src-title">Reference title (optional)</Label>
              <Input
                id="src-title"
                className="rounded-xl"
                placeholder="e.g. Solar pump + inverter package"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="src-desc">Notes for suppliers (optional)</Label>
              <Input
                id="src-desc"
                className="rounded-xl"
                placeholder="Delivery context, site constraints…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
              />
            </div>
          </div>

          <div className="space-y-2">
            {lines.map((l, idx) => {
              const selected = products.find((p) => p.id === l.productId)
              return (
                <div key={l.key} className="grid grid-cols-[1fr_84px_104px_40px] items-end gap-2 rounded-xl border p-2.5">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Item {idx + 1}</Label>
                    <select
                      className="h-10 w-full rounded-xl border bg-transparent px-2.5 text-xs"
                      value={l.productId}
                      onChange={(e) => patchLine(l.key, { productId: e.target.value })}
                    >
                      <option value="">Select a catalog item…</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Qty</Label>
                    <Input
                      type="number"
                      min={1}
                      className="rounded-xl text-right"
                      value={l.quantity}
                      onChange={(e) => patchLine(l.key, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Target $/u</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      className="rounded-xl text-right"
                      value={l.targetPrice ?? ''}
                      placeholder={selected ? String(selected.price) : ''}
                      onChange={(e) => patchLine(l.key, { targetPrice: e.target.value === '' ? null : Number(e.target.value) })}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 rounded-xl text-muted-foreground"
                    onClick={() => removeLine(l.key)}
                    aria-label="Remove item"
                    disabled={lines.length === 1}
                  >
                    <X size={15} />
                  </Button>
                </div>
              )
            })}
            <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={addLine}>
              <Plus size={14} className="mr-1.5" /> Add item
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="h-11 rounded-xl" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="h-11 rounded-xl" disabled={!valid || busy} onClick={submit}>
            {busy ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Send size={14} className="mr-1.5" />}
            {mode === 'create' ? 'Create & route' : 'Create new version'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
