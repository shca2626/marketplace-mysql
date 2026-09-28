'use client'

import { useCallback, useEffect, useState } from 'react'
import { Eye, Loader2, Mail, MailX, Send } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import type { DigestFrequency, DigestPreviewDTO, DigestRowDTO } from '@/lib/types'
import { timeAgo } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'

/**
 * Email digest settings + preview (DIGEST-13).
 *
 * Opened from the bell's footer ("Email digest"). Mounted as a SIBLING of the
 * bell's Popover so it survives the popover closing — rendering it inside the
 * PopoverContent unmounts the dialog on close (popover synthetic clicks are
 * flaky). Everything the user can do here hits /api/notifications/digest:
 * pick a cadence, live-preview the rendered email, generate one on demand,
 * and browse the stored history.
 */

const FREQUENCY_OPTIONS: { value: DigestFrequency; label: string; hint: string }[] = [
  { value: 'OFF', label: 'Off', hint: 'No digest emails' },
  { value: 'DAILY', label: 'Daily', hint: 'Every 24 hours' },
  { value: 'WEEKLY', label: 'Weekly', hint: 'Every 7 days' },
]

const KIND_BADGE: Record<string, string> = {
  DAILY: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  WEEKLY: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300',
}

const STATUS_BADGE: Record<string, string> = {
  LOGGED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  SENT: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300',
  FAILED: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
}

const FALLBACK_BADGE = 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'

// House apiRequest pattern (component-local — same shape as admin/shared.tsx)
async function postDigest<T = unknown>(
  body: unknown
): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const res = await fetch('/api/notifications/digest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      return { ok: false, error: (json.error as string) ?? `Request failed (${res.status})` }
    }
    return { ok: true, data: json as T }
  } catch {
    return { ok: false, error: 'Network error — please try again' }
  }
}

