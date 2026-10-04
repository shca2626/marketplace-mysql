'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FINANCING · DOCUMENTS CENTER (W-VAULT — DP-27, ALL users).
// Personal + organization vault management: upload (multipart through the real
// media pipeline), type filter, replace (new upload + soft-delete of the old),
// soft-delete, PENDING/VERIFIED/REJECTED badges with platform review notes.
// Exports the reusable upload dialog + document picker consumed by the wizard.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Building2,
  CheckCircle2,
  ExternalLink,
  FileWarning,
  FolderLock,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
  User as UserIcon,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import type { AccountDocumentDTO, OrganizationDTO } from '@/lib/types'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { VaultDocumentThumb, vaultOpenAction } from '@/components/documents/vault-media'
import { SENSITIVITY_HINTS, documentSensitivity } from '@/server/modules/documents/sensitivity'
import {
  apiRequest,
  DOC_STATUS_MAP,
  DOCUMENT_TYPE_LABELS,
  EmptyState,
  ExpiryChip,
  formatDate,
  StatusBadge,
  timeAgo,
  toastApiError,
} from '@/components/marketplace/financing/financing-shared'

// ── Upload dialog (reused by the wizard's DOCUMENT checklist + Step 1) ───────

export function UploadDocDialog({
  open,
  onOpenChange,
  defaultType,
  organizationId,
  onUploaded,
  organizations,
  lockType,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pre-selected documentType (wizard checklist items know their type). */
  defaultType?: string
  /** Lock the upload to this org scope (wizard company context). */
  organizationId?: string | null
  /** orgs for the scope picker when not locked. */
  organizations?: OrganizationDTO[]
  onUploaded: (doc: AccountDocumentDTO) => void
  /** When true the type select is disabled (checklist requirements are typed). */
  lockType?: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload a document</DialogTitle>
          <DialogDescription>
            Stored once in your vault and reused by every application — the platform verifies it a
            single time.
          </DialogDescription>
        </DialogHeader>
        {/* Radix unmounts closed dialogs — the form state resets per open. */}
        {open && (
          <UploadDocForm
            defaultType={defaultType}
            organizationId={organizationId}
            organizations={organizations}
            lockType={lockType}
            onUploaded={onUploaded}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function UploadDocForm({
  defaultType,
  organizationId,
  organizations,
  lockType,
  onUploaded,
  onClose,
}: {
  defaultType?: string
  organizationId?: string | null
  organizations?: OrganizationDTO[]
  lockType?: boolean
  onUploaded: (doc: AccountDocumentDTO) => void
  onClose: () => void
}) {
  const [documentType, setDocumentType] = useState(defaultType ?? 'NATIONAL_ID')
  const [title, setTitle] = useState('')
  const [issuedAt, setIssuedAt] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [orgScope, setOrgScope] = useState<string>(organizationId ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  // BUY-206/207: server rejections (past expiry date, PDF/processing failures,
  // size/type limits) render INLINE inside the open dialog instead of being
  // swallowed by a transient toast the user never sees.
  const [apiError, setApiError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const submit = async () => {
    if (!file) return toast({ title: 'Pick a file to upload', variant: 'destructive' })
    setBusy(true)
    setApiError(null)
    const form = new FormData()
    form.append('file', file)
    form.append('documentType', documentType)
    if (title.trim()) form.append('title', title.trim())
    if (issuedAt) form.append('issuedAt', issuedAt)
    if (expiresAt) form.append('expiresAt', expiresAt)
    if (orgScope && orgScope !== 'personal') form.append('organizationId', orgScope)
    const res = await apiRequest<{ document: AccountDocumentDTO }>('/api/documents', {
      method: 'POST',
      body: form as unknown as BodyInit,
    })
    setBusy(false)
    if (!res.ok || !res.data) {
      // Keep the dialog open with the server's reason visible — the user can
      // fix the field/file in place and retry.
      setApiError(res.error ?? 'Upload failed — please check the file and try again.')
      return
    }
    toast({
      title: 'Document uploaded',
      description: `${DOCUMENT_TYPE_LABELS[documentType] ?? documentType} added to your vault — pending platform verification.`,
    })
    onUploaded(res.data.document)
    onClose()
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
            <Label htmlFor="doc-type">Document type</Label>
            <Select value={documentType} onValueChange={setDocumentType} disabled={lockType}>
              <SelectTrigger id="doc-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doc-title">Title (optional)</Label>
            <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Commercial registration 2026" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="doc-issued">Issued on</Label>
              <Input id="doc-issued" type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-expires">Expires on</Label>
              <Input id="doc-expires" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>
          </div>
          {!organizationId && organizations && organizations.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="doc-scope">Vault scope</Label>
              <Select value={orgScope} onValueChange={setOrgScope}>
                <SelectTrigger id="doc-scope" className="w-full">
                  <SelectValue placeholder="Personal vault" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">Personal vault</SelectItem>
                  {organizations.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="doc-file">File</Label>
            <Input
              id="doc-file"
              ref={fileInput}
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null)
                setApiError(null)
              }}
            />
            <p className="text-[11px] text-muted-foreground">Images and PDF · up to 8 MB · inspected by the media pipeline.</p>
          </div>
          {apiError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs font-semibold text-destructive"
            >
              <FileWarning size={14} className="mt-px shrink-0" />
              <span className="min-w-0 break-words">{apiError}</span>
            </div>
          )}
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={onClose}>
            Cancel
          </Button>
          <Button className="rounded-xl" onClick={submit} disabled={busy || !file}>
            {busy ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Upload size={14} className="mr-1.5" />}
            Upload
          </Button>
        </DialogFooter>
    </div>
  )
}

// ── Vault document card (list row shared by center + wizard) ────────────────

export function VaultDocCard({
  doc,
  onReplace,
  onDelete,
  compact,
}: {
  doc: AccountDocumentDTO
  onReplace?: () => void
  onDelete?: () => void
  compact?: boolean
}) {
  const label = DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType
  const sensitivity = doc.sensitivity ?? documentSensitivity(doc.documentType)
  const openDoc = vaultOpenAction(doc.id, () =>
    toast({ title: 'Could not open this document', description: 'The link may have expired — try again.', variant: 'destructive' })
  )

  return (
    <Card className="overflow-hidden">
      <CardContent className={cn('flex flex-col gap-3 p-4', compact && 'p-3')}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <VaultDocumentThumb
              documentId={doc.id}
              alt={`${label} preview`}
              className="h-11 w-11 rounded-lg"
              fallback={<FolderLock size={17} className="text-muted-foreground" />}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{label}</p>
              <p className="truncate text-xs text-muted-foreground">{doc.title ?? doc.media?.originalName ?? '—'}</p>
            </div>
          </div>
          <StatusBadge status={doc.status} map={DOC_STATUS_MAP} />
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span>{doc.organizationName ? `@ ${doc.organizationName}` : 'Personal'}</span>
          {doc.issuedAt && <span>issued {formatDate(doc.issuedAt)}</span>}
          <span>uploaded {timeAgo(doc.createdAt)}</span>
          <ExpiryChip expiresAt={doc.expiresAt} />
        </div>

        <p className="flex items-center gap-1 text-[10.5px] text-muted-foreground/80" title={SENSITIVITY_HINTS[sensitivity]}>
          <FolderLock size={10} className="shrink-0" /> {SENSITIVITY_HINTS[sensitivity]}
        </p>

        {doc.status === 'REJECTED' && doc.note && (
          <p className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] font-medium text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
            <FileWarning size={11} className="mr-1 inline" /> Platform note: {doc.note}
          </p>
        )}
        {doc.status === 'VERIFIED' && doc.note && (
          <p className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
            <CheckCircle2 size={11} className="mr-1 inline" /> {doc.note}
          </p>
        )}

        {(onReplace || onDelete) && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" className="h-8 rounded-lg text-xs" onClick={openDoc}>
              <ExternalLink size={13} className="mr-1.5" /> View
            </Button>
            {onReplace && (
              <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs" onClick={onReplace}>
                <RefreshCw size={13} className="mr-1.5" /> Replace
              </Button>
            )}
            {onDelete && (
              <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs text-destructive hover:text-destructive" onClick={onDelete}>
                <Trash2 size={13} className="mr-1.5" /> Remove
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Vault picker (wizard DOCUMENT checklist rows) ────────────────────────────

export function VaultDocPicker({
  docs,
  selectedId,
  onSelect,
  onUpload,
  documentType,
}: {
  docs: AccountDocumentDTO[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onUpload: () => void
  documentType: string | null
}) {
  const matching = documentType ? docs.filter((d) => d.documentType === documentType) : docs
  return (
    <div className="space-y-2">
      <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
        {matching.length === 0 && (
          <p className="rounded-lg border border-dashed px-3 py-3 text-center text-xs text-muted-foreground">
            No {documentType ? DOCUMENT_TYPE_LABELS[documentType]?.toLowerCase() : 'document'} in your vault yet —
            upload it once and reuse it everywhere.
          </p>
        )}
        {matching.map((d) => (
          <label
            key={d.id}
            className={cn(
              'flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-xs transition-colors',
              selectedId === d.id ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'hover:bg-muted/60'
            )}
          >
            <input
              type="radio"
              name={`doc-${documentType ?? 'any'}`}
              className="h-4 w-4 accent-[var(--primary)]"
              checked={selectedId === d.id}
              onChange={() => onSelect(d.id)}
            />
            <span className="min-w-0 flex-1 truncate font-semibold">{d.title ?? d.media?.originalName ?? d.documentType}</span>
            <StatusBadge status={d.status} map={DOC_STATUS_MAP} />
            <ExpiryChip expiresAt={d.expiresAt} />
          </label>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" className="h-9 w-full rounded-xl text-xs" onClick={onUpload}>
        <Upload size={13} className="mr-1.5" /> Upload {documentType ? DOCUMENT_TYPE_LABELS[documentType]?.toLowerCase() : 'a document'}
      </Button>
    </div>
  )
}

// ── Documents center section ────────────────────────────────────────────────

export function DocumentsSection() {
  const { data: orgsData } = useApi<{ organizations: OrganizationDTO[] }>('/api/organizations')
  const orgs = orgsData?.organizations ?? []

  const [scope, setScope] = useState<'personal' | string>('personal')
  const [typeFilter, setTypeFilter] = useState<string>('ALL')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [version, setVersion] = useState(0)
  const [replaceTarget, setReplaceTarget] = useState<AccountDocumentDTO | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AccountDocumentDTO | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  // BUY-209: the delete guard's answer — the server's block reason (with the
  // live-reference count) shows inside the confirm dialog, and a second,
  // explicit "remove anyway" action sends ?confirm=force.
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteBlocked, setDeleteBlocked] = useState(false)

  const url = scope === 'personal' ? '/api/documents' : `/api/documents?organizationId=${scope}`
  const { data, loading, error, refetch } = useApi<{ documents: AccountDocumentDTO[] }>(url)
  useEffect(() => {
    if (version > 0) void refetch()
  }, [version, refetch])

  const documents = useMemo(() => {
    const all = data?.documents ?? []
    return typeFilter === 'ALL' ? all : all.filter((d) => d.documentType === typeFilter)
  }, [data, typeFilter])

  const counts = useMemo(() => {
    const all = data?.documents ?? []
    return {
      verified: all.filter((d) => d.status === 'VERIFIED').length,
      pending: all.filter((d) => d.status === 'PENDING').length,
      rejected: all.filter((d) => d.status === 'REJECTED').length,
    }
  }, [data])

  const removeDoc = async (doc: AccountDocumentDTO, force = false) => {
    setBusyId(doc.id)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/documents/${doc.id}${force ? '?confirm=force' : ''}`, { method: 'DELETE' })
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        references?: number
        code?: string
      }
      if (!res.ok) {
        if (json.code === 'DOCUMENT_REFERENCED' || (json.references ?? 0) > 0) {
          // Blocked by the reference guard — show WHY inside the dialog and
          // offer the explicit override instead of failing silently.
          setDeleteError(json.error ?? 'This document is attached to active applications.')
          setDeleteBlocked(true)
        } else {
          setDeleteError(json.error ?? 'Could not remove the document')
          setDeleteBlocked(false)
        }
        return
      }
      toast({
        title: 'Document removed',
        description: force
          ? 'Removed anyway — existing applications keep their archived evidence rows.'
          : 'Existing applications keep their evidence rows.',
      })
      setDeleteTarget(null)
      setDeleteError(null)
      setDeleteBlocked(false)
      setVersion((v) => v + 1)
    } catch {
      setDeleteError('Network error — please try again')
      setDeleteBlocked(false)
    } finally {
      setBusyId(null)
    }
  }

  const replaceDoc = async (newDoc: AccountDocumentDTO, old: AccountDocumentDTO) => {
    // Replace = new upload + soft-delete of the old version (verify-once is
    // preserved for history; the new file starts PENDING).
    const res = await apiRequest(`/api/documents/${old.id}`, { method: 'DELETE' })
    if (!res.ok) return toastApiError(res.error, 'Could not archive the previous version')
    toast({
      title: 'Document replaced',
      description: 'The previous version was archived; the new one awaits platform verification.',
    })
    setReplaceTarget(null)
    setVersion((v) => v + 1)
  }

  const scopeOrg = orgs.find((o) => o.id === scope)

  return (
    <div className="space-y-4">
      {/* scope toggle + summary */}
      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => setScope('personal')}
              className={cn(
                'flex min-h-11 items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold transition-colors',
                scope === 'personal' ? 'bg-background shadow-sm' : 'text-muted-foreground'
              )}
            >
              <UserIcon size={13} /> Personal
            </button>
            {orgs.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setScope(o.id)}
                className={cn(
                  'flex min-h-11 items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold transition-colors',
                  scope === o.id ? 'bg-background shadow-sm' : 'text-muted-foreground'
                )}
              >
                <Building2 size={13} /> {o.name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            {counts.verified} verified
          </span>
          <span className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            {counts.pending} pending
          </span>
          {counts.rejected > 0 && (
            <span className="rounded-full bg-rose-100 px-2.5 py-1 font-semibold text-rose-800 dark:bg-rose-950 dark:text-rose-300">
              {counts.rejected} rejected
            </span>
          )}
          <Button size="sm" className="h-11 rounded-xl" onClick={() => setUploadOpen(true)}>
            <Upload size={14} className="mr-1.5" /> Upload
          </Button>
        </div>
      </div>

      <p className="flex items-center gap-2 rounded-2xl border bg-primary/5 px-4 py-3 text-xs font-medium text-foreground/80">
        <FolderLock size={15} className="shrink-0 text-primary" />
        {scope === 'personal'
          ? 'Your personal vault — verified once by the platform, then reused by every application. Never re-upload per request.'
          : `Company vault of ${scopeOrg?.name ?? 'your organization'} — visible to every member and usable as B2B application evidence.`}
      </p>

      {/* type filter */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setTypeFilter('ALL')}
          className={cn(
            'min-h-11 rounded-full border px-3.5 text-xs font-semibold transition-colors',
            typeFilter === 'ALL' ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted/60'
          )}
        >
          All types ({data?.documents.length ?? 0})
        </button>
        {[...new Set((data?.documents ?? []).map((d) => d.documentType))].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTypeFilter(t)}
            className={cn(
              'min-h-11 rounded-full border px-3.5 text-xs font-semibold transition-colors',
              typeFilter === t ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted/60'
            )}
          >
            {DOCUMENT_TYPE_LABELS[t] ?? t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState icon={FolderLock} title="Could not load your vault" description={error}>
          <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
            Retry
          </Button>
        </EmptyState>
      ) : documents.length === 0 ? (
        <EmptyState
          icon={FolderLock}
          title={typeFilter === 'ALL' ? 'Your vault is empty' : 'No documents of this type'}
          description="Upload an ID, commercial registration, bank statement… once. Applications reference them; the platform verifies each document a single time."
        >
          <Button className="rounded-xl" onClick={() => setUploadOpen(true)}>
            <Upload size={14} className="mr-1.5" /> Upload your first document
          </Button>
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {documents.map((d) => (
            <motion.div key={d.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
              <VaultDocCard
                doc={d}
                onReplace={() => setReplaceTarget(d)}
                onDelete={busyId === d.id ? undefined : () => setDeleteTarget(d)}
              />
            </motion.div>
          ))}
        </div>
      )}

      <UploadDocDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        organizations={orgs}
        organizationId={scope === 'personal' ? null : scope}
        onUploaded={() => setVersion((v) => v + 1)}
      />

      {/* Replace flow: upload the new version, then archive the old one */}
      <UploadDocDialog
        open={!!replaceTarget}
        onOpenChange={(open) => !open && setReplaceTarget(null)}
        defaultType={replaceTarget?.documentType}
        organizationId={replaceTarget?.organizationId ?? null}
        lockType
        onUploaded={(doc) => {
          if (replaceTarget) void replaceDoc(doc, replaceTarget)
        }}
      />

      {/* Delete confirm — BUY-209: warns about active-application references
          (server guard answer renders inline; "Remove anyway" sends confirm=force) */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null)
            setDeleteError(null)
            setDeleteBlocked(false)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove this document?</DialogTitle>
            <DialogDescription>
              {deleteTarget && (
                <>
                  {DOCUMENT_TYPE_LABELS[deleteTarget.documentType] ?? deleteTarget.documentType}
                  {deleteTarget.title ? ` — “${deleteTarget.title}”` : ''} will be archived. Applications that already
                  reference it keep their evidence rows, but new checklist items will not be able to pick it.
                  If it is attached to any active application, we will stop and tell you first.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-xs font-semibold text-destructive"
            >
              <FileWarning size={15} className="mt-px shrink-0" />
              <span className="min-w-0 break-words leading-relaxed">{deleteError}</span>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => {
                setDeleteTarget(null)
                setDeleteError(null)
                setDeleteBlocked(false)
              }}
            >
              Keep it
            </Button>
            {deleteBlocked ? (
              <Button
                variant="destructive"
                className="rounded-xl"
                disabled={busyId === deleteTarget?.id}
                onClick={() => deleteTarget && void removeDoc(deleteTarget, true)}
              >
                {busyId === deleteTarget?.id ? (
                  <Loader2 size={14} className="mr-1.5 animate-spin" />
                ) : (
                  <Trash2 size={14} className="mr-1.5" />
                )}
                Remove anyway
              </Button>
            ) : (
              <Button
                variant="destructive"
                className="rounded-xl"
                disabled={busyId === deleteTarget?.id}
                onClick={() => deleteTarget && void removeDoc(deleteTarget)}
              >
                {busyId === deleteTarget?.id ? (
                  <Loader2 size={14} className="mr-1.5 animate-spin" />
                ) : (
                  <Trash2 size={14} className="mr-1.5" />
                )}
                Remove
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
