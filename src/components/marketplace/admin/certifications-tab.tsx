'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN CONSOLE → PRODUCT CERTIFICATIONS (Phase 3 KYP review queue).
// Datasheets, warranties, certificates of origin, test reports… sellers attach
// them to listings; the platform verifies ONCE here — a VERIFIED row switches
// the product page to the "Verified specs" badge and the compliance block.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import {
  BadgeCheck,
  CalendarClock,
  Check,
  ExternalLink,
  FileBadge,
  FileText,
  FlaskConical,
  Globe,
  Loader2,
  Package,
  ShieldAlert,
  X,
} from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { toast } from '@/hooks/use-toast'
import type { ProductCertificationDTO } from '@/lib/types'
import { formatDate } from '@/lib/format'
import { useMarketplace } from '@/store/marketplace'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { AdminEmptyState, FilterChips, apiRequest, toastApiError } from './shared'

const KIND_META: Record<string, { label: string; icon: typeof FileText; chip: string }> = {
  DATASHEET: { label: 'Datasheet', icon: FileText, chip: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300' },
  WARRANTY: { label: 'Warranty', icon: BadgeCheck, chip: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300' },
  ORIGIN: { label: 'Origin', icon: Globe, chip: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  TEST_REPORT: { label: 'Test report', icon: FlaskConical, chip: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300' },
  CERTIFICATE: { label: 'Certificate', icon: BadgeCheck, chip: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  OTHER: { label: 'Other', icon: FileText, chip: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
}

const STATUS_CHIP: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  VERIFIED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  REJECTED: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
}

export function CertificationsTab() {
  const navigate = useMarketplace((s) => s.navigate)
  const { data, loading, error, refetch } = useApi<{ certifications: ProductCertificationDTO[] }>(
    '/api/admin/certifications'
  )
  const certifications = useMemo(() => data?.certifications ?? [], [data])

  const [filter, setFilter] = useState<'PENDING' | 'VERIFIED' | 'REJECTED' | 'ALL'>('PENDING')
  const [actingId, setActingId] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<ProductCertificationDTO | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [rejectBusy, setRejectBusy] = useState(false)

  const counts = useMemo(
    () => ({
      PENDING: certifications.filter((c) => c.status === 'PENDING').length,
      VERIFIED: certifications.filter((c) => c.status === 'VERIFIED').length,
      REJECTED: certifications.filter((c) => c.status === 'REJECTED').length,
      ALL: certifications.length,
    }),
    [certifications]
  )
  const visible = useMemo(
    () => (filter === 'ALL' ? certifications : certifications.filter((c) => c.status === filter)),
    [certifications, filter]
  )

  const verify = async (cert: ProductCertificationDTO, approve: boolean, note?: string) => {
    setActingId(cert.id)
    const res = await apiRequest(`/api/admin/certifications/${cert.id}/verify`, {
      method: 'POST',
      body: JSON.stringify({ approve, ...(note ? { note } : {}) }),
    })
    setActingId(null)
    if (!res.ok) {
      toastApiError(res.error, 'Could not record the verdict')
      return
    }
    toast({
      title: approve ? 'Certification verified' : 'Certification rejected',
      description: approve
        ? `${cert.title} — the product now shows the Verified specs badge.`
        : `${cert.title} — the seller was notified${note ? ' with your note' : ''}.`,
    })
    void refetch()
  }

  const confirmReject = async () => {
    if (!rejecting) return
    setRejectBusy(true)
    await verify(rejecting, false, rejectNote.trim() || undefined)
    setRejectBusy(false)
    setRejecting(null)
    setRejectNote('')
  }

  return (
    <div className="space-y-5">
      <p className="max-w-xl text-sm text-muted-foreground">
        The KYP review queue — verify a seller&apos;s datasheet, warranty or test report once and every
        buyer sees the trust signal on the product page. Verified rows power the{' '}
        <span className="inline-flex items-center gap-1 font-semibold text-foreground">
          <BadgeCheck size={13} className="text-emerald-600" /> Verified specs
        </span>{' '}
        badge.
      </p>

      <FilterChips
        ariaLabel="Filter certifications by status"
        value={filter}
        onChange={(v) => setFilter(v as typeof filter)}
        options={[
          { value: 'PENDING', label: 'Pending', count: counts.PENDING },
          { value: 'VERIFIED', label: 'Verified', count: counts.VERIFIED },
          { value: 'REJECTED', label: 'Rejected', count: counts.REJECTED },
          { value: 'ALL', label: 'All', count: counts.ALL },
        ]}
      />

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {!loading && error && (
        <AdminEmptyState icon={ShieldAlert} title="Couldn't load the queue" description={error}>
          <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
            Try again
          </Button>
        </AdminEmptyState>
      )}

      {!loading && !error && certifications.length === 0 && (
        <AdminEmptyState
          icon={FileBadge}
          title="No certifications yet"
          description="Sellers attach datasheets, warranties and test reports in the product form — their submissions land here for review."
        />
      )}

      {!loading && !error && certifications.length > 0 && visible.length === 0 && (
        <AdminEmptyState
          icon={FileBadge}
          title={filter === 'PENDING' ? 'Queue clear' : `No ${filter.toLowerCase()} rows`}
          description={
            filter === 'PENDING'
              ? 'Nothing awaiting review — new seller submissions appear here automatically.'
              : 'Switch filters to see the other verdicts.'
          }
        />
      )}

      {!loading && !error && visible.length > 0 && (
        <div className="max-h-[70vh] space-y-3 overflow-y-auto scrollbar-thin pr-1" role="list" aria-label="Product certifications">
          {visible.map((cert) => {
            const kind = KIND_META[cert.kind] ?? { label: cert.kind, icon: FileText, chip: 'bg-muted text-muted-foreground' }
            const KindIcon = kind.icon
            const busy = actingId === cert.id
            return (
              <Card key={cert.id} className="transition-colors hover:border-primary/30">
                <CardContent className="space-y-3 p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={cn('shrink-0 rounded-full border-0 text-[11px] font-semibold', kind.chip)}>
                          <KindIcon size={11} className="mr-1" />
                          {kind.label}
                        </Badge>
                        <p className="min-w-0 truncate text-sm font-semibold">{cert.title}</p>
                        <Badge className={cn('shrink-0 rounded-full border-0 text-[11px] font-semibold', STATUS_CHIP[cert.status])}>
                          {cert.status}
                        </Badge>
                      </div>
                      <button
                        type="button"
                        onClick={() => navigate('product', { productId: cert.productId })}
                        className="mt-1.5 flex items-center gap-1.5 text-left text-xs text-primary transition-colors hover:text-primary/80 hover:underline"
                      >
                        <Package size={12} className="shrink-0" />
                        <span className="truncate">{cert.productTitle ?? 'View product'}</span>
                        <ExternalLink size={11} className="shrink-0" />
                      </button>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Seller: <span className="font-medium text-foreground">{cert.sellerName ?? '—'}</span>
                        {cert.issuedBy ? ` · Issued by ${cert.issuedBy}` : ''}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      {cert.status === 'PENDING' ? (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            className="rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                            disabled={busy}
                            onClick={() => void verify(cert, true)}
                          >
                            {busy ? <Loader2 size={13} className="mr-1 animate-spin" /> : <Check size={13} className="mr-1" />}
                            Verify
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-lg border-rose-300 text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950"
                            disabled={busy}
                            onClick={() => {
                              setRejectNote('')
                              setRejecting(cert)
                            }}
                          >
                            <X size={13} className="mr-1" /> Reject
                          </Button>
                        </div>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">
                          {cert.verifiedAt ? `Decided ${formatDate(cert.verifiedAt)}` : cert.status}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-2.5 text-xs text-muted-foreground">
                    {cert.url && (
                      <a
                        href={cert.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <ExternalLink size={11} /> Open artifact link
                      </a>
                    )}
                    {cert.issuedAt && (
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock size={11} /> Issued {formatDate(cert.issuedAt)}
                      </span>
                    )}
                    {cert.expiresAt && (
                      <span className={cn('inline-flex items-center gap-1', new Date(cert.expiresAt) < new Date() && 'font-semibold text-rose-600 dark:text-rose-400')}>
                        <CalendarClock size={11} /> Expires {formatDate(cert.expiresAt)}
                      </span>
                    )}
                    <span className="ml-auto">Submitted {formatDate(cert.createdAt)}</span>
                  </div>

                  {cert.note && (
                    <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                      <span className="font-semibold">Review note:</span> {cert.note}
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Reject-with-note dialog */}
      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject “{rejecting?.title}”?</DialogTitle>
            <DialogDescription>
              The seller is notified immediately and can fix or replace the artifact. A short note
              explains what to correct.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reject-note">
              Note to the seller <span className="text-xs text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="reject-note"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              maxLength={500}
              placeholder="e.g. The datasheet link opens a private Google Drive — attach a public URL or upload the PDF."
              className="min-h-20"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRejecting(null)} disabled={rejectBusy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmReject()}
              disabled={rejectBusy}
              className="min-w-28"
            >
              {rejectBusy && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              Reject certification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
