'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN · WHATSAPP — Templates library (agent 8-a)
// CRUD + a rich editor dialog: category/language/status selects, body
// textarea with variable chips inserted at the cursor, and a LIVE preview.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import {
  FileText,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { formatDate } from '@/lib/format'
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
import { apiRequest, toastApiError } from '../shared'
import {
  SectionHeader,
  TEMPLATE_CATEGORY_MAP,
  TEMPLATE_STATUS_MAP,
  LANGUAGE_MAP,
  VariableChips,
  WaBadge,
  previewBody,
  type WTemplate,
} from './shared'

interface EditorState {
  id: string | null
  name: string
  category: string
  language: string
  status: string
  body: string
}

const BLANK: EditorState = {
  id: null,
  name: '',
  category: 'MARKETING',
  language: 'ar',
  status: 'DRAFT',
  body: '',
}

export function TemplatesTab() {
  const { data, loading, error, refetch } = useApi<{ templates: WTemplate[] }>('/api/whatsapp/templates')
  const templates = data?.templates ?? []

  const [editorOpen, setEditorOpen] = useState(false)
  const [editor, setEditor] = useState<EditorState>(BLANK)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<WTemplate | null>(null)
  const [deleting, setDeleting] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (editorOpen) requestAnimationFrame(() => bodyRef.current?.focus())
  }, [editorOpen])

  const openCreate = () => {
    setEditor(BLANK)
    setEditorOpen(true)
  }

  const openEdit = (t: WTemplate) => {
    setEditor({
      id: t.id,
      name: t.name,
      category: t.category,
      language: t.language,
      status: t.status,
      body: t.body,
    })
    setEditorOpen(true)
  }

  const save = async () => {
    if (!editor.name.trim()) {
      toast({ title: 'Name required', description: 'Give the template a recognizable name.', variant: 'destructive' })
      return
    }
    if (!editor.body.trim()) {
      toast({ title: 'Body required', description: 'Write the message body — variables are optional.', variant: 'destructive' })
      return
    }
    setSaving(true)
    const payload = {
      name: editor.name.trim(),
      category: editor.category,
      language: editor.language,
      status: editor.status,
      body: editor.body,
    }
    const res = editor.id
      ? await apiRequest(`/api/whatsapp/templates/${editor.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
      : await apiRequest('/api/whatsapp/templates', { method: 'POST', body: JSON.stringify(payload) })
    setSaving(false)
    if (!res.ok) {
      toastApiError(res, editor.id ? 'Template update failed' : 'Template creation failed')
      return
    }
    toast({
      title: editor.id ? 'Template updated' : 'Template created',
      description: `${editor.name} — ${editor.status === 'APPROVED' ? 'approved and selectable for campaigns' : 'kept as draft'}.`,
    })
    setEditorOpen(false)
    void refetch()
  }

  const remove = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const res = await apiRequest(`/api/whatsapp/templates/${deleteTarget.id}`, { method: 'DELETE' })
    setDeleting(false)
    if (!res.ok) {
      toastApiError(res, 'Delete failed')
      return
    }
    toast({ title: 'Template deleted', description: `${deleteTarget.name} was removed from the library.` })
    setDeleteTarget(null)
    void refetch()
  }

  const approvedCount = templates.filter((t) => t.status === 'APPROVED').length
  const arabicCount = templates.filter((t) => t.language === 'ar').length

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Message templates"
        description="Reusable WhatsApp message bodies with {{variables}} for personalization. Approve a template to make it selectable for bulk campaigns."
      >
        <span className="rounded-full border px-3 py-1 text-xs font-semibold text-bh-muted">
          {approvedCount}/{templates.length} approved · {arabicCount} عربي
        </span>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          <RefreshCw size={14} /> Refresh
        </Button>
        <Button size="sm" className="bg-bh-gold text-bh-navy-deep hover:bg-bh-gold-dark" onClick={openCreate}>
          <Plus size={14} /> New template
        </Button>
      </SectionHeader>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm font-semibold text-rose-600">Failed to load templates</p>
            <p className="text-xs text-bh-muted">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              <RefreshCw size={14} /> Retry
            </Button>
          </CardContent>
        </Card>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bh-bg-gold">
              <FileText size={22} className="text-bh-gold-dark" />
            </div>
            <p className="text-sm font-semibold">No templates yet</p>
            <p className="max-w-sm text-xs text-bh-muted">
              Create your first message — e.g. an Arabic solar promo with &#123;&#123;name&#125;&#125; and &#123;&#123;discount&#125;&#125;% variables.
            </p>
            <Button size="sm" className="bg-bh-gold text-bh-navy-deep hover:bg-bh-gold-dark" onClick={openCreate}>
              <Plus size={14} /> Create template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {templates.map((t) => (
            <Card key={t.id} className="overflow-hidden">
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-bh-navy">{t.name}</p>
                    <WaBadge value={t.category} map={TEMPLATE_CATEGORY_MAP} />
                    <WaBadge value={t.language} map={LANGUAGE_MAP} />
                    <WaBadge value={t.status} map={TEMPLATE_STATUS_MAP} />
                  </div>
                  <p
                    dir="auto"
                    className="mt-2 line-clamp-2 whitespace-pre-line text-sm text-bh-subtle"
                  >
                    {t.body}
                  </p>
                  <p className="mt-2 text-[11px] text-bh-muted">
                    Used {t.useCount}× · {t.campaignCount} campaign{t.campaignCount === 1 ? '' : 's'} · updated {formatDate(t.updatedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1 self-end sm:self-start">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)} aria-label={`Edit ${t.name}`}>
                    <Pencil size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-rose-500 hover:text-rose-600"
                    onClick={() => setDeleteTarget(t)}
                    aria-label={`Delete ${t.name}`}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Create / edit dialog ─────────────────────────────────────────────── */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editor.id ? 'Edit template' : 'New template'}</DialogTitle>
            <DialogDescription>
              Use &#123;&#123;variables&#125;&#125; for personalization — chips below insert them at the cursor. Unknown variables stay visible in the preview so typos are caught.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-name">Template name</Label>
                <Input
                  id="tpl-name"
                  value={editor.name}
                  onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                  placeholder="e.g. رمضان سولار عرض خاص"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Category · language · status</Label>
                <div className="flex gap-2">
                  <Select value={editor.category} onValueChange={(v) => setEditor({ ...editor, category: v })}>
                    <SelectTrigger className="w-full" aria-label="Category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MARKETING">Marketing</SelectItem>
                      <SelectItem value="UTILITY">Utility</SelectItem>
                      <SelectItem value="AUTHENTICATION">Authentication</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={editor.language} onValueChange={(v) => setEditor({ ...editor, language: v })}>
                    <SelectTrigger className="w-28" aria-label="Language">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ar">عربي</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Select value={editor.status} onValueChange={(v) => setEditor({ ...editor, status: v })}>
                  <SelectTrigger className="w-full" aria-label="Status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRAFT">Draft</SelectItem>
                    <SelectItem value="APPROVED">Approved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="tpl-body">Message body</Label>
                <span className="text-[11px] text-bh-muted">{editor.body.length}/2000</span>
              </div>
              <Textarea
                id="tpl-body"
                ref={bodyRef}
                value={editor.body}
                onChange={(e) => setEditor({ ...editor, body: e.target.value.slice(0, 2000) })}
                placeholder="مرحباً {{name}}! خصم {{discount}}% على أنظمة الطاقة الشمسية…"
                dir="auto"
                rows={6}
                className="resize-y"
              />
              <div className="space-y-1.5 pt-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-bh-muted">
                  Insert variable at cursor
                </p>
                <VariableChips textareaRef={bodyRef} value={editor.body} onChange={(body) => setEditor({ ...editor, body })} />
              </div>
            </div>

            {/* LIVE preview */}
            <div className="space-y-1.5 rounded-xl border bg-bh-page/60 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-bh-muted">Live preview (example values)</p>
              <div className="flex justify-end">
                <div
                  dir="auto"
                  className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-sm bg-[#dcf8c6] px-3.5 py-2 text-sm text-stone-800 shadow-sm"
                >
                  {editor.body.trim() ? previewBody(editor.body) : 'Start typing the message body to see the live preview…'}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button className="bg-bh-gold text-bh-navy-deep hover:bg-bh-gold-dark" onClick={save} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {editor.id ? 'Save changes' : 'Create template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ───────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The template is removed from the library. Campaigns already sent keep their snapshot of the body.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault()
                void remove()
              }}
            >
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Delete template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
