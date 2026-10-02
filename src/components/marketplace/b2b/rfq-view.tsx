'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  BadgeCheck,
  CalendarClock,
  Check,
  ChevronRight,
  Clock,
  FileDown,
  FileText,
  Handshake,
  Hourglass,
  Info,
  Loader2,
  MapPin,
  MessageSquareText,
  PackageSearch,
  Plus,
  Printer,
  Repeat,
  Send,
  ShieldCheck,
  ShoppingCart,
  Star,
  Store,
  Timer,
  TrendingDown,
  Trash2,
  X,
  XCircle,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'
import { useApi } from '@/hooks/use-api'
import type { ApprovalRequestDTO, OrganizationDTO, QuoteDTO, RfqDTO } from '@/lib/types'
import { formatDate, formatUSD, timeAgo } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  apiRequest,
  clearRfqPrefill,
  defaultActiveOrg,
  EmptyState,
  ProductPicker,
  QUOTE_STATUS_MAP,
  readRfqPrefill,
  rememberActiveOrg,
  RFQ_STATUS_MAP,
  RfqThread,
  StatusBadge,
  validityLeft,
  type PickedProduct,
} from './b2b-shared'
import { RecurringField, RecurringSchedulesCard, type RecurringPublicConfig } from './recurring'

type Mode = { type: 'list' } | { type: 'detail'; id: string } | { type: 'create' }

// ── Draft line model (create form) ─────────────────────────────────────────

interface DraftLine {
  key: number
  kind: 'catalog' | 'open'
  product: PickedProduct | null
  variantId: string | null
  productName: string
  quantity: string
  targetPrice: string
  notes: string
}

let lineKeySeq = 1
const newDraftLine = (): DraftLine => ({
  key: lineKeySeq++,
  kind: 'catalog',
  product: null,
  variantId: null,
  productName: '',
  quantity: '1',
  targetPrice: '',
  notes: '',
})

// ── Component ───────────────────────────────────────────────────────────────

export function RfqView() {
  const user = useMarketplace((s) => s.user)
  const openAuth = useMarketplace((s) => s.openAuth)
  const navigate = useMarketplace((s) => s.navigate)
  const viewParams = useMarketplace((s) => s.params)

  const [mode, setMode] = useState<Mode>({ type: 'list' })
  const [listVersion, setListVersion] = useState(0) // bump to refetch the list after mutations

  // List data
  const {
    data: listData,
    loading: listLoading,
    refetch: refetchList,
  } = useApi<{ rfqs: RfqDTO[] }>(user ? '/api/rfqs' : null, { skip: !user })

  useEffect(() => {
    if (listVersion > 0) void refetchList()
  }, [listVersion, refetchList])

  // Deep link: / with params.rfqId (notification bell, handoffs) opens the
  // detail directly. Consumed once — navigating back shows the list.
  // SELLERS are redirected to their console's RFQ inbox detail instead — the
  // buyer detail page (cancel action, owner copy) is never the right surface
  // for a seller who followed an "open request" or quote notification.
  const deepLinkConsumed = useRef<string | null>(null)
  useEffect(() => {
    const target = viewParams.rfqId
    if (!user || !target || deepLinkConsumed.current === target) return
    deepLinkConsumed.current = target
    if (user.role === 'SELLER') {
      navigate('seller', { sellerTab: 'rfqs', rfqId: target })
      return
    }
    setMode({ type: 'detail', id: target })
    navigate('rfqs', {})
  }, [user, viewParams.rfqId, navigate])

  const rfqs = useMemo(() => listData?.rfqs ?? [], [listData])

  // ── Create-form state (kept at top level so the prefill can seed it) ──
  const [formTitle, setFormTitle] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([newDraftLine()])
  const [orgId, setOrgId] = useState<string>('')
  const orgsFetched = useRef(false)

  const { data: orgData } = useApi<{ organizations: OrganizationDTO[] }>(
    user && !orgsFetched.current ? '/api/organizations' : null,
    { skip: !user }
  )
  useEffect(() => {
    if (orgData) {
      orgsFetched.current = true
      const active = defaultActiveOrg(orgData.organizations)
      if (active) {
        setOrgId((current) => current || active.id)
      }
    }
  }, [orgData])

  // Product-page handoff: preload a line when arriving via "Request a Quote"
  const prefillApplied = useRef(false)
  useEffect(() => {
    if (!user || prefillApplied.current) return
    const prefill = readRfqPrefill()
    if (!prefill) return
    prefillApplied.current = true
    clearRfqPrefill()
    setLines([
      {
        key: lineKeySeq++,
        kind: 'catalog',
        product: { id: prefill.productId, title: prefill.title, price: prefill.price, image: null },
        variantId: null,
        productName: '',
        quantity: '1',
        targetPrice: '',
        notes: '',
      },
    ])
    setMode({ type: 'create' })
    toast({
      title: 'Line added to a new RFQ',
      description: `${prefill.title} — set your quantity and target price.`,
    })
  }, [user])

  // ── Signed-out gate ──
  if (!user) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <FileText size={44} className="text-muted-foreground/40" />
        <h1 className="mt-4 text-xl font-bold">Sign in to manage your RFQs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Request bulk pricing, negotiate and accept quotes.
        </p>
        <Button className="mt-6 rounded-xl" onClick={() => openAuth('login', { view: 'rfqs' })}>
          Sign in
        </Button>
      </div>
    )
  }

  return (
    <>
      {mode.type === 'list' && (
        <RfqListView
          rfqs={rfqs}
          loading={listLoading}
          onOpen={(id) => setMode({ type: 'detail', id })}
          onCreate={() => setMode({ type: 'create' })}
          focusScheduleId={viewParams.scheduleId ?? null}
        />
      )}

      {mode.type === 'detail' && (
        <RfqDetailView
          id={mode.id}
          onBack={() => {
            setMode({ type: 'list' })
            setListVersion((v) => v + 1)
          }}
          onChanged={() => setListVersion((v) => v + 1)}
        />
      )}

      {mode.type === 'create' && (
        <RfqCreateView
          title={formTitle}
          setTitle={setFormTitle}
          description={formDescription}
          setDescription={setFormDescription}
          lines={lines}
          setLines={setLines}
          orgs={orgData?.organizations ?? []}
          orgId={orgId}
          setOrgId={(id) => {
            setOrgId(id)
            if (id) rememberActiveOrg(id)
          }}
          onDone={(id) => {
            setMode({ type: 'detail', id })
            setListVersion((v) => v + 1)
          }}
          onCancel={() => setMode({ type: 'list' })}
          navigate={navigate}
        />
      )}
    </>
  )
}

// ── List ────────────────────────────────────────────────────────────────────

const RFQ_STATUS_ORDER = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'QUOTED',
  'ACCEPTED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
]

