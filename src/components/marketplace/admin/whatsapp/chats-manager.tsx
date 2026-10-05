'use client'

// ─────────────────────────────────────────────────────────────────────────────
// WHATSAPP BUSINESS SUITE · CHATS MANAGER (wa-chat-2, contract wa-chat-0).
// WhatsApp-Web-like two-pane console over the admin chat API:
//   GET    /api/admin/whatsapp/chats            (shell-owned list, 10s poll)
//   GET    /api/admin/whatsapp/chats/[id]       (4s poll here — also marks read)
//   POST   /api/admin/whatsapp/chats/[id]/reply { body }
//   PATCH  /api/admin/whatsapp/chats/[id]       { autoReply }
//   DELETE /api/admin/whatsapp/chats/[id]
// The auto-reply engine and manual agent replies coexist: the per-thread
// switch pauses the bot so a human can take over that conversation.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import {
  AlertTriangle,
  ChevronLeft,
  Loader2,
  MessagesSquare,
  Search,
  Send,
  Trash2,
} from 'lucide-react'
import { initials, timeAgo } from '@/lib/format'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useApi } from '@/hooks/use-api'
import { AdminEmptyState, apiRequest, toastApiError } from '../shared'
import {
  WaBadge,
  type ChatMessageDTO,
  type ChatThreadDTO,
  type ChatsListDTO,
  type ManagerLoaderProps,
  type ThreadDetailDTO,
} from './shared'

function msgTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

/** WhatsApp source = emerald, website widget = orange. */
function avatarTone(source: string): string {
  return source === 'WHATSAPP'
    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
    : 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300'
}

