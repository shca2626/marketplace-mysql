'use client'

import { useEffect, useState } from 'react'
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  FileClock,
  Loader2,
  ShieldAlert,
  Trash2,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import type { ProductDTO } from '@/lib/types'
import { formatDate } from '@/lib/format'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { ACTOR_TYPE_MAP, AdminEmptyState, StatusBadge, apiRequest, toastApiError } from './shared'

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 9.3 — moderation dialogs with teeth: every destructive action carries
// a mandatory reason (≥10 chars) that lands in the audit log and reaches the
// seller. The audit viewer renders the field-level before→after diffs.
// ─────────────────────────────────────────────────────────────────────────────

export type ModerationAction = 'archive' | 'restore' | 'delete'

const ACTION_META: Record<
  ModerationAction,
  { title: (p: ProductDTO) => string; description: (p: ProductDTO) => string; cta: string; icon: typeof Archive }
> = {
  archive: {
    title: (p) => `Archive “${p.title}”?`,
    description: () =>
      'The listing is hidden from the storefront and preserved for order history. The seller is notified with your reason.',
    cta: 'Archive listing',
    icon: Archive,
  },
  restore: {
    title: (p) => `Restore “${p.title}”?`,
    description: () => 'The listing returns to the public catalog as ACTIVE. The seller is notified with your reason.',
    cta: 'Restore listing',
    icon: ArchiveRestore,
  },
  delete: {
    title: (p) => `Delete “${p.title}” permanently?`,
    description: (p) =>
      p.offerCount && p.offerCount > 0
        ? `This listing has ${p.offerCount} vendor offer${p.offerCount === 1 ? '' : 's'} attached — the platform will refuse a hard delete. Archive it instead.`
        : 'Hard delete is refused while the listing has vendor offers, orders, reviews, favorites or quotes. Otherwise it is removed forever.',
    cta: 'Delete permanently',
    icon: Trash2,
  },
}

