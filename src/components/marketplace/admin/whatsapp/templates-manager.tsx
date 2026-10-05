'use client'

// ─────────────────────────────────────────────────────────────────────────────
// WHATSAPP BUSINESS SUITE · TEMPLATES MANAGER (wa-biz-2).
// Grid of reusable message templates with {{variable}} detection, a live
// WhatsApp-style preview bubble and full CRUD against the wa-biz-0 contract:
//   GET/POST  /api/admin/whatsapp/templates
//   PATCH/DELETE /api/admin/whatsapp/templates/[id]
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useState } from 'react'
import {
  AlertTriangle,
  Archive,
  Braces,
  Check,
  Copy,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Undo2,
} from 'lucide-react'
import { timeAgo } from '@/lib/format'
import { toast } from '@/hooks/use-toast'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { AdminEmptyState, apiRequest, toastApiError } from '../shared'
import {
  ChatBubble,
  extractCustomVars,
  extractTemplateVars,
  renderPreview,
  SYSTEM_VARIABLES,
  TEMPLATE_CATEGORY_MAP,
  TEMPLATE_STATUS_MAP,
  WaBadge,
  type ManagerLoaderProps,
  type TemplateDTO,
} from './shared'

const CATEGORIES = Object.keys(TEMPLATE_CATEGORY_MAP)
const LANGUAGES = ['ar', 'en']