interface NotificationsDigestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NotificationsDigestDialog({ open, onOpenChange }: NotificationsDigestDialogProps) {
  const [frequency, setFrequency] = useState<DigestFrequency | null>(null)
  const [history, setHistory] = useState<DigestRowDTO[]>([])
  const [transport, setTransport] = useState<'smtp-resend' | 'dev-console'>('dev-console')
  const [loading, setLoading] = useState(false)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewEmpty, setPreviewEmpty] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [generating, setGenerating] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/notifications/digest', { cache: 'no-store' })
      if (res.ok) {
        const data = (await res.json()) as {
          digests: DigestRowDTO[]
          frequency: DigestFrequency
          transport?: 'smtp-resend' | 'dev-console'
        }
        setFrequency(data.frequency)
        setHistory(data.digests)
        setTransport(data.transport === 'smtp-resend' ? 'smtp-resend' : 'dev-console')
      }
    } catch {
      /* next open retries */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      // Fresh settings + a clean preview surface on every open
      setPreviewHtml(null)
      setPreviewEmpty(false)
      void refresh()
    }
  }, [open, refresh])

  const handleFrequencyChange = useCallback(
    async (value: string) => {
      const next = value as DigestFrequency
      const prev = frequency
      setFrequency(next) // optimistic — reverted on failure
      const res = await postDigest<{ frequency: DigestFrequency }>({
        action: 'set-frequency',
        frequency: next,
      })
      if (!res.ok || !res.data) {
        if (prev) setFrequency(prev)
        toast({
          title: 'Could not save preference',
          description: res.error ?? 'Unexpected error',
          variant: 'destructive',
        })
        return
      }
      if (next !== 'OFF') {
        toast({
          title: next === 'DAILY' ? 'Daily digest enabled' : 'Weekly digest enabled',
          description:
            next === 'DAILY'
              ? 'Your notifications will be bundled into one email every 24 hours.'
              : 'Your notifications will be bundled into one email every 7 days.',
        })
      }
    },
    [frequency]
  )

  const handlePreview = useCallback(async () => {
    setPreviewing(true)
    const res = await postDigest<{ digest: DigestPreviewDTO | null }>({ action: 'preview' })
    setPreviewing(false)
    if (!res.ok || !res.data) {
      toast({
        title: 'Preview failed',
        description: res.error ?? 'Unexpected error',
        variant: 'destructive',
      })
      return
    }
    setPreviewHtml(res.data.digest?.html ?? null)
    setPreviewEmpty(res.data.digest === null)
  }, [])

  const handleGenerate = useCallback(async () => {
    setGenerating(true)
    const res = await postDigest<{ digest: DigestRowDTO }>({ action: 'generate' })
    setGenerating(false)
    if (!res.ok || !res.data) {
      toast({
        title: 'Digest not generated',
        description: res.error ?? 'Unexpected error',
        variant: 'destructive',
      })
      return
    }
    toast({
      title: 'Digest generated',
      description:
        transport === 'smtp-resend'
          ? `${res.data.digest.subject} — sent via your email provider (status: ${res.data.digest.status.toLowerCase()}).`
          : `${res.data.digest.subject} — stored and logged via the dev transport.`,
    })
    void refresh()
  }, [refresh, transport])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto scrollbar-thin sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail size={18} className="text-primary" /> Email digest
          </DialogTitle>
          <DialogDescription>
            Bundle your notification activity into one branded summary email.
          </DialogDescription>
        </DialogHeader>

        {/* Frequency — rounded option cards */}
        <fieldset className="space-y-2" disabled={loading && frequency === null}>
          <legend className="text-xs font-medium text-muted-foreground">Frequency</legend>
          <RadioGroup
            value={frequency ?? ''}
            onValueChange={handleFrequencyChange}
            className="grid grid-cols-3 gap-2"
          >
            {FREQUENCY_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={cn(
                  'flex cursor-pointer items-start gap-2 rounded-xl border p-3 transition-colors',
                  frequency === opt.value
                    ? 'border-primary bg-primary/5'
                    : 'hover:bg-muted/60'
                )}
              >
                <RadioGroupItem value={opt.value} className="mt-0.5" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{opt.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                    {opt.hint}
                  </span>
                </span>
              </label>
            ))}
          </RadioGroup>
        </fieldset>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePreview}
            disabled={previewing}
          >
            {previewing ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Eye size={14} />
            )}
            Preview digest
          </Button>
          {frequency && frequency !== 'OFF' && (
            <Button type="button" size="sm" onClick={handleGenerate} disabled={generating}>
              {generating ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Send size={14} />
              )}
              Generate now
            </Button>
          )}
        </div>

        {/* Live email preview — sandboxed iframe, no scripts */}
        {previewHtml !== null && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Email preview</p>
            <iframe
              title="Digest email preview"
              sandbox=""
              srcDoc={previewHtml}
              className="h-[420px] w-full rounded border bg-white"
            />
          </div>
        )}
        {previewEmpty && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center">
            <MailX size={26} className="text-muted-foreground/40" />
            <p className="text-sm font-medium">Nothing to digest yet</p>
            <p className="text-xs text-muted-foreground">
              No notifications arrived in this period — check back after your next activity.
            </p>
          </div>
        )}

        {/* Stored digest history */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Recent digests</p>
            {loading && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
          </div>
          <ul className="max-h-40 overflow-y-auto scrollbar-thin rounded-xl border px-3">
            {history.length === 0 ? (
              <li className="py-6 text-center text-xs text-muted-foreground">
                No digests yet — they will appear here once generated.
              </li>
            ) : (
              history.slice(0, 5).map((d) => (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b py-2 last:border-b-0"
                >
                  <Badge className={cn('rounded-full px-2 text-[10px]', KIND_BADGE[d.kind] ?? FALLBACK_BADGE)}>
                    {d.kind === 'WEEKLY' ? 'Weekly' : 'Daily'}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{d.subject}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {d.itemCount} update{d.itemCount === 1 ? '' : 's'}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground/80">
                    {timeAgo(d.createdAt)}
                  </span>
                  <Badge className={cn('rounded-full px-2 text-[10px]', STATUS_BADGE[d.status] ?? FALLBACK_BADGE)}>
                    {d.status === 'SENT' ? 'Sent' : d.status === 'FAILED' ? 'Failed' : 'Logged'}
                  </Badge>
                </li>
              ))
            )}
          </ul>
        </div>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {transport === 'smtp-resend'
            ? 'Digests are sent through your configured email provider (Resend SMTP). Note: while the sending domain is not yet verified in the provider dashboard, it only delivers to the account owner\u2019s address \u2014 other recipients are marked Failed until verification, and can be regenerated after.'
            : 'This sandbox has no SMTP connection — generated digests are rendered, stored, and logged to the server console instead of being sent. Registering a real email transport will switch their status to Sent.'}
        </p>
      </DialogContent>
    </Dialog>
  )
}