export function ProductReasonDialog({
  product,
  action,
  onClose,
  onDone,
}: {
  product: ProductDTO | null
  action: ModerationAction
  onClose: () => void
  onDone: () => void
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const meta = ACTION_META[action]
  const Icon = meta.icon

  // Reset the draft whenever a new product enters the dialog (render-phase
  // reset — avoids cascading effect renders).
  const [lastProduct, setLastProduct] = useState<ProductDTO | null>(product)
  if (product !== lastProduct) {
    setLastProduct(product)
    setReason('')
  }

  const run = async () => {
    if (!product) return
    if (reason.trim().length < 10) {
      toast({
        title: 'Reason required',
        description: 'At least 10 characters — it is audit-logged and shown to the seller.',
        variant: 'destructive',
      })
      return
    }
    setBusy(true)
    const res =
      action === 'delete'
        ? await apiRequest<{ ok: boolean }>(`/api/admin/products/${product.id}`, {
            method: 'DELETE',
            body: JSON.stringify({ reason: reason.trim() }),
          })
        : await apiRequest<{ product: { id: string } }>(`/api/admin/products/${product.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ action, reason: reason.trim() }),
          })
    setBusy(false)
    if (!res.ok) {
      toastApiError(res.error, action === 'delete' ? 'Delete refused' : 'Action failed')
      return
    }
    toast({
      title:
        action === 'archive' ? 'Listing archived' : action === 'restore' ? 'Listing restored' : 'Listing deleted',
      description: `"${product.title}" — reason recorded in the audit log.`,
    })
    onClose()
    onDone()
  }

  return (
    <AlertDialog open={!!product} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{product ? meta.title(product) : ''}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <span>{product ? meta.description(product) : ''}</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="mod-reason" className="text-xs font-semibold">
            Reason <span className="text-rose-600 dark:text-rose-400">*</span>
          </Label>
          <Textarea
            id="mod-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="min-h-16"
            maxLength={1000}
            placeholder="Why? (min 10 characters — audit-logged, sent to the seller)"
          />
          <p className="text-[11px] text-muted-foreground">
            {reason.trim().length < 10 ? `${reason.trim().length}/10 characters minimum` : `${reason.trim().length} characters`}
          </p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={cn(
              action === 'delete' && 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
            )}
            disabled={busy}
            onClick={(e) => {
              e.preventDefault()
              void run()
            }}
          >
            {busy ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Icon size={14} className="mr-1.5" />}
            {meta.cta}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ── Bulk-action reason dialog (one audit entry per action) ──────────────────

export function BulkReasonDialog({
  open,
  count,
  action,
  onClose,
  onApply,
}: {
  open: boolean
  count: number
  action: 'archive' | 'restore' | 'feature' | 'unfeature' | null
  onClose: () => void
  /** Receives the validated reason — performs the bulk call + refresh. */
  onApply: (reason: string) => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  // Reset the draft on open (render-phase reset pattern)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setReason('')
  }

  if (!action) return null

  const label =
    action === 'archive'
      ? `Archive ${count} listing${count === 1 ? '' : 's'}`
      : action === 'restore'
        ? `Restore ${count} listing${count === 1 ? '' : 's'}`
        : action === 'feature'
          ? `Feature ${count} listing${count === 1 ? '' : 's'}`
          : `Unfeature ${count} listing${count === 1 ? '' : 's'}`

  const apply = async () => {
    if (reason.trim().length < 10) {
      toast({
        title: 'Reason required',
        description: 'At least 10 characters — it is audit-logged.',
        variant: 'destructive',
      })
      return
    }
    setBusy(true)
    try {
      await onApply(reason.trim())
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            One audit entry is written for the whole action.{' '}
            {action === 'archive' || action === 'restore'
              ? 'Affected sellers are notified with your reason.'
              : 'Feature placement changes are audit-logged.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="bulk-reason" className="text-xs font-semibold">
            Reason <span className="text-rose-600 dark:text-rose-400">*</span>
          </Label>
          <Textarea
            id="bulk-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="min-h-16"
            maxLength={1000}
            placeholder="Why? (min 10 characters — audit-logged)"
          />
          <p className="text-[11px] text-muted-foreground">
            {reason.trim().length < 10 ? `${reason.trim().length}/10 characters minimum` : `${reason.trim().length} characters`}
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={() => void apply()}>
            {busy && <Loader2 size={14} className="mr-1.5 animate-spin" />}
            Apply to {count} listing{count === 1 ? '' : 's'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Per-edit audit diff viewer ───────────────────────────────────────────────

interface AuditEntryDTO {
  id: string
  actorId: string | null
  actorType: string
  action: string
  summary: string | null
  metadata: unknown
  createdAt: string
}

interface DiffEntry {
  field: string
  before: unknown
  after: unknown
}

function renderValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'string') return v.length > 120 ? `${v.slice(0, 120)}…` : v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

export function ProductAuditDialog({
  product,
  onClose,
}: {
  product: ProductDTO | null
  onClose: () => void
}) {
  const [entries, setEntries] = useState<AuditEntryDTO[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Reset for a newly opened product (render-phase reset pattern)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  if (product && product.id !== loadedFor) {
    setLoadedFor(product.id)
    setEntries(null)
    setError(null)
  }

  useEffect(() => {
    if (!product) return
    const target = product
    let alive = true
    void (async () => {
      const res = await apiRequest<{ entries: AuditEntryDTO[] }>(`/api/admin/products/${target.id}/audit`)
      if (!alive) return
      if (!res.ok || !res.data) setError(res.error ?? 'Failed to load audit trail')
      else setEntries(res.data.entries)
    })()
    return () => {
      alive = false
    }
  }, [product])

  return (
    <Dialog open={!!product} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto scrollbar-thin sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileClock size={16} className="text-primary" /> Audit trail — {product?.title}
          </DialogTitle>
          <DialogDescription>
            Every platform action on this listing, with field-level before → after diffs.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <AdminEmptyState icon={ShieldAlert} title="Couldn't load the audit trail" description={error} />
        )}

        {!error && entries === null && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        )}

        {!error && entries !== null && entries.length === 0 && (
          <AdminEmptyState
            icon={FileClock}
            title="No audit entries yet"
            description="Platform edits, moderation actions and review decisions on this listing will appear here."
          />
        )}

        {entries !== null && entries.length > 0 && (
          <ol className="space-y-3">
            {entries.map((e) => {
              const meta = (e.metadata ?? {}) as {
                reason?: string
                changed?: DiffEntry[]
                changedCount?: number
                action?: string
                before?: unknown
                after?: unknown
                hard?: boolean
              }
              const changed = Array.isArray(meta.changed) ? meta.changed : []
              return (
                <li key={e.id} className="rounded-2xl border bg-muted/20 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={e.actorType} map={ACTOR_TYPE_MAP} />
                      <span className="text-sm font-semibold">{formatActionLabel(e.action)}</span>
                      {e.action === 'PRODUCT_ADMIN_EDITED' && typeof meta.changedCount === 'number' && (
                        <Badge className="rounded-full border-0 bg-amber-100 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          {meta.changedCount} field{meta.changedCount === 1 ? '' : 's'} changed
                        </Badge>
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground" title={formatDate(e.createdAt)}>
                      {formatDate(e.createdAt)}
                    </span>
                  </div>
                  {e.summary && <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{e.summary}</p>}

                  {changed.length > 0 && (
                    <div className="mt-2.5 space-y-1.5">
                      {changed.map((c, i) => (
                        <div
                          key={`${c.field}-${i}`}
                          className="grid items-start gap-1 rounded-xl border bg-background px-3 py-2 text-xs sm:grid-cols-[130px_1fr_auto_1fr] sm:gap-2"
                        >
                          <span className="font-mono text-[11px] font-semibold text-foreground">{c.field}</span>
                          <span className="min-w-0 break-words rounded-lg bg-rose-50 px-2 py-1 font-mono text-[11px] text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                            {renderValue(c.before)}
                          </span>
                          <ArrowRight size={12} className="mx-auto shrink-0 self-center text-muted-foreground" aria-hidden />
                          <span className="min-w-0 break-words rounded-lg bg-emerald-50 px-2 py-1 font-mono text-[11px] text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                            {renderValue(c.after)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  )
}

function formatActionLabel(action: string): string {
  switch (action) {
    case 'PRODUCT_ADMIN_EDITED':
      return 'Platform edit'
    case 'PRODUCT_MODERATED':
      return 'Moderation'
    case 'PRODUCT_BULK_MODERATED':
      return 'Bulk moderation'
    case 'PRODUCT_TAKEDOWN':
      return 'Takedown / delete'
    case 'PRODUCT_CATALOG_CREATED':
      return 'Catalog record created'
    case 'PRODUCT_CLONED':
      return 'Cloned'
    case 'PRODUCT_REVIEW_DECIDED':
      return 'Review decision'
    case 'PRODUCT_PUBLICATION_CONSENT':
      return 'Publication consent'
    default:
      return action
  }
}