export function TemplatesManager({
  data,
  loading,
  error,
  refetch,
}: ManagerLoaderProps<{ templates: TemplateDTO[] }>) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<TemplateDTO | null>(null)
  const [deleting, setDeleting] = useState<TemplateDTO | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const templates = data?.templates ?? []

  async function patchStatus(t: TemplateDTO, status: 'APPROVED' | 'ARCHIVED' | 'DRAFT') {
    if (busyId) return
    setBusyId(t.id)
    const res = await apiRequest<{ template: TemplateDTO }>(`/api/admin/whatsapp/templates/${t.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
    setBusyId(null)
    if (!res.ok) {
      toastApiError(res.error, 'Could not update the template')
      return
    }
    toast({
      title:
        status === 'APPROVED' ? 'Template approved' : status === 'ARCHIVED' ? 'Template archived' : 'Template restored',
    })
    void refetch({ silent: true })
  }

  async function duplicate(t: TemplateDTO) {
    if (busyId) return
    setBusyId(t.id)
    const res = await apiRequest<{ template: TemplateDTO }>('/api/admin/whatsapp/templates', {
      method: 'POST',
      body: JSON.stringify({
        name: `${t.name}-copy`,
        category: t.category,
        language: t.language,
        body: t.body,
      }),
    })
    setBusyId(null)
    if (!res.ok) {
      toastApiError(res.error, 'Could not duplicate the template')
      return
    }
    toast({ title: 'Template duplicated', description: `Saved as “${t.name}-copy”.` })
    void refetch({ silent: true })
  }

  async function confirmDelete() {
    if (!deleting || busyId) return
    setBusyId(deleting.id)
    const res = await apiRequest(`/api/admin/whatsapp/templates/${deleting.id}`, { method: 'DELETE' })
    setBusyId(null)
    if (!res.ok) {
      toastApiError(res.error, 'Could not delete the template')
      return
    }
    toast({ title: 'Template deleted' })
    setDeleting(null)
    void refetch({ silent: true })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Message templates</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Reusable bodies with {'{{variables}}'} — load them straight into campaigns.
          </p>
        </div>
        <Button
          size="sm"
          className="h-9 rounded-xl"
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          <Plus size={14} className="mr-1.5" /> New template
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-52 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <AdminEmptyState icon={AlertTriangle} title="Could not load templates" description={error}>
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => void refetch()}>
            Try again
          </Button>
        </AdminEmptyState>
      ) : templates.length === 0 ? (
        <AdminEmptyState
          icon={FileText}
          title="No templates yet"
          description="Create your first reusable message — write it once, reuse it in every campaign."
        >
          <Button size="sm" className="rounded-xl" onClick={() => setDialogOpen(true)}>
            <Plus size={14} className="mr-1.5" /> New template
          </Button>
        </AdminEmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => {
            const cat = TEMPLATE_CATEGORY_MAP[t.category] ?? { label: t.category, badge: 'bg-muted text-muted-foreground' }
            const status = TEMPLATE_STATUS_MAP[t.status] ?? { label: t.status, badge: 'bg-muted text-muted-foreground' }
            const vars = extractTemplateVars(t.body)
            const busy = busyId === t.id
            return (
              <Card key={t.id} className="rounded-xl">
                <CardContent className="flex h-full flex-col p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 break-all font-mono text-sm font-semibold leading-snug">{t.name}</p>
                    <WaBadge className={status.badge}>{status.label}</WaBadge>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <WaBadge className={cat.badge}>{cat.label}</WaBadge>
                    <WaBadge className="border bg-background uppercase text-muted-foreground">{t.language}</WaBadge>
                    {vars.length > 0 && (
                      <span className="text-[11px] text-muted-foreground" title={vars.join(' ')}>
                        {vars.length} variable{vars.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>

                  <p
                    dir="auto"
                    className="mt-2.5 line-clamp-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground"
                  >
                    {t.body}
                  </p>

                  <p className="mt-auto pt-3 text-[11px] text-muted-foreground">
                    Used {t.useCount}× · updated {timeAgo(t.updatedAt)}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg"
                      disabled={busy}
                      onClick={() => {
                        setEditing(t)
                        setDialogOpen(true)
                      }}
                    >
                      <Pencil size={13} className="mr-1" /> Edit
                    </Button>
                    {t.status !== 'APPROVED' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-lg text-emerald-700 hover:text-emerald-800 dark:text-emerald-400"
                        disabled={busy}
                        onClick={() => void patchStatus(t, 'APPROVED')}
                      >
                        {busy ? <Loader2 size={13} className="mr-1 animate-spin" /> : <Check size={13} className="mr-1" />}
                        Approve
                      </Button>
                    )}
                    {t.status === 'ARCHIVED' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-lg"
                        disabled={busy}
                        onClick={() => void patchStatus(t, 'DRAFT')}
                      >
                        <Undo2 size={13} className="mr-1" /> Restore
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-lg"
                        disabled={busy}
                        onClick={() => void patchStatus(t, 'ARCHIVED')}
                      >
                        <Archive size={13} className="mr-1" /> Archive
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg"
                      disabled={busy}
                      aria-label={`Duplicate ${t.name}`}
                      title="Duplicate"
                      onClick={() => void duplicate(t)}
                    >
                      {busy ? <Loader2 size={13} className="animate-spin" /> : <Copy size={13} />}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg text-rose-700 hover:text-rose-800 dark:text-rose-400"
                      disabled={busy}
                      aria-label={`Delete ${t.name}`}
                      title="Delete"
                      onClick={() => setDeleting(t)}
                    >
                      {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Mounted only while open — state initializes from `editing` at mount,
          so re-opening always starts from the current row. */}
      {dialogOpen && (
        <TemplateDialog
          editing={editing}
          onClose={() => setDialogOpen(false)}
          onSaved={() => void refetch({ silent: true })}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this template?</AlertDialogTitle>
            <AlertDialogDescription>
              “<span className="font-mono">{deleting?.name}</span>” will be removed permanently. Campaigns already
              sent with it are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-rose-600 hover:bg-rose-700"
              disabled={busyId === deleting?.id}
              onClick={(e) => {
                e.preventDefault() // keep the dialog open until the API answers
                void confirmDelete()
              }}
            >
              {busyId === deleting?.id ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : null}
              Delete template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ── Create / edit dialog with live variable detection + WhatsApp preview ─────

function TemplateDialog({
  editing,
  onClose,
  onSaved,
}: {
  editing: TemplateDTO | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(editing?.name ?? '')
  const [category, setCategory] = useState(editing?.category ?? 'MARKETING')
  const [language, setLanguage] = useState(editing?.language ?? 'ar')
  const [body, setBody] = useState(editing?.body ?? '')
  const [submitting, setSubmitting] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement | null>(null)

  const vars = extractTemplateVars(body)
  const customVars = extractCustomVars(body)
  const slug =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06ff]+/g, '-')
      .replace(/^-+|-+$/g, '') || '—'
  const valid = name.trim().length >= 2 && body.trim().length >= 3

  async function submit() {
    if (submitting || !valid) return
    setSubmitting(true)
    const payload = JSON.stringify({
      name: name.trim(),
      category,
      language,
      body: body.trim(),
    })
    const res = editing
      ? await apiRequest<{ template: TemplateDTO }>(`/api/admin/whatsapp/templates/${editing.id}`, {
          method: 'PATCH',
          body: payload,
        })
      : await apiRequest<{ template: TemplateDTO }>('/api/admin/whatsapp/templates', {
          method: 'POST',
          body: payload,
        })
    setSubmitting(false)
    if (!res.ok) {
      toastApiError(res.error, 'Could not save the template')
      return
    }
    toast({ title: editing ? 'Template updated' : 'Template created', description: name.trim() })
    onSaved()
    onClose()
  }

  /** Insert a variable token at the textarea caret (keeps focus + caret). */
  function insertVar(token: string) {
    const el = bodyRef.current
    if (!el) {
      setBody((b) => b + token)
      return
    }
    const start = el.selectionStart ?? body.length
    const end = el.selectionEnd ?? start
    setBody(body.slice(0, start) + token + body.slice(end))
    requestAnimationFrame(() => {
      el.focus()
      const caret = start + token.length
      el.setSelectionRange(caret, caret)
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText size={18} className="text-primary" /> {editing ? 'Edit template' : 'New template'}
          </DialogTitle>
          <DialogDescription>
            Write the body once and reuse it everywhere. Wrap variables in {'{{double braces}}'}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tpl-name">Name</Label>
            <Input
              id="tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="order-shipped"
              maxLength={80}
              className="h-10 rounded-xl"
            />
            <p className="text-[11px] text-muted-foreground">
              Slug: <span className="font-mono">{slug}</span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="tpl-category" className="h-10 w-full rounded-xl">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {TEMPLATE_CATEGORY_MAP[c]?.label ?? c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-language">Language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger id="tpl-language" className="h-10 w-full rounded-xl">
                  <SelectValue placeholder="Language" />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l === 'ar' ? 'العربية (ar)' : 'English (en)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tpl-body">Body</Label>
            <Textarea
              ref={bodyRef}
              id="tpl-body"
              dir="auto"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={'مرحبا {{name}}، طلبك {{order_id}} في الطريق 🚚\nHello {{name}}, your order {{order_id}} has shipped!'}
              rows={6}
              className="rounded-xl"
            />
            {/* Variable picker — click inserts at the caret */}
            <div className="space-y-1.5 pt-1">
              <p className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                <Braces size={12} /> Variables — click to insert at the cursor
              </p>
              <div className="flex flex-wrap gap-1.5">
                {SYSTEM_VARIABLES.map((v) => (
                  <Tooltip key={v.key}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => insertVar(v.key)}
                        className="rounded-md border border-dashed border-primary/40 bg-primary/5 px-2 py-0.5 font-mono text-[10px] font-semibold text-primary transition-colors hover:bg-primary/15"
                      >
                        {v.key}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[220px] text-xs">
                      <span className="font-semibold">{v.label}</span> — {v.description}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </div>
            {vars.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                  <Braces size={12} /> Detected variables:
                </span>
                {vars.map((v) => (
                  <WaBadge
                    key={v}
                    className={cn(
                      'font-mono text-[10px]',
                      customVars.includes(v)
                        ? 'border border-dashed border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-500/60 dark:bg-amber-950 dark:text-amber-300'
                        : 'border border-dashed border-primary/40 bg-primary/5 text-primary'
                    )}
                  >
                    {v}
                  </WaBadge>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Tip: type {'{{name}}'} or click a chip above — system variables auto-fill from each
                recipient&apos;s account at send time.
              </p>
            )}
          </div>

          {/* Live WhatsApp-style preview — resolved against a mock recipient */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Live preview</p>
            <div className="rounded-xl border bg-muted/50 p-3">
              <div className="ml-auto w-fit max-w-[85%]">
                <ChatBubble
                  body={renderPreview(body.trim() || 'Your message preview…')}
                />
              </div>
            </div>
            {customVars.length > 0 && (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                <span className="font-semibold">{customVars.join(', ')}</span>{' '}
                {customVars.length === 1 ? 'is a custom variable' : 'are custom variables'} — define
                {customVars.length === 1 ? ' it' : ' them'} in the campaign dialog when sending.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button className="rounded-xl" disabled={!valid || submitting} onClick={() => void submit()}>
            {submitting ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : <Check size={15} className="mr-1.5" />}
            {editing ? 'Save changes' : 'Create template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
