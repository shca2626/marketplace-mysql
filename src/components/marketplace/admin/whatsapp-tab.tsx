'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Copy,
  FileText,
  History,
  Loader2,
  Megaphone,
  MessageCircle,
  MessageSquareDashed,
  MessagesSquare,
  QrCode,
  RefreshCw,
  Send,
  Smartphone,
  Star,
  Timer,
  Trash2,
  Unplug,
} from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { formatDate, timeAgo } from '@/lib/format'
import { toast } from '@/hooks/use-toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { AdminEmptyState, apiRequest, toastApiError } from './shared'
import { CampaignsManager } from './whatsapp/campaigns-manager'
import { ChatbotManager } from './whatsapp/chatbot-manager'
import { ChatsManager } from './whatsapp/chats-manager'
import { TemplatesManager } from './whatsapp/templates-manager'
import {
  CAMPAIGN_LIVE_STATUSES,
  KpiCard,
  type CampaignDTO,
  type ChatsListDTO,
  type RuleDTO,
  type TemplateDTO,
} from './whatsapp/shared'

/**
 * Admin console → WhatsApp Business suite (Phase 3 pairing + wa-biz-2 tabs).
 *
 * The platform sends WhatsApp for FREE through Baileys: the owner pairs ANY
 * international SIM (pairing code typed into WhatsApp → Linked devices →
 * "Link with phone number instead"), and that line becomes the outbound sender
 * for OTP codes + notification mirrors. This console now spans six tabs:
 *   Senders · Templates · Chatbot · Chats · Campaigns · Messages
 * backed by a KPI strip and (while a campaign is in flight) a 5s live poll.
 */

interface SenderDTO {
  id: string
  label: string
  phoneNumber: string
  status: string
  isDefault: boolean
  pairingCode: string | null
  codeIssuedAt: string | null
  lastUsedAt: string | null
  lastError: string | null
  createdAt: string
}

interface MessageDTO {
  id: string
  toPhone: string
  template: string
  status: string
  error: string | null
  createdAt: string
  sentAt: string | null
  bodyPreview: string
}

const SENDER_STATUS_MAP: Record<string, { label: string; badge: string }> = {
  PAIRED: {
    label: 'Paired',
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  },
  PENDING_PAIRING: {
    label: 'Awaiting pairing',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  },
  DISCONNECTED: {
    label: 'Disconnected',
    badge: 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400',
  },
  FAILED: {
    label: 'Failed',
    badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  },
}

const MESSAGE_STATUS_MAP: Record<string, { label: string; badge: string }> = {
  SENT: {
    label: 'Sent',
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  },
  QUEUED: {
    label: 'Queued',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  },
  FAILED: {
    label: 'Failed',
    badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  },
}

const TEMPLATE_BADGE: Record<string, string> = {
  OTP: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  NOTIFICATION: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300',
  TEST: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
}

function formatSenderPhone(e164: string): string {
  if (e164.startsWith('+967')) {
    const local = e164.slice(4)
    return `+967 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`
  }
  if (e164.startsWith('+966')) {
    const local = e164.slice(4)
    return `+966 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`
  }
  return e164
}

type WhatsAppSection = 'senders' | 'templates' | 'chatbot' | 'chats' | 'campaigns' | 'messages'

const SECTIONS: { key: WhatsAppSection; label: string; icon: LucideIcon }[] = [
  { key: 'senders', label: 'Senders', icon: Smartphone },
  { key: 'templates', label: 'Templates', icon: FileText },
  { key: 'chatbot', label: 'Chatbot', icon: Bot },
  { key: 'chats', label: 'Chats', icon: MessagesSquare },
  { key: 'campaigns', label: 'Campaigns', icon: Megaphone },
  { key: 'messages', label: 'Messages', icon: History },
]

