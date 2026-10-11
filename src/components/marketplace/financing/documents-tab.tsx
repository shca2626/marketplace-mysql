'use client'

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENTS CENTER — the universal vault (DP-27): every user/org manages their
// documents once; the platform verifies each once; financing checklists reuse
// them everywhere. GET/POST /api/documents (multipart ≤6 × 8MB) +
// PATCH /api/documents/[id] (meta / deactivate). Replace = deactivate + upload
// the corrected version as a NEW document (verified docs are frozen server-side).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  CalendarClock,
  FileText,
  FolderLock,
  Loader2,
  Pencil,
  RefreshCcw,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/format'
import { apiRequest } from '@/components/marketplace/b2b/b2b-shared'
import { documentTypeLabel } from '@/components/marketplace/financier/financing-status-badge'
import { DocStatusBadge } from './checklist'
import type { AccountDocumentDTO, OrgLiteDTO } from './shared'

const DOC_TYPES = [
  'NATIONAL_ID', 'PASSPORT', 'RESIDENCE_PERMIT', 'COMMERCIAL_REG', 'TAX_CARD',
  'BUSINESS_LICENSE', 'BANK_STATEMENT', 'FINANCIAL_STATEMENT', 'PROOF_OF_ADDRESS',
  'GUARANTEE_DOC', 'FEASIBILITY_STUDY', 'INVOICE', 'PURCHASE_ORDER', 'PROJECT_FILE',
  'OTHER',
] as const

const MAX_BYTES = 8 * 1024 * 1024
const MAX_FILES = 6

