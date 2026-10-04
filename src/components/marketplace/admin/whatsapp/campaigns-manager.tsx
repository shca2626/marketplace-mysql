'use client'

// ─────────────────────────────────────────────────────────────────────────────
// WHATSAPP BUSINESS SUITE · CAMPAIGNS MANAGER (wa-biz-2).
// Bulk broadcast console against the wa-biz-0 contract:
//   GET/POST /api/admin/whatsapp/campaigns
//   DELETE    /api/admin/whatsapp/campaigns/[id]      (DRAFT/COMPLETED/CANCELLED/FAILED only)
//   POST      /api/admin/whatsapp/campaigns/[id]/start
//   POST      /api/admin/whatsapp/campaigns/[id]/control { action: pause|resume|cancel }
// The 5s live-refresh while a campaign is SENDING/QUEUED/PAUSED lives in the
// tab shell (single poll for the KPI strip + this list).
// NOTE: the contract has no PATCH for campaigns — "Edit" recreates the draft
// (POST first, then DELETE of the old draft) so a failed save never loses it.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  FileText,
  Loader2,
  Megaphone,
  Pause,
  Pencil,
  Play,
  Plus,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { formatDate, timeAgo } from '@/lib/format'
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
import { cn } from '@/lib/utils'
import { AdminEmptyState, apiRequest, toastApiError } from '../shared'
import {
  CAMPAIGN_AUDIENCE_MAP,
  CAMPAIGN_LIVE_STATUSES,
  CAMPAIGN_STATUS_MAP,
  PulsingDot,
  WaBadge,
  type CampaignDTO,
  type ManagerLoaderProps,
  type TemplateDTO,
} from './shared'

const AUDIENCES = Object.keys(CAMPAIGN_AUDIENCE_MAP)