export function WhatsAppTab() {
  const [section, setSection] = useState<WhatsAppSection>('senders')

  // 6s poll: while a pairing window is live the service auto-refreshes codes
  // into the DB, and the card list should surface them quickly.
  const {
    data,
    loading,
    error,
    refetch,
  } = useApi<{ senders: SenderDTO[] }>('/api/admin/whatsapp/senders', {
    pollMs: 6_000,
  })
  const { data: ledgerData, loading: ledgerLoading, refetch: refetchLedger } = useApi<{ messages: MessageDTO[] }>(
    '/api/admin/whatsapp/messages?take=200'
  )
  // wa-biz suite loaders — owned HERE (not inside the managers) so the KPI
  // strip and the tab bodies always render the exact same data.
  const templatesApi = useApi<{ templates: TemplateDTO[] }>('/api/admin/whatsapp/templates')
  const rulesApi = useApi<{ rules: RuleDTO[] }>('/api/admin/whatsapp/chatbot')
  const campaignsApi = useApi<{ campaigns: CampaignDTO[] }>('/api/admin/whatsapp/campaigns')
  // Chat threads (wa-chat-0) — 10s poll keeps the unread badge + KPI live;
  // the open conversation itself refreshes faster inside ChatsManager (4s).
  const chatsApi = useApi<ChatsListDTO>('/api/admin/whatsapp/chats', { pollMs: 10_000 })

  const senders = data?.senders ?? []
  const messages = ledgerData?.messages ?? []
  const rules = rulesApi.data?.rules
  const campaigns = campaignsApi.data?.campaigns
  const chatThreads = chatsApi.data?.threads
  const totalUnread = chatsApi.data?.totalUnread ?? null

  const pairedCount = senders.filter((s) => s.status === 'PAIRED').length
  const messages24h = messages.filter((m) => Date.now() - new Date(m.createdAt).getTime() < 86_400_000).length
  const activeRules = rules?.filter((r) => r.active).length ?? null
  const runningCampaigns = campaigns?.filter((c) => c.status === 'SENDING' || c.status === 'QUEUED').length ?? null
  const campaignLive = !!campaigns?.some((c) => CAMPAIGN_LIVE_STATUSES.includes(c.status))

  const refreshAll = useCallback(() => {
    void refetch()
    void refetchLedger()
    void templatesApi.refetch()
    void rulesApi.refetch()
    void campaignsApi.refetch()
    void chatsApi.refetch()
  }, [refetch, refetchLedger, templatesApi.refetch, rulesApi.refetch, campaignsApi.refetch, chatsApi.refetch])

  // Live progress: while any campaign is QUEUED/SENDING/PAUSED, refresh the
  // campaigns list every 5s (silent — no skeleton flash) and stop on its own
  // once nothing is running. Interval cleanup also covers unmount.
  useEffect(() => {
    if (!campaignLive) return
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      void campaignsApi.refetch({ silent: true })
    }, 5_000)
    return () => clearInterval(timer)
  }, [campaignLive, campaignsApi.refetch])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Pair sender lines, build reusable templates, auto-reply to incoming messages and run bulk
          campaigns — everything sends over your own WhatsApp numbers, free through Baileys.
        </p>
        <Button variant="outline" size="sm" onClick={refreshAll} className="h-9 rounded-xl">
          <RefreshCw size={14} className="mr-1.5" /> Refresh
        </Button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          icon={Smartphone}
          label="Paired lines"
          value={pairedCount}
          loading={loading}
          tone="emerald"
          hint={`${senders.length} line${senders.length === 1 ? '' : 's'} total`}
        />
        <KpiCard
          icon={History}
          label="Messages (24h)"
          value={messages24h}
          loading={ledgerLoading}
          hint={`${messages.length} recent logged`}
        />
        <KpiCard
          icon={Bot}
          label="Active chatbot rules"
          value={activeRules ?? '—'}
          loading={rulesApi.loading}
          tone="violet"
        />
        <KpiCard
          icon={Megaphone}
          label="Running campaigns"
          value={runningCampaigns ?? '—'}
          loading={campaignsApi.loading}
          tone="amber"
          hint={campaignLive ? 'Live · refreshing every 5s' : undefined}
        />
        <KpiCard
          icon={MessagesSquare}
          label="Chat threads"
          value={chatThreads?.length ?? '—'}
          loading={chatsApi.loading}
          tone="emerald"
          hint={
            chatThreads
              ? `${chatThreads.filter((t) => t.source === 'WEBCHAT').length} from the website widget`
              : undefined
          }
        />
        <KpiCard
          icon={MessageSquareDashed}
          label="Unread"
          value={totalUnread ?? '—'}
          loading={chatsApi.loading}
          tone="rose"
          hint={totalUnread === null ? undefined : totalUnread > 0 ? 'Waiting for a reply' : 'All caught up'}
        />
      </div>

      {/* Sticky section tabs — they dock right under the dashboard topbar (h-14) */}
      <div className="sticky top-14 z-20 -mx-4 border-b bg-background/95 px-4 pb-2 pt-1 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <nav
          aria-label="WhatsApp sections"
          className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {SECTIONS.map((s) => {
            const active = section === s.key
            const Icon = s.icon
            const count =
              s.key === 'chatbot' ? activeRules : s.key === 'campaigns' ? runningCampaigns : null
            const unread = s.key === 'chats' ? totalUnread : null
            return (
              <button
                key={s.key}
                type="button"
                aria-current={active ? 'true' : undefined}
                onClick={() => {
                  setSection(s.key)
                  // The ledger only lives on this tab — top it up silently on
                  // entry so fresh campaign/chatbot rows appear without a
                  // manual Refresh (no skeleton flash, no polling).
                  if (s.key === 'messages') void refetchLedger({ silent: true })
                }}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
                )}
              >
                <Icon size={14} />
                {s.label}
                {!!count && (
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none tabular-nums',
                      active
                        ? 'bg-primary-foreground/20 text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {count}
                  </span>
                )}
                {!!unread && (
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none tabular-nums',
                      active
                        ? 'bg-rose-500 text-white'
                        : 'bg-rose-500 text-white dark:bg-rose-400'
                    )}
                    title={`${unread} unread message${unread === 1 ? '' : 's'}`}
                  >
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Tab bodies — Senders + Messages keep the battle-tested Phase 3 UI */}
      {section === 'senders' && (
        <div className="space-y-3">
          <AddSenderForm onAdded={refreshAll} />

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full rounded-2xl" />
              ))}
            </div>
          ) : error ? (
            <AdminEmptyState
              icon={AlertTriangle}
              title="Could not load channels"
              description={error}
            />
          ) : senders.length === 0 ? (
            <AdminEmptyState
              icon={Smartphone}
              title="No WhatsApp lines yet"
              description="Add the number of a SIM that has WhatsApp installed — you will get a pairing code to type on that phone once."
            />
          ) : (
            <div className="space-y-3">
              {senders.map((s) => (
                <SenderCard key={s.id} sender={s} onChanged={refreshAll} />
              ))}
            </div>
          )}
        </div>
      )}

      {section === 'templates' && (
        <TemplatesManager
          data={templatesApi.data}
          loading={templatesApi.loading}
          error={templatesApi.error}
          refetch={templatesApi.refetch}
        />
      )}

      {section === 'chatbot' && (
        <ChatbotManager
          data={rulesApi.data}
          loading={rulesApi.loading}
          error={rulesApi.error}
          refetch={rulesApi.refetch}
          setData={rulesApi.setData}
        />
      )}

      {section === 'chats' && (
        <ChatsManager
          data={chatsApi.data}
          loading={chatsApi.loading}
          error={chatsApi.error}
          refetch={chatsApi.refetch}
          setData={chatsApi.setData}
        />
      )}

      {section === 'campaigns' && (
        <CampaignsManager
          data={campaignsApi.data}
          loading={campaignsApi.loading}
          error={campaignsApi.error}
          refetch={campaignsApi.refetch}
          templates={templatesApi.data?.templates ?? []}
          live={campaignLive}
        />
      )}

      {section === 'messages' && <MessageLedger messages={messages} />}
    </div>
  )
}

