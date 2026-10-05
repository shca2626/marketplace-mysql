'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN · PUBLICATION AGREEMENTS (Phase 9.4).
// One console, two views:
//   • "Templates"     — versioned agreement texts (exactly one ACTIVE at a
//                       time; drafts editable, active versions immutable so
//                       historical consents stay reproducible).
//   • "Consent Ledger"— every seller acceptance: searchable, filterable,
//                       paginated, CSV-exportable (compliance evidence).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileSignature,
  FileText,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  ScrollText,
  SearchX,
  ShieldAlert,
  Zap,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'
import { useApi } from '@/hooks/use-api'
import { formatDate, timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { Textarea } from '@/components/ui/textarea'
import {
  AdminEmptyState,
  SearchInput,
  apiRequest,
  localInputToIso,
  toastApiError,
  useDebounced,
} from './shared'

// ── DTOs (mirror the API responses) ─────────────────────────────────────────

interface TemplateRow {
  id: string
  version: string
  title: string
  body: string
  isActive: boolean
  consentCount: number
  createdBy: { id: string; name: string } | null
  createdAt: string
}

interface ConsentRow {
  id: string
  templateId: string
  templateVersion: string
  templateTitle: string
  productId: string | null
  productTitle: string | null
  productDeleted: boolean
  sellerId: string
  sellerName: string
  sellerStoreName: string | null
  sellerEmail: string | null
  acceptedAt: string
  ipAddress: string | null
}

type ViewKey = 'templates' | 'ledger'

const PAGE_SIZE = 25

// ── Create / edit-draft dialog ──────────────────────────────────────────────

function TemplateDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: TemplateRow | null
  onSaved: () => void
}) {
  const [version, setVersion] = useState(editing?.version ?? '')
  const [title, setTitle] = useState(editing?.title ?? '')
  const [body, setBody] = useState(editing?.body ?? '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const v = version.trim()
    const t = title.trim()
    if (!v || v.length > 32) {
      toast({ title: 'Version required', description: '1–32 characters, e.g. "v2" or "1.1"', variant: 'destructive' })
      return
    }
    if (t.length < 2) {
      toast({ title: 'Title too short', description: 'Give the version a recognizable title', variant: 'destructive' })
      return
    }
    if (body.trim().length < 20) {
      toast({ title: 'Body too short', description: 'The agreement text needs at least 20 characters', variant: 'destructive' })
      return
    }
    setSaving(true)
    const payload = { version: v, title: t, body: body.trim() }
    const res = editing
      ? await apiRequest(`/api/admin/agreements/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
      : await apiRequest('/api/admin/agreements', { method: 'POST', body: JSON.stringify(payload) })
    setSaving(false)
    if (!res.ok) {
      toastApiError(res.error, editing ? 'Could not update the draft' : 'Could not create the template')
      return
    }
    toast({
      title: editing ? 'Draft updated' : 'Template created',
      description: editing ? `${v} — ${t} (still a draft)` : `${v} — ${t} saved as a draft. Activate it when it should govern new publications.`,
    })
    onOpenChange(false)
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto scrollbar-thin sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit draft ${editing.version}` : 'New agreement template'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Drafts stay editable until they are activated — active versions are frozen so consents remain reproducible.'
              : 'Creates a DRAFT version. It only governs new publications once you activate it.'}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,160px)_1fr]">
              <div className="space-y-1.5">
                <Label htmlFor="agr-version">Version *</Label>
                <Input
                  id="agr-version"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  maxLength={32}
                  placeholder="v2"
                  className="font-mono"
                  aria-describedby="agr-version-hint"
                />
                <p id="agr-version-hint" className="text-[11px] text-muted-foreground">
                  Letters, digits, dots, dashes
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="agr-title">Title *</Label>
                <Input
                  id="agr-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={120}
                  placeholder="Vendora Publication Agreement — 2026 revision"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agr-body">Agreement text *</Label>
              <Textarea
                id="agr-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={20000}
                placeholder="The full text sellers accept when they publish a listing…"
                className="min-h-52 font-mono text-xs leading-relaxed"
              />
              <p className="text-[11px] text-muted-foreground">
                {body.trim().length.toLocaleString('en-US')} / 20,000 characters
              </p>
            </div>
            <DialogFooter className="gap-2 pt-1">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void save()} disabled={saving} className="min-w-28">
                {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
                {editing ? <Pencil size={14} className="mr-1.5" /> : <Plus size={14} className="mr-1.5" />}
                {editing ? 'Save draft' : 'Create draft'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Read-only detail dialog ─────────────────────────────────────────────────

function TemplateDetailDialog({
  template,
  onClose,
  onActivate,
}: {
  template: TemplateRow | null
  onClose: () => void
  onActivate: (t: TemplateRow) => void
}) {
  return (
    <Dialog open={!!template} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto scrollbar-thin sm:max-w-2xl">
        {template && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-base">{template.version}</span>
                <span className="text-muted-foreground">·</span>
                <span className="min-w-0 truncate">{template.title}</span>
                {template.isActive && (
                  <Badge className="rounded-full border-0 bg-emerald-100 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    ACTIVE
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription>
                Created {formatDate(template.createdAt)}
                {template.createdBy ? ` by ${template.createdBy.name}` : ' · legacy seed (imported from the Phase-4 constant)'} ·{' '}
                {template.consentCount.toLocaleString('en-US')} consent{template.consentCount === 1 ? '' : 's'} recorded
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[46vh] overflow-y-auto scrollbar-thin rounded-xl border bg-muted/30 p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{template.body}</p>
            </div>
            <DialogFooter className="gap-2">
              {!template.isActive && (
                <Button
                  onClick={() => {
                    onClose()
                    onActivate(template)
                  }}
                >
                  <Zap size={14} className="mr-1.5" /> Activate this version
                </Button>
              )}
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Templates view ──────────────────────────────────────────────────────────

function TemplatesView({ onViewConsents }: { onViewConsents: (templateId: string) => void }) {
  const { data, loading, error, refetch } = useApi<{ templates: TemplateRow[] }>('/api/admin/agreements')
  const templates = data?.templates ?? []

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<TemplateRow | null>(null)
  const [detail, setDetail] = useState<TemplateRow | null>(null)
  const [activating, setActivating] = useState<TemplateRow | null>(null)
  const [activateBusy, setActivateBusy] = useState(false)

  const activate = async () => {
    if (!activating) return
    setActivateBusy(true)
    const res = await apiRequest(`/api/admin/agreements/${activating.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'activate' }),
    })
    setActivateBusy(false)
    if (!res.ok) {
      toastApiError(res.error, 'Could not activate the template')
      return
    }
    toast({
      title: `${activating.version} is now active`,
      description: 'New publications capture this agreement; existing consents keep their version.',
    })
    setActivating(null)
    void refetch()
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-sm text-muted-foreground">
          Versioned agreement texts — exactly <span className="font-semibold text-foreground">one ACTIVE version</span> governs
          new publications. Active versions are frozen; publish a new version to change the terms.
        </p>
        <Button
          className="shrink-0 rounded-xl"
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          <Plus size={15} className="mr-1.5" /> New template
        </Button>
      </div>

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      )}

      {!loading && error && (
        <AdminEmptyState icon={ShieldAlert} title="Couldn't load templates" description={error}>
          <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
            Try again
          </Button>
        </AdminEmptyState>
      )}

      {!loading && !error && templates.length === 0 && (
        <AdminEmptyState
          icon={FileSignature}
          title="No agreement templates yet"
          description="The first template is seeded automatically from the legacy Phase-4 text the moment a consent is recorded — or create the next version now."
        />
      )}

      {/* Desktop table */}
      {!loading && !error && templates.length > 0 && (
        <div className="hidden overflow-hidden rounded-2xl border md:block">
          <div className="max-h-96 overflow-y-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-medium">Version</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Consents</th>
                  <th scope="col" className="px-4 py-3 font-medium">Created</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id} className="border-b align-top transition-colors last:border-0 hover:bg-accent/50">
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs font-semibold">{t.version}</p>
                      <p className="mt-0.5 max-w-72 truncate text-xs text-muted-foreground" title={t.title}>
                        {t.title}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {t.isActive ? (
                        <Badge className="rounded-full border-0 bg-emerald-100 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          ACTIVE
                        </Badge>
                      ) : (
                        <Badge className="rounded-full border-0 bg-stone-200 text-[11px] font-semibold text-stone-700 dark:bg-stone-800 dark:text-stone-300">
                          Draft
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onViewConsents(t.id)}
                        className="rounded-md px-1.5 py-0.5 tabular-nums text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
                        aria-label={`View the ${t.consentCount} consents recorded for ${t.version}`}
                      >
                        {t.consentCount.toLocaleString('en-US')}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs tabular-nums text-muted-foreground">{formatDate(t.createdAt)}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {t.createdBy ? t.createdBy.name : 'legacy seed'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button variant="outline" size="sm" className="h-8 rounded-lg" onClick={() => setDetail(t)} aria-label={`View ${t.version} text`}>
                          <Eye size={13} className="mr-1" /> View
                        </Button>
                        {!t.isActive && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-lg"
                              onClick={() => {
                                setEditing(t)
                                setDialogOpen(true)
                              }}
                              aria-label={`Edit draft ${t.version}`}
                            >
                              <Pencil size={13} className="mr-1" /> Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-lg border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950/50"
                              onClick={() => setActivating(t)}
                              aria-label={`Activate ${t.version}`}
                            >
                              <Zap size={13} className="mr-1" /> Activate
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Mobile stacked cards */}
      {!loading && !error && templates.length > 0 && (
        <div className="space-y-3 md:hidden">
          {templates.map((t) => (
            <Card key={t.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-semibold">
                      <span className="font-mono text-xs">{t.version}</span>
                      {t.isActive && (
                        <Badge className="rounded-full border-0 bg-emerald-100 px-1.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          ACTIVE
                        </Badge>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{t.title}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {t.consentCount.toLocaleString('en-US')} consent{t.consentCount === 1 ? '' : 's'} · {formatDate(t.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1.5">
                    <Button variant="outline" size="sm" className="h-8 rounded-lg" onClick={() => setDetail(t)} aria-label={`View ${t.version} text`}>
                      <Eye size={13} />
                    </Button>
                    {!t.isActive && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-lg"
                          onClick={() => {
                            setEditing(t)
                            setDialogOpen(true)
                          }}
                          aria-label={`Edit draft ${t.version}`}
                        >
                          <Pencil size={13} />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-lg border-emerald-300 text-emerald-700 dark:border-emerald-900 dark:text-emerald-400"
                          onClick={() => setActivating(t)}
                          aria-label={`Activate ${t.version}`}
                        >
                          <Zap size={13} />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* key = fresh state every time the dialog opens on a different row */}
      <TemplateDialog key={editing?.id ?? 'new'} open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} onSaved={() => void refetch()} />

      <TemplateDetailDialog template={detail} onClose={() => setDetail(null)} onActivate={(t) => setActivating(t)} />

      <AlertDialog open={!!activating} onOpenChange={(o) => !o && setActivating(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Activate {activating?.version}?</AlertDialogTitle>
            <AlertDialogDescription>
              Activating {activating?.version} makes it the agreement new publications capture — existing consents keep
              their version. The current active version (if any) drops back to draft.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={activateBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-emerald-700 hover:bg-emerald-800"
              disabled={activateBusy}
              onClick={(e) => {
                e.preventDefault() // keep the dialog open until the API answers
                void activate()
              }}
            >
              {activateBusy && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              Activate {activating?.version}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ── Consent ledger view ─────────────────────────────────────────────────────

function LedgerView({ templateFilter, onTemplateFilterChange }: { templateFilter: string; onTemplateFilterChange: (v: string) => void }) {
  const navigate = useMarketplace((s) => s.navigate)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)

  // Render-time keyed sync: jump back to page 1 whenever filters change
  const filterKey = `${debouncedSearch}|${templateFilter}|${from}|${to}`
  const [appliedKey, setAppliedKey] = useState<string | null>(null)
  if (appliedKey !== filterKey) {
    setAppliedKey(filterKey)
    setPage(1)
  }

  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
  if (debouncedSearch.trim()) query.set('q', debouncedSearch.trim())
  if (templateFilter !== '__all__') query.set('templateId', templateFilter)
  const fromIso = localInputToIso(from)
  const toIso = localInputToIso(to)
  if (fromIso) query.set('from', fromIso)
  if (toIso) query.set('to', toIso)

  const { data, loading, error, refetch } = useApi<{
    items: ConsentRow[]
    total: number
    page: number
    pageSize: number
  }>(`/api/admin/agreements/consents?${query.toString()}`)

  const { data: tplData } = useApi<{ templates: TemplateRow[] }>('/api/admin/agreements')
  const templateOptions = tplData?.templates ?? []

  const consents = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / (data?.pageSize ?? PAGE_SIZE)))
  const activeFilters = !!debouncedSearch.trim() || templateFilter !== '__all__' || !!from || !!to

  const exportCsv = async () => {
    setExporting(true)
    try {
      const res = await fetch(`/api/admin/agreements/consents?${query.toString()}&export=csv`, { cache: 'no-store' })
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        toast({ title: 'Export failed', description: json.error ?? `Request failed (${res.status})`, variant: 'destructive' })
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `vendora-publication-consents-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast({ title: 'Consent ledger exported', description: `${total.toLocaleString('en-US')} row${total === 1 ? '' : 's'} in the current filter` })
    } catch {
      toast({ title: 'Export failed', description: 'Network error — please try again', variant: 'destructive' })
    } finally {
      setExporting(false)
    }
  }

  const productCell = (c: ConsentRow) => {
    const title = c.productTitle ?? '— (no product)'
    if (c.productId && !c.productDeleted) {
      return (
        <button
          type="button"
          onClick={() => navigate('product', { productId: c.productId! })}
          className="max-w-64 truncate text-left font-medium underline-offset-2 transition-colors hover:text-primary hover:underline"
          title={title}
        >
          {title}
        </button>
      )
    }
    return (
      <span className="flex max-w-64 items-center gap-1.5" title={title}>
        <span className="truncate">{title}</span>
        {c.productDeleted && (
          <Badge className="shrink-0 rounded-full border-0 bg-neutral-200 px-1.5 text-[10px] font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
            deleted
          </Badge>
        )}
      </span>
    )
  }

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
            <label htmlFor="agr-ledger-search" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Search
            </label>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Product, seller or store…"
              ariaLabel="Search consents by product, seller or store"
              className="max-w-none"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="agr-ledger-template" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Template
            </label>
            <Select value={templateFilter} onValueChange={onTemplateFilterChange}>
              <SelectTrigger id="agr-ledger-template" aria-label="Filter by agreement version">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All versions</SelectItem>
                {templateOptions.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.version} · {t.title.slice(0, 40)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="agr-ledger-from" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Accepted from
            </label>
            <Input id="agr-ledger-from" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10 rounded-lg text-sm" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="agr-ledger-to" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Accepted to
            </label>
            <Input id="agr-ledger-to" type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} className="h-10 rounded-lg text-sm" />
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => void refetch()} disabled={loading}>
            {loading ? <Loader2 size={15} className="mr-2 animate-spin" /> : <RefreshCw size={15} className="mr-2" />}
            Refresh
          </Button>
          <Button className="rounded-xl" onClick={() => void exportCsv()} disabled={exporting || loading}>
            {exporting ? <Loader2 size={15} className="mr-2 animate-spin" /> : <Download size={15} className="mr-2" />}
            Export CSV
          </Button>
        </div>
      </div>

      {loading && (
        <div className="space-y-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      )}

      {!loading && error && (
        <AdminEmptyState icon={ShieldAlert} title="Couldn't load the consent ledger" description={error}>
          <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
            Try again
          </Button>
        </AdminEmptyState>
      )}

      {!loading && !error && consents.length === 0 && (
        <AdminEmptyState
          icon={activeFilters ? SearchX : ScrollText}
          title={activeFilters ? 'No matching consents' : 'No consents recorded yet'}
          description={
            activeFilters
              ? 'Try clearing a filter — the search matches product titles, seller names and stores.'
              : 'Every seller acceptance of the Publication Agreement lands here the moment it happens.'
          }
        />
      )}

      {/* Desktop table */}
      {!loading && !error && consents.length > 0 && (
        <>
          <div className="hidden overflow-hidden rounded-2xl border md:block">
            <div className="max-h-[60vh] overflow-y-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="px-4 py-3 font-medium">Product</th>
                    <th scope="col" className="px-4 py-3 font-medium">Seller</th>
                    <th scope="col" className="px-4 py-3 font-medium">Version</th>
                    <th scope="col" className="px-4 py-3 font-medium">Accepted</th>
                    <th scope="col" className="px-4 py-3 font-medium">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {consents.map((c) => (
                    <tr key={c.id} className="border-b align-top transition-colors last:border-0 hover:bg-accent/50">
                      <td className="px-4 py-3">{productCell(c)}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{c.sellerName}</p>
                        <p className="text-xs text-muted-foreground">{c.sellerStoreName ?? c.sellerEmail ?? '—'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-lg bg-muted px-2 py-1 font-mono text-[11px] font-semibold">
                          {c.templateVersion}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <p className="text-xs font-medium tabular-nums">{timeAgo(c.acceptedAt)}</p>
                        <p className="text-[11px] text-muted-foreground" title={new Date(c.acceptedAt).toLocaleString()}>
                          {formatDate(c.acceptedAt)}
                        </p>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{c.ipAddress ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile stacked cards */}
          <div className="space-y-2.5 md:hidden">
            {consents.map((c) => (
              <Card key={c.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{c.productTitle ?? '— (no product)'}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {c.sellerName}
                        {c.sellerStoreName ? ` · ${c.sellerStoreName}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-lg bg-muted px-2 py-1 font-mono text-[11px] font-semibold">
                      {c.templateVersion}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {new Date(c.acceptedAt).toLocaleString()} · IP {c.ipAddress ?? '—'}
                    {c.productDeleted ? ' · product deleted' : ''}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {total.toLocaleString('en-US')} consent{total === 1 ? '' : 's'} · showing{' '}
              {(data?.page ?? page) * (data?.pageSize ?? PAGE_SIZE) - (data?.pageSize ?? PAGE_SIZE) + 1}–
              {Math.min((data?.page ?? page) * (data?.pageSize ?? PAGE_SIZE), total)}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-lg"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                aria-label="Previous page"
              >
                <ChevronLeft size={14} /> Prev
              </Button>
              <span className="text-xs font-semibold tabular-nums" aria-label={`Page ${page} of ${totalPages}`}>
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-lg"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                aria-label="Next page"
              >
                Next <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── The console (exported) ───────────────────────────────────────────────────

const VIEWS: { key: ViewKey; label: string; icon: typeof FileSignature }[] = [
  { key: 'templates', label: 'Templates', icon: FileText },
  { key: 'ledger', label: 'Consent Ledger', icon: ScrollText },
]

export function AgreementsTab() {
  const [view, setView] = useState<ViewKey>('templates')
  // Template filter shared with the Templates view cross-link (consents count
  // → ledger pre-filtered to that version).
  const [templateFilter, setTemplateFilter] = useState('__all__')

  const viewConsents = (templateId: string) => {
    setTemplateFilter(templateId)
    setView('ledger')
  }

  return (
    <div className="space-y-4">
      {/* Context strip */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-bh-muted">
        <FileSignature size={13} className="text-bh-gold-dark" />
        <span>
          Versioned publication agreements + the immutable consent ledger — who agreed to publish what, under which version,
          when and from where.
        </span>
      </div>

      {/* Sticky section pills (dock under the dashboard topbar, h-14) */}
      <div className="sticky top-14 z-20 -mx-4 border-b bg-background/95 px-4 pb-2 pt-1 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <nav aria-label="Agreement sections" className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {VIEWS.map((v) => {
            const active = view === v.key
            const Icon = v.icon
            return (
              <button
                key={v.key}
                type="button"
                aria-current={active ? 'true' : undefined}
                onClick={() => setView(v.key)}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
                )}
              >
                <Icon size={14} />
                {v.label}
              </button>
            )
          })}
        </nav>
      </div>

      {view === 'templates' ? (
        <TemplatesView onViewConsents={viewConsents} />
      ) : (
        <LedgerView templateFilter={templateFilter} onTemplateFilterChange={setTemplateFilter} />
      )}
    </div>
  )
}
