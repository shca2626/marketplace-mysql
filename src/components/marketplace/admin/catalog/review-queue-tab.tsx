'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN CONSOLE → CATALOG REVIEW QUEUE (Phase 4).
// One mechanism, three subjects: seller listings, multi-vendor offers and
// financier services all land here when the publish-review gate routes them.
// Approve → live; Reject → REJECTED with a reason the owner sees. The header
// carries the two platform settings that drive what ends up in the queue.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Banknote,
  Check,
  CheckCircle2,
  ClipboardCheck,
  HandCoins,
  ImageOff,
  Loader2,
  Package,
  ShieldAlert,
  X,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { formatUSD, timeAgo } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { AdminEmptyState, FilterChips, apiRequest, toastApiError } from '../shared'

type QueueKind = 'PRODUCT' | 'OFFER' | 'SERVICE'
type ReviewAction = 'APPROVE' | 'REJECT'

interface QueueSeller {
  id: string
  name: string
  storeName: string | null
  kycLevel: number
}

interface QueueProduct {
  id: string
  title: string
  status: string
  price: number
  createdAt: string
  reviewNote: string | null
  category: string
  seller: QueueSeller
  hasImage: boolean
}

interface QueueOffer {
  id: string
  price: number
  status: string
  createdAt: string
  product: { id: string; title: string; category: string }
  seller: QueueSeller
}

interface QueueService {
  id: string
  name: string
  kind: string
  category: string
  status: string
  createdAt: string
  reviewNote: string | null
  institution: string
}

interface ReviewQueueData {
  products: QueueProduct[]
  offers: QueueOffer[]
  services: QueueService[]
  counts: { products: number; offers: number; services: number }
}

interface CatalogSettingsData {
  settings: { publishReview: 'OFF' | 'NEW_SELLERS' | 'ALL'; editReview: 'OFF' | 'ALL' }
  counts: {
    pendingProducts: number
    pendingOffers: number
    pendingServices: number
    brands: number
    units: number
    categories: number
    orgTypes: number
    curated: number
    popularRanked: number
    merged: number
  }
}

const STATUS_CHIP: Record<string, string> = {
  PENDING_REVIEW: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  REJECTED: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
}

const PUBLISH_MODE_LABEL: Record<string, string> = {
  OFF: 'No review (KYC L2 only)',
  NEW_SELLERS: 'New sellers only',
  ALL: 'Every publish',
}

const KYC_CHIP = (level: number) =>
  level >= 2
    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
    : level === 1
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
      : 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'