export function DocumentsTab() {
  const { data, loading, refetch } = useApi<{ documents: AccountDocumentDTO[] }>('/api/documents')
  const { data: orgsData } = useApi<{ organizations: OrgLiteDTO[] }>('/api/organizations')
  const orgs = orgsData?.organizations ?? []
  const documents = data?.documents ?? []

  const [typeFilter, setTypeFilter] = useState<string>('ALL')
  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE')

  const filtered = useMemo(
    () =>
      documents.filter(
        (d) =>
          (typeFilter === 'ALL' || d.documentType === typeFilter) &&
          (statusFilter === 'ALL' ||
            (statusFilter === 'ACTIVE' ? d.isActive : d.status === statusFilter))
      ),
    [documents, typeFilter, statusFilter]
  )

  // ── Upload dialog ──
  const [uploadOpen, setUploadOpen] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [documentType, setDocumentType] = useState<string>('')
  const [title, setTitle] = useState('')
  const [issuedAt, setIssuedAt] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [organizationId, setOrganizationId] = useState<string>('PERSONAL')
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Meta edit dialog ──
  const [editDoc, setEditDoc] = useState<AccountDocumentDTO | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editIssuedAt, setEditIssuedAt] = useState('')
  const [editExpiresAt, setEditExpiresAt] = useState('')
  const [savingMeta, setSavingMeta] = useState(false)

  const openUpload = (prefillType?: string) => {
    setFiles([])
    setDocumentType(prefillType ?? '')
    setTitle('')
    setIssuedAt('')
    setExpiresAt('')
    setOrganizationId('PERSONAL')
    setUploadOpen(true)
  }

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return
    const next = [...files]
    const rejected: string[] = []
    for (const f of Array.from(incoming)) {
      if (next.length >= MAX_FILES) {
        rejected.push(`${f.name} (max ${MAX_FILES} files)`)
        continue
      }
      if (f.size > MAX_BYTES) {
        rejected.push(`${f.name} (over 8 MB)`)
        continue
      }
      if (!/^image\/(jpeg|png|webp|gif)$/.test(f.type)) {
        rejected.push(`${f.name} (images only: JPG/PNG/WebP/GIF)`)
        continue
      }
      next.push(f)
    }
    setFiles(next)
    if (rejected.length > 0) {
      toast({ title: 'Some files were skipped', description: rejected.join(' · '), variant: 'destructive' })
    }
  }

  const submitUpload = async () => {
    if (uploading) return
    if (files.length === 0) {
      toast({ title: 'Pick at least one file', description: 'Scans or photos of the original document (JPG/PNG/WebP/GIF, up to 8 MB each).' })
      return
    }
    if (!documentType) {
      toast({ title: 'Choose the document type', description: 'The type drives checklist matching and verification.' })
      return
    }
    setUploading(true)
    const form = new FormData()
    for (const f of files) form.append('file', f)
    form.append('documentType', documentType)
    if (title.trim()) form.append('title', title.trim())
    if (issuedAt) form.append('issuedAt', issuedAt)
    if (expiresAt) form.append('expiresAt', expiresAt)
    if (organizationId !== 'PERSONAL') form.append('organizationId', organizationId)
    try {
      const res = await fetch('/api/documents', { method: 'POST', body: form })
      const json = (await res.json().catch(() => ({}))) as {
        documents?: AccountDocumentDTO[]
        errors?: { name: string; error: string }[]
        error?: string
      }
      if (!res.ok && !json.documents?.length) {
        toast({ title: 'Upload failed', description: json.error ?? json.errors?.[0]?.error ?? 'Please try again', variant: 'destructive' })
      } else {
        const okCount = json.documents?.length ?? 0
        const errCount = json.errors?.length ?? 0
        toast({
          title: `${okCount} document${okCount === 1 ? '' : 's'} uploaded`,
          description:
            errCount > 0
              ? `${errCount} file${errCount === 1 ? '' : 's'} failed: ${json.errors?.map((e) => e.error).join(' · ')}`
              : 'The platform verifies each document once — watch the status here.',
        })
        setUploadOpen(false)
        void refetch()
      }
    } catch {
      toast({ title: 'Upload failed', description: 'Network error — please try again', variant: 'destructive' })
    } finally {
      setUploading(false)
    }
  }

  const saveMeta = async () => {
    if (!editDoc || savingMeta) return
    setSavingMeta(true)
    const res = await apiRequest<{ document: AccountDocumentDTO }>(`/api/documents/${editDoc.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        title: editTitle.trim() || null,
        issuedAt: editIssuedAt || null,
        expiresAt: editExpiresAt || null,
      }),
    })
    setSavingMeta(false)
    if (!res.ok) {
      toast({ title: 'Could not save', description: res.error, variant: 'destructive' })
      return
    }
    toast({ title: 'Document updated' })
    setEditDoc(null)
    void refetch()
  }

  const deactivate = async (doc: AccountDocumentDTO) => {
    const res = await apiRequest(`/api/documents/${doc.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: false }),
    })
    if (!res.ok) {
      toast({ title: 'Could not deactivate', description: res.error, variant: 'destructive' })
      return
    }
    toast({ title: 'Document deactivated', description: 'Upload the corrected version to replace it.' })
    void refetch()
  }

  const openEdit = (doc: AccountDocumentDTO) => {
    setEditTitle(doc.title ?? '')
    setEditIssuedAt(doc.issuedAt?.slice(0, 10) ?? '')
    setEditExpiresAt(doc.expiresAt?.slice(0, 10) ?? '')
    setEditDoc(doc)
  }

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            {documents.filter((d) => d.isActive && d.status === 'VERIFIED').length} verified
          </span>
          <span className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            {documents.filter((d) => d.isActive && d.status === 'PENDING').length} pending
          </span>
          <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground">
            {documents.filter((d) => !d.isActive).length} replaced/deactivated
          </span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-9 w-40 rounded-xl text-xs" aria-label="Filter by type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All types</SelectItem>
              {DOC_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{documentTypeLabel(t)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-40 rounded-xl text-xs" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">Active only</SelectItem>
              <SelectItem value="ALL">All statuses</SelectItem>
              <SelectItem value="VERIFIED">Verified</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <Button className="h-9 rounded-xl text-xs" onClick={() => openUpload()}>
            <Upload size={14} className="mr-1.5" /> Upload documents
          </Button>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-14 text-center">
          <FolderLock size={34} className="text-muted-foreground/40" />
          <p className="mt-3 text-sm font-semibold">Nothing in your vault yet</p>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">
            Upload your ID, commercial registration, tax card or bank statements once — the platform verifies each
            document once and every financing application reuses them.
          </p>
          <Button className="mt-5 rounded-xl" onClick={() => openUpload()}>
            <Upload size={15} className="mr-1.5" /> Upload your first document
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((d, i) => (
            <motion.div
              key={d.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: Math.min(i * 0.04, 0.2) }}
              className={cn(
                'flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-all hover:shadow-md',
                !d.isActive && 'opacity-60'
              )}
            >
              <button
                type="button"
                className="relative block h-36 w-full cursor-zoom-in bg-muted"
                onClick={() => window.open(d.media.url, '_blank', 'noopener')}
                aria-label={`Open ${d.title ?? d.media.originalName}`}
              >
                {d.media.url ? (
                  <img src={d.media.url} alt={d.title ?? d.media.originalName} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <FileText size={28} />
                  </span>
                )}
                <span className="absolute left-2.5 top-2.5 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground/80 backdrop-blur">
                  {documentTypeLabel(d.documentType) ?? d.documentType}
                </span>
                {!d.isActive && (
                  <span className="absolute right-2.5 top-2.5 rounded-full bg-neutral-800/85 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    Replaced
                  </span>
                )}
              </button>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold" title={d.title ?? d.media.originalName}>
                    {d.title ?? d.media.originalName}
                  </p>
                  <DocStatusBadge status={d.status} />
                </div>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  {d.issuedAt && (
                    <span className="flex items-center gap-1">
                      <CalendarClock size={11} /> issued {formatDate(d.issuedAt)}
                    </span>
                  )}
                  {d.expiresAt && (
                    <span
                      className={cn(
                        'flex items-center gap-1 font-medium',
                        new Date(d.expiresAt) < new Date() && 'text-rose-600 dark:text-rose-400'
                      )}
                    >
                      expires {formatDate(d.expiresAt)}
                    </span>
                  )}
                  {d.organizationName && (
                    <span className="rounded-full bg-muted px-1.5 py-0.5">org: {d.organizationName}</span>
                  )}
                </p>
                {d.note && (
                  <p
                    className={cn(
                      'rounded-lg px-2.5 py-1.5 text-[11px]',
                      d.status === 'REJECTED'
                        ? 'bg-rose-100/70 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {d.status === 'REJECTED' ? 'Reviewer note: ' : ''}
                    {d.note}
                  </p>
                )}
                {d.reviewedByName && d.reviewedAt && (
                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <ShieldCheck size={11} /> reviewed by {d.reviewedByName} · {formatDate(d.reviewedAt)}
                  </p>
                )}
                <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
                  {d.isActive && d.status !== 'VERIFIED' && (
                    <Button variant="outline" size="sm" className="h-7 rounded-lg text-[11px]" onClick={() => openEdit(d)}>
                      <Pencil size={11} className="mr-1" /> Edit
                    </Button>
                  )}
                  {d.isActive && d.status !== 'VERIFIED' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 rounded-lg text-[11px] text-destructive hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => void deactivate(d)}
                    >
                      <X size={11} className="mr-1" /> Deactivate
                    </Button>
                  )}
                  {d.isActive && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 rounded-lg text-[11px]"
                      onClick={() => openUpload(d.documentType)}
                    >
                      <RefreshCcw size={11} className="mr-1" /> Replace
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={(o) => !o && !uploading && setUploadOpen(false)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload to your document vault</DialogTitle>
            <DialogDescription>
              Up to {MAX_FILES} image files (JPG/PNG/WebP/GIF), 8 MB each. One upload serves every future
              application — the platform verifies each document once.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Drop zone */}
            <div
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                addFiles(e.dataTransfer.files)
              }}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors',
                dragOver ? 'border-primary bg-primary/5' : 'hover:border-primary/40'
              )}
            >
              <Upload size={26} className="text-muted-foreground/60" />
              <p className="mt-2 text-sm font-semibold">Click or drop files here</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Scans or photos of the original document
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files)
                  e.target.value = ''
                }}
              />
            </div>
            {files.length > 0 && (
              <ul className="space-y-1.5">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs">
                    <FileText size={13} className="shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <span className="shrink-0 text-muted-foreground">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                    <button
                      type="button"
                      className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      aria-label={`Remove ${f.name}`}
                      onClick={() => setFiles((list) => list.filter((_, idx) => idx !== i))}
                    >
                      <X size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-semibold">
                  Document type <span className="text-destructive">*</span>
                </Label>
                <Select value={documentType || undefined} onValueChange={setDocumentType}>
                  <SelectTrigger className="h-9 rounded-xl" aria-label="Document type">
                    <SelectValue placeholder="What is this document?" />
                  </SelectTrigger>
                  <SelectContent>
                    {DOC_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{documentTypeLabel(t)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-semibold">Title</Label>
                <Input
                  className="rounded-xl"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={160}
                  placeholder="e.g. Tax Card 2026"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Issued on</Label>
                <Input type="date" className="rounded-xl" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Expires on</Label>
                <Input type="date" className="rounded-xl" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              </div>
              {orgs.length > 0 && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs font-semibold">Belongs to</Label>
                  <Select value={organizationId} onValueChange={setOrganizationId}>
                    <SelectTrigger className="h-9 rounded-xl" aria-label="Document scope">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PERSONAL">Me (personal vault)</SelectItem>
                      {orgs.map((o) => (
                        <SelectItem key={o.id} value={o.id}>{o.name} (organization)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setUploadOpen(false)} disabled={uploading}>
              Cancel
            </Button>
            <Button className="rounded-xl" onClick={() => void submitUpload()} disabled={uploading || files.length === 0}>
              {uploading ? (
                <>
                  <Loader2 size={14} className="mr-1.5 animate-spin" /> Uploading…
                </>
              ) : (
                <>
                  <Upload size={14} className="mr-1.5" /> Upload {files.length > 0 ? `(${files.length})` : ''}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Meta edit dialog */}
      <Dialog open={!!editDoc} onOpenChange={(o) => !o && setEditDoc(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit document details</DialogTitle>
            <DialogDescription>
              {editDoc && (editDoc.title ?? editDoc.media.originalName)} — verified documents are frozen; replace
              them instead of editing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Title</Label>
              <Input className="rounded-xl" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} maxLength={160} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Issued on</Label>
                <Input type="date" className="rounded-xl" value={editIssuedAt} onChange={(e) => setEditIssuedAt(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Expires on</Label>
                <Input type="date" className="rounded-xl" value={editExpiresAt} onChange={(e) => setEditExpiresAt(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setEditDoc(null)} disabled={savingMeta}>
              Cancel
            </Button>
            <Button className="rounded-xl" onClick={() => void saveMeta()} disabled={savingMeta}>
              {savingMeta ? <Loader2 size={14} className="animate-spin" /> : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
