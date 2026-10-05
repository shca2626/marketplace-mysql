'use client'

/**
 * ChatWidget — the floating WhatsApp-style live chat (Task 8-b).
 *
 * Public, token-gated conversation against /api/chat/widget:
 *   closed → picker (choose a store / general inquiry) → name capture → thread
 *   returning visitor with a stored conversation (localStorage `vendora-chat`)
 *   → straight into the thread.
 *
 * Polls every 4s while the panel is open; a slow 20s heartbeat while closed
 * feeds the gold unread badge + a subtle flash ring on the launcher.
 * Auto-replies come from the seeded chatbot ("Vendora Assistant", 🤖).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Loader2,
  MessageCircle,
  MoreVertical,
  RotateCcw,
  Send,
  Sun,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'

// ── types (local — the widget owns its contracts) ──────────────────────────
type ChatMsg = {
  id: string
  senderRole: 'VISITOR' | 'STAFF' | 'SYSTEM' | 'BOT'
  senderName?: string | null
  body: string
  createdAt: string
  pending?: boolean
}

type StoreOption = { id: string; storeName: string }

type Stored = {
  cid?: string
  token?: string
  name?: string
  phone?: string
  sellerId?: string
  sellerStoreName?: string
  lastTs?: string // newest message createdAt the visitor has already fetched
  unread?: number // launcher badge — survives reloads / HMR remounts
}

type GetResponse = {
  conversation: { id: string; status: string; subject?: string | null; sellerStoreName?: string | null }
  messages: ChatMsg[]
}

type PostResponse = { conversationId: string; token: string; sellerStoreName?: string | null; messages: ChatMsg[] }

const STORAGE_KEY = 'vendora-chat'

// ── tiny presentational helpers ────────────────────────────────────────────
function TypingDots() {
  return (
    <span className="flex items-center gap-1 px-1 py-1.5" aria-label="Loading" role="status">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  )
}

function initialsOf(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  )
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

/** One message bubble — dir="auto" so Arabic renders RTL correctly. */
function Bubble({ m }: { m: ChatMsg }) {
  if (m.senderRole === 'SYSTEM') {
    return (
      <div
        dir="auto"
        className="mx-auto w-fit max-w-[85%] rounded-full bg-stone-200/70 px-3 py-1 text-center text-[11px] text-stone-500"
      >
        {m.body}
      </div>
    )
  }

  const isVisitor = m.senderRole === 'VISITOR'
  const isBot = m.senderRole === 'BOT'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.16 }}
      className={`flex ${isVisitor ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[82%] px-3 py-2 shadow-sm ${
          isVisitor
            ? 'rounded-2xl rounded-br-md bg-emerald-700 text-white'
            : isBot
              ? 'rounded-2xl rounded-bl-md border border-stone-200 bg-white text-stone-800'
              : 'rounded-2xl rounded-bl-md bg-bh-navy text-white'
        }`}
      >
        {!isVisitor && (
          <p dir="auto" className="mb-0.5 text-[10px] font-semibold">
            {isBot ? (
              <span className="text-emerald-700">🤖 {m.senderName || 'Vendora Assistant'}</span>
            ) : (
              <span className="text-bh-gold-light">{m.senderName || 'Vendora Team'}</span>
            )}
          </p>
        )}
        <p dir="auto" className="whitespace-pre-wrap break-words text-sm leading-relaxed">
          {m.body}
        </p>
        <p
          className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${
            isVisitor ? 'text-emerald-100/80' : 'text-stone-400'
          }`}
        >
          <span suppressHydrationWarning>{fmtTime(m.createdAt)}</span>
          {isVisitor &&
            (m.pending ? (
              <Clock3 size={11} aria-label="Sending" />
            ) : (
              <CheckCheck size={12} className="text-emerald-200" aria-label="Delivered" />
            ))}
        </p>
      </div>
    </motion.div>
  )
}

function StoreRow({
  avatar,
  title,
  hint,
  onClick,
}: {
  avatar: React.ReactNode
  title: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
    >
      {avatar}
      <span className="min-w-0 flex-1">
        <span dir="auto" className="block truncate text-sm font-medium text-stone-800">
          {title}
        </span>
        <span className="block text-[11px] text-stone-400">{hint}</span>
      </span>
      <ChevronRight size={14} className="shrink-0 text-stone-300" aria-hidden />
    </button>
  )
}

// ── the widget ─────────────────────────────────────────────────────────────
export function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'picker' | 'details' | 'thread'>('picker')
  const [stores, setStores] = useState<StoreOption[] | null>(null)
  const [storesError, setStoresError] = useState(false)
  const [stored, setStored] = useState<Stored | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [loadingThread, setLoadingThread] = useState(false)
  const [unread, setUnread] = useState(0)
  const [flashSeq, setFlashSeq] = useState(0)
  const [pulse, setPulse] = useState(true)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [selectedSeller, setSelectedSeller] = useState<{ id: string | null; storeName: string } | null>(null)
  const [convoStatus, setConvoStatus] = useState<string | null>(null)
  const [storeLabel, setStoreLabel] = useState<string | null>(null)

  const openRef = useRef(false)
  const storedRef = useRef<Stored | null>(null)
  const messagesRef = useRef<ChatMsg[]>([])
  const lastTsRef = useRef('')
  const unreadRef = useRef(0)
  const listRef = useRef<HTMLDivElement | null>(null)
  const nearBottomRef = useRef(true)
  const taRef = useRef<HTMLTextAreaElement | null>(null)
  const nameInputRef = useRef<HTMLInputElement | null>(null)

  // hydrate the persisted conversation + stop the first-paint pulse after a while
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const s = JSON.parse(raw) as Stored
        if (s && typeof s === 'object') {
          setStored(s)
          storedRef.current = s
          if (s.name) setName(s.name)
          if (s.phone) setPhone(s.phone)
          // resume the badge + the delta cursor so a remount never re-counts
          // messages the visitor has already fetched
          lastTsRef.current = s.lastTs || ''
          unreadRef.current = Math.max(0, s.unread || 0)
          setUnread(unreadRef.current)
        }
      }
    } catch {
      /* corrupted payload — start fresh */
    }
    setHydrated(true)
    const t = setTimeout(() => setPulse(false), 7000)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    openRef.current = open
  }, [open])

  /** single writer for messages so refs never drift from state */
  const commit = useCallback((next: ChatMsg[]) => {
    messagesRef.current = next
    setMessages(next)
  }, [])

  /** merge a patch into the persisted conversation (localStorage + state). */
  const persistStored = useCallback((patch: Partial<Stored>) => {
    const next: Stored = { ...(storedRef.current ?? {}), ...patch }
    storedRef.current = next
    setStored(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* storage unavailable */
    }
  }, [])

  const resetConvo = useCallback(() => {
    const next: Stored = { name: storedRef.current?.name, phone: storedRef.current?.phone }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* storage unavailable */
    }
    storedRef.current = next
    setStored(next)
    commit([])
    lastTsRef.current = ''
    unreadRef.current = 0
    setUnread(0)
    setSelectedSeller(null)
    setConvoStatus(null)
    setStoreLabel(null)
    setSendError(null)
    setStep('picker')
  }, [commit])

  const loadStores = useCallback(async () => {
    try {
      const r = await fetch('/api/chat/widget/stores')
      if (!r.ok) throw new Error('failed')
      const d = (await r.json()) as { stores?: StoreOption[] }
      setStores(d.stores ?? [])
      setStoresError(false)
    } catch {
      setStoresError(true)
    }
  }, [])

  const loadThread = useCallback(
    async (cid: string, token: string) => {
      setLoadingThread(true)
      try {
        const r = await fetch(`/api/chat/widget?cid=${encodeURIComponent(cid)}&token=${encodeURIComponent(token)}`)
        if (r.status === 404) {
          resetConvo() // conversation vanished (DB reset) → start over
          return
        }
        if (!r.ok) throw new Error('failed')
        const d = (await r.json()) as GetResponse
        commit(d.messages ?? [])
        lastTsRef.current = d.messages?.length ? d.messages[d.messages.length - 1].createdAt : ''
        setConvoStatus(d.conversation?.status ?? null)
        setStoreLabel(d.conversation?.sellerStoreName || storedRef.current?.sellerStoreName || null)
        // opening the thread = seeing everything → clear the badge, advance the cursor
        unreadRef.current = 0
        setUnread(0)
        persistStored({ lastTs: lastTsRef.current, unread: 0 })
      } catch {
        /* transient — the 4s poller will retry */
      } finally {
        setLoadingThread(false)
      }
    },
    [commit, persistStored, resetConvo],
  )

  /** GET the delta since the last known message; badge new staff/bot replies when closed. */
  const poll = useCallback(async () => {
    const s = storedRef.current
    if (!s?.cid || !s?.token) return
    const qs = new URLSearchParams({ cid: s.cid, token: s.token })
    if (lastTsRef.current) qs.set('after', lastTsRef.current)
    try {
      const r = await fetch(`/api/chat/widget?${qs.toString()}`)
      if (r.status === 404) {
        resetConvo()
        return
      }
      if (!r.ok) return
      const d = (await r.json()) as GetResponse
      setConvoStatus(d.conversation?.status ?? null)
      if (d.conversation?.sellerStoreName) setStoreLabel(d.conversation.sellerStoreName)
      const fresh = (d.messages ?? []).filter((m) => !messagesRef.current.some((x) => x.id === m.id))
      if (!fresh.length) return
      commit([...messagesRef.current, ...fresh])
      lastTsRef.current = fresh[fresh.length - 1].createdAt
      if (!openRef.current) {
        const notable = fresh.filter((m) => m.senderRole === 'STAFF' || m.senderRole === 'BOT').length
        if (notable > 0) {
          unreadRef.current += notable
          setUnread(unreadRef.current)
          setFlashSeq((f) => f + 1) // retrigger the launcher flash ring
          persistStored({ lastTs: lastTsRef.current, unread: unreadRef.current })
          return
        }
      }
      // seen (panel open) or nothing notable — just advance the cursor
      persistStored({ lastTs: lastTsRef.current })
    } catch {
      /* offline — the next tick retries */
    }
  }, [commit, persistStored, resetConvo])

  // fast poll while the thread is open …
  useEffect(() => {
    if (!hydrated || !open || step !== 'thread' || !stored?.cid) return
    const id = setInterval(() => void poll(), 4000)
    return () => clearInterval(id)
  }, [hydrated, open, step, stored?.cid, poll])

  // … and a slow heartbeat while closed so the unread badge + flash can fire
  useEffect(() => {
    if (!hydrated || open || !stored?.cid) return
    const id = setInterval(() => void poll(), 20000)
    return () => clearInterval(id)
  }, [hydrated, open, stored?.cid, poll])

  // Esc closes the panel
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // keep the thread pinned to the newest message (unless the user scrolled up)
  useEffect(() => {
    if (step !== 'thread') return
    const el = listRef.current
    if (!el) return
    if (nearBottomRef.current) el.scrollTo({ top: el.scrollHeight, behavior: loadingThread ? 'auto' : 'smooth' })
  }, [messages, loadingThread, step, open])

  // focus the active input (skip the mobile keyboard popup in the thread)
  useEffect(() => {
    if (!open) return
    if (step === 'details') {
      const t = setTimeout(() => nameInputRef.current?.focus(), 150)
      return () => clearTimeout(t)
    }
    if (step === 'thread' && window.matchMedia('(min-width: 640px)').matches) {
      const t = setTimeout(() => taRef.current?.focus(), 200)
      return () => clearTimeout(t)
    }
  }, [open, step])

  const toggle = () => {
    const next = !open
    setOpen(next)
    openRef.current = next
    if (next) {
      unreadRef.current = 0
      setUnread(0)
      if (storedRef.current?.cid) persistStored({ unread: 0 })
      setPulse(false)
      const s = storedRef.current
      if (s?.cid && s?.token) {
        setStep('thread') // returning visitor → straight into the thread
        void loadThread(s.cid, s.token)
      } else {
        setStep('picker')
        if (stores === null && !storesError) void loadStores()
      }
    }
  }

  const chooseStore = (opt: { id: string | null; storeName: string }) => {
    setSelectedSeller(opt)
    setStoreLabel(opt.id ? opt.storeName : null)
    if (name.trim()) setStep('thread') // known visitor skips name capture
    else setStep('details')
  }

  const startChat = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const next: Stored = { ...(storedRef.current ?? {}), name: trimmed, phone: phone.trim() || undefined }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* storage unavailable */
    }
    storedRef.current = next
    setStored(next)
    setStep('thread')
  }

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    const s = storedRef.current
    setInput('')
    setSendError(null)
    setSending(true)
    if (taRef.current) taRef.current.style.height = 'auto'

    // optimistic visitor bubble
    const optimistic: ChatMsg = {
      id: `pending-${Date.now()}`,
      senderRole: 'VISITOR',
      body: text,
      createdAt: new Date().toISOString(),
      pending: true,
    }
    commit([...messagesRef.current, optimistic])
    nearBottomRef.current = true

    try {
      const r = await fetch('/api/chat/widget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || s?.name || undefined,
          phone: phone.trim() || s?.phone || undefined,
          sellerId: selectedSeller?.id ?? s?.sellerId ?? undefined,
          subject: selectedSeller ? `Inquiry — ${selectedSeller.storeName}` : undefined,
          message: text,
          cid: s?.cid,
          token: s?.token,
        }),
      })
      const d = (await r.json().catch(() => null)) as (PostResponse & { error?: string }) | null
      if (!r.ok || !d?.conversationId || !d?.token) throw new Error(d?.error || 'Failed to send')

      const base = messagesRef.current.filter((m) => m.id !== optimistic.id)
      const incoming = (d.messages ?? []).filter((m) => !base.some((x) => x.id === m.id))
      commit([...base, ...incoming])
      if (incoming.length) lastTsRef.current = incoming[incoming.length - 1].createdAt

      persistStored({
        cid: d.conversationId,
        token: d.token,
        name: name.trim() || s?.name,
        phone: phone.trim() || s?.phone,
        sellerId: selectedSeller?.id ?? s?.sellerId,
        sellerStoreName: d.sellerStoreName ?? s?.sellerStoreName,
        lastTs: lastTsRef.current,
        unread: 0, // the visitor sees these messages immediately
      })
      if (d.sellerStoreName) setStoreLabel(d.sellerStoreName)
      setConvoStatus('OPEN')
    } catch (e) {
      commit(messagesRef.current.filter((m) => m.id !== optimistic.id))
      setInput(text) // let them retry without retyping
      setSendError(e instanceof Error && e.message ? e.message : "Couldn't send — please try again.")
    } finally {
      setSending(false)
    }
  }

  const onComposerKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  const autosize = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`
  }

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <>
      {/* slim custom scrollbar for the thread / store list (plain <style> so it
          is emitted during SSR too — styled-jsx is not SSR-injected in the
          App Router) */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .vcw-scroll { scrollbar-width: thin; scrollbar-color: rgba(120,113,108,.35) transparent; }
        .vcw-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .vcw-scroll::-webkit-scrollbar-track { background: transparent; }
        .vcw-scroll::-webkit-scrollbar-thumb { background: rgba(120,113,108,.35); border-radius: 9999px; }
        .vcw-scroll::-webkit-scrollbar-thumb:hover { background: rgba(120,113,108,.55); }
      `,
        }}
      />

      {/* ── LAUNCHER — stacks above BackToTop (bottom-6/right-4 on sm+,
             bottom-20/right-4 on mobile) without ever overlapping it ── */}
      <div className="fixed bottom-5 right-4 z-40 sm:bottom-20">
        <motion.button
          type="button"
          onClick={toggle}
          whileHover={{ scale: 1.07 }}
          whileTap={{ scale: 0.92 }}
          aria-label="Chat with us — تحدث معنا"
          aria-expanded={open}
          aria-haspopup="dialog"
          className="relative grid h-14 w-14 place-items-center rounded-full bg-emerald-600 text-white shadow-xl shadow-emerald-900/25 transition-colors hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2"
        >
          {pulse && (
            <span aria-hidden className="absolute inset-0 z-0 animate-ping rounded-full bg-emerald-500 opacity-30" />
          )}
          {flashSeq > 0 && (
            <motion.span
              key={flashSeq}
              aria-hidden
              initial={{ opacity: 0.8, scale: 1 }}
              animate={{ opacity: 0, scale: 1.9 }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
              className="pointer-events-none absolute inset-0 z-0 rounded-full bg-bh-gold"
            />
          )}
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={open ? 'close' : 'chat'}
              initial={{ rotate: -60, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 60, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="relative z-10 grid place-items-center"
            >
              {open ? <X size={24} /> : <MessageCircle size={26} />}
            </motion.span>
          </AnimatePresence>
          {unread > 0 && !open && (
            <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-bh-gold px-1 text-[11px] font-bold text-bh-navy-deep shadow">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </motion.button>
      </div>

      {/* ── PANEL ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Vendora support chat"
            initial={{ opacity: 0, y: 28, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 28, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="fixed bottom-[5.25rem] left-3 right-3 z-[45] flex max-h-[70dvh] flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl sm:bottom-36 sm:left-auto sm:right-4 sm:w-[380px]"
          >
            {/* header — bh-navy gradient */}
            <header className="flex shrink-0 items-center gap-3 bg-gradient-to-b from-bh-navy to-bh-navy-deep px-4 py-3 text-white">
              <div className="relative shrink-0">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-bh-gold to-bh-gold-light text-bh-navy-deep">
                  <Sun size={19} strokeWidth={2.2} aria-hidden />
                </div>
                <span
                  aria-hidden
                  title="Online"
                  className="absolute -bottom-0.5 -right-0.5 h-3 w-3 animate-pulse rounded-full bg-emerald-400 ring-2 ring-bh-navy"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-tight">Vendora Support</p>
                <p className="truncate text-[11px] text-white/70" dir="auto">
                  Typically replies in minutes · نردّ سريعاً
                </p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Chat options"
                    className="grid h-8 w-8 place-items-center rounded-full text-white/75 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                  >
                    <MoreVertical size={16} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={resetConvo} className="gap-2 text-xs">
                    <RotateCcw size={13} />
                    Start a new conversation
                    <span className="ms-auto text-[10px] text-stone-400">محادثة جديدة</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                className="grid h-8 w-8 place-items-center rounded-full text-white/75 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <X size={17} />
              </button>
            </header>

            {/* ── STEP: store picker ── */}
            {step === 'picker' && (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="px-4 pt-4">
                  <div className="rounded-2xl rounded-bl-md border border-stone-200 bg-white p-3 shadow-sm">
                    <p dir="auto" className="text-sm leading-relaxed text-stone-700">
                      <span className="font-semibold text-bh-navy">أهلاً وسهلاً بك في فيندورا 🌞</span>
                      <br />
                      Welcome to Vendora! Pick a store to chat with — or send us a general inquiry.
                    </p>
                  </div>
                </div>
                <p className="flex items-center justify-between px-5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                  <span>Choose a store</span>
                  <span dir="rtl">اختر متجراً</span>
                </p>
                <div className="vcw-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                  <StoreRow
                    avatar={
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-bh-gold-pale text-bh-navy">
                        <Sun size={16} aria-hidden />
                      </span>
                    }
                    title="General inquiry"
                    hint="Orders, delivery, financing & more"
                    onClick={() => chooseStore({ id: null, storeName: 'Vendora Support' })}
                  />
                  <div className="mx-3 my-1 border-t border-stone-100" />
                  {stores === null && !storesError && (
                    <div className="flex justify-center py-6">
                      <TypingDots />
                    </div>
                  )}
                  {storesError && (
                    <div className="px-3 py-4 text-center">
                      <p className="text-xs text-stone-500">Couldn&apos;t load stores.</p>
                      <Button variant="outline" size="sm" className="mt-2 h-8 text-xs" onClick={() => void loadStores()}>
                        Try again
                      </Button>
                    </div>
                  )}
                  {stores?.map((s) => (
                    <StoreRow
                      key={s.id}
                      avatar={
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-stone-100 text-[11px] font-bold text-bh-navy">
                          {initialsOf(s.storeName)}
                        </span>
                      }
                      title={s.storeName}
                      hint="Chat about solar products"
                      onClick={() => chooseStore({ id: s.id, storeName: s.storeName })}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── STEP: name capture ── */}
            {step === 'details' && (
              <div className="vcw-scroll flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4 pt-3">
                <button
                  type="button"
                  onClick={() => setStep('picker')}
                  className="inline-flex items-center gap-1 self-start rounded-lg px-2 py-1 text-xs font-medium text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-300"
                >
                  <ChevronLeft size={14} /> Back
                </button>
                <div className="mt-2 rounded-2xl rounded-bl-md border border-stone-200 bg-white p-3 shadow-sm">
                  <p dir="auto" className="text-sm leading-relaxed text-stone-700">
                    👋 What should we call you?
                    <span className="mt-0.5 block text-xs text-stone-400">بماذا نناديك؟</span>
                  </p>
                </div>
                <label className="mt-4 block">
                  <span className="mb-1 block text-xs font-medium text-stone-600">Name · الاسم</span>
                  <Input
                    ref={nameInputRef}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        startChat()
                      }
                    }}
                    placeholder="e.g. Ahmed"
                    maxLength={80}
                    dir="auto"
                    autoComplete="name"
                  />
                </label>
                <label className="mt-3 block">
                  <span className="mb-1 block text-xs font-medium text-stone-600">
                    WhatsApp number · optional
                  </span>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+967 7XX XXX XXX"
                    maxLength={24}
                    dir="ltr"
                    inputMode="tel"
                    autoComplete="tel"
                    type="tel"
                  />
                </label>
                <Button
                  type="button"
                  onClick={startChat}
                  disabled={!name.trim()}
                  className="mt-5 w-full bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  Start chatting · ابدأ المحادثة
                </Button>
              </div>
            )}

            {/* ── STEP: thread ── */}
            {step === 'thread' && (
              <div className="flex min-h-0 flex-1 flex-col">
                <div
                  ref={listRef}
                  onScroll={(e) => {
                    const el = e.currentTarget
                    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90
                  }}
                  aria-live="polite"
                  aria-label="Chat messages"
                  className="vcw-scroll min-h-0 flex-1 space-y-2.5 overflow-y-auto bg-stone-50 px-3 py-4"
                >
                  {storeLabel && (
                    <div
                      dir="auto"
                      className="mx-auto w-fit rounded-full bg-bh-gold-pale px-3 py-1 text-[11px] font-medium text-bh-navy"
                    >
                      Chatting with {storeLabel}
                    </div>
                  )}
                  {convoStatus === 'CLOSED' && (
                    <div className="mx-auto w-fit max-w-[90%] rounded-lg bg-amber-50 px-3 py-1.5 text-center text-[11px] text-amber-700 ring-1 ring-amber-200">
                      This chat was closed — send a message to reopen it.
                    </div>
                  )}

                  {loadingThread ? (
                    <div className="flex justify-start">
                      <div className="rounded-2xl rounded-bl-md border border-stone-200 bg-white px-3 py-2 shadow-sm">
                        <TypingDots />
                      </div>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex justify-start">
                      <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-stone-200 bg-white px-3 py-2 shadow-sm">
                        <p className="mb-0.5 text-[10px] font-semibold text-emerald-700">🤖 Vendora Assistant</p>
                        <p dir="auto" className="text-sm leading-relaxed text-stone-700">
                          You&apos;re chatting with {storeLabel ?? 'Vendora Support'} — send a message and we&apos;ll
                          get back to you right away.
                          <span className="mt-1 block text-xs text-stone-400">
                            أرسل رسالتك وسنرد عليك بأسرع وقت 🌞
                          </span>
                        </p>
                      </div>
                    </div>
                  ) : (
                    messages.map((m) => <Bubble key={m.id} m={m} />)
                  )}
                </div>

                {sendError && (
                  <p role="alert" className="px-4 pt-2 text-xs text-red-600">
                    {sendError}
                  </p>
                )}

                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    void send()
                  }}
                  className="flex shrink-0 items-end gap-2 border-t border-stone-200 bg-white p-3"
                >
                  <textarea
                    ref={taRef}
                    rows={1}
                    dir="auto"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onInput={autosize}
                    onKeyDown={onComposerKey}
                    disabled={sending}
                    placeholder="Type a message… اكتب رسالتك"
                    aria-label="Message"
                    maxLength={2000}
                    className="vcw-scroll min-h-[2.5rem] max-h-28 flex-1 resize-none rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={sending || !input.trim()}
                    aria-label="Send message"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-600 text-white shadow transition hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
                  </button>
                </form>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
