'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN · FINANCING — DOCUMENTS. The platform-wide vault verification queue
// (DP-27: verified ONCE, reused by every request). Pending documents by
// default; verify / reject (note required) per document.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import {
  Ban,
  BadgeCheck,
  CheckCircle2,
  ExternalLink,
  FileWarning,
  FolderLock,
  Loader2,
  SearchX,
  ShieldAlert,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import type { AccountDocumentDTO } from '@/lib/types'
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
import { motion } from 'framer-motion'
import { VaultDocumentThumb, VaultPreviewImage, vaultOpenAction } from '@/components/documents/vault-media'
import { FilterChips, StatusBadge, apiRequest, toastApiError } from '../shared'
import {
  DOC_STATUS_MAP,
  DOCUMENT_TYPE_LABELS,
  ExpiryChip,
  formatDate,
  timeAgo,
} from '../../financing/financing-shared'

const STATUS_FILTERS = [
  { value: 'PENDING', label: 'Pending review' },
  { value: '', label: 'All documents' },
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'REJECTED', label: 'Rejected' },
]

const PAGE_SIZE = 12

export function DocumentsQueueSection() {
  const [statusFilter, setStatusFilter] = useState('PENDING')
  const [verdict, setVerdict] = useState<{ doc: AccountDocumentDTO; action: 'VERIFY' | 'REJECT' } | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [page, setPage] = useState(1)

  const query = new URLSearchParams()
  if (statusFilter) query.set('status', statusFilter)
  const { data, loading, error, refetch } = useApi<{ documents: AccountDocumentDTO[] }>(
    `/api/admin/financing/documents?${query.toString()}`
  )
  const documents = data?.documents ?? []

  const [appliedFilter, setAppliedFilter] = useState<string | null>(null)
  if (appliedFilter !== statusFilter) {
    setAppliedFilter(statusFilter)
    setPage(1)
  }

  const pages = Math.max(1, Math.ceil(documents.length / PAGE_SIZE))
  const visible = useMemo(
    () => documents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [documents, page]
  )

  const submitVerdict = async () => {
    if (!verdict) return
    if (verdict.action === 'REJECT' && note.trim().length < 3) {
      toast({
        title: 'A rejection note is required',
        description: 'The uploader sees this note on their document card.',
        variant: 'destructive',
      })
      return
    }
    setBusy(true)
    const res = await apiRequest<{ document: AccountDocumentDTO }>(`/api/admin/financing/documents/${verdict.doc.id}`, {
      method: 'POST',
      body: JSON.stringify(
        verdict.action === 'VERIFY' ? { action: 'VERIFY', note: note.trim() || undefined } : { action: 'REJECT', note: note.trim() }
      ),
    })
    setBusy(false)
    if (!res.ok) {
      toastApiError(res.error, 'Verification failed')
      return
    }
    toast({
      title: verdict.action === 'VERIFY' ? 'Document verified' : 'Document rejected',
      description:
        verdict.action === 'VERIFY'
          ? `${DOCUMENT_TYPE_LABELS[verdict.doc.documentType] ?? verdict.doc.documentType} — verified once, reused by every request (DP-27).`
          : 'The uploader was notified and can replace the file.',
    })
    setVerdict(null)
    setNote('')
    void refetch()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3">
        <FolderLock size={18} className="mt-0.5 shrink-0 text-primary" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">One verification per document.</span>{' '}
          KYC evidence is uploaded once to a user/org vault and referenced by every financing,
          accreditation and general KYC flow — verify here and it counts everywhere.
        </p>
      </div>

      <FilterChips
        options={STATUS_FILTERS}
        value={statusFilter}
        onChange={setStatusFilter}
        ariaLabel="Filter vault documents by status"
      />

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-12 text-center">
          <ShieldAlert size={34} className="text-muted-foreground/40" />
          <p className="mt-3 text-sm font-semibold">Couldn't load the documents queue</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">{error}</p>
          <Button variant="outline" className="mt-4 rounded-xl" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}

      {!loading && !error && documents.length === 0 && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-12 text-center">
          <SearchX size={34} className="text-muted-foreground/40" />
          <p className="mt-3 text-sm font-semibold">
            {statusFilter === 'PENDING' ? 'No documents awaiting review' : 'No documents found'}
          </p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            {statusFilter === 'PENDING'
              ? 'New vault uploads appear here the moment they land.'
              : 'Try another status filter.'}
          </p>
        </div>
      )}

      {!loading && !error && visible.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((doc, i) => (
              <motion.div
                key={doc.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, delay: i * 0.03 }}
              >
                <Card className="flex h-full flex-col overflow-hidden">
                  <CardContent className="flex h-full flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <VaultDocumentThumb
                          documentId={doc.id}
                          alt={`${DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType} preview`}
                          className="h-12 w-12 rounded-lg"
                          fallback={<FolderLock size={18} className="text-muted-foreground" />}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold">
                            {DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {doc.title ?? doc.media?.originalName ?? '—'}
                          </p>
                        </div>
                      </div>
                      <StatusBadge status={doc.status} map={DOC_STATUS_MAP} />
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
                      <Badge variant="outline" className="rounded-full px-1.5 text-[10px] font-semibold text-muted-foreground">
                        {doc.organizationName ? 'Company vault' : 'Personal vault'}
                      </Badge>
                      <span className="truncate">{doc.userName}</span>
                      {doc.organizationName && <span className="truncate">· {doc.organizationName}</span>}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
                      {doc.issuedAt && <span>issued {formatDate(doc.issuedAt)}</span>}
                      <span>uploaded {timeAgo(doc.createdAt)}</span>
                      <ExpiryChip expiresAt={doc.expiresAt} />
                    </div>

                    {doc.status === 'REJECTED' && doc.note && (
                      <p className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] font-medium text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                        <FileWarning size={11} className="mr-1 inline" /> {doc.note}
                      </p>
                    )}
                    {doc.status === 'VERIFIED' && doc.note && (
                      <p className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                        <CheckCircle2 size={11} className="mr-1 inline" /> {doc.note}
                      </p>
                    )}

                    <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                      {doc.status === 'PENDING' ? (
                        <>
                          <Button
                            size="sm"
                            className="h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => {
                              setVerdict({ doc, action: 'VERIFY' })
                              setNote('')
                            }}
                          >
                            <BadgeCheck size={13} className="mr-1" /> Verify
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 rounded-lg text-rose-600 hover:text-rose-700"
                            onClick={() => {
                              setVerdict({ doc, action: 'REJECT' })
                              setNote('')
                            }}
                          >
                            <Ban size={13} className="mr-1" /> Reject…
                          </Button>
                        </>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">
                          {doc.status === 'VERIFIED' ? 'Verified once — reused everywhere' : 'Rejected — awaiting replacement'}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={vaultOpenAction(doc.id, () =>
                          toast({ title: 'Could not open this document', variant: 'destructive' })
                        )}
                        className="ml-auto inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <ExternalLink size={11} /> View
                      </button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-lg"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-xs font-semibold tabular-nums">
                Page {page} of {pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-lg"
                disabled={page >= pages}
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}

      {/* Verdict dialog */}
      <Dialog
        open={!!verdict}
        onOpenChange={(v) => {
          if (!v) {
            setVerdict(null)
            setNote('')
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {verdict?.action === 'VERIFY' ? (
                <BadgeCheck size={17} className="text-emerald-600" />
              ) : (
                <Ban size={17} className="text-rose-600" />
              )}
              {verdict?.action === 'VERIFY' ? 'Verify document' : 'Reject document'}
            </DialogTitle>
            <DialogDescription>
              {verdict?.action === 'VERIFY'
                ? 'Verified once, then reused by every request that references it (DP-27).'
                : 'The uploader can replace the file — the note is shown on their vault card.'}
            </DialogDescription>
          </DialogHeader>
          {verdict && (
            <VaultPreviewImage documentId={verdict.doc.id} documentType={verdict.doc.documentType} />
          )}
          <div className="space-y-1.5">
            <Label htmlFor="doc-note" className="text-xs">
              Note {verdict?.action === 'VERIFY' ? '(optional)' : '(required — min 3 characters)'}
            </Label>
            <Textarea
              id="doc-note"
              className="min-h-[72px] rounded-lg"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                verdict?.action === 'VERIFY'
                  ? 'Optional context for the audit trail…'
                  : 'e.g. The scan is blurry — upload a readable copy.'
              }
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => {
                setVerdict(null)
                setNote('')
              }}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              className={cn('rounded-xl', verdict?.action === 'REJECT' && 'bg-rose-600 hover:bg-rose-700')}
              disabled={busy}
              onClick={() => void submitVerdict()}
            >
              {busy && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              {verdict?.action === 'VERIFY' ? 'Verify' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
