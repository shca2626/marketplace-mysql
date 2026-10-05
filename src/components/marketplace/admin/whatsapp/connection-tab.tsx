'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN · WHATSAPP — Connection (agent 8-a)
// Bridge status card, QR pairing flow, connect/logout, and a direct test
// message form. Degrades to a clear amber/red card when the service is down.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import {
  Loader2,
  LogOut,
  Phone,
  Plug,
  QrCode,
  RefreshCw,
  Send,
  ShieldCheck,
  Unplug,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { timeAgo } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
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
import { apiRequest, toastApiError } from '../shared'
import type { WSession } from './shared'

export function ConnectionTab() {
  const { data, loading, refetch } = useApi<{ session: WSession }>('/api/whatsapp/session', {
    pollMs: 5000,
  })
  const session = data?.session ?? null

  const [connecting, setConnecting] = useState(false)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [testMessage, setTestMessage] = useState('')
  const [testSending, setTestSending] = useState(false)

  // fresh status right after an action
  const refreshSoon = () => {
    setTimeout(() => void refetch({ silent: true }), 600)
    setTimeout(() => void refetch({ silent: true }), 2500)
  }

  const connect = async () => {
    setConnecting(true)
    const res = await apiRequest('/api/whatsapp/session', {
      method: 'POST',
      body: JSON.stringify({ action: 'connect' }),
    })
    setConnecting(false)
    if (!res.ok) {
      toastApiError(res, 'Connect failed')
      return
    }
    toast({
      title: 'Pairing started',
      description: 'A QR code is being generated — scan it with the WhatsApp phone under Linked devices.',
    })
    refreshSoon()
  }

  const logout = async () => {
    setLoggingOut(true)
    const res = await apiRequest('/api/whatsapp/session', {
      method: 'POST',
      body: JSON.stringify({ action: 'logout' }),
    })
    setLoggingOut(false)
    setLogoutOpen(false)
    if (!res.ok) {
      toastApiError(res, 'Logout failed')
      return
    }
    toast({ title: 'Logged out', description: 'The WhatsApp number is unlinked. Connect again to re-pair.' })
    refreshSoon()
  }

  const sendTest = async () => {
    if (!testPhone.trim() || !testMessage.trim()) {
      toast({ title: 'Both fields needed', description: 'Enter a phone number and a message.', variant: 'destructive' })
      return
    }
    setTestSending(true)
    const res = await apiRequest('/api/whatsapp/send', {
      method: 'POST',
      body: JSON.stringify({ to: testPhone.trim(), message: testMessage.trim() }),
    })
    setTestSending(false)
    if (!res.ok) {
      toastApiError(res, 'Test message failed')
      return
    }
    toast({ title: 'Test message sent', description: `Delivered to ${testPhone.trim()} — check the phone.` })
    setTestMessage('')
  }

  if (loading && !session) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  // ── service DOWN state ─────────────────────────────────────────────────────
  if (session && !session.up) {
    return (
      <div className="space-y-5">
        <Card className="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
              <Unplug size={26} className="text-amber-600" />
            </div>
            <div>
              <p className="text-base font-bold text-amber-800 dark:text-amber-300">WhatsApp service is not running</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-amber-700 dark:text-amber-400/80">
                The WhatsApp bridge (port 3031) is unreachable. Start the bridge service, then retry — templates,
                rules and the inbox keep working in the meantime.
              </p>
            </div>
            <Button variant="outline" onClick={() => void refetch()}>
              <RefreshCw size={14} /> Retry connection
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const connected = !!session?.connected

  return (
    <div className="space-y-5">
      {/* ── status card ───────────────────────────────────────────────────────── */}
      <Card
        className={cn(
          'border',
          connected
            ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30'
            : 'border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30'
        )}
      >
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
                connected ? 'bg-emerald-100' : 'bg-amber-100'
              )}
            >
              {connected ? (
                <ShieldCheck size={20} className="text-emerald-600" />
              ) : (
                <Plug size={20} className="text-amber-600" />
              )}
            </div>
            <div>
              <p className="text-sm font-bold text-bh-navy">
                {connected ? 'WhatsApp linked' : 'Not linked'}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-bh-muted">
                <span className="flex items-center gap-1">
                  <span
                    className={cn(
                      'h-2 w-2 rounded-full',
                      session?.up ? (connected ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse') : 'bg-rose-500'
                    )}
                    aria-hidden
                  />
                  Bridge {session?.up ? 'running' : 'down'}
                </span>
                {session?.phone && (
                  <span className="flex items-center gap-1 font-mono">
                    <Phone size={11} /> {session.phone}
                  </span>
                )}
                {session?.since && <span>since {timeAgo(session.since)}</span>}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button variant="outline" onClick={() => void refetch()}>
              <RefreshCw size={14} /> Refresh
            </Button>
            {!connected ? (
              <Button className="bg-bh-navy text-bh-gold hover:bg-bh-navy-deep" onClick={connect} disabled={connecting}>
                {connecting ? <Loader2 size={14} className="animate-spin" /> : <Plug size={14} />}
                Connect WhatsApp
              </Button>
            ) : (
              <Button variant="outline" className="border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => setLogoutOpen(true)}>
                <LogOut size={14} /> Log out
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── QR pairing ────────────────────────────────────────────────────────── */}
      {!connected && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-6 sm:flex-row sm:items-start sm:gap-8">
            <div className="flex h-40 w-40 shrink-0 items-center justify-center rounded-2xl border-2 border-dashed border-bh-border bg-white p-2">
              {session?.qr ? (
                <img src={session.qr} alt="WhatsApp pairing QR code" className="h-full w-full object-contain" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-bh-muted">
                  <QrCode size={40} />
                  <p className="text-center text-[11px]">
                    {connecting ? 'Generating QR…' : 'Press “Connect WhatsApp” to generate a QR code'}
                  </p>
                </div>
              )}
            </div>
            <div className="max-w-md space-y-2">
              <h4 className="text-sm font-bold text-bh-navy">Pair with the business phone</h4>
              <ol className="list-decimal space-y-1 pl-4 text-sm text-bh-muted">
                <li>Press <strong className="text-bh-navy">Connect WhatsApp</strong> — a QR code appears here.</li>
                <li>On the WhatsApp phone open <strong className="text-bh-navy">Settings → Linked devices → Link a device</strong>.</li>
                <li>Scan the QR code. The status turns <strong className="text-emerald-600">linked</strong> and the phone number shows above.</li>
              </ol>
              <p className="rounded-lg bg-bh-bg-gold px-3 py-2 text-xs text-bh-gold-dark">
                The WhatsApp account stays signed in on the phone — the bridge relays messages both ways, and incoming
                messages flow into the Inbox with the chatbot auto-replies attached.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── test message ──────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-2">
            <Send size={15} className="text-bh-gold-dark" />
            <h4 className="text-sm font-bold text-bh-navy">Send a test message</h4>
          </div>
          <p className="mt-1 text-xs text-bh-muted">
            Verify the link end-to-end: send yourself (or a colleague) a message — it lands in the message log like any campaign send.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[220px_1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="test-phone">Phone (with country code)</Label>
              <Input
                id="test-phone"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="+967 77 123 4567"
                inputMode="tel"
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="test-message">Message</Label>
              <Textarea
                id="test-message"
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value.slice(0, 2000))}
                placeholder="Vendora test — شكراً لتوصيلكم 🌞"
                dir="auto"
                rows={2}
                className="resize-none"
              />
            </div>
            <Button
              className="bg-bh-gold text-bh-navy-deep hover:bg-bh-gold-dark"
              onClick={sendTest}
              disabled={testSending || !connected}
            >
              {testSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Send test
            </Button>
          </div>
          {!connected && (
            <p className="mt-2 text-[11px] text-amber-600">Link a WhatsApp number first — the send button unlocks once connected.</p>
          )}
        </CardContent>
      </Card>

      {/* ── logout confirm ────────────────────────────────────────────────────── */}
      <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Log out of WhatsApp?</AlertDialogTitle>
            <AlertDialogDescription>
              The number is unlinked and messages stop flowing until you pair again. Nothing is deleted — conversations, templates and rules all stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loggingOut}>Stay linked</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              disabled={loggingOut}
              onClick={(e) => {
                e.preventDefault()
                void logout()
              }}
            >
              {loggingOut ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
              Log out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