/** The settings panel — drives which publishes land in the queue. */
function SettingsCard({ data, onChanged }: { data: CatalogSettingsData; onChanged: (s: CatalogSettingsData['settings']) => void }) {
  const [busy, setBusy] = useState(false)

  const patch = async (next: Partial<CatalogSettingsData['settings']>) => {
    setBusy(true)
    const res = await apiRequest<{ settings: CatalogSettingsData['settings'] }>('/api/admin/catalog', {
      method: 'PATCH',
      body: JSON.stringify(next),
    })
    setBusy(false)
    if (!res.ok || !res.data) {
      toastApiError(res.error, 'Could not update the review settings')
      return
    }
    onChanged(res.data.settings)
    toast({ title: 'Review settings updated' })
  }

  return (
    <Card>
      <CardContent className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[1fr_1fr_1.4fr] lg:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="cq-publish-review" className="text-xs">
            Publish review
          </Label>
          <Select
            value={data.settings.publishReview}
            onValueChange={(v) => void patch({ publishReview: v as CatalogSettingsData['settings']['publishReview'] })}
            disabled={busy}
          >
            <SelectTrigger id="cq-publish-review" className="h-9" aria-label="Publish review mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(['OFF', 'NEW_SELLERS', 'ALL'] as const).map((m) => (
                <SelectItem key={m} value={m}>
                  {PUBLISH_MODE_LABEL[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cq-edit-review" className="text-xs">
            Edits to live listings
          </Label>
          <Select
            value={data.settings.editReview}
            onValueChange={(v) => void patch({ editReview: v as CatalogSettingsData['settings']['editReview'] })}
            disabled={busy}
          >
            <SelectTrigger id="cq-edit-review" className="h-9" aria-label="Edit review mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="OFF">No re-review (default)</SelectItem>
              <SelectItem value="ALL">Every edit re-enters the queue</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {data.settings.publishReview === 'NEW_SELLERS' ? (
            <>
              <span className="font-semibold text-foreground">New sellers only —</span> sellers with zero
              previously-approved listings go through this queue; established merchants publish instantly.
            </>
          ) : data.settings.publishReview === 'ALL' ? (
            <>
              <span className="font-semibold text-foreground">Every publish —</span> all listings, offers and
              financier services wait for approval before going live.
            </>
          ) : (
            <>
              <span className="font-semibold text-foreground">No review —</span> KYC level 2 is the only publish
              gate; moderation stays reactive. The queue stays available for anything already inside it.
            </>
          )}{' '}
          Edits to already-live listings{data.settings.editReview === 'ALL' ? ' re-enter this queue' : ' stay live without re-review'}.
        </p>
      </CardContent>
    </Card>
  )
}

export function CatalogReviewQueueTab() {
  const [queue, setQueue] = useState<ReviewQueueData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [settings, setSettings] = useState<CatalogSettingsData | null>(null)

  const [filter, setFilter] = useState<'products' | 'offers' | 'services'>('products')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<{ kind: QueueKind; label: string; id: string } | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [rejectBusy, setRejectBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [queueRes, settingsRes] = await Promise.all([
        apiRequest<ReviewQueueData>('/api/admin/catalog/review'),
        apiRequest<CatalogSettingsData>('/api/admin/catalog'),
      ])
      if (!queueRes.ok || !queueRes.data) {
        setLoadError(queueRes.error ?? 'Failed to load the review queue')
        setQueue(null)
      } else {
        setQueue(queueRes.data)
      }
      if (settingsRes.ok && settingsRes.data) setSettings(settingsRes.data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const counts = queue?.counts ?? { products: 0, offers: 0, services: 0 }

  /** Optimistic remove → server decision → rollback + error toast on failure. */
  const decide = async (
    kind: QueueKind,
    id: string,
    action: ReviewAction,
    note?: string,
    label = 'This submission'
  ) => {
    const snapshot = queue
    setBusyId(id)
    setQueue((q) => {
      if (!q) return q
      if (kind === 'PRODUCT') return { ...q, products: q.products.filter((p) => p.id !== id) }
      if (kind === 'OFFER') return { ...q, offers: q.offers.filter((o) => o.id !== id) }
      return { ...q, services: q.services.filter((s) => s.id !== id) }
    })
    const res = await apiRequest('/api/admin/catalog/review', {
      method: 'POST',
      body: JSON.stringify({ kind, id, action, note }),
    })
    setBusyId(null)
    if (!res.ok) {
      setQueue(snapshot) // rollback — show the row again with the server's reason
      toastApiError(res.error, action === 'APPROVE' ? 'Could not approve' : 'Could not reject')
      return
    }
    toast({
      title: action === 'APPROVE' ? 'Approved' : 'Rejected',
      description: `${label} — the owner was notified${action === 'REJECT' ? ' with your reason' : ''}.`,
    })
  }

  const confirmReject = async () => {
    if (!rejecting) return
    if (!rejectNote.trim()) {
      toast({
        title: 'Reason required',
        description: 'The rejection reason is shown to the owner — it cannot be empty.',
        variant: 'destructive',
      })
      return
    }
    setRejectBusy(true)
    await decide(rejecting.kind, rejecting.id, 'REJECT', rejectNote.trim(), rejecting.label)
    setRejectBusy(false)
    setRejecting(null)
    setRejectNote('')
  }

  const products = useMemo(() => queue?.products ?? [], [queue])
  const offers = useMemo(() => queue?.offers ?? [], [queue])
  const services = useMemo(() => queue?.services ?? [], [queue])

  const pendingTotal = counts.products + counts.offers + counts.services
  const visibleEmpty =
    (filter === 'products' && products.length === 0) ||
    (filter === 'offers' && offers.length === 0) ||
    (filter === 'services' && services.length === 0)

  return (
    <div className="space-y-5">
      {/* Settings */}
      {loading && !settings && <Skeleton className="h-28 w-full rounded-2xl" />}
      {settings && <SettingsCard data={settings} onChanged={(s) => setSettings((prev) => (prev ? { ...prev, settings: s } : prev))} />}

      {/* Filters */}
      <FilterChips
        ariaLabel="Filter the review queue by kind"
        value={filter}
        onChange={(v) => setFilter(v as typeof filter)}
        options={[
          { value: 'products', label: 'Products', count: counts.products },
          { value: 'offers', label: 'Offers', count: counts.offers },
          { value: 'services', label: 'Services', count: counts.services },
        ]}
      />

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && loadError && (
        <AdminEmptyState icon={ShieldAlert} title="Couldn't load the queue" description={loadError}>
          <Button variant="outline" className="rounded-xl" onClick={() => void load()}>
            Try again
          </Button>
        </AdminEmptyState>
      )}

      {/* Empty */}
      {!loading && !loadError && pendingTotal === 0 && (
        <AdminEmptyState
          icon={CheckCircle2}
          title="Queue clear — nothing awaiting review"
          description="New seller listings, multi-vendor offers and financier services appear here the moment the review gate routes them."
        >
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            <Check size={12} /> All caught up
          </span>
        </AdminEmptyState>
      )}
      {!loading && !loadError && pendingTotal > 0 && visibleEmpty && (
        <AdminEmptyState
          icon={ClipboardCheck}
          title={`${filter.charAt(0).toUpperCase()}${filter.slice(1)} — nothing pending`}
          description="Nothing here right now — switch chips to check the other kinds."
        />
      )}

      {/* Product rows */}
      {!loading && !loadError && filter === 'products' && products.length > 0 && (
        <div className="max-h-[70vh] space-y-3 overflow-y-auto scrollbar-thin pr-1" role="list" aria-label="Listings awaiting review">
          {products.map((p) => (
            <Card key={p.id} role="listitem">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Package size={15} className="shrink-0 text-muted-foreground" />
                      <p className="min-w-0 truncate text-sm font-semibold">{p.title}</p>
                      <Badge className={cn('rounded-full border-0 text-[11px] font-semibold', STATUS_CHIP[p.status] ?? 'bg-muted text-muted-foreground')}>
                        {p.status === 'PENDING_REVIEW' ? 'Pending' : 'Rejected'}
                      </Badge>
                      <Badge className="rounded-full border-0 bg-muted text-[11px] font-medium text-muted-foreground">
                        {p.category}
                      </Badge>
                      {!p.hasImage && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                          title="Approving a listing without images fails — ask the seller to add at least one first"
                        >
                          <ImageOff size={11} /> No image
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {p.seller.storeName ?? p.seller.name} · KYC{' '}
                      <span className={cn('rounded-full px-1.5 py-0.5 font-semibold', KYC_CHIP(p.seller.kycLevel))}>L{p.seller.kycLevel}</span>
                      {' · '}submitted {timeAgo(p.createdAt)} · {formatUSD(p.price)}
                    </p>
                    {p.status === 'REJECTED' && p.reviewNote && (
                      <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
                        <span className="font-semibold">Rejection reason:</span> {p.reviewNote}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {busyId === p.id && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
                    <Button
                      size="sm"
                      className="h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700"
                      disabled={busyId === p.id}
                      onClick={() => void decide('PRODUCT', p.id, 'APPROVE', undefined, p.title)}
                    >
                      <Check size={13} className="mr-1" />
                      {p.status === 'REJECTED' ? 'Re-approve' : 'Approve'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-lg border-rose-300 text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/50"
                      disabled={busyId === p.id}
                      onClick={() => setRejecting({ kind: 'PRODUCT', id: p.id, label: p.title })}
                    >
                      <X size={13} className="mr-1" /> Reject
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Offer rows */}
      {!loading && !loadError && filter === 'offers' && offers.length > 0 && (
        <div className="max-h-[70vh] space-y-3 overflow-y-auto scrollbar-thin pr-1" role="list" aria-label="Offers awaiting review">
          {offers.map((o) => (
            <Card key={o.id} role="listitem">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <HandCoins size={15} className="shrink-0 text-muted-foreground" />
                      <p className="min-w-0 truncate text-sm font-semibold">{o.product.title}</p>
                      <Badge className={cn('rounded-full border-0 text-[11px] font-semibold', STATUS_CHIP[o.status] ?? 'bg-muted text-muted-foreground')}>
                        {o.status === 'PENDING_REVIEW' ? 'Pending' : 'Rejected'}
                      </Badge>
                      <Badge className="rounded-full border-0 bg-muted text-[11px] font-medium text-muted-foreground">
                        {o.product.category}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Offer from {o.seller.storeName ?? o.seller.name} · KYC{' '}
                      <span className={cn('rounded-full px-1.5 py-0.5 font-semibold', KYC_CHIP(o.seller.kycLevel))}>L{o.seller.kycLevel}</span>
                      {' · '}submitted {timeAgo(o.createdAt)} · {formatUSD(o.price)}
                    </p>
                    {o.status === 'REJECTED' && (
                      <p className="text-xs italic text-muted-foreground">Rejected offers keep their row here for re-approval.</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {busyId === o.id && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
                    <Button
                      size="sm"
                      className="h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700"
                      disabled={busyId === o.id}
                      onClick={() => void decide('OFFER', o.id, 'APPROVE', undefined, `Offer on ${o.product.title}`)}
                    >
                      <Check size={13} className="mr-1" /> {o.status === 'REJECTED' ? 'Re-approve' : 'Approve'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-lg border-rose-300 text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/50"
                      disabled={busyId === o.id}
                      onClick={() => setRejecting({ kind: 'OFFER', id: o.id, label: `Offer on ${o.product.title}` })}
                    >
                      <X size={13} className="mr-1" /> Reject
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Financier service rows */}
      {!loading && !loadError && filter === 'services' && services.length > 0 && (
        <div className="max-h-[70vh] space-y-3 overflow-y-auto scrollbar-thin pr-1" role="list" aria-label="Financier services awaiting review">
          {services.map((s) => (
            <Card key={s.id} role="listitem">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Banknote size={15} className="shrink-0 text-muted-foreground" />
                      <p className="min-w-0 truncate text-sm font-semibold">{s.name}</p>
                      <Badge className={cn('rounded-full border-0 text-[11px] font-semibold', STATUS_CHIP[s.status] ?? 'bg-muted text-muted-foreground')}>
                        {s.status === 'PENDING_REVIEW' ? 'Pending' : 'Rejected'}
                      </Badge>
                      <Badge className="rounded-full border-0 bg-muted text-[11px] font-medium text-muted-foreground">
                        {s.kind === 'OTHER' ? s.category : s.kind.replace('_', ' ')}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {s.institution} · submitted {timeAgo(s.createdAt)}
                    </p>
                    {s.status === 'REJECTED' && s.reviewNote && (
                      <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
                        <span className="font-semibold">Rejection reason:</span> {s.reviewNote}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {busyId === s.id && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
                    <Button
                      size="sm"
                      className="h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700"
                      disabled={busyId === s.id}
                      onClick={() => void decide('SERVICE', s.id, 'APPROVE', undefined, s.name)}
                    >
                      <Check size={13} className="mr-1" /> {s.status === 'REJECTED' ? 'Re-approve' : 'Approve'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-lg border-rose-300 text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/50"
                      disabled={busyId === s.id}
                      onClick={() => setRejecting({ kind: 'SERVICE', id: s.id, label: s.name })}
                    >
                      <X size={13} className="mr-1" /> Reject
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Rejection reason dialog */}
      <Dialog
        open={!!rejecting}
        onOpenChange={(open) => {
          if (!open) {
            setRejecting(null)
            setRejectNote('')
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject with a reason</DialogTitle>
            <DialogDescription>
              The reason is shown to the owner (and stored on the row). Rejections without a reason are not
              allowed — be specific so they can fix and resubmit.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="cq-reject-note">Reason</Label>
            <Textarea
              id="cq-reject-note"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="e.g. Photos don't match the specification sheet — upload real product photos and resubmit."
            />
            <p className="text-[11px] text-muted-foreground">{rejectNote.trim().length}/1000 characters</p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setRejecting(null)
                setRejectNote('')
              }}
              disabled={rejectBusy}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmReject()}
              disabled={rejectBusy || !rejectNote.trim()}
              className="min-w-24"
            >
              {rejectBusy && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              Reject submission
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
