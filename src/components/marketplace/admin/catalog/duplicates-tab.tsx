'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN CONSOLE → CATALOG DUPLICATES (Phase 4).
// The similarity scan: strong pairs (same GTIN, or same MPN within a category)
// and title candidates (≥75% token overlap). Merging converts the duplicate
// seller's listing into an OFFER on the canonical product — destructive-ish, so
// every merge goes through an explicit confirmation that spells it out.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, GitMerge, Loader2, RefreshCw, ShieldAlert } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { AdminEmptyState, apiRequest, toastApiError } from '../shared'

interface DupSide {
  id: string
  title: string
  seller: string
  gtin: string | null
  mpn: string | null
  brand: string | null
}

interface DuplicatePair {
  a: DupSide
  b: DupSide
  category: string
  score: number
  reason: 'GTIN' | 'MPN' | 'TITLE'
}

function SideCard({ side, label }: { side: DupSide; label: string }) {
  return (
    <div className="min-w-0 flex-1 space-y-1.5 rounded-xl border bg-card p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="line-clamp-2 text-sm font-semibold leading-snug">{side.title}</p>
      <p className="truncate text-xs text-muted-foreground">{side.seller}</p>
      <div className="flex flex-wrap gap-1 pt-0.5">
        {side.brand && <Badge className="rounded-full border-0 bg-muted text-[10px] font-medium text-muted-foreground">{side.brand}</Badge>}
        {side.gtin && (
          <Badge className="rounded-full border-0 bg-orange-100 font-mono text-[10px] font-medium text-orange-800 dark:bg-orange-950 dark:text-orange-300">
            GTIN {side.gtin}
          </Badge>
        )}
        {side.mpn && (
          <Badge className="rounded-full border-0 bg-teal-100 font-mono text-[10px] font-medium text-teal-800 dark:bg-teal-950 dark:text-teal-300">
            MPN {side.mpn}
          </Badge>
        )}
      </div>
    </div>
  )
}