// ── Add-sender form ──────────────────────────────────────────────────────────

function AddSenderForm({ onAdded }: { onAdded: () => void }) {
  const [label, setLabel] = useState('')
  const [phone, setPhone] = useState('')
  const [isDefault, setIsDefault] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [pairing, setPairing] = useState<{
    sender: SenderDTO
    pairingCode: string | null
    warning?: string
  } | null>(null)

  async function submit() {
    if (submitting) return
    setSubmitting(true)
    const res = await apiRequest<{
      sender: SenderDTO
      pairingCode: string | null
      warning?: string
    }>('/api/admin/whatsapp/senders', {
      method: 'POST',
      body: JSON.stringify({ label, phoneNumber: phone, isDefault }),
    })
    setSubmitting(false)
    if (!res.ok || !res.data) {
      toastApiError(res.error, 'Could not add sender')
      return
    }
    setLabel('')
    setPhone('')
    setIsDefault(false)
    setPairing(res.data)
    onAdded()
  }

  const valid = label.trim().length >= 2 && phone.replace(/\D/g, '').length >= 8

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Smartphone size={16} className="text-primary" /> Add a sender line
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault()
              if (valid) void submit()
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="wa-sender-label">Label</Label>
              <Input
                id="wa-sender-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Vendora main line"
                maxLength={60}
                className="h-10 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wa-sender-phone">Phone number (any country)</Label>
              <Input
                id="wa-sender-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+967 777 555 888 — any country"
                inputMode="tel"
                className="h-10 rounded-xl"
                aria-describedby="wa-sender-phone-hint"
              />
              <p id="wa-sender-phone-hint" className="text-[11px] text-muted-foreground">
                The SIM must have WhatsApp installed — you type the pairing code on that phone
                once.
              </p>
            </div>
            <div className="flex items-end gap-3">
              <label className="flex min-h-10 items-center gap-2 text-sm">
                <Checkbox
                  checked={isDefault}
                  onCheckedChange={(v) => setIsDefault(v === true)}
                  aria-label="Make this the default outbound line once paired"
                />
                Default
              </label>
              <Button type="submit" disabled={!valid || submitting} className="h-10 rounded-xl">
                {submitting ? (
                  <Loader2 size={15} className="mr-1.5 animate-spin" />
                ) : (
                  <MessageCircle size={15} className="mr-1.5" />
                )}
                Pair number
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {pairing && (
        <PairingDialog
          result={pairing}
          onClose={(paired) => {
            setPairing(null)
            if (paired) {
              toast({
                title: 'WhatsApp line paired ✓',
                description: 'The number is now an active outbound sender.',
              })
            }
            onAdded()
          }}
        />
      )}
    </>
  )
}