function parsePhoneList(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function CampaignsManager({
  data,
  loading,
  error,
  refetch,
  templates,
  live,
}: ManagerLoaderProps<{ campaigns: CampaignDTO[] }> & {
  templates: TemplateDTO[]
  /** true while any campaign is QUEUED/SENDING/PAUSED (shell polls every 5s) */
  live: boolean
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CampaignDTO | null>(null)
  const [starting, setStarting] = useState<CampaignDTO | null>(null)
  const [deleting, setDeleting] = useState<CampaignDTO | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const campaigns = data?.campaigns ?? []

  async function control(c: CampaignDTO, action: 'pause' | 'resume' | 'cancel') {
    if (busyId) return
    setBusyId(c.id)
    const res = await apiRequest<{ campaign: CampaignDTO }>(`/api/admin/whatsapp/campaigns/${c.id}/control`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    })
    setBusyId(null)
    if (!res.ok) {
      toastApiError(res.error, `Could not ${action} the campaign`)
      return
    }
    toast({
      title:
        action === 'pause' ? 'Campaign paused' : action === 'resume' ? 'Campaign resumed' : 'Campaign cancelled',
      description: action === 'resume' ? 'Sending continues from where it paused.' : undefined,
    })
    void refetch({ silent: true })
  }

  async function confirmStart() {
    if (!starting || busyId) return
    setBusyId(starting.id)
    const res = await apiRequest<{ campaign: CampaignDTO }>(`/api/admin/whatsapp/campaigns/${starting.id}/start`, {
      method: 'POST',
    })
    setBusyId(null)
    if (!res.ok) {
      toastApiError(res.error, 'Could not start the campaign')
      return
    }
    toast({
      title: 'Campaign started',
      description: `Sending to ${starting.total} recipient${starting.total === 1 ? '' : 's'} — progress updates live.`,
    })
    setStarting(null)
    void refetch({ silent: true })
  }

  async function confirmDelete() {
    if (!deleting || busyId) return
    setBusyId(deleting.id)
    const res = await apiRequest(`/api/admin/whatsapp/campaigns/${deleting.id}`, { method: 'DELETE' })
    setBusyId(null)
    if (!res.ok) {
      toastApiError(res.error, 'Could not delete the campaign')
      return
    }
    toast({ title: 'Campaign deleted' })
    setDeleting(null)
    void refetch({ silent: true })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            Bulk campaigns
            {live && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                <PulsingDot /> Live · refreshing
              </span>
            )}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Broadcast to buyers, sellers or a custom list — sent over the default paired line, paced ~1.2s/message.
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
          <Plus size={14} className="mr-1.5" /> New campaign
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <AdminEmptyState icon={AlertTriangle} title="Could not load campaigns" description={error}>
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => void refetch()}>
            Try again
          </Button>
        </AdminEmptyState>
      ) : campaigns.length === 0 ? (
        <AdminEmptyState
          icon={Megaphone}
          title="No campaigns yet"
          description="Create a bulk broadcast — pick an audience, write the message (or load a template) and start sending over your paired line."
        >
          <Button size="sm" className="rounded-xl" onClick={() => setDialogOpen(true)}>
            <Plus size={14} className="mr-1.5" /> New campaign
          </Button>
        </AdminEmptyState>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => {
            const status = CAMPAIGN_STATUS_MAP[c.status] ?? {
              label: c.status,
              badge: 'bg-muted text-muted-foreground',
            }
            const pulsing = c.status === 'SENDING' || c.status === 'QUEUED'
            const busy = busyId === c.id
            const pct = c.total > 0 ? Math.round((c.sent / c.total) * 100) : 0
            return (
              <Card key={c.id} className="rounded-xl">
                <CardContent className="p-4 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="min-w-0 truncate font-semibold">{c.name}</p>
                        <WaBadge className={cn(status.badge, pulsing && 'gap-1.5')}>
                          {pulsing && <PulsingDot />}
                          {status.label}
                        </WaBadge>
                        <WaBadge className="border bg-background text-muted-foreground">
                          <Users size={10} className="mr-1" />
                          {CAMPAIGN_AUDIENCE_MAP[c.audience] ?? c.audience}
                        </WaBadge>
                      </div>

                      <p dir="auto" className="mt-2 line-clamp-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                        {c.body}
                      </p>

                      <p className="mt-2 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                        <span>Created {formatDate(c.createdAt)}</span>
                        {c.startedAt && <span>· started {timeAgo(c.startedAt)}</span>}
                        {c.completedAt && <span>· finished {timeAgo(c.completedAt)}</span>}
                        {c.templateName && (
                          <span>· template <span className="font-mono">{c.templateName}</span></span>
                        )}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {c.status === 'DRAFT' && (
                        <>
                          <Button size="sm" className="h-8 rounded-lg" disabled={busy} onClick={() => setStarting(c)}>
                            {busy ? <Loader2 size={13} className="mr-1 animate-spin" /> : <Play size={13} className="mr-1" />}
                            Start
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-lg"
                            disabled={busy}
                            onClick={() => {
                              setEditing(c)
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
                            aria-label={`Delete ${c.name}`}
                            onClick={() => setDeleting(c)}
                          >
                            {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                          </Button>
                        </>
                      )}
                      {(c.status === 'SENDING' || c.status === 'QUEUED') && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-lg"
                            disabled={busy}
                            onClick={() => void control(c, 'pause')}
                          >
                            {busy ? <Loader2 size={13} className="mr-1 animate-spin" /> : <Pause size={13} className="mr-1" />}
                            Pause
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-lg text-rose-700 hover:text-rose-800 dark:text-rose-400"
                            disabled={busy}
                            onClick={() => void control(c, 'cancel')}
                          >
                            {busy ? <Loader2 size={13} className="mr-1 animate-spin" /> : <X size={13} className="mr-1" />}
                            Cancel
                          </Button>
                        </>
                      )}
                      {c.status === 'PAUSED' && (
                        <>
                          <Button size="sm" className="h-8 rounded-lg" disabled={busy} onClick={() => void control(c, 'resume')}>
                            {busy ? <Loader2 size={13} className="mr-1 animate-spin" /> : <Play size={13} className="mr-1" />}
                            Resume
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-lg text-rose-700 hover:text-rose-800 dark:text-rose-400"
                            disabled={busy}
                            onClick={() => void control(c, 'cancel')}
                          >
                            {busy ? <Loader2 size={13} className="mr-1 animate-spin" /> : <X size={13} className="mr-1" />}
                            Cancel
                          </Button>
                        </>
                      )}
                      {(c.status === 'COMPLETED' || c.status === 'CANCELLED' || c.status === 'FAILED') && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-lg text-rose-700 hover:text-rose-800 dark:text-rose-400"
                          disabled={busy}
                          aria-label={`Delete ${c.name}`}
                          onClick={() => setDeleting(c)}
                        >
                          {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        </Button>
                      )}
                    </div>
                  </div>

                  {c.total > 0 && (
                    <div className="mt-3 space-y-1.5 rounded-xl border bg-muted/40 p-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium tabular-nums">
                          {c.sent}/{c.total} sent
                          {pulsing && <span className="ml-1.5 font-normal text-muted-foreground">· in flight…</span>}
                        </span>
                        {c.failed > 0 && (
                          <span className="font-medium tabular-nums text-rose-600 dark:text-rose-400">
                            {c.failed} failed
                          </span>
                        )}
                      </div>
                      <div
                        className="h-2 w-full overflow-hidden rounded-full bg-primary/20"
                        role="progressbar"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${c.name} progress`}
                      >
                        <div
                          className={cn(
                            'h-full rounded-full transition-all duration-500',
                            c.status === 'FAILED'
                              ? 'bg-rose-500'
                              : c.status === 'CANCELLED'
                                ? 'bg-stone-400 dark:bg-stone-600'
                                : 'bg-primary'
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Mounted only while open — state initializes from `editing` at mount. */}
      {dialogOpen && (
        <CampaignDialog
          editing={editing}
          templates={templates}
          onClose={() => setDialogOpen(false)}
          onSaved={() => void refetch({ silent: true })}
        />
      )}

      {/* Start confirmation — this will message real recipients */}
      <AlertDialog open={!!starting} onOpenChange={(open) => !open && setStarting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start this campaign?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <span>
                This will message <span className="font-semibold text-foreground">{starting?.total ?? 0} recipient{(starting?.total ?? 0) === 1 ? '' : 's'}</span>{' '}
                over the default paired WhatsApp line. Sends are paced (~1.2s/message) and you can pause or cancel
                while it runs.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl" disabled={busyId === starting?.id}>
              Not yet
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl"
              disabled={busyId === starting?.id}
              onClick={(e) => {
                e.preventDefault() // keep the dialog open until the API answers
                void confirmStart()
              }}
            >
              {busyId === starting?.id ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : null}
              Start sending
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.name}” and its recipient snapshot will be removed permanently. Already-sent messages stay
              in the ledger.
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
              Delete campaign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ── Create / edit dialog (edit = recreate-then-remove, no PATCH in contract) ─

function CampaignDialog({
  editing,
  templates,
  onClose,
  onSaved,
}: {
  editing: CampaignDTO | null
  templates: TemplateDTO[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(editing?.name ?? '')
  const [audience, setAudience] = useState(editing?.audience ?? 'ALL_USERS')
  // The custom phone snapshot is not part of the DTO — always start empty.
  const [customPhones, setCustomPhones] = useState('')
  const [body, setBody] = useState(editing?.body ?? '')
  const [templateId, setTemplateId] = useState<string>(editing?.templateId ?? 'none')
  const [submitting, setSubmitting] = useState(false)

  const usableTemplates = templates.filter((t) => t.status !== 'ARCHIVED')
  const phoneCount = useMemo(() => parsePhoneList(customPhones).length, [customPhones])

  const valid =
    name.trim().length >= 2 &&
    body.trim().length >= 3 &&
    (audience !== 'CUSTOM' || phoneCount > 0)

  function loadFromTemplate(id: string) {
    setTemplateId(id)
    const t = usableTemplates.find((tpl) => tpl.id === id)
    if (t) setBody(t.body)
  }

  async function submit() {
    if (submitting || !valid) return
    setSubmitting(true)
    const payload = JSON.stringify({
      name: name.trim(),
      audience,
      body: body.trim(),
      ...(audience === 'CUSTOM' ? { customPhones: parsePhoneList(customPhones).join('\n') } : {}),
      ...(templateId !== 'none' ? { templateId } : {}),
    })

    if (editing) {
      // No PATCH in the contract → create the replacement FIRST, then remove
      // the old draft, so a failed save never loses the original.
      const created = await apiRequest<{ campaign: CampaignDTO }>('/api/admin/whatsapp/campaigns', {
        method: 'POST',
        body: payload,
      })
      if (!created.ok || !created.data) {
        setSubmitting(false)
        toastApiError(created.error, 'Could not update the campaign')
        return
      }
      const removed = await apiRequest(`/api/admin/whatsapp/campaigns/${editing.id}`, { method: 'DELETE' })
      setSubmitting(false)
      if (!removed.ok) {
        toast({
          title: 'Campaign recreated',
          description: 'The previous draft could not be removed automatically — delete it from the list.',
        })
      } else {
        toast({
          title: 'Campaign updated',
          description: `${created.data.campaign.total} recipient${created.data.campaign.total === 1 ? '' : 's'} resolved.`,
        })
      }
    } else {
      const res = await apiRequest<{ campaign: CampaignDTO }>('/api/admin/whatsapp/campaigns', {
        method: 'POST',
        body: payload,
      })
      setSubmitting(false)
      if (!res.ok || !res.data) {
        toastApiError(res.error, 'Could not create the campaign')
        return
      }
      toast({
        title: 'Campaign created as draft',
        description: `${res.data.campaign.total} recipient${res.data.campaign.total === 1 ? '' : 's'} resolved — press Start when ready.`,
      })
    }
    onSaved()
    onClose()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone size={18} className="text-primary" /> {editing ? 'Edit campaign draft' : 'New campaign'}
          </DialogTitle>
          <DialogDescription>
            The audience is resolved to a phone snapshot when you save — nobody is messaged until you press Start.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="camp-name">Name</Label>
            <Input
              id="camp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Eid promotions"
              maxLength={80}
              className="h-10 rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="camp-audience">Audience</Label>
            <Select value={audience} onValueChange={setAudience}>
              <SelectTrigger id="camp-audience" className="h-10 w-full rounded-xl">
                <SelectValue placeholder="Audience" />
              </SelectTrigger>
              <SelectContent>
                {AUDIENCES.map((a) => (
                  <SelectItem key={a} value={a}>
                    {CAMPAIGN_AUDIENCE_MAP[a]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {audience === 'CUSTOM'
                ? 'Recipients are counted from your list below.'
                : 'All users with a WhatsApp number on their account.'}
            </p>
          </div>

          {audience === 'CUSTOM' && (
            <div className="space-y-1.5">
              <Label htmlFor="camp-phones">Phone list (one per line)</Label>
              <Textarea
                id="camp-phones"
                value={customPhones}
                onChange={(e) => setCustomPhones(e.target.value)}
                placeholder={'777555888\n773120145\n+966534175148'}
                rows={4}
                className="rounded-xl font-mono text-sm"
                aria-describedby="camp-phones-hint"
              />
              <p id="camp-phones-hint" className="text-[11px] text-muted-foreground">
                9-digit locals don&apos;t need the +967 prefix — the backend normalizes.{' '}
                <span className="font-semibold text-foreground">{phoneCount} number{phoneCount === 1 ? '' : 's'}</span> parsed
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="camp-body">Message</Label>
            {usableTemplates.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pb-0.5">
                <span className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                  <FileText size={12} /> Load from template:
                </span>
                <Select value={templateId} onValueChange={loadFromTemplate}>
                  <SelectTrigger className="h-8 rounded-lg text-xs" aria-label="Load body from a template">
                    <SelectValue placeholder="Pick a template…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— none —</SelectItem>
                    {usableTemplates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        <span className="font-mono text-xs">{t.name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Textarea
              id="camp-body"
              dir="auto"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={'عرض خاص بمناسبة العيد 🎉 استعرض أحدث المنتجات مع خصومات تصل إلى 30%'}
              rows={5}
              className="rounded-xl"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button className="rounded-xl" disabled={!valid || submitting} onClick={() => void submit()}>
            {submitting ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : null}
            {editing ? 'Save draft' : 'Create draft'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
