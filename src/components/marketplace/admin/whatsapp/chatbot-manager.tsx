'use client'

// ─────────────────────────────────────────────────────────────────────────────
// WHATSAPP BUSINESS SUITE · CHATBOT MANAGER (wa-biz-2).
// Auto-reply rules for incoming WhatsApp messages + a live test console that
// simulates an incoming message through the backend's pure evaluator:
//   GET/POST /api/admin/whatsapp/chatbot
//   PATCH/DELETE /api/admin/whatsapp/chatbot/[id]
//   POST /api/admin/whatsapp/chatbot/test  { sample } → { matched } | null
// Rules run in priority order (asc) on the mini-service; first match replies.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, type Dispatch, type SetStateAction } from 'react'
import {
  AlertTriangle,
  Bot,
  FlaskConical,
  Loader2,
  Pencil,
  Plus,
  Send,
  Trash2,
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { AdminEmptyState, apiRequest, toastApiError } from '../shared'
import { ChatBubble, RULE_MATCH_MAP, WaBadge, type ManagerLoaderProps, type RuleDTO } from './shared'

const MATCH_TYPES = ['CONTAINS', 'EXACT', 'STARTS_WITH', 'REGEX']

interface RulesPayload {
  rules: RuleDTO[]
}

export function ChatbotManager({
  data,
  loading,
  error,
  refetch,
  setData,
}: ManagerLoaderProps<RulesPayload> & {
  setData: Dispatch<SetStateAction<RulesPayload | null>>
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<RuleDTO | null>(null)
  const [deleting, setDeleting] = useState<RuleDTO | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const rules = data?.rules ?? []

  // ── Test console ─────────────────────────────────────────────────────────
  const [sample, setSample] = useState('')
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<{ sample: string; matched: { name: string; reply: string } | null } | null>(null)

  async function runTest() {
    if (!sample.trim() || testing) return
    setTesting(true)
    const res = await apiRequest<{ matched: { name: string; reply: string } | null }>(
      '/api/admin/whatsapp/chatbot/test',
      { method: 'POST', body: JSON.stringify({ sample: sample.trim() }) }
    )
    setTesting(false)
    if (!res.ok) {
      toastApiError(res.error, 'Test failed')
      return
    }
    setResult({ sample: sample.trim(), matched: res.data?.matched ?? null })
  }

  // ── Optimistic active toggle (rollback on error) ──────────────────────────
  function patchLocal(id: string, patch: Partial<RuleDTO>) {
    setData((prev) =>
      prev ? { rules: prev.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) } : prev
    )
  }

  async function toggleActive(rule: RuleDTO, next: boolean) {
    patchLocal(rule.id, { active: next })
    const res = await apiRequest(`/api/admin/whatsapp/chatbot/${rule.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ active: next }),
    })
    if (!res.ok) {
      patchLocal(rule.id, { active: !next }) // rollback
      toastApiError(res.error, 'Could not update the rule')
      return
    }
    toast({ title: next ? 'Rule activated' : 'Rule paused', description: rule.name })
  }

  async function confirmDelete() {
    if (!deleting || busyId) return
    setBusyId(deleting.id)
    const res = await apiRequest(`/api/admin/whatsapp/chatbot/${deleting.id}`, { method: 'DELETE' })
    setBusyId(null)
    if (!res.ok) {
      toastApiError(res.error, 'Could not delete the rule')
      return
    }
    toast({ title: 'Rule deleted' })
    setDeleting(null)
    void refetch({ silent: true })
  }

  return (
    <div className="space-y-4">
      {/* ── Test console — simulate an incoming message, no real send ──────── */}
      <Card className="rounded-xl">
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <FlaskConical size={16} className="text-primary" /> Test console
            <span className="text-xs font-normal text-muted-foreground">
              Simulate an incoming message — nothing is actually sent
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault()
              void runTest()
            }}
          >
            <Input
              dir="auto"
              value={sample}
              onChange={(e) => setSample(e.target.value)}
              placeholder="Simulate an incoming message… e.g. ساعات العمل"
              className="h-10 rounded-xl"
              aria-label="Simulate an incoming message"
            />
            <Button
              type="submit"
              className="h-10 shrink-0 rounded-xl"
              disabled={!sample.trim() || testing}
            >
              {testing ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : <Send size={15} className="mr-1.5" />}
              Test
            </Button>
          </form>

          {result && (
            <div
              className={cn(
                'rounded-xl border p-3',
                result.matched
                  ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40'
                  : 'bg-muted/40'
              )}
            >
              {/* mini chat: the simulated inbound (left) + the matched auto-reply (right) */}
              <div className="flex">
                <ChatBubble body={result.sample} incoming />
              </div>
              {result.matched ? (
                <>
                  <p className="mt-3 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    Rule “{result.matched.name}” would reply:
                  </p>
                  <div className="mt-1.5 flex justify-end">
                    <ChatBubble body={result.matched.reply} />
                  </div>
                </>
              ) : (
                <p className="mt-3 text-center text-xs text-muted-foreground">
                  No rule matches — the message stays unanswered.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Rules list ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Auto-reply rules</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Incoming messages are checked against active rules in priority order — first match replies.
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
          <Plus size={14} className="mr-1.5" /> New rule
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <AdminEmptyState icon={AlertTriangle} title="Could not load rules" description={error}>
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => void refetch()}>
            Try again
          </Button>
        </AdminEmptyState>
      ) : rules.length === 0 ? (
        <AdminEmptyState
          icon={Bot}
          title="No auto-replies yet"
          description="Add your first rule — e.g. reply to “ساعات” with your working hours."
        >
          <Button size="sm" className="rounded-xl" onClick={() => setDialogOpen(true)}>
            <Plus size={14} className="mr-1.5" /> New rule
          </Button>
        </AdminEmptyState>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => {
            const match = RULE_MATCH_MAP[rule.matchType] ?? {
              label: rule.matchType,
              badge: 'bg-muted text-muted-foreground',
            }
            const busy = busyId === rule.id
            return (
              <Card key={rule.id} className="rounded-xl">
                <CardContent className="p-4 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted text-[11px] font-bold text-muted-foreground"
                          title={`Priority ${rule.priority} — lower numbers fire first`}
                        >
                          {rule.priority}
                        </span>
                        <p className="min-w-0 truncate font-semibold">{rule.name}</p>
                        <WaBadge className={match.badge}>{match.label}</WaBadge>
                        <span
                          className={cn(
                            'text-[11px] font-semibold',
                            rule.active ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                          )}
                        >
                          {rule.active ? 'Active' : 'Paused'}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <code
                          dir="auto"
                          className="break-all rounded-md bg-muted px-2 py-1 font-mono text-xs"
                        >
                          {rule.pattern}
                        </code>
                        <span className="text-[11px] text-muted-foreground">
                          {rule.hits} {rule.hits === 1 ? 'hit' : 'hits'} · updated {timeAgo(rule.updatedAt)}
                        </span>
                      </div>

                      <p
                        dir="auto"
                        className="mt-2.5 line-clamp-2 whitespace-pre-line rounded-xl bg-muted/60 px-3 py-2 text-sm leading-relaxed text-muted-foreground"
                      >
                        {rule.reply}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-3">
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Switch
                          checked={rule.active}
                          onCheckedChange={(v) => void toggleActive(rule, v)}
                          aria-label={`${rule.active ? 'Pause' : 'Activate'} rule ${rule.name}`}
                        />
                        {rule.active ? 'On' : 'Off'}
                      </label>
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-lg"
                          disabled={busy}
                          onClick={() => {
                            setEditing(rule)
                            setDialogOpen(true)
                          }}
                        >
                          <Pencil size={13} className="mr-1" /> Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-lg text-rose-700 hover:text-rose-800 dark:text-rose-400"
                          disabled={busy}
                          aria-label={`Delete rule ${rule.name}`}
                          onClick={() => setDeleting(rule)}
                        >
                          {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Mounted only while open — state initializes from `editing` at mount. */}
      {dialogOpen && (
        <RuleDialog editing={editing} onClose={() => setDialogOpen(false)} onSaved={() => void refetch({ silent: true })} />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this rule?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.name}” will stop replying immediately and be removed permanently.
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
              Delete rule
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ── Create / edit rule dialog ────────────────────────────────────────────────

function RuleDialog({
  editing,
  onClose,
  onSaved,
}: {
  editing: RuleDTO | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(editing?.name ?? '')
  const [matchType, setMatchType] = useState(editing?.matchType ?? 'CONTAINS')
  const [pattern, setPattern] = useState(editing?.pattern ?? '')
  const [reply, setReply] = useState(editing?.reply ?? '')
  const [priority, setPriority] = useState(String(editing?.priority ?? 10))
  const [active, setActive] = useState(editing?.active ?? true)
  const [submitting, setSubmitting] = useState(false)

  const valid =
    name.trim().length >= 2 && pattern.trim().length >= 1 && reply.trim().length >= 2 && priority !== ''

  async function submit() {
    if (submitting || !valid) return
    setSubmitting(true)
    const payload = JSON.stringify({
      name: name.trim(),
      matchType,
      pattern: pattern.trim(),
      reply: reply.trim(),
      priority: parseInt(priority, 10) || 0,
      active,
    })
    const res = editing
      ? await apiRequest<{ rule: RuleDTO }>(`/api/admin/whatsapp/chatbot/${editing.id}`, {
          method: 'PATCH',
          body: payload,
        })
      : await apiRequest<{ rule: RuleDTO }>('/api/admin/whatsapp/chatbot', {
          method: 'POST',
          body: payload,
        })
    setSubmitting(false)
    if (!res.ok) {
      toastApiError(res.error, 'Could not save the rule')
      return
    }
    toast({ title: editing ? 'Rule updated' : 'Rule created', description: name.trim() })
    onSaved()
    onClose()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot size={18} className="text-primary" /> {editing ? 'Edit rule' : 'New auto-reply rule'}
          </DialogTitle>
          <DialogDescription>
            When an incoming message matches the pattern, the reply is sent automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rule-name">Rule name</Label>
            <Input
              id="rule-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Working hours"
              maxLength={80}
              className="h-10 rounded-xl"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rule-match">Match type</Label>
              <Select value={matchType} onValueChange={setMatchType}>
                <SelectTrigger id="rule-match" className="h-10 w-full rounded-xl">
                  <SelectValue placeholder="Match type" />
                </SelectTrigger>
                <SelectContent>
                  {MATCH_TYPES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {RULE_MATCH_MAP[m]?.label ?? m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-priority">Priority</Label>
              <Input
                id="rule-priority"
                type="number"
                min={0}
                max={999}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="h-10 rounded-xl"
                aria-describedby="rule-priority-hint"
              />
              <p id="rule-priority-hint" className="text-[11px] text-muted-foreground">
                Lower numbers fire first
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rule-pattern">Pattern</Label>
            <Input
              id="rule-pattern"
              dir="auto"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder={matchType === 'REGEX' ? '^(ساعات|شغل)$' : 'ساعات'}
              maxLength={200}
              className="h-10 rounded-xl font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rule-reply">Reply</Label>
            <Textarea
              id="rule-reply"
              dir="auto"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="نفتح يومياً من 9 صباحاً حتى 9 مساءً 🕘"
              rows={4}
              className="rounded-xl"
            />
          </div>

          <label className="flex items-center justify-between gap-3 rounded-xl border p-3">
            <span className="min-w-0">
              <span className="block text-sm font-medium">Active</span>
              <span className="block text-xs text-muted-foreground">
                Paused rules stay saved but never reply
              </span>
            </span>
            <Switch checked={active} onCheckedChange={setActive} aria-label="Rule active" />
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button className="rounded-xl" disabled={!valid || submitting} onClick={() => void submit()}>
            {submitting ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : null}
            {editing ? 'Save changes' : 'Create rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
