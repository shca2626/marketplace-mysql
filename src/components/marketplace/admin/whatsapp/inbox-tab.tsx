'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN · WHATSAPP — Unified Inbox (agent 8-a)
// WhatsApp-Web-style two-pane layout: conversation list (~340px) + thread.
// On mobile the list pushes to the thread with a back button. The thread
// polls every 4s while open; staff replies go to the chat and (for WhatsApp
// threads) out over the bridge.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  Bot,
  CheckCheck,
  Inbox as InboxIcon,
  Loader2,
  MessageCircle,
  RefreshCw,
  Send,
  Smartphone,
  Store,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { initials, timeAgo } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { apiRequest, toastApiError, FilterChips, SearchInput } from '../shared'
import {
  type ChatMsg,
  type InboxDetail,
  type InboxRow,
} from './shared'

function timeLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  }
  return timeAgo(iso)
}

function SenderAvatar({ name, kind }: { name: string; kind: string }) {
  return (
    <div
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold',
        kind === 'WHATSAPP' ? 'bg-emerald-100 text-emerald-800' : 'bg-bh-navy text-bh-gold'
      )}
      aria-hidden
    >
      {initials(name || '?') || '?'}
    </div>
  )
}

export function InboxTab() {
  // list state
  const [kind, setKind] = useState('ALL')
  const [status, setStatus] = useState('ALL')
  const [q, setQ] = useState('')
  const listUrl = `/api/whatsapp/inbox?${new URLSearchParams({
    ...(kind !== 'ALL' ? { kind } : {}),
    ...(status !== 'ALL' ? { status } : {}),
    ...(q ? { q } : {}),
  }).toString()}`
  const { data, loading, error, refetch } = useApi<{ conversations: InboxRow[] }>(listUrl, { pollMs: 10000 })
  const conversations = data?.conversations ?? []

  // thread state
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { data: thread, loading: threadLoading, refetch: refetchThread } = useApi<InboxDetail>(
    selectedId ? `/api/whatsapp/inbox/${selectedId}` : null,
    { pollMs: 4000 }
  )
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [togglingStatus, setTogglingStatus] = useState(false)
  const threadEndRef = useRef<HTMLDivElement | null>(null)
  const messages = thread?.messages ?? []

  // mark-read when opening a conversation
  useEffect(() => {
    if (!selectedId) return
    void apiRequest(`/api/whatsapp/inbox/${selectedId}`, {
      method: 'POST',
      body: JSON.stringify({ action: 'mark-read' }),
    })
  }, [selectedId])

  // keep the newest message in view
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, selectedId])

  const sendReply = async () => {
    if (!selectedId || !reply.trim() || sending) return
    setSending(true)
    const text = reply.trim()
    setReply('')
    const res = await apiRequest<{ message: ChatMsg; delivered: boolean | null; deliveryError: string | null }>(
      `/api/whatsapp/inbox/${selectedId}`,
      { method: 'POST', body: JSON.stringify({ body: text }) }
    )
    setSending(false)
    if (!res.ok || !res.data) {
      toastApiError(res, 'Reply failed')
      setReply(text)
      return
    }
    if (res.data.deliveryError) {
      toast({
        title: 'Saved, but WhatsApp delivery failed',
        description: res.data.deliveryError,
        variant: 'destructive',
      })
    }
    void refetchThread({ silent: true })
    void refetch({ silent: true })
  }

  const toggleConversationStatus = async () => {
    if (!thread) return
    const next = thread.conversation.status === 'OPEN' ? 'CLOSED' : 'OPEN'
    setTogglingStatus(true)
    const res = await apiRequest(`/api/whatsapp/inbox/${thread.conversation.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: next }),
    })
    setTogglingStatus(false)
    if (!res.ok) {
      toastApiError(res, 'Status change failed')
      return
    }
    toast({ title: next === 'CLOSED' ? 'Conversation closed' : 'Conversation reopened' })
    void refetchThread({ silent: true })
    void refetch({ silent: true })
  }

  const totalUnread = conversations.reduce((acc, c) => acc + c.unreadStaff, 0)
  const conv = thread?.conversation

  return (
    <div className="space-y-4">
      {/* ── Toolbar ─────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-base font-bold text-bh-navy">Unified inbox</h3>
          <p className="mt-0.5 max-w-xl text-sm text-bh-muted">
            WhatsApp conversations and website chat widget threads, answered from one place.
            {totalUnread > 0 && (
              <span className="ml-1 font-semibold text-bh-gold-dark">{totalUnread} unread</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterChips
            ariaLabel="Filter by channel"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'ALL', label: 'All' },
              { value: 'WHATSAPP', label: 'WhatsApp' },
              { value: 'WIDGET', label: 'Widget' },
            ]}
          />
          <FilterChips
            ariaLabel="Filter by status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'ALL', label: 'Any status' },
              { value: 'OPEN', label: 'Open' },
              { value: 'CLOSED', label: 'Closed' },
            ]}
          />
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            <RefreshCw size={14} /> Refresh
          </Button>
        </div>
      </div>

      {/* ── Two-pane shell ──────────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        {/* LEFT · conversation list */}
        <Card
          className={cn(
            'h-[600px] overflow-hidden',
            selectedId && 'hidden lg:block'
          )}
        >
          <CardContent className="flex h-full flex-col p-0">
            <div className="border-b p-3">
              <SearchInput value={q} onChange={setQ} placeholder="Search name, phone, subject…" ariaLabel="Search conversations" />
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {loading && conversations.length === 0 ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : error ? (
                <div className="p-6 text-center">
                  <p className="text-sm font-semibold text-rose-600">Failed to load inbox</p>
                  <p className="mt-1 text-xs text-bh-muted">{error}</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
                    <RefreshCw size={14} /> Retry
                  </Button>
                </div>
              ) : conversations.length === 0 ? (
                <div className="flex flex-col items-center gap-2 p-8 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bh-bg-gold">
                    <InboxIcon size={22} className="text-bh-gold-dark" />
                  </div>
                  <p className="text-sm font-semibold">No conversations</p>
                  <p className="max-w-[220px] text-xs text-bh-muted">
                    WhatsApp messages arrive here once the phone is linked — website chat threads too.
                  </p>
                </div>
              ) : (
                conversations.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    aria-label={`Open conversation with ${c.visitorName ?? c.channelRef ?? 'visitor'}`}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-xl p-3 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none',
                      selectedId === c.id && 'bg-accent'
                    )}
                  >
                    <SenderAvatar name={c.visitorName ?? c.visitorPhone ?? '?'} kind={c.kind} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-bold text-bh-navy">
                          {c.visitorName ?? c.visitorPhone ?? 'Visitor'}
                        </p>
                        <span className="shrink-0 text-[10px] text-bh-muted">{timeLabel(c.lastMessageAt)}</span>
                      </div>
                      <p dir="auto" className="mt-0.5 truncate text-xs text-bh-muted">
                        {c.lastMessagePreview ?? 'No messages yet'}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-bold',
                            c.kind === 'WHATSAPP'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-stone-200 text-stone-700'
                          )}
                        >
                          {c.kind === 'WHATSAPP' ? 'WhatsApp' : 'Widget'}
                        </span>
                        {c.status === 'CLOSED' && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-bh-muted">closed</span>
                        )}
                        {c.sellerStoreName && (
                          <span className="flex items-center gap-0.5 text-[10px] text-bh-muted">
                            <Store size={9} /> {c.sellerStoreName}
                          </span>
                        )}
                        {c.unreadStaff > 0 && (
                          <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-bh-gold px-1.5 text-[10px] font-bold text-bh-navy-deep">
                            {c.unreadStaff}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* RIGHT · thread — hidden on mobile when the list is showing */}
        <Card className={cn('h-[600px] overflow-hidden', !selectedId && 'hidden lg:flex lg:flex-col')}>
          {!selectedId ? (
            <CardContent className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-bh-bg-gold">
                <MessageCircle size={26} className="text-bh-gold-dark" />
              </div>
              <p className="text-sm font-semibold">Your conversations</p>
              <p className="max-w-xs text-xs text-bh-muted">
                Select a conversation on the left to read it and reply. WhatsApp threads are delivered straight to the customer’s phone.
              </p>
            </CardContent>
          ) : (
            <CardContent className="flex h-full flex-col p-0">
              {/* thread header */}
              <div className="flex items-center gap-3 border-b p-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 lg:hidden"
                  onClick={() => setSelectedId(null)}
                  aria-label="Back to conversation list"
                >
                  <ArrowLeft size={16} />
                </Button>
                {conv ? (
                  <SenderAvatar name={conv.visitorName ?? conv.visitorPhone ?? '?'} kind={conv.kind} />
                ) : (
                  <Skeleton className="h-10 w-10 rounded-full" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-bh-navy">
                    {conv?.visitorName ?? conv?.visitorPhone ?? 'Loading…'}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-bh-muted">
                    {conv?.kind === 'WHATSAPP' ? (
                      <span className="flex items-center gap-1">
                        <Smartphone size={10} /> {conv.channelRef ?? conv.visitorPhone}
                      </span>
                    ) : (
                      <span>Website chat</span>
                    )}
                    {conv?.visitorEmail && <span>· {conv.visitorEmail}</span>}
                    {thread?.sellerStoreName && (
                      <span className="flex items-center gap-1">
                        · <Store size={10} /> {thread.sellerStoreName}
                      </span>
                    )}
                  </div>
                </div>
                {conv && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0"
                    onClick={toggleConversationStatus}
                    disabled={togglingStatus}
                  >
                    {togglingStatus ? <Loader2 size={13} className="animate-spin" /> : <CheckCheck size={13} />}
                    {conv.status === 'OPEN' ? 'Close' : 'Reopen'}
                  </Button>
                )}
              </div>

              {/* messages */}
              <div className="flex-1 space-y-2.5 overflow-y-auto bg-bh-page/40 p-4">
                {threadLoading && !thread ? (
                  <div className="space-y-2.5">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className={cn('h-12 w-2/3 rounded-2xl', i % 2 === 1 && 'ml-auto')} />
                    ))}
                  </div>
                ) : messages.length === 0 ? (
                  <p className="py-10 text-center text-xs text-bh-muted">No messages in this conversation yet.</p>
                ) : (
                  messages.map((m) => {
                    const isStaff = m.senderRole === 'STAFF'
                    const isBot = m.senderRole === 'BOT'
                    const isVisitor = m.senderRole === 'VISITOR'
                    return (
                      <div key={m.id} className={cn('flex', isVisitor ? 'justify-start' : 'justify-end')}>
                        <div
                          className={cn(
                            'max-w-[78%] rounded-2xl px-3.5 py-2 shadow-sm',
                            isVisitor && 'rounded-bl-sm bg-muted text-foreground',
                            isStaff && 'rounded-br-sm bg-bh-navy text-white',
                            isBot && 'rounded-br-sm bg-bh-bg-gold text-bh-ink',
                            !isVisitor && !isStaff && !isBot && 'bg-muted text-muted-foreground'
                          )}
                        >
                          {isBot && (
                            <p className="mb-0.5 flex items-center gap-1 text-[10px] font-bold text-bh-gold-dark">
                              <Bot size={10} /> auto-reply
                            </p>
                          )}
                          {isStaff && m.senderName && (
                            <p className="mb-0.5 text-[10px] font-semibold text-bh-gold/80">{m.senderName}</p>
                          )}
                          <p dir="auto" className="whitespace-pre-line break-words text-sm">
                            {m.body}
                          </p>
                          <p
                            className={cn(
                              'mt-0.5 text-right text-[10px]',
                              isStaff ? 'text-white/60' : 'text-bh-muted'
                            )}
                          >
                            {timeLabel(m.createdAt)}
                          </p>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={threadEndRef} />
              </div>

              {/* composer */}
              <div className="border-t p-3">
                <div className="flex items-end gap-2">
                  <Textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        void sendReply()
                      }
                    }}
                    placeholder="Type your reply… (Enter to send, Shift+Enter for a new line)"
                    dir="auto"
                    rows={2}
                    className="max-h-32 min-h-[44px] resize-none"
                    aria-label="Reply message"
                  />
                  <Button
                    size="icon"
                    className="h-10 w-10 shrink-0 bg-bh-gold text-bh-navy-deep hover:bg-bh-gold-dark"
                    onClick={sendReply}
                    disabled={!reply.trim() || sending}
                    aria-label="Send reply"
                  >
                    {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </Button>
                </div>
                <p className="mt-1.5 text-[11px] text-bh-muted">
                  {conv?.kind === 'WHATSAPP'
                    ? 'Replies are delivered to the customer over WhatsApp.'
                    : 'Replies appear in the visitor’s chat widget.'}
                </p>
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  )
}