/** Deadline chip: “Expires in 3d” / “Last day” / nothing when open-ended. */
function ExpiryChip({ expiresAt }: { expiresAt?: string | null }) {
  if (!expiresAt) return null
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return null
  const days = Math.ceil(ms / 86_400_000)
  const urgent = days <= 2
  return (
    <span
      className={
        'flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ' +
        (urgent
          ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
          : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400')
      }
      title={new Date(expiresAt).toLocaleDateString()}
    >
      <Timer size={11} />
      {days <= 1 ? 'Last day' : `${days}d left`}
    </span>
  )
}

function RfqListView({
  rfqs,
  loading,
  onOpen,
  onCreate,
  focusScheduleId,
}: {
  rfqs: RfqDTO[]
  loading: boolean
  onOpen: (id: string) => void
  onCreate: () => void
  focusScheduleId?: string | null
}) {
  const [statusFilter, setStatusFilter] = useState('ALL')

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of rfqs) counts.set(r.status, (counts.get(r.status) ?? 0) + 1)
    return RFQ_STATUS_ORDER.filter((s) => counts.has(s)).map((s) => ({ status: s, count: counts.get(s)! }))
  }, [rfqs])

  const filtered = useMemo(
    () => (statusFilter === 'ALL' ? rfqs : rfqs.filter((r) => r.status === statusFilter)),
    [rfqs, statusFilter]
  )

  // Header stats — a calm scannable strip over the buyer's pipeline.
  const stats = useMemo(() => {
    const awaiting = rfqs.filter((r) => r.status === 'SUBMITTED' || r.status === 'UNDER_REVIEW').length
    const withQuotes = rfqs.filter((r) => r.status === 'QUOTED').length
    const accepted = rfqs.filter((r) => r.status === 'ACCEPTED').length
    return [
      { label: 'Total requests', value: rfqs.length, cls: 'text-foreground' },
      { label: 'Awaiting quotes', value: awaiting, cls: 'text-amber-600 dark:text-amber-400' },
      { label: 'Quotes to review', value: withQuotes, cls: 'text-primary' },
      { label: 'Accepted', value: accepted, cls: 'text-emerald-600 dark:text-emerald-400' },
    ]
  }, [rfqs])

  const totalUnits = useMemo(
    () => rfqs.reduce((s, r) => s + (r.totalQuantity ?? r.lines.reduce((q, l) => q + l.quantity, 0)), 0),
    [rfqs]
  )

  return (
    <div className="mx-auto w-full max-w-5xl">
      {/* ── Page header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <FileText size={22} />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Requests for quote</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Bulk pricing, negotiated on your terms — NET terms and quantity breaks included.
            </p>
          </div>
        </div>
        <Button className="rounded-xl" onClick={onCreate}>
          <Plus size={15} className="mr-1.5" /> New RFQ
        </Button>
      </div>

      {/* ── Pipeline stats ── */}
      {loading ? (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[68px] rounded-xl" />
          ))}
        </div>
      ) : rfqs.length > 0 ? (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl border bg-card px-3.5 py-3 shadow-sm">
              <p className="truncate text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                {s.label}
              </p>
              <p className={cn('mt-0.5 text-xl font-bold tabular-nums leading-7', s.cls)}>{s.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-6 space-y-5">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-44 w-full rounded-2xl" />)
        ) : rfqs.length === 0 ? (
          <Card className="flex flex-col items-center border-dashed py-16 text-center">
            <Handshake size={44} className="text-muted-foreground/40" />
            <h2 className="mt-4 text-lg font-semibold">No RFQs yet</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Send one multi-line request for quote instead of many carts: pick products or describe
              open items, set target prices, and let sellers compete with offers you can accept in a
              click.
            </p>
            <Button className="mt-6 rounded-full" onClick={onCreate}>
              <FileText size={15} className="mr-1.5" /> Create your first RFQ
            </Button>
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="flex flex-col items-center border-dashed py-14 text-center">
            <Info size={40} className="text-muted-foreground/40" />
            <h2 className="mt-4 text-lg font-semibold">No {statusFilter.toLowerCase().replace('_', ' ')} RFQs</h2>
            <p className="mt-1 text-sm text-muted-foreground">Try another status filter.</p>
            <Button variant="outline" className="mt-5 rounded-full" onClick={() => setStatusFilter('ALL')}>
              <X size={14} className="mr-1.5" /> Show all
            </Button>
          </Card>
        ) : (
          <>
            {statusCounts.length > 1 && (
              <div
                className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                role="tablist"
                aria-label="Filter RFQs by status"
              >
                <button
                  role="tab"
                  aria-selected={statusFilter === 'ALL'}
                  onClick={() => setStatusFilter('ALL')}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                    statusFilter === 'ALL'
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
                  )}
                >
                  All
                  <span
                    className={cn(
                      'rounded-full px-1.5 text-[10px] font-bold tabular-nums',
                      statusFilter === 'ALL' ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {rfqs.length}
                  </span>
                </button>
                {statusCounts.map(({ status, count }) => (
                  <button
                    key={status}
                    role="tab"
                    aria-selected={statusFilter === status}
                    onClick={() => setStatusFilter(statusFilter === status ? 'ALL' : status)}
                    className={cn(
                      'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                      statusFilter === status
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
                    )}
                  >
                    {RFQ_STATUS_MAP[status]?.label ?? status}
                    <span
                      className={cn(
                        'rounded-full px-1.5 text-[10px] font-bold tabular-nums',
                        statusFilter === status ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {count}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-4">
              {filtered.map((rfq, i) => {
                const lineCount = rfq.lineCount ?? rfq.lines.length
                const units = rfq.totalQuantity ?? rfq.lines.reduce((s, l) => s + l.quantity, 0)
                return (
                  <motion.div
                    key={rfq.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.2) }}
                  >
                    <Card
                      role="button"
                      tabIndex={0}
                      aria-label={`Open RFQ ${rfq.number}`}
                      className="cursor-pointer overflow-hidden transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                      onClick={() => onOpen(rfq.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onOpen(rfq.id)
                        }
                      }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b bg-muted/40 px-5 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <span className="rounded-md bg-background px-1.5 py-0.5 font-mono text-[11px] font-bold tracking-wide text-muted-foreground ring-1 ring-border/70">
                            {rfq.number}
                          </span>
                          <span className="text-[11px] text-muted-foreground">{timeAgo(rfq.createdAt)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {(rfq.quoteCount ?? 0) > 0 && (
                            <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                              <MessageSquareText size={11} />
                              {rfq.quoteCount} quote{(rfq.quoteCount ?? 0) === 1 ? '' : 's'}
                            </span>
                          )}
                          <ExpiryChip expiresAt={rfq.expiresAt} />
                          <StatusBadge status={rfq.status} map={RFQ_STATUS_MAP} />
                        </div>
                      </div>
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold leading-snug">
                              {rfq.title?.trim() || rfq.lines[0]?.product?.title || rfq.lines[0]?.productName || 'Untitled request'}
                            </p>
                            {rfq.description && (
                              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{rfq.description}</p>
                            )}
                            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <PackageSearch size={12} className="text-muted-foreground/70" />
                                <span className="font-semibold text-foreground">{lineCount}</span> line{lineCount === 1 ? '' : 's'}
                              </span>
                              <span className="text-border">·</span>
                              <span>
                                <span className="font-semibold text-foreground">{units.toLocaleString()}</span> units
                              </span>
                              {rfq.organizationName && (
                                <>
                                  <span className="text-border">·</span>
                                  <span className="max-w-[160px] truncate">{rfq.organizationName}</span>
                                </>
                              )}
                            </div>
                            {/* Thumbnails — under the text on mobile */}
                            {rfq.lines.length > 0 && (
                              <div className="mt-3.5 flex items-center gap-2 sm:hidden">
                                {rfq.lines.slice(0, 4).map((l) => (
                                  <span
                                    key={l.id}
                                    title={`${l.productName} × ${l.quantity}`}
                                    className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border bg-muted"
                                  >
                                    {l.product?.image ? (
                                      <img src={l.product.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                                    ) : (
                                      <PackageSearch size={14} className="text-muted-foreground" />
                                    )}
                                  </span>
                                ))}
                                {rfq.lines.length > 4 && (
                                  <span className="text-xs text-muted-foreground">+{rfq.lines.length - 4} more</span>
                                )}
                              </div>
                            )}
                          </div>
                          {/* Thumbnails — right rail on desktop */}
                          {rfq.lines.length > 0 && (
                            <div className="hidden shrink-0 items-center gap-2 sm:flex">
                              {rfq.lines.slice(0, 4).map((l) => (
                                <span
                                  key={l.id}
                                  title={`${l.productName} × ${l.quantity}`}
                                  className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border bg-muted"
                                >
                                  {l.product?.image ? (
                                    <img src={l.product.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                                  ) : (
                                    <PackageSearch size={15} className="text-muted-foreground" />
                                  )}
                                </span>
                              ))}
                              {rfq.lines.length > 4 && (
                                <span className="text-xs font-medium text-muted-foreground">+{rfq.lines.length - 4}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )
              })}
            </div>
          </>
        )}

        {/* ── Standing schedules — management surface below the primary list ── */}
        <RecurringSchedulesCard focusId={focusScheduleId} />

        {!loading && rfqs.length > 0 && (
          <p className="pb-1 pt-1 text-center text-[11px] text-muted-foreground">
            {rfqs.length} request{rfqs.length === 1 ? '' : 's'} · {totalUnits.toLocaleString()} units quoted across all RFQs
          </p>
        )}
      </div>
    </div>
  )
}

// ── Detail ──────────────────────────────────────────────────────────────────

function RfqDetailView({
  id,
  onBack,
  onChanged,
}: {
  id: string
  onBack: () => void
  onChanged: () => void
}) {
  const navigate = useMarketplace((s) => s.navigate)
  const { data, loading, refetch } = useApi<{ rfq: RfqDTO }>(`/api/rfqs/${id}`)
  const { data: approvalsData } = useApi<{ approvals: ApprovalRequestDTO[] }>('/api/approvals')
  const [acting, setActing] = useState<string | null>(null)
  const rfq = data?.rfq

  // Quote acceptances routed to org approvers (B2B approval workflow)
  const pendingApprovalQuoteIds = new Set(
    (approvalsData?.approvals ?? [])
      .filter((a) => a.type === 'QUOTE_ACCEPT' && a.status === 'PENDING')
      .map((a) => a.quote?.id)
      .filter((v): v is string => !!v)
  )

  const transition = async (action: 'SUBMIT' | 'CANCEL') => {
    if (!rfq) return
    setActing(action)
    const res = await apiRequest(`/api/rfqs/${rfq.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action }),
    })
    setActing(null)
    if (!res.ok) {
      toast({
        title: action === 'SUBMIT' ? 'Could not submit' : 'Could not cancel',
        description: res.error,
        variant: 'destructive',
      })
      return
    }
    toast({
      title: action === 'SUBMIT' ? 'RFQ submitted' : 'Request cancelled',
      description:
        action === 'SUBMIT'
          ? 'Sellers have been notified — quotes will land here.'
          : `${rfq.number} is closed. Draft new lines any time.`,
    })
    void refetch()
    onChanged()
  }

  const respondToQuote = async (quoteId: string, action: 'ACCEPT' | 'DECLINE') => {
    setActing(quoteId)
    const res = await apiRequest<{ quote: QuoteDTO; pendingApproval?: boolean }>(`/api/quotes/${quoteId}/${action.toLowerCase()}`, {
      method: 'POST',
    })
    setActing(null)
    if (!res.ok) {
      toast({ title: 'Action failed', description: res.error, variant: 'destructive' })
      return
    }
    if (res.data?.pendingApproval) {
      toast({
        title: 'Sent for approval 🕐',
        description: 'Your organization must approve this acceptance before the deal closes — track it in Business account.',
      })
      void refetch()
      onChanged()
      return
    }
    toast({
      title: action === 'ACCEPT' ? 'Quote accepted — deal closed!' : 'Quote declined',
      description:
        action === 'ACCEPT'
          ? 'The seller has been notified. Any other quotes on this RFQ were declined automatically.'
          : 'Let the seller know if you want a revised offer.',
    })
    void refetch()
    onChanged()
  }

  if (loading && !rfq) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-6 h-40 w-full rounded-2xl" />
        <Skeleton className="mt-5 h-64 w-full rounded-2xl" />
      </div>
    )
  }
  if (!rfq) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <EmptyState
          icon={Info}
          title="RFQ not found"
          description="It may have been removed or belongs to another account."
        >
          <Button variant="outline" className="rounded-xl" onClick={onBack}>
            <ArrowLeft size={14} className="mr-1.5" /> Back to my RFQs
          </Button>
        </EmptyState>
      </div>
    )
  }

  const quotes = rfq.quotes ?? []
  const hasOpenQuote = quotes.some((q) => q.status === 'SENT')
  const canSubmit = rfq.status === 'DRAFT'
  const canCancel = ['SUBMITTED', 'UNDER_REVIEW', 'QUOTED'].includes(rfq.status)

  return (
    <div className="mx-auto w-full max-w-5xl">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft size={15} /> All RFQs
      </button>

      {/* Header */}
      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-mono text-xl font-bold tracking-tight sm:text-2xl">{rfq.number}</h1>
            <StatusBadge status={rfq.status} map={RFQ_STATUS_MAP} />
            {rfq.sourceRecurringId && (
              <span
                className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary"
                title="Spawned automatically by a standing schedule"
              >
                <Repeat size={11} className="shrink-0" /> Recurring run
              </span>
            )}
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Created {formatDate(rfq.createdAt)}
            {rfq.submittedAt ? ` · Submitted ${formatDate(rfq.submittedAt)}` : ' · Not submitted yet'}
            {rfq.organizationName ? ` · On behalf of ${rfq.organizationName}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canSubmit && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="rounded-xl" disabled={acting === 'SUBMIT'}>
                  {acting === 'SUBMIT' ? (
                    <>
                      <Loader2 size={15} className="mr-1.5 animate-spin" /> Submitting…
                    </>
                  ) : (
                    <>
                      <Send size={15} className="mr-1.5" /> Submit for quote
                    </>
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Submit this RFQ to sellers?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {rfq.number} ({rfq.lineCount ?? rfq.lines.length} lines) will be sent for
                    quoting. You can no longer edit the lines after submitting.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep as draft</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void transition('SUBMIT')}>Submit RFQ</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {canCancel && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="rounded-xl text-destructive hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                  disabled={acting === 'CANCEL'}
                >
                  {acting === 'CANCEL' ? 'Cancelling…' : 'Cancel request'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel this request?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {rfq.number} will be closed and sellers will stop working on it. This can&apos;t
                    be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep request</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-white hover:bg-destructive/90"
                    onClick={() => void transition('CANCEL')}
                  >
                    Cancel request
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Ordered banner */}
      {rfq.status === 'ORDERED' && (
        <div className="mt-4 flex flex-wrap items-center gap-2.5 rounded-xl border border-lime-300 bg-lime-50 px-4 py-3 dark:border-lime-900 dark:bg-lime-950/40">
          <ShoppingCart size={16} className="text-lime-700 dark:text-lime-400" aria-hidden />
          <p className="text-sm font-medium text-lime-800 dark:text-lime-300">
            This request was converted to an order — check{' '}
            <button
              type="button"
              onClick={() => navigate('orders')}
              className="font-bold underline underline-offset-2"
            >
              My orders
            </button>{' '}
            for status and invoicing.
          </p>
        </div>
      )}

      {/* Description */}
      {rfq.description && (
        <Card className="mt-6">
          <CardContent className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              What you need
            </p>
            <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-foreground/90">
              {rfq.description}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Lines */}
      <Card className="mt-5">
        <CardContent className="p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Requested items ({rfq.lines.length})
          </p>
          <div className="mt-3 space-y-3">
            {rfq.lines.map((l) => (
              <div
                key={l.id}
                className="flex items-center gap-3.5 rounded-xl border bg-muted/30 px-3.5 py-3"
              >
                <button
                  className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted"
                  onClick={() => l.productId && navigate('product', { productId: l.productId })}
                  disabled={!l.productId}
                  aria-label={l.productId ? `View ${l.productName}` : l.productName}
                >
                  {l.product?.image ? (
                    <img src={l.product.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <PackageSearch size={16} className="text-muted-foreground" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold">{l.productName}</p>
                    {l.sellerName && (
                      <Badge variant="outline" className="shrink-0 rounded-full border-foreground/15 bg-foreground/5 px-2 text-[10px] font-medium text-foreground/70">
                        <Store size={9} className="mr-1" /> {l.sellerName}
                      </Badge>
                    )}
                    {l.variantName && (
                      <Badge variant="outline" className="rounded-full border-primary/40 px-2 text-[10px] text-primary">
                        {l.variantName}
                      </Badge>
                    )}
                    {!l.productId && (
                      <Badge variant="secondary" className="rounded-full px-2 text-[10px]">
                        Open item
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Qty <span className="font-semibold text-foreground">{l.quantity.toLocaleString()}</span>
                    {l.targetPrice != null && (
                      <>
                        {' · '}Target <span className="font-semibold text-foreground">{formatUSD(l.targetPrice)}</span>/unit
                      </>
                    )}
                    {l.notes && <span className="block truncate">“{l.notes}”</span>}
                  </p>
                  <LineCommercialHints line={l} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quotes */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight">Quotes ({quotes.length})</h2>
          {!quotes.length && rfq.status !== 'DRAFT' && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Hourglass size={13} /> Waiting for seller offers
            </span>
          )}
        </div>

        {quotes.length === 0 ? (
          <div className="mt-4">
            {rfq.status === 'DRAFT' ? (
              <EmptyState
                icon={FileText}
                title="Still a draft"
                description="Submit this RFQ so sellers can send their best offers."
              />
            ) : rfq.status === 'CANCELLED' ? (
              <EmptyState icon={XCircle} title="Request cancelled" description="No quotes were issued." />
            ) : (
              <EmptyState
                icon={Hourglass}
                title="No quotes yet"
                description="Sellers are reviewing your request — quotes will appear here with full pricing, NET terms and validity windows."
              />
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            {quotes.map((quote, idx) => (
              <QuoteCard
                key={quote.id}
                quote={quote}
                index={idx}
                acting={acting === quote.id}
                disabled={!hasOpenQuote || rfq.status === 'ACCEPTED' || rfq.status === 'CANCELLED'}
                rfqStatus={rfq.status}
                awaitingApproval={pendingApprovalQuoteIds.has(quote.id)}
                onRespond={(a) => void respondToQuote(quote.id, a)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Negotiation thread */}
      {rfq.status !== 'DRAFT' && (
        <div className="mt-8">
          <RfqThread rfqId={rfq.id} rfqStatus={rfq.status} title="Negotiation with sellers" />
        </div>
      )}
    </div>
  )
}

// ── Quote card ────────────────────────────────────────────────────────────────────

/** Commercial hints on a requested line: tier ladder, MOQ, live stock (settings-driven). */
function LineCommercialHints({
  line,
}: {
  line: RfqDTO['lines'][number]
}) {
  const { data: config } = useApi<{
    moq: { enabled: boolean; showToBuyer: boolean }
    tiers: { buyerSeesTiers: boolean; showSavings: boolean }
    stock: { showToBuyer: boolean; lowThreshold: number }
  }>('/api/rfq-config')
  const p = line.product
  const tiers = config?.tiers?.buyerSeesTiers ? p?.priceTiers : null
  const moq = config?.moq?.showToBuyer ? p?.moq : null
  const showStock = config?.stock?.showToBuyer && p?.stock != null
  if (!tiers?.length && !moq && !showStock) return null

  const hit = tiers?.find((t) => line.quantity >= t.from && (t.to == null || line.quantity <= t.to))
  const savings = hit && config?.tiers?.showSavings && p ? p.price - hit.price : null

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {moq ? (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          MOQ {moq}
          {line.quantity < moq ? ' — below minimum' : ''}
        </span>
      ) : null}
      {showStock ? (
        <span className={cn('font-medium', (p!.stock ?? 0) <= (config?.stock?.lowThreshold ?? 0) ? 'text-rose-600 dark:text-rose-400' : '')}>
          {p!.stock} in stock
        </span>
      ) : null}
      {tiers && tiers.length > 0 && (
        <span className="flex flex-wrap items-center gap-1">
          <TrendingDown size={11} />
          {tiers.map((t, i) => (
            <span
              key={i}
              className={cn(
                'rounded-full px-1.5 py-0.5 tabular-nums',
                hit && t === hit ? 'bg-primary/10 font-semibold text-primary' : 'bg-muted'
              )}
              title={`${t.from}–${t.to ?? '∞'} units → ${formatUSD(t.price)}/unit`}
            >
              {t.from}+ → {formatUSD(t.price)}
            </span>
          ))}
          {savings != null && savings > 0 && (
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              saves {formatUSD(savings)}/unit at this qty
            </span>
          )}
        </span>
      )}
    </div>
  )
}

/** Seller trust signals on a quote (settings-driven: stars, reviews, badge, since). */
function SellerTrustChips({ quote }: { quote: QuoteDTO }) {
  const { data: config } = useApi<{
    rating: {
      show: boolean
      showStars: boolean
      showReviewCount: boolean
      showVerificationBadge: boolean
      showMemberSince: boolean
      minReviews: number
    }
  }>('/api/rfq-config')
  const m = quote.sellerMeta
  const rc = config?.rating
  if (!m || !rc?.show) return null
  const enoughReviews = (m.reviewCount ?? 0) >= (rc.minReviews ?? 0)
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {rc.showStars && enoughReviews && (m.rating ?? 0) > 0 && (
        <span className="flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300" title={`${m.rating} average catalog rating`}>
          <Star size={10} className="fill-current" /> {m.rating!.toFixed(1)}
        </span>
      )}
      {rc.showReviewCount && enoughReviews && (
        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-400">
          {m.reviewCount} reviews
        </span>
      )}
      {rc.showVerificationBadge && m.verified && (
        <span className="flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <ShieldCheck size={10} /> Verified
        </span>
      )}
      {rc.showMemberSince && m.memberSince && (
        <span className="text-[11px] text-muted-foreground">since {new Date(m.memberSince).getFullYear()}</span>
      )}
    </span>
  )
}

function QuoteCard({
  quote,
  index,
  acting,
  disabled,
  rfqStatus,
  awaitingApproval,
  onRespond,
}: {
  quote: QuoteDTO
  index: number
  acting: boolean
  disabled: boolean
  rfqStatus: string
  awaitingApproval: boolean
  onRespond: (action: 'ACCEPT' | 'DECLINE') => void
}) {
  const validity = validityLeft(quote.validUntil)
  const canRespond = quote.status === 'SENT' && !validity.expired && !disabled
  const canConvert = quote.status === 'ACCEPTED' && rfqStatus === 'ACCEPTED'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.06, 0.25) }}
    >
      <Card className="overflow-hidden">
        {/* Quote header */}
        <div
          className={cn(
            'flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b px-5 py-3.5',
            quote.status === 'ACCEPTED' && 'bg-emerald-50/80 dark:bg-emerald-950/30',
            quote.status === 'DECLINED' && 'bg-rose-50/60 dark:bg-rose-950/20'
          )}
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-xs font-bold tracking-wide text-muted-foreground">
              {quote.number}
            </span>
            {quote.paymentTerms && (
              <span className="flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-0.5 text-[11px] font-semibold text-violet-800 dark:bg-violet-950 dark:text-violet-300">
                <CalendarClock size={11} /> {quote.paymentTerms}
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              by{' '}
              <span className="font-semibold text-foreground/80">
                {quote.sellerMeta?.storeName ?? quote.createdBy?.name ?? 'Vendora'}
              </span>
              {quote.sellerMeta?.storeName && quote.createdBy?.name ? (
                <span className="text-muted-foreground/70"> ({quote.createdBy.name})</span>
              ) : null}
              {' · '}
              {quote.sentAt ? timeAgo(quote.sentAt) : timeAgo(quote.createdAt)}
            </span>
            <SellerTrustChips quote={quote} />
          </div>
          <div className="flex items-center gap-2.5">
            {quote.validUntil && (
              <span
                className={cn(
                  'flex items-center gap-1 text-[11px] font-semibold',
                  validity.expired
                    ? 'text-rose-600 dark:text-rose-400'
                    : validity.urgent
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-muted-foreground'
                )}
                title={quote.validUntil ? `Valid until ${formatDate(quote.validUntil)}` : undefined}
              >
                <Clock size={11} className={cn(validity.urgent && 'animate-pulse')} />
                {validity.expired ? 'Offer expired' : `Valid ${validity.text}`}
              </span>
            )}
            <StatusBadge status={quote.status} map={QUOTE_STATUS_MAP} />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 rounded-full px-2.5 text-xs text-muted-foreground"
              onClick={() => {
                window.open(`/api/quotes/${quote.id}/pdf`, '_blank', 'noopener')
              }}
              aria-label={`Download quote ${quote.number} as PDF`}
            >
              <FileDown size={13} /> PDF
            </Button>
            <QuotePrintDialog quote={quote} />
          </div>
        </div>

        <CardContent className="p-5">
          {/* Lines */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="pb-2 pr-3 font-semibold">Item</th>
                  <th scope="col" className="pb-2 px-3 text-right font-semibold">Qty</th>
                  <th scope="col" className="pb-2 px-3 text-right font-semibold">Unit</th>
                  <th scope="col" className="pb-2 pl-3 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {quote.lines.map((l) => (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                          {l.image ? (
                            <img src={l.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                          ) : (
                            <PackageSearch size={14} className="text-muted-foreground" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{l.productTitle ?? 'Item'}</span>
                          {l.variantName && (
                            <span className="mt-0.5 block truncate text-[11px] text-primary">
                              {l.variantName}
                            </span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {l.quantity.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatUSD(l.unitPrice)}</td>
                    <td className="py-2.5 pl-3 text-right font-semibold tabular-nums">{formatUSD(l.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="mt-4 ml-auto max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatUSD(quote.subtotal)}</span>
            </div>
            {quote.discountTotal > 0 && (
              <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                <span>Discount</span>
                <span className="tabular-nums">−{formatUSD(quote.discountTotal)}</span>
              </div>
            )}
            {quote.shippingTotal > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Shipping</span>
                <span className="tabular-nums">{formatUSD(quote.shippingTotal)}</span>
              </div>
            )}
            {quote.taxTotal > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Tax</span>
                <span className="tabular-nums">{formatUSD(quote.taxTotal)}</span>
              </div>
            )}
            <Separator className="my-2" />
            <div className="flex justify-between text-base font-extrabold">
              <span>Total</span>
              <span className="tabular-nums">{formatUSD(quote.total)}</span>
            </div>
          </div>

          {/* Seller notes */}
          {quote.notes && (
            <div className="mt-4 flex gap-2.5 rounded-xl border border-dashed bg-muted/30 px-4 py-3">
              <MessageSquareText size={15} className="mt-0.5 shrink-0 text-primary" />
              <p className="text-sm leading-relaxed text-foreground/90">{quote.notes}</p>
            </div>
          )}

          {/* Actions */}
          {awaitingApproval && (
            <div className="mt-5 flex items-center gap-2.5 rounded-xl border border-teal-500/40 bg-teal-500/10 px-4 py-3 text-sm text-teal-700 dark:text-teal-300">
              <Hourglass size={15} className="shrink-0" />
              <span>
                <span className="font-semibold">Awaiting approval</span> — an approver in your organization
                must clear this acceptance before the deal closes.
              </span>
            </div>
          )}
          {canRespond && (
            <div className="mt-5 flex flex-wrap justify-end gap-2.5 border-t pt-4">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="rounded-xl text-destructive hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                    disabled={acting}
                  >
                    <XCircle size={15} className="mr-1.5" /> Decline
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Decline this quote?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {quote.number} ({formatUSD(quote.total)}) will be marked as declined. The
                      seller may send a revised offer.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep offer</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-white hover:bg-destructive/90"
                      onClick={() => onRespond('DECLINE')}
                    >
                      Decline quote
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button className="rounded-xl" disabled={acting}>
                    {acting ? (
                      <>
                        <Loader2 size={15} className="mr-1.5 animate-spin" /> Accepting…
                      </>
                    ) : (
                      <>
                        <BadgeCheck size={15} className="mr-1.5" /> Accept quote
                      </>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Accept {quote.number}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      You&apos;re closing the deal at{' '}
                      <span className="font-semibold text-foreground">{formatUSD(quote.total)}</span> with{' '}
                      {quote.paymentTerms ?? 'standard'} terms. Any other quotes on this RFQ will be
                      declined automatically. This can&apos;t be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Not yet</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onRespond('ACCEPT')}>
                      <Check size={14} className="mr-1.5" /> Accept &amp; close deal
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}

          {/* Convert accepted quote to a real order */}
          {canConvert && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <p className="text-xs text-muted-foreground">
                Deal closed — turn this quote into a trackable order with NET-terms invoicing.
              </p>
              <ConvertQuoteDialog quote={quote} />
            </div>
          )}
          {quote.status === 'CONVERTED' && (
            <div className="mt-5 flex items-center gap-2 rounded-xl border border-lime-300 bg-lime-50 px-4 py-2.5 text-xs font-medium text-lime-800 dark:border-lime-900 dark:bg-lime-950/40 dark:text-lime-300">
              <Check size={13} aria-hidden /> Converted to order — see My orders for status and
              invoicing.
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ── Convert-to-order dialog ────────────────────────────────────────────────

function ConvertQuoteDialog({ quote }: { quote: QuoteDTO }) {
  const [open, setOpen] = useState(false)
  const [converting, setConverting] = useState(false)
  const [poNumber, setPoNumber] = useState('')
  const [ship, setShip] = useState({
    fullName: '',
    address: '',
    city: '',
    country: '',
    zip: '',
    phone: '',
  })
  const navigate = useMarketplace((s) => s.navigate)

  const convert = async (e: React.FormEvent) => {
    e.preventDefault()
    if (converting) return
    setConverting(true)
    const res = await apiRequest<{ order: { id: string } }>(`/api/quotes/${quote.id}/convert`, {
      method: 'POST',
      body: JSON.stringify({
        poNumber: poNumber.trim() || null,
        ...(ship.fullName.trim() ? { fullName: ship.fullName.trim() } : {}),
        ...(ship.address.trim() ? { address: ship.address.trim() } : {}),
        ...(ship.city.trim() ? { city: ship.city.trim() } : {}),
        ...(ship.country.trim() ? { country: ship.country.trim() } : {}),
        ...(ship.zip.trim() ? { zip: ship.zip.trim() } : {}),
        ...(ship.phone.trim() ? { phone: ship.phone.trim() } : {}),
      }),
    })
    setConverting(false)
    if (!res.ok) {
      toast({ title: 'Could not convert', description: res.error ?? 'Please try again', variant: 'destructive' })
      return
    }
    setOpen(false)
    toast({
      title: 'Order placed!',
      description: `${quote.number} became a trackable order — sellers are preparing your shipment.`,
    })
    navigate('orders')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-xl">
          <ShoppingCart size={15} className="mr-1.5" /> Convert to order
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Convert {quote.number} to an order</DialogTitle>
          <DialogDescription>
            {quote.lines.length} item{quote.lines.length === 1 ? '' : 's'} ·{' '}
            <span className="font-semibold text-foreground">{formatUSD(quote.total)}</span> ·{' '}
            {quote.paymentTerms ?? 'standard'} terms. Stock is reserved immediately.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={convert} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cv-po" className="text-xs">
              PO number <span className="text-muted-foreground">(optional — your purchase order reference)</span>
            </Label>
            <Input
              id="cv-po"
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value)}
              maxLength={40}
              className="h-9 rounded-lg text-sm"
              placeholder="e.g. PO-2026-0142"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1 text-xs">
              <MapPin size={11} /> Ship-to details{' '}
              <span className="text-muted-foreground">(optional — falls back to your org / last order)</span>
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={ship.fullName}
                onChange={(e) => setShip((s) => ({ ...s, fullName: e.target.value }))}
                className="h-9 rounded-lg text-sm"
                placeholder="Full name"
                aria-label="Full name"
                maxLength={120}
              />
              <Input
                value={ship.city}
                onChange={(e) => setShip((s) => ({ ...s, city: e.target.value }))}
                className="h-9 rounded-lg text-sm"
                placeholder="City"
                aria-label="City"
                maxLength={120}
              />
              <Input
                value={ship.address}
                onChange={(e) => setShip((s) => ({ ...s, address: e.target.value }))}
                className="col-span-2 h-9 rounded-lg text-sm"
                placeholder="Street address"
                aria-label="Street address"
                maxLength={255}
              />
              <Input
                value={ship.country}
                onChange={(e) => setShip((s) => ({ ...s, country: e.target.value }))}
                className="h-9 rounded-lg text-sm"
                placeholder="Country"
                aria-label="Country"
                maxLength={120}
              />
              <Input
                value={ship.zip}
                onChange={(e) => setShip((s) => ({ ...s, zip: e.target.value }))}
                className="h-9 rounded-lg text-sm"
                placeholder="ZIP / postal code"
                aria-label="ZIP or postal code"
                maxLength={32}
              />
              <Input
                value={ship.phone}
                onChange={(e) => setShip((s) => ({ ...s, phone: e.target.value }))}
                className="col-span-2 h-9 rounded-lg text-sm"
                placeholder="Phone (optional)"
                aria-label="Phone number"
                maxLength={40}
              />
            </div>
          </div>
          <div className="rounded-xl border bg-muted/40 p-3 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">What happens next</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              <li>A {quote.paymentTerms ?? 'standard'} invoice order is created in My orders</li>
              <li>Stock is reserved and sellers see the order in their dashboard</li>
              <li>This RFQ closes as <span className="font-semibold text-foreground">Ordered</span></li>
            </ul>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="rounded-lg" onClick={() => setOpen(false)}>
              Not now
            </Button>
            <Button type="submit" className="rounded-lg" disabled={converting}>
              {converting ? (
                <>
                  <Loader2 size={14} className="mr-1 animate-spin" /> Converting…
                </>
              ) : (
                <>
                  <ShoppingCart size={14} className="mr-1" /> Place order
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Quote print dialog ─────────────────────────────────────────────────────

function QuotePrintDialog({ quote }: { quote: QuoteDTO }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 rounded-lg px-2 text-xs text-muted-foreground hover:text-primary"
          aria-label={`Print or save quote ${quote.number}`}
        >
          <Printer size={13} />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] gap-0 overflow-y-auto p-0 sm:max-w-lg">
        <DialogHeader className="no-print border-b p-5 pb-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText size={16} className="text-primary" /> Quote {quote.number}
          </DialogTitle>
          <DialogDescription>Printable offer — valid while the validity window lasts.</DialogDescription>
        </DialogHeader>

        <div className="print-area bg-card p-6 text-card-foreground">
          <div className="flex items-start justify-between gap-4 border-b pb-5">
            <div>
              <p className="text-lg font-extrabold tracking-tight">
                Vendora<span className="text-primary">.</span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">Multi-vendor marketplace — B2B quote</p>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p className="font-mono text-sm font-semibold text-foreground">{quote.number}</p>
              <p className="mt-1">{formatDate(quote.sentAt ?? quote.createdAt)}</p>
              <p className="mt-1 font-semibold">{quote.paymentTerms ?? 'Standard terms'}</p>
            </div>
          </div>

          <table className="w-full border-b py-2 text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="py-3 font-semibold">Item</th>
                <th className="py-3 text-center font-semibold">Qty</th>
                <th className="py-3 text-right font-semibold">Unit</th>
                <th className="py-3 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {quote.lines.map((l) => (
                <tr key={l.id} className="border-t border-dashed align-top">
                  <td className="max-w-[220px] py-2.5 pr-2 font-medium leading-snug">
                    {l.productTitle ?? 'Item'}
                    {l.variantName && (
                      <span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">
                        {l.variantName}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 text-center tabular-nums">{l.quantity}</td>
                  <td className="py-2.5 text-right tabular-nums">{formatUSD(l.unitPrice)}</td>
                  <td className="py-2.5 text-right font-semibold tabular-nums">{formatUSD(l.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="space-y-1.5 border-b py-4 text-xs">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatUSD(quote.subtotal)}</span>
            </div>
            {quote.discountTotal > 0 && (
              <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                <span>Discount</span>
                <span className="tabular-nums">−{formatUSD(quote.discountTotal)}</span>
              </div>
            )}
            {quote.shippingTotal > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Shipping</span>
                <span className="tabular-nums">{formatUSD(quote.shippingTotal)}</span>
              </div>
            )}
            {quote.taxTotal > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Tax</span>
                <span className="tabular-nums">{formatUSD(quote.taxTotal)}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-2 text-sm font-bold">
              <span>Quote total</span>
              <span className="tabular-nums">{formatUSD(quote.total)}</span>
            </div>
          </div>

          <div className="pt-4 text-[10px] leading-relaxed text-muted-foreground">
            {quote.validUntil && (
              <p className="font-semibold text-foreground">
                Valid until {formatDate(quote.validUntil)}
              </p>
            )}
            {quote.notes && <p className="mt-1 whitespace-pre-line">{quote.notes}</p>}
            <p className="mt-2">Issued by {quote.createdBy?.name ?? 'Vendora'} · vendora.com</p>
          </div>
        </div>

        <div className="no-print flex justify-end gap-2 border-t bg-muted/40 p-4">
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => window.print()}>
            <Printer size={13} className="mr-1.5" /> Print / save as PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Create ──────────────────────────────────────────────────────────────────

function RfqCreateView({
  title,
  setTitle,
  description,
  setDescription,
  lines,
  setLines,
  orgs,
  orgId,
  setOrgId,
  onDone,
  onCancel,
  navigate,
}: {
  title: string
  setTitle: (v: string) => void
  description: string
  setDescription: (v: string) => void
  lines: DraftLine[]
  setLines: React.Dispatch<React.SetStateAction<DraftLine[]>>
  orgs: OrganizationDTO[]
  orgId: string
  setOrgId: (id: string) => void
  onDone: (id: string) => void
  onCancel: () => void
  navigate: (view: 'catalog', params?: { query?: string }) => void
}) {
  const [saving, setSaving] = useState<'draft' | 'submit' | null>(null)
  const [expiresInDays, setExpiresInDays] = useState('default')
  const [repeat, setRepeat] = useState('none')
  const [repeatCustomDays, setRepeatCustomDays] = useState('30')
  const { data: config } = useApi<{
    moq: { enabled: boolean; showToBuyer: boolean }
    expiry: { enabled: boolean; defaultDays: number; minDays: number; maxDays: number; buyerOverride: boolean }
    recurring: RecurringPublicConfig
  }>('/api/rfq-config')

  const updateLine = (key: number, patch: Partial<DraftLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  const removeLine = (key: number) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls))

  const validate = (): string | null => {
    if (!lines.length) return 'Add at least one item to this request.'
    for (const [i, l] of lines.entries()) {
      const n = i + 1
      if (l.kind === 'catalog' && !l.product) return `Line ${n}: pick a product from the catalog (or switch to an open item).`
      if (l.kind === 'open' && !l.productName.trim()) return `Line ${n}: describe the open item (e.g. “Custom kraft boxes”).`
      const qty = Number(l.quantity)
      if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty < 1) return `Line ${n}: quantity must be a whole number of at least 1.`
      if (l.targetPrice.trim() && (Number.isNaN(Number(l.targetPrice)) || Number(l.targetPrice) < 0))
        return `Line ${n}: target price must be zero or more.`
    }
    return null
  }

  const save = async (submit: boolean) => {
    const problem = validate()
    if (problem) {
      toast({ title: 'Almost there', description: problem, variant: 'destructive' })
      return
    }
    setSaving(submit ? 'submit' : 'draft')
    const payload = {
      title: title.trim() || null,
      description: description.trim() || null,
      organizationId: orgId || null,
      expiresInDays: expiresInDays !== 'default' ? Number(expiresInDays) : null,
      lines: lines.map((l) => ({
        productId: l.kind === 'catalog' ? l.product!.id : null,
        productName: l.kind === 'open' ? l.productName.trim() : null,
        variantId: l.kind === 'catalog' ? l.variantId : null,
        quantity: Number(l.quantity),
        targetPrice: l.targetPrice.trim() ? Number(l.targetPrice) : null,
        notes: l.notes.trim() || null,
      })),
    }
    const created = await apiRequest<{ rfq: RfqDTO }>('/api/rfqs', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    if (!created.ok || !created.data) {
      setSaving(null)
      toast({ title: 'Could not create RFQ', description: created.error, variant: 'destructive' })
      return
    }
    const rfq = created.data.rfq
    if (submit) {
      const submitted = await apiRequest(`/api/rfqs/${rfq.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'SUBMIT' }),
      })
      if (!submitted.ok) {
        setSaving(null)
        toast({ title: 'Saved as draft', description: submitted.error, variant: 'destructive' })
        onDone(rfq.id)
        return
      }
      toast({
        title: 'RFQ submitted',
        description: `${rfq.number} is out for quoting — offers will appear on its detail page.`,
      })
    } else {
      toast({
        title: 'Draft saved',
        description: `${rfq.number} is waiting — submit it whenever you're ready.`,
      })
    }
    // Standing schedule (recurring settings): the first run went out above;
    // the schedule re-publishes the same lines every cycle.
    if (repeat !== 'none') {
      const freq = repeat as 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'CUSTOM'
      const scheduled = await apiRequest<{ schedule: { id: string } }>('/api/recurring-rfqs', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim() || null,
          description: description.trim() || null,
          organizationId: orgId || null,
          frequency: freq,
          intervalDays: freq === 'CUSTOM' ? Number(repeatCustomDays) || null : null,
          lines: payload.lines,
        }),
      })
      if (scheduled.ok) {
        toast({
          title: 'Standing schedule created',
          description: 'This request will re-publish automatically each cycle — manage it from your RFQ list.',
        })
      } else {
        toast({ title: 'Schedule not created', description: scheduled.error, variant: 'destructive' })
      }
    }
    setSaving(null)
    onDone(rfq.id)
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <button
        onClick={onCancel}
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft size={15} /> All RFQs
      </button>

      <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">New request for quote</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        One multi-line request beats a dozen carts. Sellers reply with negotiable quotes, NET terms
        and quantity breaks.
      </p>

      <div className="mt-6 space-y-5">
        {/* Basics */}
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="space-y-1.5">
              <Label htmlFor="rfq-title">Title</Label>
              <Input
                id="rfq-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Packaging restock — Q1 supply"
                className="rounded-xl"
                maxLength={160}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rfq-description">Description</Label>
              <Textarea
                id="rfq-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tell sellers anything that helps them quote you: delivery deadlines, quality requirements, recurring volume…"
                className="min-h-24 rounded-xl text-sm"
                maxLength={5000}
              />
            </div>
            {orgs.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="rfq-org">Buying on behalf of</Label>
                <Select value={orgId || 'none'} onValueChange={(v) => setOrgId(v === 'none' ? '' : v)}>
                  <SelectTrigger id="rfq-org" className="h-10 rounded-xl" aria-label="Organization for this RFQ">
                    <SelectValue placeholder="Personal account" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Personal account</SelectItem>
                    {orgs.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}
                        <span className="ml-1.5 text-xs text-muted-foreground">({o.status === 'ACTIVE' ? 'active' : 'pending'})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Contract prices and NET terms apply once your business is verified.
                </p>
              </div>
            )}
            {config?.expiry?.enabled && (
              <div className="space-y-1.5">
                <Label htmlFor="rfq-expiry">Response deadline</Label>
                <Select value={expiresInDays} onValueChange={setExpiresInDays} disabled={!config.expiry.buyerOverride}>
                  <SelectTrigger id="rfq-expiry" className="h-10 rounded-xl" aria-label="Response deadline for this RFQ">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">
                      Standard — {config.expiry.defaultDays} days
                    </SelectItem>
                    {config.expiry.buyerOverride &&
                      [3, 7, 14, 21, 30, 60, 90]
                        .filter((d) => d >= config.expiry.minDays && d <= config.expiry.maxDays)
                        .map((d) => (
                          <SelectItem key={d} value={String(d)}>
                            {d} days
                          </SelectItem>
                        ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Requests close when the deadline passes — sellers are notified before it lapses.
                </p>
              </div>
            )}
            <RecurringField
              config={config?.recurring ?? null}
              value={repeat}
              onChange={setRepeat}
              customDays={repeatCustomDays}
              onCustomDaysChange={setRepeatCustomDays}
            />
          </CardContent>
        </Card>

        {/* Lines */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Items ({lines.length})</p>
              <span className="text-xs text-muted-foreground">At least 1 required</span>
            </div>

            <div className="mt-4 space-y-4">
              {lines.map((l, i) => (
                <div key={l.key} className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Line {i + 1}
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="flex rounded-lg border bg-background p-0.5" role="group" aria-label="Line type">
                        <button
                          type="button"
                          onClick={() => updateLine(l.key, { kind: 'catalog' })}
                          className={cn(
                            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                            l.kind === 'catalog'
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          Catalog
                        </button>
                        <button
                          type="button"
                          onClick={() => updateLine(l.key, { kind: 'open' })}
                          className={cn(
                            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                            l.kind === 'open'
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          Open item
                        </button>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive"
                        onClick={() => removeLine(l.key)}
                        disabled={lines.length === 1}
                        aria-label={`Remove line ${i + 1}`}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>

                  {l.kind === 'catalog' ? (
                    l.product ? (
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center gap-3 rounded-xl border bg-background px-3.5 py-2.5">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                            {l.product.image ? (
                              <img src={l.product.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                            ) : (
                              <PackageSearch size={15} className="text-muted-foreground" />
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{l.product.title}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {l.product.sellerName && (
                                <>
                                  <span className="font-medium text-foreground/70">{l.product.sellerName}</span>
                                  <span className="mx-1">·</span>
                                </>
                              )}
                              Retail {formatUSD(l.product.price)}/unit
                            </p>
                          </div>
                          {config?.moq?.showToBuyer && l.product?.moq ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              MOQ {l.product.moq}
                            </span>
                          ) : null}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 rounded-lg text-xs text-muted-foreground"
                            onClick={() => updateLine(l.key, { product: null, variantId: null })}
                          >
                            Change
                          </Button>
                        </div>
                        {config?.moq?.showToBuyer && l.product?.moq && Number(l.quantity) < l.product.moq ? (
                          <p className="mt-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                            Below the {l.product.moq}-unit minimum — sellers may counter or decline.
                          </p>
                        ) : null}
                        {(l.product.variants?.length ?? 0) > 0 && (
                          <div className="space-y-1.5">
                            <Label htmlFor={`variant-${l.key}`}>
                              Variant{' '}
                              <span className="font-normal text-muted-foreground">
                                (optional — leave open to let sellers propose one)
                              </span>
                            </Label>
                            <Select
                              value={l.variantId ?? 'any'}
                              onValueChange={(v) => updateLine(l.key, { variantId: v === 'any' ? null : v })}
                            >
                              <SelectTrigger
                                id={`variant-${l.key}`}
                                className="h-9 rounded-xl"
                                aria-label={`Variant for line ${l.key}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="any">Any variant — sellers pick</SelectItem>
                                {l.product.variants!.map((v) => (
                                  <SelectItem key={v.id} value={v.id}>
                                    {v.name}
                                    <span className="ml-1.5 text-xs text-muted-foreground">
                                      {v.price != null ? `${formatUSD(v.price)}/unit` : 'base price'}
                                      {' · '}
                                      {v.stock} in stock
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="mt-3">
                        <ProductPicker
                          label={`Product search for line ${i + 1}`}
                          onPick={(p) => updateLine(l.key, { product: p })}
                        />
                      </div>
                    )
                  ) : (
                    <div className="mt-3">
                      <Input
                        value={l.productName}
                        onChange={(e) => updateLine(l.key, { productName: e.target.value })}
                        placeholder="Describe the item — e.g. “Custom kraft boxes, 30×20×15 cm”"
                        className="rounded-xl"
                        maxLength={200}
                        aria-label={`Open item name for line ${i + 1}`}
                      />
                    </div>
                  )}

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor={`qty-${l.key}`}>Quantity</Label>
                      <Input
                        id={`qty-${l.key}`}
                        type="number"
                        min={1}
                        step={1}
                        value={l.quantity}
                        onChange={(e) => updateLine(l.key, { quantity: e.target.value })}
                        className="rounded-xl tabular-nums"
                        aria-label={`Quantity for line ${i + 1}`}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`target-${l.key}`}>
                        Target price / unit <span className="font-normal text-muted-foreground">(optional)</span>
                      </Label>
                      <Input
                        id={`target-${l.key}`}
                        type="number"
                        min={0}
                        step="0.01"
                        value={l.targetPrice}
                        onChange={(e) => updateLine(l.key, { targetPrice: e.target.value })}
                        placeholder="Leave blank to let sellers bid"
                        className="rounded-xl tabular-nums"
                        aria-label={`Target unit price for line ${i + 1}`}
                      />
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <Label htmlFor={`notes-${l.key}`}>
                      Notes <span className="font-normal text-muted-foreground">(optional)</span>
                    </Label>
                    <Input
                      id={`notes-${l.key}`}
                      value={l.notes}
                      onChange={(e) => updateLine(l.key, { notes: e.target.value })}
                      placeholder="Specs, color, deadline, delivery window…"
                      className="rounded-xl"
                      maxLength={2000}
                      aria-label={`Notes for line ${i + 1}`}
                    />
                  </div>
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              className="mt-4 w-full rounded-xl border-dashed"
              onClick={() => setLines((ls) => [...ls, newDraftLine()])}
            >
              <Plus size={15} className="mr-1.5" /> Add another item
            </Button>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            className="rounded-xl"
            onClick={() => navigate('catalog')}
          >
            Browse the catalog <ChevronRight size={15} className="ml-0.5" />
          </Button>
          <div className="flex flex-wrap gap-2.5">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              disabled={saving !== null}
              onClick={() => void save(false)}
            >
              {saving === 'draft' ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : null}
              Save as draft
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="rounded-xl" disabled={saving !== null}>
                  {saving === 'submit' ? (
                    <>
                      <Loader2 size={15} className="mr-1.5 animate-spin" /> Submitting…
                    </>
                  ) : (
                    <>
                      <Send size={15} className="mr-1.5" /> Submit for quote
                    </>
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Submit this RFQ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {lines.length} line{lines.length === 1 ? '' : 's'} will be sent to sellers for
                    quoting. Lines can&apos;t be edited afterwards (you can cancel and redraft).
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Review again</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void save(true)}>Submit RFQ</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>
    </div>
  )
}