function sourceMeta(source: string): { label: string; badge: string } {
  return source === 'WHATSAPP'
    ? { label: 'WhatsApp', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' }
    : { label: 'Website widget', badge: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300' }
}

/** Stable identity so the filtered-threads useMemo keeps its memoization. */
const NO_THREADS: ChatThreadDTO[] = []

export function ChatsManager({
  data,
  loading,
  error,
  refetch,
  setData,
}: ManagerLoaderProps<ChatsListDTO> & {
  setData: Dispatch<SetStateAction<ChatsListDTO | null>>
}) {
  const threads = data?.threads ?? NO_THREADS
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  // Mobile is a single pane — tap a thread to open it, chevron to go back.
  const [mobilePane, setMobilePane] = useState<'list' | 'chat'>('list')
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [deleting, setDeleting] = useState<ChatThreadDTO | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  // Open-thread messages — polled every 4s while this tab is mounted. The GET
  // also marks the thread read server-side.
  const messagesApi = useApi<ThreadDetailDTO>(
    selectedId ? `/api/admin/whatsapp/chats/${selectedId}` : null,
    { pollMs: 4_000 }
  )
  const messages = messagesApi.data?.messages ?? []

  // Prefer the fresh list row; fall back to the detail payload so a slow list
  // poll never blanks the pane mid-conversation.
  const selected =
    threads.find((t) => t.id === selectedId) ??
    (messagesApi.data && messagesApi.data.thread.id === selectedId ? messagesApi.data.thread : null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return threads
    return threads.filter(
      (t) =>
        t.name?.toLowerCase().includes(q) ||
        (t.phone ?? '').toLowerCase().includes(q) ||
        (t.lastMessageBody ?? '').toLowerCase().includes(q)
    )
  }, [threads, search])

  // ── Auto-scroll on new messages / thread switch ──────────────────────────
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const scrollKeyRef = useRef('')
  useEffect(() => {
    if (!selectedId || !messagesApi.data) return
    const last = messagesApi.data.messages.at(-1)
    const key = `${selectedId}:${messagesApi.data.messages.length}:${last?.id ?? ''}`
    if (scrollKeyRef.current === key) return
    scrollKeyRef.current = key
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }))
  }, [messagesApi.data, selectedId])

  // ── Opening a thread marks it read server-side — refresh the list (and
  //    the unread badge) while it still shows unread. The unread count is a
  //    primitive dep, so this settles instead of looping on list refreshes.
  const selectedUnread = selected?.unreadCount ?? 0
  useEffect(() => {
    if (!selectedId || !messagesApi.data || selectedUnread <= 0) return
    void refetch({ silent: true })
  }, [selectedId, messagesApi.data, selectedUnread, refetch])

  // ── Local list patching (optimistic auto-reply toggle) ───────────────────
  function patchThread(id: string, patch: Partial<ChatThreadDTO>) {
    setData((prev) =>
      prev ? { ...prev, threads: prev.threads.map((t) => (t.id === id ? { ...t, ...patch } : t)) } : prev
    )
  }

  async function toggleAutoReply(thread: ChatThreadDTO, next: boolean) {
    patchThread(thread.id, { autoReply: next })
    const res = await apiRequest<{ thread: ChatThreadDTO }>(`/api/admin/whatsapp/chats/${thread.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ autoReply: next }),
    })
    if (!res.ok) {
      patchThread(thread.id, { autoReply: !next }) // rollback
      toastApiError(res.error, 'Could not update auto-reply')
      return
    }
    toast({
      title: next ? 'Auto-reply on' : 'Agent mode',
      description: next
        ? 'Chatbot rules now answer this conversation instantly.'
        : 'Auto-reply is off — you answer this chat manually.',
    })
  }

  async function sendReply() {
    if (!selectedId || !reply.trim() || sending) return
    setSending(true)
    const res = await apiRequest<{ message: ChatMessageDTO; delivery: 'whatsapp' | 'dev' }>(
      `/api/admin/whatsapp/chats/${selectedId}/reply`,
      { method: 'POST', body: JSON.stringify({ body: reply.trim() }) }
    )
    setSending(false)
    if (!res.ok || !res.data) {
      toastApiError(res.error, 'Could not send the reply')
      return
    }
    const message = res.data.message
    // Dedupe against the 4s poll: if the background GET already delivered this
    // message between our POST landing and this append, appending again would
    // show two identical bubbles until the next poll heals the list.
    messagesApi.setData((prev) =>
      prev && !prev.messages.some((m) => m.id === message.id)
        ? { ...prev, messages: [...prev.messages, message] }
        : prev
    )
    setReply('')
    void refetch({ silent: true }) // refresh preview + lastMessageAt in the list
    toast({
      title: res.data.delivery === 'whatsapp' ? 'Reply sent over WhatsApp' : 'Reply saved',
      description:
        res.data.delivery === 'whatsapp' ? undefined : 'No line is paired — recorded as a DEV delivery.',
    })
  }

  async function confirmDelete() {
    if (!deleting || deletingBusy) return
    setDeletingBusy(true)
    const res = await apiRequest(`/api/admin/whatsapp/chats/${deleting.id}`, { method: 'DELETE' })
    setDeletingBusy(false)
    if (!res.ok) {
      toastApiError(res.error, 'Could not delete the conversation')
      return
    }
    toast({ title: 'Conversation deleted' })
    if (selectedId === deleting.id) {
      setSelectedId(null)
      setMobilePane('list')
    }
    setDeleting(null)
    void refetch({ silent: true })
  }

  function selectThread(t: ChatThreadDTO) {
    setSelectedId(t.id)
    setReply('')
    setMobilePane('chat')
  }

  const src = selected ? sourceMeta(selected.source) : null

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Conversations</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          WhatsApp threads and website widget chats in one inbox — auto-reply and manual replies work
          together.
        </p>
      </div>

      <div className="grid h-[560px] overflow-hidden rounded-xl border bg-card shadow-sm md:grid-cols-[320px_1fr]">
        {/* ── Left pane: search + thread list ─────────────────────────────── */}
        <aside
          className={cn(
            'flex min-h-0 flex-col border-b md:border-b-0 md:border-r',
            mobilePane === 'chat' && 'hidden md:flex'
          )}
          aria-label="Conversations list"
        >
          <div className="border-b p-3">
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, phone or message…"
                className="h-9 rounded-lg pl-8 text-sm"
                aria-label="Search conversations"
              />
            </div>
          </div>

          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto" role="list" aria-label="Conversations">
            {loading ? (
              <div className="space-y-1 p-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-2">
                    <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="p-4">
                <AdminEmptyState icon={AlertTriangle} title="Could not load chats" description={error}>
                  <Button variant="outline" size="sm" className="rounded-xl" onClick={() => void refetch()}>
                    Try again
                  </Button>
                </AdminEmptyState>
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-sm font-medium">No conversations{search ? ' found' : ' yet'}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Website widget chats appear here instantly — WhatsApp threads arrive once a line is
                  paired.
                </p>
              </div>
            ) : (
              filtered.map((t) => {
                const active = t.id === selectedId
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="listitem"
                    onClick={() => selectThread(t)}
                    aria-current={active ? 'true' : undefined}
                    className={cn(
                      'flex w-full items-center gap-3 border-b px-3 py-2.5 text-left transition-colors',
                      active ? 'bg-muted' : 'hover:bg-muted/60'
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                        avatarTone(t.source)
                      )}
                      aria-hidden
                    >
                      {initials(t.name || t.phone || '?')}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span dir="auto" className="min-w-0 flex-1 truncate text-sm font-semibold">
                          {t.name || t.phone || 'Unknown'}
                        </span>
                        {t.lastMessageAt && (
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {timeAgo(t.lastMessageAt)}
                          </span>
                        )}
                      </span>
                      <span className="mt-1 flex items-center gap-1.5">
                        <span
                          dir="auto"
                          className="min-w-0 flex-1 truncate text-xs leading-snug text-muted-foreground"
                        >
                          {t.lastMessageBody ?? 'No messages yet'}
                        </span>
                        <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                          {t.source === 'WHATSAPP' ? 'WA' : 'WEB'}
                        </span>
                        {t.unreadCount > 0 && (
                          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold leading-none text-white tabular-nums">
                            {t.unreadCount > 99 ? '99+' : t.unreadCount}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </aside>

        {/* ── Right pane: conversation ─────────────────────────────────────── */}
        <section
          className={cn('flex min-h-0 flex-col', mobilePane === 'list' && 'hidden md:flex')}
          aria-label="Conversation"
        >
          {!selected ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                <MessagesSquare size={30} aria-hidden />
              </span>
              <div>
                <p className="font-semibold">Select a conversation</p>
                <p className="mx-auto mt-1 max-w-[280px] text-xs leading-relaxed text-muted-foreground">
                  WhatsApp threads appear once a line is paired — website widget chats show up
                  instantly.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <header className="flex items-center gap-2.5 border-b p-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 rounded-full md:hidden"
                  onClick={() => setMobilePane('list')}
                  aria-label="Back to conversations"
                >
                  <ChevronLeft size={18} />
                </Button>
                <span
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                    avatarTone(selected.source)
                  )}
                  aria-hidden
                >
                  {initials(selected.name || selected.phone || '?')}
                </span>
                <div className="min-w-0 flex-1">
                  <p dir="auto" className="truncate text-sm font-semibold">
                    {selected.name || selected.phone || 'Unknown'}
                  </p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {selected.phone ?? 'Website visitor'}
                  </p>
                </div>
                {src && <WaBadge className={src.badge}>{src.label}</WaBadge>}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <label className="flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-muted/70">
                      <Switch
                        checked={selected.autoReply}
                        onCheckedChange={(v) => void toggleAutoReply(selected, v)}
                        aria-label={`Auto-reply for ${selected.name || 'this conversation'}`}
                      />
                      <span className="hidden text-xs font-medium text-muted-foreground sm:inline">
                        Auto-reply
                      </span>
                    </label>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[240px] text-xs">
                    Off = you answer manually (agent mode). On = chatbot rules reply instantly.
                  </TooltipContent>
                </Tooltip>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 text-rose-600 hover:text-rose-700 dark:text-rose-400"
                  onClick={() => setDeleting(selected)}
                  aria-label={`Delete conversation with ${selected.name || selected.phone || 'visitor'}`}
                >
                  <Trash2 size={16} />
                </Button>
              </header>

              {/* Messages */}
              <div
                ref={scrollRef}
                role="log"
                aria-label="Messages"
                className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-muted/20 p-4"
              >
                {messagesApi.loading && !messagesApi.data ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className={cn('flex', i % 2 ? 'justify-end' : 'justify-start')}>
                      <Skeleton
                        className={cn('h-14 rounded-2xl', i % 2 ? 'w-2/3' : 'w-1/2', i % 2 ? 'rounded-tr-sm' : 'rounded-tl-sm')}
                      />
                    </div>
                  ))
                ) : messagesApi.error ? (
                  <div className="flex flex-1 items-center justify-center p-4">
                    <AdminEmptyState
                      icon={AlertTriangle}
                      title="Could not load messages"
                      description={messagesApi.error}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        onClick={() => void messagesApi.refetch()}
                      >
                        Try again
                      </Button>
                    </AdminEmptyState>
                  </div>
                ) : messages.length === 0 ? (
                  <p className="pt-8 text-center text-xs text-muted-foreground">
                    No messages yet — say hello 👋
                  </p>
                ) : (
                  messages.map((m) => <MessageBubble key={m.id} message={m} threadName={selected.name} />)
                )}
              </div>

              {/* Reply input */}
              <form
                className="flex items-center gap-2 border-t p-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  void sendReply()
                }}
              >
                <Input
                  dir="auto"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Type a reply… / اكتب ردك…"
                  className="h-10 rounded-xl"
                  aria-label="Reply message"
                  maxLength={2000}
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={!reply.trim() || sending}
                  className="h-10 w-10 shrink-0 rounded-xl"
                  aria-label="Send reply"
                >
                  {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </Button>
              </form>
            </>
          )}
        </section>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              The thread with{' '}
              <span dir="auto" className="font-semibold">
                {deleting?.name || deleting?.phone || 'this visitor'}
              </span>{' '}
              and all its messages will be removed permanently. Auto-reply history and the message
              ledger are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl" disabled={deletingBusy}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-rose-600 hover:bg-rose-700"
              disabled={deletingBusy}
              onClick={(e) => {
                e.preventDefault() // keep the dialog open until the API answers
                void confirmDelete()
              }}
            >
              {deletingBusy ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : null}
              Delete conversation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ── One message row ──────────────────────────────────────────────────────────

function MessageBubble({ message, threadName }: { message: ChatMessageDTO; threadName: string }) {
  const out = message.direction === 'OUT'
  return (
    <div className={cn('flex w-full', out ? 'justify-end' : 'justify-start')}>
      <div
        dir="auto"
        title={new Date(message.createdAt).toLocaleString()}
        className={cn(
          'max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm',
          out
            ? 'rounded-tr-sm bg-emerald-100 text-emerald-950 dark:bg-emerald-900/60 dark:text-emerald-50'
            : 'rounded-tl-sm bg-muted text-foreground'
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
        <p className="mt-1 flex items-center gap-1.5 text-[10px] leading-none text-muted-foreground">
          <span dir="auto" className="max-w-[160px] truncate">
            {out ? (message.author ?? 'agent') : threadName || 'Visitor'}
          </span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">{msgTime(message.createdAt)}</span>
        </p>
      </div>
    </div>
  )
}
