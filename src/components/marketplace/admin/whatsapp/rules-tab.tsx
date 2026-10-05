'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN · WHATSAPP — Chatbot rules + simulator (agent 8-a)
// Priority-ordered auto-reply rules with per-type validation and a live
// simulator that runs the exact matching engine used by the webhook.
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useState } from 'react'
import {
  Bot,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Zap,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { apiRequest, toastApiError } from '../shared'
import { SectionHeader, MATCH_TYPE_MAP, VariableChips, WaBadge, previewBody, type WRule } from './shared'

interface EditorState {
  id: string | null
  name: string
  matchType: string
  pattern: string
  reply: string
  priority: string
}

const BLANK: EditorState = {
  id: null,
  name: '',
  matchType: 'CONTAINS',
  pattern: '',
  reply: '',
  priority: '10',
}

const MATCH_HELP: Record<string, string> = {
  CONTAINS: 'Fires when the customer message contains the pattern (case-insensitive) — e.g. pattern "price" matches "what is the PRICE?".',
  EXACT: 'Fires only when the whole message equals the pattern (trimmed, case-insensitive) — e.g. "menu".',
  STARTS_WITH: 'Fires when the message starts with the pattern (case-insensitive) — e.g. "how" matches "how to order?".',
  REGEX: 'JavaScript regular expression tested against the message (case-insensitive flag) — e.g. "^(hi|hello|salam)".',
}

interface TestResult {
  matched: boolean
  ruleId?: string
  name?: string | null
  reply?: string
}

export function RulesTab() {
  const { data, loading, error, refetch } = useApi<{ rules: WRule[] }>('/api/whatsapp/rules')
  const rules = data?.rules ?? []

  const [editorOpen, setEditorOpen] = useState(false)
  const [editor, setEditor] = useState<EditorState>(BLANK)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<WRule | null>(null)
  const [deleting, setDeleting] = useState(false)
  const replyRef = useRef<HTMLTextAreaElement | null>(null)

  // simulator state
  const [sample, setSample] = useState('')
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)

  const openCreate = () => {
    setEditor(BLANK)
    setEditorOpen(true)
  }

  const openEdit = (r: WRule) => {
    setEditor({
      id: r.id,
      name: r.name,
      matchType: r.matchType,
      pattern: r.pattern,
      reply: r.reply,
      priority: String(r.priority),
    })
    setEditorOpen(true)
  }

  const save = async () => {
    if (!editor.name.trim() || !editor.pattern.trim() || !editor.reply.trim()) {
      toast({ title: 'Missing fields', description: 'Name, pattern and reply are all required.', variant: 'destructive' })
      return
    }
    setSaving(true)
    const payload = {
      name: editor.name.trim(),
      matchType: editor.matchType,
      pattern: editor.pattern,
      reply: editor.reply,
      priority: Math.max(0, Math.min(1000, parseInt(editor.priority || '0', 10) || 0)),
    }
    const res = editor.id
      ? await apiRequest(`/api/whatsapp/rules/${editor.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
      : await apiRequest('/api/whatsapp/rules', { method: 'POST', body: JSON.stringify(payload) })
    setSaving(false)
    if (!res.ok) {
      toastApiError(res, editor.id ? 'Rule update failed' : 'Rule creation failed')
      return
    }
    toast({ title: editor.id ? 'Rule updated' : 'Rule created', description: `${editor.name} — priority ${payload.priority}.` })
    setEditorOpen(false)
    void refetch()
  }

  const toggleActive = async (r: WRule, next: boolean) => {
    setBusyId(r.id)
    const res = await apiRequest(`/api/whatsapp/rules/${r.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ active: next }),
    })
    setBusyId(null)
    if (!res.ok) {
      toastApiError(res, 'Toggle failed')
      return
    }
    void refetch()
  }

  const remove = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const res = await apiRequest(`/api/whatsapp/rules/${deleteTarget.id}`, { method: 'DELETE' })
    setDeleting(false)
    if (!res.ok) {
      toastApiError(res, 'Delete failed')
      return
    }
    toast({ title: 'Rule deleted', description: `${deleteTarget.name} no longer auto-replies.` })
    setDeleteTarget(null)
    void refetch()
  }

  const runTest = async () => {
    if (!sample.trim()) return
    setTesting(true)
    setResult(null)
    const res = await apiRequest<TestResult>('/api/whatsapp/rules/test', {
      method: 'POST',
      body: JSON.stringify({ text: sample }),
    })
    setTesting(false)
    if (!res.ok || !res.data) {
      toastApiError(res, 'Simulation failed')
      return
    }
    setResult(res.data)
  }

  const activeCount = rules.filter((r) => r.active).length
  const totalHits = rules.reduce((acc, r) => acc + r.hits, 0)

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Chatbot auto-replies"
        description="Every incoming message is matched against active rules — highest priority first, first match wins. Replies support template variables."
      >
        <span className="rounded-full border px-3 py-1 text-xs font-semibold text-bh-muted">
          {activeCount}/{rules.length} active · {totalHits} hits
        </span>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          <RefreshCw size={14} /> Refresh
        </Button>
        <Button size="sm" className="bg-bh-gold text-bh-navy-deep hover:bg-bh-gold-dark" onClick={openCreate}>
          <Plus size={14} /> New rule
        </Button>
      </SectionHeader>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm font-semibold text-rose-600">Failed to load rules</p>
            <p className="text-xs text-bh-muted">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              <RefreshCw size={14} /> Retry
            </Button>
          </CardContent>
        </Card>
      ) : rules.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bh-bg-gold">
              <Bot size={22} className="text-bh-gold-dark" />
            </div>
            <p className="text-sm font-semibold">No rules yet</p>
            <p className="max-w-sm text-xs text-bh-muted">
              Add a rule like “hello / مرحبا” so the chatbot greets customers instantly, 24/7.
            </p>
            <Button size="sm" className="bg-bh-gold text-bh-navy-deep hover:bg-bh-gold-dark" onClick={openCreate}>
              <Plus size={14} /> Create rule
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {rules.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-bh-navy">{r.name}</p>
                    <WaBadge value={r.matchType} map={MATCH_TYPE_MAP} />
                    <span className="rounded-full bg-bh-soft-blue px-2 py-0.5 text-[11px] font-bold text-bh-navy">
                      priority {r.priority}
                    </span>
                    {!r.active && (
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-bh-faded">inactive</span>
                    )}
                  </div>
                  <p className="mt-1.5 truncate font-mono text-xs text-bh-muted">
                    <span className="font-bold">if</span> {r.pattern}
                  </p>
                  <p dir="auto" className="mt-1.5 line-clamp-2 whitespace-pre-line text-sm text-bh-subtle">
                    {r.reply}
                  </p>
                  <p className="mt-1.5 text-[11px] text-bh-muted">{r.hits} auto-replies sent</p>
                </div>
                <div className="flex shrink-0 items-center gap-2 self-end sm:self-start">
                  <Switch
                    checked={r.active}
                    onCheckedChange={(next) => toggleActive(r, next)}
                    disabled={busyId === r.id}
                    aria-label={`Toggle ${r.name}`}
                  />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)} aria-label={`Edit ${r.name}`}>
                    <Pencil size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-rose-500 hover:text-rose-600"
                    onClick={() => setDeleteTarget(r)}
                    aria-label={`Delete ${r.name}`}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Simulator ──────────────────────────────────────────────────────────── */}
      <Card className="border-bh-gold/30 bg-bh-page/50">
        <CardContent className="p-5">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-bh-gold-dark" />
            <h3 className="text-sm font-bold text-bh-navy">Simulator</h3>
          </div>
          <p className="mt-1 text-xs text-bh-muted">
            Type a customer message and see exactly what the chatbot would answer — uses the live rules and matching engine.
          </p>
          <div className="mt-3 flex gap-2">
            <Input
              value={sample}
              onChange={(e) => setSample(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void runTest()
                }
              }}
              placeholder="Type a customer message… e.g. hello / ما هي الأسعار؟"
              dir="auto"
              aria-label="Customer message to simulate"
            />
            <Button onClick={runTest} disabled={testing || !sample.trim()} className="shrink-0 bg-bh-navy text-bh-gold hover:bg-bh-navy-deep">
              {testing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Test
            </Button>
          </div>

          {result && (
            <div className="mt-4 space-y-2 rounded-xl border bg-card p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-bh-muted">Conversation preview</p>
              <div className="flex justify-end">
                <div dir="auto" className="max-w-[85%] rounded-2xl rounded-br-sm bg-bh-navy px-3.5 py-2 text-sm text-white shadow-sm">
                  {sample}
                </div>
              </div>
              {result.matched ? (
                <>
                  <div className="flex items-center gap-2">
                    <Bot size={13} className="text-bh-gold-dark" />
                    <span className="text-[11px] font-semibold text-bh-gold-dark">
                      🤖 auto-reply · matched rule “{result.name ?? result.ruleId}”
                    </span>
                  </div>
                  <div className="flex justify-start">
                    <div
                      dir="auto"
                      className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-bl-sm bg-bh-bg-gold px-3.5 py-2 text-sm text-bh-ink shadow-sm"
                    >
                      {result.reply}
                    </div>
                  </div>
                </>
              ) : (
                <p className="rounded-lg bg-muted px-3 py-2 text-center text-xs text-bh-muted">
                  No rule matched — the message waits for staff in the Inbox.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Create / edit dialog ──────────────────────────────────────────────── */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editor.id ? 'Edit rule' : 'New chatbot rule'}</DialogTitle>
            <DialogDescription>
              Rules run highest-priority-first; the first match wins. Test tricky patterns in the simulator before saving.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="rule-name">Rule name</Label>
                <Input
                  id="rule-name"
                  value={editor.name}
                  onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                  placeholder="e.g. Greeting / التحية"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rule-priority">Priority (0–1000, higher wins)</Label>
                <Input
                  id="rule-priority"
                  value={editor.priority}
                  onChange={(e) => setEditor({ ...editor, priority: e.target.value.replace(/\D/g, '') })}
                  inputMode="numeric"
                  placeholder="10"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Match type</Label>
              <Select value={editor.matchType} onValueChange={(v) => setEditor({ ...editor, matchType: v })}>
                <SelectTrigger className="w-full" aria-label="Match type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CONTAINS">Contains</SelectItem>
                  <SelectItem value="EXACT">Exact</SelectItem>
                  <SelectItem value="STARTS_WITH">Starts with</SelectItem>
                  <SelectItem value="REGEX">Regex</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-bh-muted">{MATCH_HELP[editor.matchType]}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rule-pattern">
                Pattern {editor.matchType === 'REGEX' && <span className="text-bh-gold-dark">(validated server-side)</span>}
              </Label>
              <Input
                id="rule-pattern"
                value={editor.pattern}
                onChange={(e) => setEditor({ ...editor, pattern: e.target.value })}
                placeholder={editor.matchType === 'REGEX' ? '^(hi|hello|مرحبا)' : 'hello'}
                dir="auto"
                className="font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="rule-reply">Auto-reply</Label>
                <span className="text-[11px] text-bh-muted">{editor.reply.length}/2000</span>
              </div>
              <Textarea
                id="rule-reply"
                ref={replyRef}
                value={editor.reply}
                onChange={(e) => setEditor({ ...editor, reply: e.target.value.slice(0, 2000) })}
                placeholder="أهلاً {{name}}! كيف يمكننا مساعدتك اليوم؟"
                dir="auto"
                rows={4}
                className="resize-y"
              />
              <div className="space-y-1.5 pt-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-bh-muted">Insert variable at cursor</p>
                <VariableChips textareaRef={replyRef} value={editor.reply} onChange={(reply) => setEditor({ ...editor, reply })} />
              </div>
              <div className="rounded-lg border bg-bh-page/60 p-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-bh-muted">Preview</p>
                <p dir="auto" className="mt-1 whitespace-pre-line text-sm text-bh-subtle">
                  {editor.reply.trim() ? previewBody(editor.reply) : <span className="text-bh-faded">The rendered auto-reply appears here…</span>}
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button className="bg-bh-gold text-bh-navy-deep hover:bg-bh-gold-dark" onClick={save} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {editor.id ? 'Save rule' : 'Create rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ────────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The rule stops matching immediately. Nothing is sent to customers that already received its reply.
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
              Delete rule
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
