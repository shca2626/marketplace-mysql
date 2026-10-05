'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN · WHATSAPP — Bulk campaigns (agent 8-a)
// Create (template snapshot or custom body), send with a confirmed flow,
// live progress polling while SENDING, and a detail dialog with the
// per-recipient message log.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import {
  Eye,
  Loader2,
  Megaphone,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Users,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { formatDate, timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
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
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { apiRequest, toastApiError } from '../shared'
import {
  AUDIENCE_MAP,
  CAMPAIGN_STATUS_MAP,
  MSG_STATUS_MAP,
  SectionHeader,
  VariableChips,
  WaBadge,
  previewBody,
  type WCampaign,
  type WCampaignMessage,
  type WTemplate,
} from './shared'

interface CampaignDetail {
  campaign: WCampaign
  messages: WCampaignMessage[]
}

const AUDIENCE_LABELS: Record<string, string> = {
  ALL_USERS: 'All users with a phone number',
  BUYERS: 'Buyers with a phone number',
  SELLERS: 'Sellers with a phone number',
  CUSTOM: 'Custom phone list',
}

export function CampaignsTab() {
  const { data, loading, error, refetch } = useApi<{ campaigns: WCampaign[] }>('/api/whatsapp/campaigns')
  const campaigns = data?.campaigns ?? []
  const { data: tplData } = useApi<{ templates: WTemplate[] }>('/api/whatsapp/templates')
  const approvedTemplates = (tplData?.templates ?? []).filter((t) => t.status === 'APPROVED')

  // create dialog state
  const [createOpen, setCreateOpen] = useState(false)
  const [cName, setCName] = useState('')
  const [cTemplateId, setCTemplateId] = useState<string>('custom')
  const [cBody, setCBody] = useState('')
  const [cAudience, setCAudience] = useState('ALL_USERS')
  const [cPhones, setCPhones] = useState('')
  const [creating, setCreating] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement | null>(null)

  // send / delete / detail state
  const [sendTarget, setSendTarget] = useState<WCampaign | null>(null)
  const [sending, setSending] = useState(false)
  const [pollingId, setPollingId] = useState<string | null>(null)
  const [polled, setPolled] = useState<CampaignDetail | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<WCampaign | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [detailTarget, setDetailTarget] = useState<WCampaign | null>(null)
  const [detail, setDetail] = useState<CampaignDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // poll the campaign being sent every 2s until it leaves SENDING/QUEUED
  useEffect(() => {
    if (!pollingId) return
    let cancelled = false
    const tick = async () => {
      const res = await apiRequest<CampaignDetail>(`/api/whatsapp/campaigns/${pollingId}`)
      if (cancelled) return
      if (res.ok && res.data) {
        setPolled(res.data)
        const st = res.data.campaign.status
        if (st !== 'SENDING' && st !== 'QUEUED') {
          setPollingId(null)
          const c = res.data.campaign
          if (st === 'COMPLETED') {
            toast({
              title: 'Campaign completed',
              description: `${c.name}: ${c.sent} sent${c.failed ? `, ${c.failed} failed` : ''}.`,
            })
          } else if (st === 'FAILED') {
            toast({
              title: 'Campaign failed',
              description: 'No messages were delivered — check the Connection tab, then retry.',
              variant: 'destructive',
            })
          }
          void refetch()
        }
      }
    }
    void tick()
    const timer = setInterval(tick, 2000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [pollingId, refetch])

  // live detail polling while the detail dialog is open on a sending campaign
  useEffect(() => {
    if (!detailTarget || detailTarget.status !== 'SENDING') return
    const timer = setInterval(async () => {
      const res = await apiRequest<CampaignDetail>(`/api/whatsapp/campaigns/${detailTarget.id}`)
      if (res.ok && res.data) setDetail(res.data)
    }, 2500)
    return () => clearInterval(timer)
  }, [detailTarget])

  const openDetail = async (c: WCampaign) => {
    setDetailTarget(c)
    setDetail(null)
    setDetailLoading(true)
    const res = await apiRequest<CampaignDetail>(`/api/whatsapp/campaigns/${c.id}`)
    setDetailLoading(false)
    if (!res.ok || !res.data) {
      toastApiError(res, 'Failed to load campaign')
      setDetailTarget(null)
      return
    }
    setDetail(res.data)
  }

  const create = async () => {
    if (!cName.trim()) {
      toast({ title: 'Name required', description: 'Give the campaign a name you will recognize in reports.', variant: 'destructive' })
      return
    }
    if (cTemplateId === 'custom' && !cBody.trim()) {
      toast({ title: 'Message required', description: 'Pick a template or write a custom message body.', variant: 'destructive' })
      return
    }
    const phones = cAudience === 'CUSTOM'
      ? cPhones.split('\n').map((l) => l.trim()).filter(Boolean)
      : []
    if (cAudience === 'CUSTOM' && phones.length === 0) {
      toast({ title: 'Phone list required', description: 'Add at least one number — one per line.', variant: 'destructive' })
      return
    }
    setCreating(true)
    const res = await apiRequest<{ campaign: WCampaign }>('/api/whatsapp/campaigns', {
      method: 'POST',
      body: JSON.stringify({
        name: cName.trim(),
        templateId: cTemplateId === 'custom' ? null : cTemplateId,
        body: cTemplateId === 'custom' ? cBody : undefined,
        audience: cAudience,
        phones,
      }),
    })
    setCreating(false)
    if (!res.ok || !res.data) {
      toastApiError(res, 'Campaign creation failed')
      return
    }
    toast({
      title: 'Draft campaign created',
      description: `${res.data.campaign.name} — ${res.data.campaign.total} recipient${res.data.campaign.total === 1 ? '' : 's'} resolved. Review and send when ready.`,
    })
    setCreateOpen(false)
    setCName('')
    setCTemplateId('custom')
    setCBody('')
    setCAudience('ALL_USERS')
    setCPhones('')
    void refetch()
  }

  const send = async () => {
    if (!sendTarget) return
    setSending(true)
    const res = await apiRequest<{ campaign: WCampaign }>(`/api/whatsapp/campaigns/${sendTarget.id}/send`, {
      method: 'POST',
    })
    setSending(false)
    if (!res.ok) {
      toastApiError(res, 'Send failed')
      setSendTarget(null)
      void refetch()
      return
    }
    const c = res.data?.campaign
    toast({
      title: 'Campaign sent',
      description: c ? `${c.name}: ${c.sent} sent${c.failed ? `, ${c.failed} failed` : ''}.` : 'Delivery finished.',
    })
    setSendTarget(null)
    void refetch()
  }

  const remove = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const res = await apiRequest(`/api/whatsapp/campaigns/${deleteTarget.id}`, { method: 'DELETE' })
    setDeleting(false)
    if (!res.ok) {
      toastApiError(res, 'Delete failed')
      return
    }
    toast({ title: 'Campaign deleted', description: `${deleteTarget.name} was removed.` })
    setDeleteTarget(null)
    void refetch()
  }

  // merge polled live progress into the list rows
  const liveCampaigns = campaigns.map((c) => (polled && polled.campaign.id === c.id ? polled.campaign : c))

  const sendingCount = liveCampaigns.filter((c) => c.status === 'SENDING').length
  const totalSent = liveCampaigns.reduce((acc, c) => acc + c.sent, 0)

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Bulk campaigns"
        description="Broadcast a template or custom message to an audience. Each recipient gets a personalized copy — variables resolve from their account and latest order."
      >
        <span className="rounded-full border px-3 py-1 text-xs font-semibold text-bh-muted">
          {totalSent} messages delivered{sendingCount ? ` · ${sendingCount} sending` : ''}
        </span>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          <RefreshCw size={14} /> Refresh
        </Button>
        <Button size="sm" className="bg-bh-gold text-bh-navy-deep hover:bg-bh-gold-dark" onClick={() => setCreateOpen(true)}>
          <Plus size={14} /> New campaign
        </Button>
      </SectionHeader>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm font-semibold text-rose-600">Failed to load campaigns</p>
            <p className="text-xs text-bh-muted">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              <RefreshCw size={14} /> Retry
            </Button>
          </CardContent>
        </Card>
      ) : liveCampaigns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bh-bg-gold">
              <Megaphone size={22} className="text-bh-gold-dark" />
            </div>
            <p className="text-sm font-semibold">No campaigns yet</p>
            <p className="max-w-sm text-xs text-bh-muted">
              Create your first broadcast — e.g. a Ramadan solar offer to all buyers with a WhatsApp number.
            </p>
            <Button size="sm" className="bg-bh-gold text-bh-navy-deep hover:bg-bh-gold-dark" onClick={() => setCreateOpen(true)}>
              <Plus size={14} /> Create campaign
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {liveCampaigns.map((c) => {
            const pct = c.total > 0 ? Math.round(((c.sent + c.failed) / c.total) * 100) : 0
            return (
              <Card key={c.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold text-bh-navy">{c.name}</p>
                        <WaBadge value={c.audience} map={AUDIENCE_MAP} />
                        <WaBadge value={c.status} map={CAMPAIGN_STATUS_MAP} />
                      </div>
                      <p className="mt-1 text-[11px] text-bh-muted">
                        {c.templateName ? `Template: ${c.templateName}` : 'Custom body'} · created {formatDate(c.createdAt)}
                        {c.startedAt ? ` · started ${timeAgo(c.startedAt)}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {(c.status === 'DRAFT' || c.status === 'FAILED' || c.status === 'PAUSED') && (
                        <Button
                          size="sm"
                          className="h-8 bg-bh-navy text-bh-gold hover:bg-bh-navy-deep"
                          onClick={() => setSendTarget(c)}
                        >
                          <Play size={13} /> Send
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void openDetail(c)} aria-label={`Open ${c.name}`}>
                        <Eye size={14} />
                      </Button>
                      {['DRAFT', 'COMPLETED', 'CANCELLED', 'FAILED'].includes(c.status) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-rose-500 hover:text-rose-600"
                          onClick={() => setDeleteTarget(c)}
                          aria-label={`Delete ${c.name}`}
                        >
                          <Trash2 size={14} />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-bh-muted">
                      <span>
                        {c.sent}/{c.total} delivered{c.failed ? ` · ${c.failed} failed` : ''}
                      </span>
                      <span>{pct}%</span>
                    </div>
                    <Progress
                      value={pct}
                      aria-label={`${c.name} progress`}
                      className={cn('h-2', c.status === 'COMPLETED' && '[&>div]:bg-emerald-500', c.status === 'FAILED' && '[&>div]:bg-rose-500', c.status === 'SENDING' && '[&>div]:bg-bh-gold')}
                    />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ── Create dialog ─────────────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>New campaign</DialogTitle>
            <DialogDescription>
              Pick an approved template or write a custom body, choose the audience, and save as a draft — you confirm before anything is sent.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="c-name">Campaign name</Label>
              <Input id="c-name" value={cName} onChange={(e) => setCName(e.target.value)} placeholder="e.g. عرض رمضان — أكتوبر" />
            </div>

            <div className="space-y-1.5">
              <Label>Message</Label>
              <Select
                value={cTemplateId}
                onValueChange={(v) => setCTemplateId(v)}
                disabled={approvedTemplates.length === 0}
              >
                <SelectTrigger className="w-full" aria-label="Message template">
                  <SelectValue placeholder={approvedTemplates.length ? 'Choose a template' : 'No approved templates — write a custom body'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">✍️ Custom message</SelectItem>
                  {approvedTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.language === 'ar' ? 'عربي' : 'EN'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {cTemplateId === 'custom' && (
                <div className="space-y-1.5 pt-1">
                  <Textarea
                    ref={bodyRef}
                    value={cBody}
                    onChange={(e) => setCBody(e.target.value.slice(0, 2000))}
                    placeholder="اكتب رسالتك هنا… استخدم {{name}} للتخصيص"
                    dir="auto"
                    rows={5}
                    className="resize-y"
                  />
                  <VariableChips textareaRef={bodyRef} value={cBody} onChange={setCBody} />
                </div>
              )}

              {cTemplateId !== 'custom' && (
                <div className="rounded-xl border bg-bh-page/60 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-bh-muted">Body snapshot (personalized per recipient)</p>
                  <p dir="auto" className="mt-1 max-h-28 overflow-y-auto whitespace-pre-line text-sm text-bh-subtle">
                    {previewBody(approvedTemplates.find((t) => t.id === cTemplateId)?.body ?? '')}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Audience</Label>
              <Select value={cAudience} onValueChange={setCAudience}>
                <SelectTrigger className="w-full" aria-label="Audience">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL_USERS">All users with a phone</SelectItem>
                  <SelectItem value="BUYERS">Buyers</SelectItem>
                  <SelectItem value="SELLERS">Sellers</SelectItem>
                  <SelectItem value="CUSTOM">Custom list</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-bh-muted">
                <Users size={11} className="mr-1 inline" />
                {AUDIENCE_LABELS[cAudience]} — the exact recipient count is resolved and stored when you save.
              </p>
              {cAudience === 'CUSTOM' && (
                <Textarea
                  value={cPhones}
                  onChange={(e) => setCPhones(e.target.value)}
                  placeholder={'+967771234567\n+967712345678'}
                  rows={4}
                  className="font-mono text-sm"
                  aria-label="Phone numbers, one per line"
                />
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button className="bg-bh-gold text-bh-navy-deep hover:bg-bh-gold-dark" onClick={create} disabled={creating}>
              {creating ? <Loader2 size={14} className="animate-spin" /> : null}
              Save draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Send confirm ──────────────────────────────────────────────────────── */}
      <AlertDialog open={!!sendTarget} onOpenChange={(open) => !open && setSendTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send “{sendTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                This will WhatsApp <strong className="text-bh-navy">{sendTarget?.total}</strong> recipient
                {sendTarget?.total === 1 ? '' : 's'} immediately. Each one gets a personalized copy of the message. Once started, it runs to completion.
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Not yet</AlertDialogCancel>
            <AlertDialogAction
              className="bg-bh-navy text-bh-gold hover:bg-bh-navy-deep"
              disabled={sending}
              onClick={(e) => {
                e.preventDefault()
                void send()
              }}
            >
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              Send to {sendTarget?.total ?? 0}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Detail dialog ─────────────────────────────────────────────────────── */}
      <Dialog open={!!detailTarget} onOpenChange={(open) => !open && setDetailTarget(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              {detailTarget?.name}
              {detail && <WaBadge value={detail.campaign.status} map={CAMPAIGN_STATUS_MAP} />}
              {detail && <WaBadge value={detail.campaign.audience} map={AUDIENCE_MAP} />}
            </DialogTitle>
            <DialogDescription>
              {detail
                ? `${detail.campaign.sent}/${detail.campaign.total} delivered${detail.campaign.failed ? ` · ${detail.campaign.failed} failed` : ''} — last 50 messages below.`
                : 'Loading…'}
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : detail ? (
            <>
              <div className="rounded-xl border bg-bh-page/60 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-bh-muted">Campaign body (snapshot)</p>
                <p dir="auto" className="mt-1 max-h-32 overflow-y-auto whitespace-pre-line text-sm text-bh-subtle">
                  {detail.campaign.body}
                </p>
              </div>
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {detail.messages.length === 0 ? (
                  <p className="rounded-lg bg-muted px-3 py-6 text-center text-xs text-bh-muted">
                    No messages yet — send the campaign to see the per-recipient log here.
                  </p>
                ) : (
                  detail.messages.map((m) => (
                    <div key={m.id} className="flex flex-col gap-1 rounded-xl border p-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-bh-navy">{m.toNumber}</span>
                          <WaBadge value={m.status} map={MSG_STATUS_MAP} />
                        </div>
                        <p dir="auto" className="mt-1 line-clamp-2 text-xs text-bh-subtle">
                          {m.body}
                        </p>
                        {m.error && <p className="mt-1 text-[11px] text-rose-600">{m.error}</p>}
                      </div>
                      <span className="shrink-0 text-[11px] text-bh-muted">
                        {m.sentAt ? timeAgo(m.sentAt) : timeAgo(m.createdAt)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-bh-muted">Could not load campaign details.</p>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ────────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The campaign and its message log are removed. Nothing is unsent — already-delivered messages stay with the recipients.
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
              Delete campaign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