// ── Pairing dialog (QR + code + live poll) ───────────────────────────────────
// Codes expire in ~2-3 min (WhatsApp drops the unregistered socket). The
// service auto-issues a fresh code when that happens, and this dialog polls
// /check so the refreshed code (and the QR) appear without any click. The QR
// comes from the same socket as the code — scanning it links instantly,
// exactly like WhatsApp Web in a browser.
interface PairingLiveState {
  pairingCode: string | null
  codeIssuedAt: string | null
  codeFresh: boolean
  refreshing: boolean
  qrDataUrl: string | null
  windowExpiresAt: string | null
}

const CODE_TTL_MS = 3 * 60_000

function PairingDialog({
  result,
  onClose,
}: {
  result: { sender: SenderDTO; pairingCode: string | null; warning?: string }
  onClose: (paired: boolean) => void
}) {
  const [paired, setPaired] = useState(false)
  const [live, setLive] = useState<PairingLiveState>({
    pairingCode: result.pairingCode,
    codeIssuedAt: null,
    codeFresh: !!result.pairingCode,
    refreshing: false,
    qrDataUrl: null,
    windowExpiresAt: null,
  })
  const [now, setNow] = useState(() => Date.now())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const deadlineRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [windowExpired, setWindowExpired] = useState(false)

  useEffect(() => {
    // Poll live pairing state every 2.5s — picks up PAIRED, auto-refreshed
    // codes, fresh QRs and window expiry without any user action.
    timerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/whatsapp/senders/${result.sender.id}/check`, {
          method: 'POST',
        })
        if (!res.ok) return
        const json = (await res.json()) as {
          sender?: { status?: string }
          pairingCode?: string | null
          codeIssuedAt?: string | null
          codeFresh?: boolean
          refreshing?: boolean
          qrDataUrl?: string | null
          windowExpiresAt?: string | null
        }
        if (json.sender?.status === 'PAIRED') {
          setPaired(true)
          return
        }
        setLive({
          pairingCode: json.pairingCode ?? null,
          codeIssuedAt: json.codeIssuedAt ?? null,
          codeFresh: !!json.codeFresh,
          refreshing: !!json.refreshing,
          qrDataUrl: json.qrDataUrl ?? null,
          windowExpiresAt: json.windowExpiresAt ?? null,
        })
      } catch {
        /* transient network error — next tick retries */
      }
    }, 2_500)
    // 1s local clock for the countdown
    tickRef.current = setInterval(() => setNow(Date.now()), 1_000)
    deadlineRef.current = setTimeout(() => setWindowExpired(true), 15 * 60_000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (tickRef.current) clearInterval(tickRef.current)
      if (deadlineRef.current) clearTimeout(deadlineRef.current)
    }
  }, [result.sender.id])

  const code = live.pairingCode ?? result.pairingCode
  const issued = live.codeIssuedAt ? new Date(live.codeIssuedAt).getTime() : null
  const ttlLeft = issued ? Math.max(0, CODE_TTL_MS - (now - issued)) : null
  const ttlSecs = ttlLeft !== null ? Math.ceil(ttlLeft / 1000) : null
  const codeExpired = !!code && ttlLeft !== null && ttlLeft <= 0
  const windowLeft = live.windowExpiresAt
    ? Math.max(0, Math.ceil((new Date(live.windowExpiresAt).getTime() - now) / 1000))
    : null

  return (
    <Dialog open onOpenChange={() => onClose(paired)}>
      <DialogContent className="sm:max-w-md">
        {paired ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 size={20} /> Number paired
              </DialogTitle>
              <DialogDescription>
                {result.sender.label} is now an active WhatsApp sender for Vendora.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-center py-2">
              <div className="rounded-2xl bg-emerald-50 p-6 text-center dark:bg-emerald-950">
                <CheckCircle2 size={40} className="mx-auto text-emerald-600 dark:text-emerald-400" />
                <p className="mt-2 text-sm font-semibold">
                  {formatSenderPhone(result.sender.phoneNumber)} · paired
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => onClose(true)} className="w-full rounded-xl">
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageCircle size={18} className="text-primary" /> Link your WhatsApp
              </DialogTitle>
              <DialogDescription>
                Pairing <span className="font-semibold">{formatSenderPhone(result.sender.phoneNumber)}</span>{' '}
                — scan the QR, or type the code on the phone that owns the SIM.
              </DialogDescription>
            </DialogHeader>

            {code ? (
              <>
                {/* QR — the fastest path: WhatsApp → Linked devices → Link a device → scan */}
                <div className="flex flex-col items-center rounded-2xl border-2 border-dashed p-4">
                  {live.qrDataUrl && !codeExpired ? (
                    <>
                      <img
                        src={live.qrDataUrl}
                        alt="WhatsApp pairing QR code"
                        width={224}
                        height={224}
                        className="rounded-xl bg-white p-1"
                      />
                      <p className="mt-2 text-xs text-muted-foreground">
                        WhatsApp → Settings → Linked devices → <span className="font-medium text-foreground">Link a device</span> → scan
                      </p>
                    </>
                  ) : (
                    <div className="flex h-[224px] w-[224px] items-center justify-center rounded-xl border">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        {live.refreshing || codeExpired ? (
                          <>
                            <Loader2 size={26} className="animate-spin" />
                            <p className="max-w-[180px] text-center text-xs">
                              Connection refreshed — new QR & code on the way…
                            </p>
                          </>
                        ) : (
                          <>
                            <QrCode size={26} />
                            <p className="max-w-[180px] text-center text-xs">
                              Preparing QR code…
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Pairing code — typing path ("Link with phone number instead") */}
                <div className="flex flex-col items-center rounded-2xl border-2 border-dashed py-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Pairing code
                  </p>
                  <p className="mt-1 select-all font-mono text-4xl font-bold tracking-[0.35em] sm:text-5xl">
                    {code}
                  </p>
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    {codeExpired ? (
                      live.refreshing ? (
                        <>
                          <Loader2 size={13} className="animate-spin" /> Code expired — a fresh one is being issued automatically…
                        </>
                      ) : (
                        'Code expired — close and press “Pair now” for a new one.'
                      )
                    ) : ttlSecs !== null ? (
                      <>
                        <Timer size={13} className="text-emerald-600 dark:text-emerald-400" />
                        {ttlSecs > 0 ? (
                          <span>
                            Valid for{' '}
                            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                              {Math.floor(ttlSecs / 60)}:{String(ttlSecs % 60).padStart(2, '0')}
                            </span>{' '}
                            — a new code is issued automatically if it expires
                          </span>
                        ) : (
                          'Expiring — wait for the fresh code…'
                        )}
                      </>
                    ) : (
                      'Valid for a few minutes — a new code is issued automatically if it expires'
                    )}
                  </p>
                </div>

                <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
                  <li>
                    Open <span className="font-medium text-foreground">WhatsApp</span> on the phone
                    with this SIM
                  </li>
                  <li>
                    <span className="font-medium text-foreground">Settings → Linked devices</span>
                  </li>
                  <li>
                    <span className="font-medium text-foreground">Link a device</span> — scan the QR,
                    or tap{' '}
                    <span className="font-medium text-foreground">
                      “Link with phone number instead”
                    </span>{' '}
                    and enter the code above
                  </li>
                </ol>
                <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Loader2 size={13} className="animate-spin" />
                  {windowExpired
                    ? 'Still waiting — check the phone and try “Pair now” for a fresh code.'
                    : windowLeft !== null
                      ? `Waiting for the phone… (window: ${Math.floor(windowLeft / 60)}:${String(windowLeft % 60).padStart(2, '0')})`
                      : 'Waiting for you to link the phone…'}
                </p>
              </>
            ) : (
              <div className="space-y-2 rounded-2xl border p-4 text-sm">
                <p className="flex items-start gap-2 font-medium">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
                  Pairing could not start
                </p>
                <p className="text-muted-foreground">{result.warning}</p>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onClose(false)} className="w-full rounded-xl">
                {code ? 'Close and finish later' : 'Close'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Sender card ──────────────────────────────────────────────────────────────

/** Persistent pairing-code chip on the sender card. Shows a live TTL countdown
 *  while the code is fresh and a clear "expired" state afterwards — the
 *  mini-service replaces expired codes automatically while the 15-min pairing
 *  window is open, and the 6s list poll picks the fresh code up. */
function PairingCodeChip({ code, issuedAt }: { code: string; issuedAt: string | null }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(t)
  }, [])

  const issued = issuedAt ? new Date(issuedAt).getTime() : null
  const left = issued ? Math.max(0, CODE_TTL_MS - (now - issued)) : null
  const expired = left !== null && left <= 0
  const secs = left !== null ? Math.ceil(left / 1000) : null

  return (
    <div
      className={cn(
        'mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border p-3',
        expired
          ? 'border-stone-300 bg-stone-100 dark:border-stone-700 dark:bg-stone-900/60'
          : 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40'
      )}
    >
      <div className="min-w-0">
        <p
          className={cn(
            'text-[11px] font-semibold uppercase tracking-wide',
            expired
              ? 'text-stone-600 dark:text-stone-400'
              : 'text-amber-800 dark:text-amber-300'
          )}
        >
          Pairing code {expired && '· expired'}
        </p>
        <p
          className={cn(
            'font-mono text-xl font-bold tracking-[0.2em]',
            expired
              ? 'text-stone-500 line-through dark:text-stone-500'
              : 'text-amber-900 dark:text-amber-200'
          )}
        >
          {code}
        </p>
        <p
          className={cn(
            'mt-0.5 flex items-center gap-1 text-[11px] leading-snug',
            expired
              ? 'text-stone-600 dark:text-stone-400'
              : 'text-amber-800/80 dark:text-amber-300/80'
          )}
        >
          {expired ? (
            'A fresh code is issued automatically — or press “Pair now”.'
          ) : secs !== null ? (
            <>
              <Timer size={11} /> Valid {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')} ·
              WhatsApp → Linked devices → Link with phone number
            </>
          ) : (
            'WhatsApp → Settings → Linked devices → Link with phone number'
          )}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="ml-auto h-8 shrink-0 rounded-lg"
        onClick={() => {
          void navigator.clipboard?.writeText(code).catch(() => undefined)
          toast({ title: 'Pairing code copied' })
        }}
      >
        <Copy size={13} className="mr-1" /> Copy
      </Button>
    </div>
  )
}

function SenderCard({ sender, onChanged }: { sender: SenderDTO; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [testOpen, setTestOpen] = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [testBusy, setTestBusy] = useState(false)
  const [pairing, setPairing] = useState<{ sender: SenderDTO; pairingCode: string | null; warning?: string } | null>(null)

  // Restart pairing for a saved-but-unpaired number — the retry path that was
  // missing when the first attempt failed (user-reported 2026-10-05).
  const retryPairing = async () => {
    if (busy) return
    setBusy('pair')
    const res = await apiRequest<{ sender: SenderDTO; pairingCode: string | null; warning?: string }>(
      `/api/admin/whatsapp/senders/${sender.id}/retry-pairing`,
      { method: 'POST' }
    )
    setBusy(null)
    if (!res.ok || !res.data) {
      toastApiError(res.error, 'Could not start pairing')
      onChanged()
      return
    }
    setPairing(res.data)
    // NOTE: no immediate onChanged() here — refetch flips `loading` on and
    // unmounts the sender cards, destroying this dialog's state. The 15s poll
    // refreshes the row; onClose() refreshes again.
  }

  async function action(name: string, url: string, successTitle: string) {
    if (busy) return
    setBusy(name)
    const res = await apiRequest(url, { method: 'POST' })
    setBusy(null)
    if (!res.ok) {
      toastApiError(res.error, `Could not ${name} the sender`)
      return
    }
    toast({ title: successTitle })
    onChanged()
  }

  async function sendTest() {
    if (testBusy) return
    setTestBusy(true)
    const res = await apiRequest<{ delivered: 'whatsapp' | 'dev' }>(
      `/api/admin/whatsapp/senders/${sender.id}/test`,
      { method: 'POST', body: JSON.stringify({ toPhone: testPhone }) }
    )
    setTestBusy(false)
    if (!res.ok) {
      toastApiError(res.error, 'Test message failed')
      return
    }
    toast({
      title: 'Test message sent',
      description:
        res.data?.delivered === 'whatsapp'
          ? 'Delivered through the paired WhatsApp line.'
          : 'No line is paired yet — logged as a DEV delivery (see ledger).',
    })
    setTestOpen(false)
    setTestPhone('')
    onChanged()
  }

  const statusMeta = SENDER_STATUS_MAP[sender.status] ?? {
    label: sender.status,
    badge: 'bg-muted text-muted-foreground',
  }

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-semibold">{sender.label}</p>
              <Badge className={cn('rounded-full border-0 text-[11px] font-semibold', statusMeta.badge)}>
                {statusMeta.label}
              </Badge>
              {sender.isDefault && (
                <Badge className="gap-1 rounded-full border-0 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  <Star size={11} className="fill-current" /> Default
                </Badge>
              )}
            </div>
            <p className="mt-1 font-mono text-sm text-muted-foreground">
              {formatSenderPhone(sender.phoneNumber)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {sender.lastUsedAt
                ? `Last used ${timeAgo(sender.lastUsedAt)}`
                : `Added ${formatDate(sender.createdAt)}`}
            </p>
            {sender.lastError && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="mt-1 line-clamp-1 max-w-md cursor-help text-xs text-rose-600 dark:text-rose-400">
                    {sender.lastError}
                  </p>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs">
                  {sender.lastError}
                </TooltipContent>
              </Tooltip>
            )}

            {/* Live pairing code from the polled row — survives page reloads
                (the code persists on the sender), so the admin never loses it.
                Codes expire in ~2-3 min; the service auto-issues a fresh one
                while the 15-min window is open (reflected here on next poll). */}
            {sender.status === 'PENDING_PAIRING' && sender.pairingCode && (
              <PairingCodeChip code={sender.pairingCode} issuedAt={sender.codeIssuedAt} />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {sender.status !== 'PAIRED' && (
              <Button
                variant="default"
                size="sm"
                className="h-9 rounded-xl"
                disabled={busy === 'pair'}
                onClick={() => void retryPairing()}
              >
                {busy === 'pair' ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Smartphone size={13} className="mr-1.5" />}
                {busy === 'pair' ? 'Getting code…' : 'Pair now'}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-xl"
              onClick={() => setTestOpen(true)}
            >
              <Send size={13} className="mr-1.5" /> Send test
            </Button>
            {!sender.isDefault && sender.status !== 'FAILED' && (
              <Button
                variant="outline"
                size="sm"
                className="h-9 rounded-xl"
                disabled={busy === 'default'}
                onClick={() => action('default', `/api/admin/whatsapp/senders/${sender.id}/default`, 'Default line updated')}
              >
                {busy === 'default' ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Star size={13} className="mr-1.5" />}
                Set default
              </Button>
            )}
            {sender.status !== 'DISCONNECTED' && (
              <Button
                variant="outline"
                size="sm"
                className="h-9 rounded-xl text-rose-700 hover:text-rose-800 dark:text-rose-400"
                disabled={busy === 'disconnect'}
                onClick={() => action('disconnect', `/api/admin/whatsapp/senders/${sender.id}/disconnect`, 'Number disconnected — you can pair another one now')}
              >
                {busy === 'disconnect' ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Unplug size={13} className="mr-1.5" />}
                Disconnect
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-xl text-rose-700 hover:text-rose-800 dark:text-rose-400"
              disabled={busy === 'delete'}
              aria-label={`Remove ${sender.label} permanently`}
              onClick={async () => {
                if (busy) return
                setBusy('delete')
                const res = await apiRequest(`/api/admin/whatsapp/senders/${sender.id}`, {
                  method: 'DELETE',
                })
                setBusy(null)
                if (!res.ok) {
                  toastApiError(res.error, 'Could not remove the sender')
                  return
                }
                toast({ title: 'Sender removed' })
                onChanged()
              }}
            >
              {busy === 'delete' ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            </Button>
          </div>
        </div>
      </CardContent>

      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send size={16} className="text-primary" /> Send a test message
            </DialogTitle>
            <DialogDescription>
              From <span className="font-semibold">{sender.label}</span> (
              {formatSenderPhone(sender.phoneNumber)}) to any WhatsApp number.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`test-phone-${sender.id}`}>Destination phone</Label>
            <Input
              id={`test-phone-${sender.id}`}
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="+967 773 555 120"
              inputMode="tel"
              className="h-10 rounded-xl"
            />
          </div>
          <DialogFooter>
            <Button
              onClick={() => void sendTest()}
              disabled={testBusy || testPhone.replace(/\D/g, '').length < 8}
              className="w-full rounded-xl"
            >
              {testBusy ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : <Send size={15} className="mr-1.5" />}
              Send test message
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {pairing && (
        <PairingDialog
          result={pairing}
          onClose={() => {
            setPairing(null)
            onChanged()
          }}
        />
      )}
    </Card>
  )
}

// ── Message ledger ───────────────────────────────────────────────────────────

function MessageLedger({ messages }: { messages: MessageDTO[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Send size={16} className="text-primary" /> Recent messages
          <span className="text-xs font-normal text-muted-foreground">
            OTP codes, notification mirrors & tests
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {messages.length === 0 ? (
          <AdminEmptyState
            icon={MessageCircle}
            title="No WhatsApp messages yet"
            description="Every outbound send (real or DEV fallback) is recorded here with its delivery status."
          />
        ) : (
          <div
            className="max-h-96 space-y-1.5 overflow-y-auto pr-1 [scrollbar-width:thin] [scrollbar-color:var(--color-border)_transparent] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border"
            role="log"
            aria-label="Recent WhatsApp messages"
          >
            {messages.map((m) => {
              const meta = MESSAGE_STATUS_MAP[m.status] ?? {
                label: m.status,
                badge: 'bg-muted text-muted-foreground',
              }
              return (
                <div
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold">{m.toPhone}</span>
                      <Badge className={cn('rounded-full border-0 text-[10px] font-semibold', meta.badge)}>
                        {meta.label}
                      </Badge>
                      {m.error === 'dev-console-delivery' && (
                        <span className="text-[10px] text-muted-foreground">(dev delivery)</span>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{m.bodyPreview}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge
                      className={cn(
                        'rounded-full border-0 text-[10px] font-semibold',
                        TEMPLATE_BADGE[m.template] ?? 'bg-muted text-muted-foreground'
                      )}
                    >
                      {m.template}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground" title={formatDate(m.createdAt)}>
                      {timeAgo(m.createdAt)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
