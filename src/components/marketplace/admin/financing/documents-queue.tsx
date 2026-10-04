'use client'

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENTS — the universal vault verification queue (FIN-7 sub-tab 2).
// Every uploaded AccountDocument across all users/organizations with its
// media preview, filtered by status; verify is one click, reject needs a
// note. A verified document flips the applicant's vault badge everywhere.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { CheckCircle2, FileCheck2, Loader2, SearchX, XCircle } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { AdminEmptyState, FilterChips, apiRequest, toastApiError } from '../shared'
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
import { formatDate, timeAgo } from '@/lib/format'
import {
  SUBMISSION_STATUS_MAP,
  FinancingStatusBadge,
  documentTypeLabel,
} from '@/components/marketplace/financier/financing-status-badge'
import type { AccountDocumentDTO } from './shared'

const STATUS_FILTERS = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'REJECTED', label: 'Rejected' },
]

export function DocumentsQueue() {
  const [status, setStatus] = useState('PENDING')
  const { data, loading, error, refetch } = useApi<{ documents: AccountDocumentDTO[] }>(
    `/api/admin/documents?status=${status}`
  )
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<AccountDocumentDTO | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const documents = data?.documents ?? []

  const verify = async (doc: AccountDocumentDTO) => {
    setBusyId(doc.id)
    const res = await apiRequest<{ document: AccountDocumentDTO }>(`/api/admin/documents/${doc.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ verdict: 'verify' }),
    })
    setBusyId(null)
    if (!res.ok) return toastApiError(res.error, 'Verification failed')
    toast({
      title: 'Document verified',
      description: `${doc.title ?? documentTypeLabel(doc.documentType)} — the applicant's vault badge is now verified.`,
    })
    void refetch()
  }

  const reject = async () => {
    if (!rejecting) return
    if (note.trim().length < 3) {
      toast({ title: 'A rejection note is required', description: 'The owner sees this reason.', variant: 'destructive' })
      return
    }
    setSaving(true)
    const res = await apiRequest<{ document: AccountDocumentDTO }>(`/api/admin/documents/${rejecting.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ verdict: 'reject', note: note.trim() }),
    })
    setSaving(false)
    if (!res.ok) return toastApiError(res.error, 'Rejection failed')
    toast({ title: 'Document rejected', description: 'The owner was notified with your note.' })
    setRejecting(null)
    setNote('')
    void refetch()
  }

  return (
    <div className="space-y-4">
      <FilterChips options={STATUS_FILTERS} value={status} onChange={setStatus} ariaLabel="Filter documents by status" />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <AdminEmptyState icon={SearchX} title="Couldn't load the document queue" description={error} />
      ) : documents.length === 0 ? (
        <AdminEmptyState
          icon={FileCheck2}
          title={`No ${status.toLowerCase()} documents`}
          description={
            status === 'PENDING'
              ? 'Every uploaded document is verified — the vault queue is clear.'
              : 'Documents in this state will appear here.'
          }
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {documents.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="flex gap-4 p-4">
                <a
                  href={doc.media.urls.full}
                  target="_blank"
                  rel="noreferrer"
                  className="group shrink-0 overflow-hidden rounded-xl border transition-shadow hover:shadow-md"
                  title={`${doc.title ?? doc.documentType} — open full document`}
                >
                  <img
                    src={doc.media.urls.medium}
                    alt={doc.title ?? doc.documentType}
                    className="h-28 w-24 bg-muted object-cover object-top"
                    loading="lazy"
                  />
                </a>
                <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold">{doc.title ?? documentTypeLabel(doc.documentType)}</p>
                      <FinancingStatusBadge status={doc.status} map={SUBMISSION_STATUS_MAP} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {documentTypeLabel(doc.documentType)} · {doc.media.originalName}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {doc.organizationName ? `${doc.organizationName} · ` : 'Personal vault · '}
                      uploaded {formatDate(doc.createdAt)} ({timeAgo(doc.createdAt)})
                    </p>
                    {doc.issuedAt && (
                      <p className="text-[11px] text-muted-foreground">
                        issued {formatDate(doc.issuedAt)}
                        {doc.expiresAt ? ` · expires ${formatDate(doc.expiresAt)}` : ''}
                      </p>
                    )}
                    {doc.note && (
                      <p className="mt-1 rounded-lg bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                        <span className="font-semibold">Note:</span> {doc.note}
                      </p>
                    )}
                  </div>
                  {doc.status === 'PENDING' && (
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        className="rounded-xl bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600"
                        disabled={busyId === doc.id}
                        onClick={() => void verify(doc)}
                      >
                        {busyId === doc.id ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <CheckCircle2 size={14} className="mr-1.5" />}
                        Verify
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-xl text-destructive hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                        disabled={busyId === doc.id}
                        onClick={() => setRejecting(doc)}
                      >
                        <XCircle size={14} className="mr-1.5" /> Reject
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* reject dialog */}
      {rejecting && (
        <Dialog open onOpenChange={(o) => !o && setRejecting(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <XCircle size={17} className="text-destructive" /> Reject document
              </DialogTitle>
              <DialogDescription>
                {rejecting.title ?? documentTypeLabel(rejecting.documentType)} — the owner is notified with your note and
                can upload a corrected file.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="doc-reject-note">Reason (required)</Label>
              <Textarea
                id="doc-reject-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="e.g. The scan is cropped — the document number is unreadable."
                className="rounded-xl"
              />
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setRejecting(null)}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" className="rounded-xl" onClick={() => void reject()} disabled={saving}>
                {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />} Reject document
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
