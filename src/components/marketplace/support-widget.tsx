'use client'

// ─────────────────────────────────────────────────────────────────────────────
// STOREFRONT · FLOATING SUPPORT WIDGET (wa-chat-2, contract wa-chat-0).
// WhatsApp-style chat bubble bottom-right of the public storefront:
//   POST /api/chat/widget/session  { name, phone? }   → { token, name }
//   POST /api/chat/widget/send     { token, body }    → { message, autoReply? }
//   GET  /api/chat/widget/messages?token=&afterId=    → { messages }
// The token persists in localStorage so returning visitors resume their chat.
// Visitor messages are direction IN server-side; support replies are OUT —
// the widget flips them visually (visitor = right/emerald, support = left).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, MessageCircle, Send, X } from 'lucide-react'
import { useMarketplace } from '@/store/marketplace'
import { timeAgo } from '@/lib/format'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { apiRequest, toastApiError } from './admin/shared'

const TOKEN_KEY = 'vendora_chat_token'
const NAME_KEY = 'vendora_chat_name'

/** localStorage read — safe on the server (renders closed → identical markup). */
function readStoredToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

interface WidgetMessageDTO {
  id: string
  direction: string // IN = visitor · OUT = support / auto-reply
  body: string
  author: string | null
  createdAt: string
}

