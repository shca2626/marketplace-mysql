'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MessageCircle,
  RefreshCw,
  Send,
  Smartphone,
  Star,
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

/**
 * Admin console → WhatsApp Channels (Phase 3).
 *
 * The platform sends WhatsApp for FREE through Baileys: the owner pairs ANY
 * international SIM here (pairing code typed into WhatsApp → Linked devices →
 * "Link with phone number instead"), and that line becomes the outbound sender
 * for OTP codes + notification mirrors. Every send lands in the ledger below.
 */

interface SenderDTO {
  id: string
  label: string
  phoneNumber: string
  status: string
  isDefault: boolean
  pairingCode: string | null
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

export function WhatsAppTab() {
  const {
    data,
    loading,
    error,
    refetch,
  } = useApi<{ senders: SenderDTO[] }>('/api/admin/whatsapp/senders', { pollMs: 15_000 })
  const { data: ledgerData, refetch: refetchLedger } = useApi<{ messages: MessageDTO[] }>(
    '/api/admin/whatsapp/messages?take=50'
  )

  const senders = data?.senders ?? []
  const messages = ledgerData?.messages ?? []
  const pairedCount = senders.filter((s) => s.status === 'PAIRED').length

  const refreshAll = useCallback(() => {
    void refetch()
    void refetchLedger()
  }, [refetch, refetchLedger])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <MessageCircle size={18} className="text-primary" /> WhatsApp channels
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Pair any international SIM as a free outbound line — OTP codes and notification
            mirrors are sent from the default paired number.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            className={cn(
              'rounded-full border-0 text-[11px] font-semibold',
              pairedCount > 0
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                : 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400'
            )}
          >
            {pairedCount} paired
          </Badge>
          <Button variant="outline" size="sm" onClick={refreshAll} className="h-9 rounded-xl">
            <RefreshCw size={14} className="mr-1.5" /> Refresh
          </Button>
        </div>
      </div>

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

      <MessageLedger messages={messages} />
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

// ── Pairing dialog (code + instructions + live poll) ────────────────────────

function PairingDialog({
  result,
  onClose,
}: {
  result: { sender: SenderDTO; pairingCode: string | null; warning?: string }
  onClose: (paired: boolean) => void
}) {
  const [paired, setPaired] = useState(false)
  const [deadlineReached, setDeadlineReached] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const deadlineRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Poll the pairing status every 3s for up to 2 minutes.
    timerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/whatsapp/senders/${result.sender.id}/check`, {
          method: 'POST',
        })
        if (!res.ok) return
        const json = (await res.json()) as { sender?: { status?: string } }
        if (json.sender?.status === 'PAIRED') {
          setPaired(true)
        }
      } catch {
        /* transient network error — next tick retries */
      }
    }, 3_000)
    deadlineRef.current = setTimeout(() => setDeadlineReached(true), 120_000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (deadlineRef.current) clearTimeout(deadlineRef.current)
    }
  }, [result.sender.id])

  const code = result.pairingCode

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
                — type this code on the phone that owns the SIM.
              </DialogDescription>
            </DialogHeader>

            {code ? (
              <>
                <div className="flex flex-col items-center rounded-2xl border-2 border-dashed py-6">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Pairing code
                  </p>
                  <p className="mt-1 select-all font-mono text-4xl font-bold tracking-[0.35em] sm:text-5xl">
                    {code}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Valid for a few minutes — keep this dialog open
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
                    <span className="font-medium text-foreground">Link a device</span>
                  </li>
                  <li>
                    Tap{' '}
                    <span className="font-medium text-foreground">
                      “Link with phone number instead”
                    </span>{' '}
                    and enter the code above
                  </li>
                </ol>
                <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Loader2 size={13} className="animate-spin" />
                  {deadlineReached
                    ? 'Still waiting — check the phone and re-enter the code if it expired.'
                    : 'Waiting for you to enter the code on the phone…'}
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

function SenderCard({ sender, onChanged }: { sender: SenderDTO; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [testOpen, setTestOpen] = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [testBusy, setTestBusy] = useState(false)

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
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