export function CatalogDuplicatesTab() {
  const [data, setData] = useState<{ strong: DuplicatePair[]; candidates: DuplicatePair[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [merging, setMerging] = useState<{ pair: DuplicatePair; target: DupSide; duplicate: DupSide } | null>(null)
  const [mergeBusy, setMergeBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await apiRequest<{ strong: DuplicatePair[]; candidates: DuplicatePair[] }>('/api/admin/catalog/duplicates')
      if (!res.ok || !res.data) {
        setLoadError(res.error ?? 'Failed to scan for duplicates')
        setData(null)
      } else {
        setData(res.data)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const rescan = async () => {
    setScanning(true)
    await load()
    setScanning(false)
    toast({ title: 'Scan complete', description: 'The duplicate scan ran against every live, draft and pending listing.' })
  }

  const confirmMerge = async () => {
    if (!merging) return
    setMergeBusy(true)
    const res = await apiRequest('/api/admin/catalog/merge', {
      method: 'POST',
      body: JSON.stringify({ duplicateId: merging.duplicate.id, targetId: merging.target.id }),
    })
    setMergeBusy(false)
    if (!res.ok) {
      toastApiError(res.error, 'Could not merge the listings')
      return
    }
    toast({
      title: 'Merged',
      description: `“${merging.duplicate.title}” became an offer on “${merging.target.title}” — the duplicate archived.`,
    })
    setMerging(null)
    void load()
  }

  const PairCard = ({ pair, variant }: { pair: DuplicatePair; variant: 'strong' | 'candidate' }) => (
    <div
      className={cn(
        'space-y-3 rounded-2xl border p-4',
        variant === 'strong'
          ? 'border-rose-200 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/30'
          : 'border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30'
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            className={cn(
              'rounded-full border-0 text-[11px] font-semibold',
              variant === 'strong'
                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
            )}
          >
            {pair.reason === 'GTIN' ? 'Same GTIN' : pair.reason === 'MPN' ? 'Same MPN' : `${Math.round(pair.score * 100)}% title match`}
          </Badge>
          <Badge className="rounded-full border-0 bg-muted text-[11px] font-medium text-muted-foreground">{pair.category}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-lg"
            onClick={() => setMerging({ pair, target: pair.a, duplicate: pair.b })}
          >
            <GitMerge size={13} className="mr-1" /> Merge A ← B
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-lg"
            onClick={() => setMerging({ pair, target: pair.b, duplicate: pair.a })}
          >
            <GitMerge size={13} className="mr-1" /> Merge B ← A
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <SideCard side={pair.a} label="A" />
        <SideCard side={pair.b} label="B" />
      </div>
    </div>
  )

  const strong = data?.strong ?? []
  const candidates = data?.candidates ?? []

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-sm text-muted-foreground">
          Merging keeps one canonical listing — the duplicate seller&apos;s price, stock and terms become their{' '}
          <span className="font-semibold text-foreground">offer</span> on it, reviews/orders/RFQs re-attach, and the
          duplicate archives.
        </p>
        <Button variant="outline" className="shrink-0 rounded-xl" onClick={() => void rescan()} disabled={scanning}>
          {scanning ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : <RefreshCw size={15} className="mr-1.5" />}
          Re-scan catalog
        </Button>
      </div>

      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      )}

      {!loading && loadError && (
        <AdminEmptyState icon={ShieldAlert} title="Couldn't run the duplicate scan" description={loadError}>
          <Button variant="outline" className="rounded-xl" onClick={() => void load()}>
            Try again
          </Button>
        </AdminEmptyState>
      )}

      {!loading && !loadError && strong.length === 0 && candidates.length === 0 && (
        <AdminEmptyState
          icon={GitMerge}
          title="No duplicates detected"
          description="The scan checks every live, draft and pending listing for shared GTINs, MPNs and near-identical titles."
        />
      )}

      {!loading && !loadError && strong.length > 0 && (
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle size={14} className="text-rose-600" /> Strong matches
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800 dark:bg-rose-950 dark:text-rose-300">
              {strong.length}
            </span>
          </h3>
          <div className="space-y-3">
            {strong.map((pair, i) => (
              <PairCard key={`${pair.a.id}-${pair.b.id}`} pair={pair} variant="strong" />
            ))}
          </div>
        </section>
      )}

      {!loading && !loadError && candidates.length > 0 && (
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle size={14} className="text-amber-600" /> Title candidates
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              {candidates.length}
            </span>
          </h3>
          <p className="text-xs text-muted-foreground">Same category with highly similar titles — verify these really are the same product before merging.</p>
          <div className="max-h-96 space-y-3 overflow-y-auto scrollbar-thin pr-1">
            {candidates.map((pair) => (
              <PairCard key={`${pair.a.id}-${pair.b.id}`} pair={pair} variant="candidate" />
            ))}
          </div>
        </section>
      )}

      {/* Destructive merge confirmation */}
      <Dialog
        open={!!merging}
        onOpenChange={(o) => {
          if (!o) setMerging(null)
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Merge into “{merging?.target.title}”?</DialogTitle>
            <DialogDescription>
              This is hard to undo. Exactly what happens:
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-3 text-xs leading-relaxed text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            <li>
              <span className="font-semibold">{merging?.duplicate.seller}</span>&apos;s listing becomes an{' '}
              <span className="font-semibold">offer</span> on the target — their price, stock, MOQ and SKU carry over.
            </li>
            <li>Reviews, orders, RFQ lines, quotes, favorites and certifications re-attach to the target listing.</li>
            <li>Images merge (up to 6 total); missing brand/GTIN/MPN fill in from the duplicate.</li>
            <li>
              <span className="font-semibold">“{merging?.duplicate.title}” archives</span> — its page disappears and its history lives on through the target.
            </li>
          </ul>
          <div className="rounded-xl border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">Canonical (keeps identity)</p>
            <p className="mt-0.5">{merging?.target.title} — {merging?.target.seller}</p>
            <p className="mt-2 font-semibold text-foreground">Becomes an offer</p>
            <p className="mt-0.5">{merging?.duplicate.title} — {merging?.duplicate.seller}</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setMerging(null)} disabled={mergeBusy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void confirmMerge()} disabled={mergeBusy} className="min-w-28">
              {mergeBusy && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              <GitMerge size={14} className="mr-1.5" /> Merge now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