export function SupportWidget() {
  const view = useMarketplace((s) => s.view)
  const user = useMarketplace((s) => s.user)

  const [open, setOpen] = useState(false)
  // Resuming visitors start with their stored token; the lazy initializer
  // keeps the first paint identical to the server markup (widget is closed).
  const [token, setToken] = useState<string | null>(() => readStoredToken())
  const [messages, setMessages] = useState<WidgetMessageDTO[]>([])
  // Pre-chat drafts stay null until edited, so a logged-in account's name and
  // phone prefill (and keep updating) without any effect.
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const [phoneDraft, setPhoneDraft] = useState<string | null>(null)
  const name = nameDraft ?? user?.name ?? ''
  const phone = phoneDraft ?? user?.phone ?? ''
  const [input, setInput] = useState('')
  const [starting, setStarting] = useState(false)
  const [sending, setSending] = useState(false)
  const afterIdRef = useRef<string>('')

  function applySession(t: string | null, n?: string) {
    setToken(t)
    try {
      if (t) {
        window.localStorage.setItem(TOKEN_KEY, t)
        if (n) window.localStorage.setItem(NAME_KEY, n)
      } else {
        window.localStorage.removeItem(TOKEN_KEY)
        window.localStorage.removeItem(NAME_KEY)
      }
    } catch {
      /* private mode — the session just lives in memory */
    }
  }

  // ── Polling: new messages after the last one we've seen ─────────────────
  const pollMessages = useCallback(
    async (tok?: string) => {
      const t = tok ?? token
      if (!t) return
      const params = new URLSearchParams({ token: t })
      if (afterIdRef.current) params.set('afterId', afterIdRef.current)
      const res = await apiRequest<{ messages: WidgetMessageDTO[] }>(
        `/api/chat/widget/messages?${params.toString()}`
      )
      if (!res.ok) {
        // Unknown token (e.g. the server was reset) → back to the pre-chat form.
        // The messages route answers 404 with { code: 'SESSION_NOT_FOUND' }.
        if (res.code === 'SESSION_NOT_FOUND' || /not found|404/i.test(res.error ?? '')) {
          applySession(null)
          setMessages([])
          afterIdRef.current = ''
          toast({
            title: 'Chat session expired',
            description: 'Start a new conversation below.',
            variant: 'destructive',
          })
        }
        return
      }
      const fresh = res.data?.messages ?? []
      if (fresh.length) {
        setMessages((prev) => {
          const known = new Set(prev.map((m) => m.id))
          const add = fresh.filter((m) => !known.has(m.id))
          return add.length ? [...prev, ...add] : prev
        })
        afterIdRef.current = fresh[fresh.length - 1].id
      }
    },
    [token]
  )

  // Poll every 5s while the widget is open (never in background tabs). The
  // first poll is deferred through a timeout so no state updates fire
  // synchronously inside the effect.
  useEffect(() => {
    if (!open || !token) return
    const poll = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        void pollMessages()
      }
    }
    const kickoff = setTimeout(poll, 0)
    const timer = setInterval(poll, 5_000)
    return () => {
      clearTimeout(kickoff)
      clearInterval(timer)
    }
  }, [open, token, pollMessages])

  // ── Auto-scroll on new messages ──────────────────────────────────────────
  const listRef = useRef<HTMLDivElement | null>(null)
  const lastKeyRef = useRef('')
  useEffect(() => {
    const last = messages.at(-1)
    const key = last?.id ?? ''
    if (key === lastKeyRef.current) return
    lastKeyRef.current = key
    requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }))
  }, [messages])

  // ── Actions ───────────────────────────────────────────────────────────────
  async function startSession() {
    if (!name.trim() || starting) return
    setStarting(true)
    const res = await apiRequest<{ token: string; name: string }>('/api/chat/widget/session', {
      method: 'POST',
      body: JSON.stringify({
        name: name.trim(),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
      }),
    })
    setStarting(false)
    if (!res.ok || !res.data) {
      toastApiError(res.error, 'Could not start the chat')
      return
    }
    applySession(res.data.token, res.data.name)
    setMessages([])
    afterIdRef.current = ''
    await pollMessages(res.data.token)
  }

  async function sendMessage() {
    const text = input.trim()
    if (!token || !text || sending) return
    setSending(true)
    // Optimistic visitor bubble — reconciled with the server response below.
    const tmpId = `tmp-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      { id: tmpId, direction: 'IN', body: text, author: 'visitor', createdAt: new Date().toISOString() },
    ])
    setInput('')
    const res = await apiRequest<{ message: WidgetMessageDTO; autoReply?: { name: string; body: string } }>(
      '/api/chat/widget/send',
      { method: 'POST', body: JSON.stringify({ token, body: text }) }
    )
    setSending(false)
    if (!res.ok || !res.data) {
      setMessages((prev) => prev.filter((m) => m.id !== tmpId))
      toastApiError(res.error, 'Could not send the message')
      return
    }
    const real = res.data.message
    // Reconcile the optimistic bubble: drop ONLY the tmp bubble, then add the
    // real message if a racing poll hasn't delivered it already. (Filtering
    // `real` out and then skipping the re-add would DROP the visitor's own
    // message whenever the 5s poll won the race.)
    setMessages((prev) => {
      const cleaned = prev.filter((m) => m.id !== tmpId)
      return cleaned.some((m) => m.id === real.id) ? cleaned : [...cleaned, real]
    })
    // afterId only ever moves forward — a racing poll may already have set it
    // past the real message (e.g. to the auto-reply).
    if (afterIdRef.current < real.id) afterIdRef.current = real.id
    // The auto-reply is persisted server-side before this response returns —
    // an immediate poll renders it with its real id (no duplicate bubbles).
    await pollMessages(token)
  }

  // Mounted in the storefront branch of the SPA root — never cover the admin
  // console (defensive: also hidden if ever mounted globally).
  if (view === 'admin') return null

  return (
    <>
      {/* Closed: floating button */}
      <AnimatePresence>
        {!open && (
          <motion.button
            key="support-fab"
            type="button"
            aria-label="Chat with Vendora support"
            onClick={() => setOpen(true)}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 400, damping: 24 }}
            className="fixed bottom-5 right-5 z-[60] grid h-14 w-14 place-items-center rounded-full bg-emerald-500 text-white shadow-xl shadow-emerald-600/30"
          >
            <MessageCircle size={24} aria-hidden />
            {/* subtle "online" dot */}
            <span className="absolute right-0.5 top-0.5 flex h-3.5 w-3.5" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-70" />
              <span className="relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-400" />
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Open: chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="support-panel"
            role="dialog"
            aria-label="Vendora support chat"
            initial={{ opacity: 0, y: 28, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 28, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 360, damping: 30 }}
            className="fixed bottom-5 left-3 right-3 z-[60] flex h-[min(600px,72vh)] w-[min(380px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl sm:left-auto sm:right-5"
          >
            {/* Header — emerald gradient */}
            <header className="flex items-center gap-3 bg-gradient-to-br from-emerald-500 to-emerald-600 p-3.5 text-white">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20">
                <MessageCircle size={20} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold leading-tight">Vendora Support</p>
                <p className="flex items-center gap-1.5 text-[11px] leading-tight text-emerald-50">
                  <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                  </span>
                  متصل الآن • Online now
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Minimize chat"
                className="rounded-full p-1.5 text-white/90 transition-colors hover:bg-white/20 hover:text-white"
              >
                <X size={18} aria-hidden />
              </button>
            </header>

            {token ? (
              <>
                {/* Messages */}
                <div
                  ref={listRef}
                  role="log"
                  aria-label="Support chat messages"
                  className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-muted/30 p-4"
                >
                  {messages.length === 0 ? (
                    <p dir="auto" className="pt-8 text-center text-xs leading-relaxed text-muted-foreground">
                      You&apos;re connected — send us a message and we&apos;ll reply right away.
                      <br />
                      أنت متصل الآن — أرسل رسالتك وسنرد فوراً.
                    </p>
                  ) : (
                    messages.map((m) => <WidgetBubble key={m.id} message={m} />)
                  )}
                </div>

                {/* Input row */}
                <form
                  className="flex items-center gap-2 border-t bg-card p-3"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void sendMessage()
                  }}
                >
                  <Input
                    dir="auto"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="اكتب رسالتك… / Type your message…"
                    className="h-10 rounded-xl"
                    aria-label="Message"
                    maxLength={2000}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!input.trim() || sending}
                    className="h-10 w-10 shrink-0 rounded-xl bg-emerald-600 hover:bg-emerald-700"
                    aria-label="Send message"
                  >
                    {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </Button>
                </form>
              </>
            ) : (
              /* Pre-chat form */
              <div className="flex flex-1 flex-col justify-center gap-5 overflow-y-auto p-5">
                <div className="space-y-1.5 text-center">
                  <p dir="auto" className="text-sm font-semibold">
                    أهلاً بك! كيف نقدر نساعدك اليوم؟
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Hello! How can we help you today? We usually reply within minutes.
                  </p>
                </div>
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void startSession()
                  }}
                >
                  <div className="space-y-1.5">
                    <label htmlFor="support-widget-name" className="text-xs font-medium">
                      Name · الاسم
                    </label>
                    <Input
                      id="support-widget-name"
                      dir="auto"
                      value={name}
                      onChange={(e) => setNameDraft(e.target.value)}
                      placeholder="Your name / اسمك"
                      className="h-10 rounded-xl"
                      maxLength={80}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="support-widget-phone" className="text-xs font-medium">
                      Phone (optional) · الجوال (اختياري)
                    </label>
                    <Input
                      id="support-widget-phone"
                      dir="ltr"
                      value={phone}
                      onChange={(e) => setPhoneDraft(e.target.value)}
                      placeholder="+967 7XX XXX XXX"
                      inputMode="tel"
                      className="h-10 rounded-xl"
                      maxLength={20}
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={!name.trim() || starting}
                    className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700"
                  >
                    {starting ? (
                      <Loader2 size={15} className="mr-1.5 animate-spin" />
                    ) : (
                      <MessageCircle size={15} className="mr-1.5" />
                    )}
                    Start chat / ابدأ المحادثة
                  </Button>
                </form>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

// ── One chat bubble — visitor's own on the right (emerald), support on the left

function WidgetBubble({ message }: { message: WidgetMessageDTO }) {
  const mine = message.direction === 'IN'
  const auto = message.author?.startsWith('auto-reply:')
  return (
    <div className={cn('flex w-full', mine ? 'justify-end' : 'justify-start')}>
      <div
        dir="auto"
        title={new Date(message.createdAt).toLocaleString()}
        className={cn(
          'max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm',
          mine
            ? 'rounded-tr-sm bg-emerald-100 text-emerald-950 dark:bg-emerald-900/60 dark:text-emerald-50'
            : 'rounded-tl-sm border bg-card text-foreground'
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
        <p className="mt-1 flex items-center gap-1.5 text-[10px] leading-none text-muted-foreground">
          {!mine && (
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
              Vendora{auto ? ' · auto' : ''}
            </span>
          )}
          {!mine && <span aria-hidden>·</span>}
          <span>{timeAgo(message.createdAt)}</span>
        </p>
      </div>
    </div>
  )
}
