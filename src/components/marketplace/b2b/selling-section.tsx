'use client'

// ── Company workspace → Selling section (Phase-5 workspace UI) ────────────────
// Four sub-consoles for the ACTIVE COMPANY org, all driven by the org-scoped
// server APIs: offers on the shared catalog, product proposals (platform
// moderation), org stores (multi-store) and incoming sales orders.
// The parent (business-view) guarantees organizationId is a COMPANY org the
// user belongs to — every fetch below is membership-checked server-side too.

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Archive,
  ArchiveRestore,
  BadgeCheck,
  Boxes,
  Building2,
  CalendarDays,
  ClipboardCheck,
  Inbox,
  Landmark,
  Loader2,
  MapPin,
  Package,
  PackageCheck,
  PackageSearch,
  Pencil,
  Plus,
  Receipt,
  ShieldAlert,
  Sparkles,
  Store as StoreIcon,
  Tag,
  Truck,
  Users,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { toastApiError } from '@/components/marketplace/financing/financing-shared'
import type { CategoryDTO } from '@/lib/types'
import { formatDate, formatNumber, formatUSD, timeAgo } from '@/lib/format'
import { cardImage } from '@/lib/storage/url'
import { FinancingRfqInboxSub } from '@/components/marketplace/b2b/financing-rfq-inbox'
import { SponsorshipsSub } from '@/components/marketplace/b2b/sponsorships-section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { cn } from '@/lib/utils'
import { apiRequest, EmptyState, ProductPicker, StatusBadge, type PickedProduct } from './b2b-shared'

// ── API row contracts ─────────────────────────────────────────────────────────

export interface OfferRow {
  id: string
  productId: string
  productTitle: string
  productSlug: string | null
  productImages: string[]
  storeId: string | null
  storeName: string | null
  sellerOrgId: string | null
  sellerOrgName: string | null
  sellerOrgSlug: string | null
  price: number
  compareAtPrice: number | null
  stock: number
  moq: number | null
  sku: string | null
  freeShipping: boolean
  shippingFee: number | null
  processingDays: number | null
  leadTimeNote: string | null
  status: string
  soldCount: number
  updatedAt: string
  variants: { variantId: string; price: number | null; stock: number | null; sku: string | null }[]
}

export interface ProposalRow {
  id: string
  title: string
  description: string
  price: number
  images: string[]
  categoryId: string
  categoryName: string
  approvalState: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | string
  reviewNote: string | null
  createdAt: string
  offerCount: number
}

export interface StoreRow {
  id: string
  organizationId: string
  name: string
  slug: string
  description: string | null
  logoUrl: string | null
  city: string | null
  phone: string | null
  isActive: boolean
  isDefault: boolean
  isArchived: boolean
  createdAt: string
  offerCount: number
}

export interface PlatformStoreSettings {
  multiStoreEnabled: boolean
  maxStoresPerCompany: number
}

export interface SalesOrderItemRow {
  id: string
  title: string
  quantity: number
  price: number
  variantName: string | null
  status: string
}

export interface SalesOrderRow {
  orderId: string
  orderStatus: string
  placedAt: string
  buyerName: string
  city: string
  country: string
  paymentTerms: string | null
  items: SalesOrderItemRow[]
  total: number
}

// ── Status palettes (warm theme — mirrors the B2B badge palette) ──────────────

const OFFER_STATUS_MAP = {
  ACTIVE: { label: 'Active', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  DRAFT: { label: 'Draft', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  PAUSED: { label: 'Paused', badge: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300' },
  ARCHIVED: { label: 'Archived', badge: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
} as const

const PROPOSAL_STATE_MAP = {
  PENDING_APPROVAL: { label: 'Pending review', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  APPROVED: { label: 'Approved', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  REJECTED: { label: 'Rejected', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
} as const

const ORDER_STATUS_MAP = {
  PAID: { label: 'Paid', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  PENDING_APPROVAL: { label: 'Awaiting approval', badge: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300' },
  PENDING_PAYMENT: { label: 'Awaiting payment', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  PROCESSING: { label: 'Processing', badge: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300' },
  SHIPPED: { label: 'Shipped', badge: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300' },
  DELIVERED: { label: 'Delivered', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  CANCELLED: { label: 'Cancelled', badge: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
} as const

type BadgeMap = Record<string, { label: string; badge: string }>

const asMap = (o: object): BadgeMap => o as BadgeMap
const OFFER_STATUS = asMap(OFFER_STATUS_MAP)
const PROPOSAL_STATE = asMap(PROPOSAL_STATE_MAP)
const ORDER_STATUS = asMap(ORDER_STATUS_MAP)

/** Small stat tile used in the section header row. */
function MiniStat({ icon: Icon, label, value }: { icon: typeof Package; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border bg-muted/30 px-3.5 py-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon size={15} />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-bold tabular-nums">{value}</p>
      </div>
    </div>
  )
}

// ── Selling section (outer shell with the four sub-tabs) ─────────────────────

/**
 * Friendly gate shown when the active context is NOT a company org: the user
 * is a member of at least one company but their working context is personal
 * (or a financier org) — offer one-click context switches instead.
 */
export function SellingContextGate({
  companyOrgs,
  activeLabel,
  switching,
  onSwitch,
}: {
  companyOrgs: { id: string; name: string }[]
  activeLabel: string
  switching: boolean
  onSwitch: (organizationId: string) => void
}) {
  return (
    <EmptyState
      icon={Building2}
      title={`Selling needs a company context — you're ${activeLabel}`}
      description="Switch your active context to one of your company organizations to manage offers, proposals, stores and incoming sales."
    >
      <div className="flex flex-wrap justify-center gap-2">
        {companyOrgs.map((o) => (
          <Button
            key={o.id}
            onClick={() => onSwitch(o.id)}
            disabled={switching}
            className="rounded-xl"
          >
            {switching ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : <Building2 size={15} className="mr-1.5" />}
            {o.name}
          </Button>
        ))}
      </div>
    </EmptyState>
  )
}

export function SellingSection({ organizationId, orgName }: { organizationId: string; orgName: string }) {
  return (
    <section aria-labelledby="selling-heading" className="space-y-5">
      <div className="flex items-start gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <StoreIcon size={22} />
        </span>
        <div>
          <h2 id="selling-heading" className="text-xl font-bold tracking-tight">
            Selling
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Offers, product proposals, stores and incoming sales for {orgName}.
          </p>
        </div>
      </div>

      <Tabs defaultValue="offers">
        <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-xl bg-muted/60 p-1 sm:w-auto">
          <TabsTrigger value="offers" className="gap-1.5 rounded-lg px-3.5 py-1.5">
            <Tag size={14} /> Offers
          </TabsTrigger>
          <TabsTrigger value="proposals" className="gap-1.5 rounded-lg px-3.5 py-1.5">
            <PackageSearch size={14} /> Product proposals
          </TabsTrigger>
          <TabsTrigger value="stores" className="gap-1.5 rounded-lg px-3.5 py-1.5">
            <StoreIcon size={14} /> Stores
          </TabsTrigger>
          <TabsTrigger value="orders" className="gap-1.5 rounded-lg px-3.5 py-1.5">
            <Receipt size={14} /> Sales orders
          </TabsTrigger>
          <TabsTrigger value="financing-rfqs" className="gap-1.5 rounded-lg px-3.5 py-1.5">
            <Landmark size={14} /> Financing RFQs
          </TabsTrigger>
          <TabsTrigger value="sponsorships" className="gap-1.5 rounded-lg px-3.5 py-1.5">
            <Sparkles size={14} /> Sponsorships
          </TabsTrigger>
        </TabsList>

        <TabsContent value="offers" className="mt-5">
          <OffersSub organizationId={organizationId} />
        </TabsContent>
        <TabsContent value="proposals" className="mt-5">
          <ProposalsSub organizationId={organizationId} />
        </TabsContent>
        <TabsContent value="stores" className="mt-5">
          <StoresSub organizationId={organizationId} />
        </TabsContent>
        <TabsContent value="orders" className="mt-5">
          <SalesOrdersSub organizationId={organizationId} />
        </TabsContent>
        <TabsContent value="financing-rfqs" className="mt-5">
          <FinancingRfqInboxSub organizationId={organizationId} />
        </TabsContent>
        <TabsContent value="sponsorships" className="mt-5">
          <SponsorshipsSub organizationId={organizationId} />
        </TabsContent>
      </Tabs>
    </section>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// a. Offers — shared-catalog offers of the org
// ══════════════════════════════════════════════════════════════════════════════

function OffersSub({ organizationId }: { organizationId: string }) {
  const { data, loading, error, refetch } = useApi<{ offers: OfferRow[] }>(
    `/api/offers?organizationId=${organizationId}`
  )
  const offers = data?.offers ?? []

  const [newOpen, setNewOpen] = useState(false)
  const [editing, setEditing] = useState<OfferRow | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const activeCount = offers.filter((o) => o.status === 'ACTIVE').length
  const totalSold = offers.reduce((sum, o) => sum + o.soldCount, 0)
  const lowestPrice = offers.length ? Math.min(...offers.map((o) => o.price)) : null

  const patchOffer = async (
    offer: OfferRow,
    body: Record<string, unknown>,
    okTitle: string,
    okDescription?: string
  ) => {
    setBusyId(offer.id)
    const res = await apiRequest(`/api/offers/${offer.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ organizationId, ...body }),
    })
    setBusyId(null)
    if (!res.ok) {
      toast({ title: 'Update failed', description: res.error, variant: 'destructive' })
      return
    }
    toast({ title: okTitle, description: okDescription })
    void refetch()
  }

  return (
    <div className="space-y-4">
      {/* Stats + new offer */}
      <div className="flex flex-wrap items-stretch justify-between gap-3">
        <div className="flex flex-wrap items-stretch gap-2.5">
          <MiniStat icon={Tag} label="Offers" value={String(offers.length)} />
          <MiniStat icon={BadgeCheck} label="Active" value={String(activeCount)} />
          <MiniStat icon={PackageCheck} label="Units sold" value={formatNumber(totalSold)} />
          {lowestPrice != null && <MiniStat icon={Tag} label="From" value={formatUSD(lowestPrice)} />}
        </div>
        <Button className="rounded-xl" onClick={() => setNewOpen(true)}>
          <Plus size={15} className="mr-1.5" /> New offer
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState icon={ShieldAlert} title="Couldn't load offers" description={error}>
          <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
            Try again
          </Button>
        </EmptyState>
      ) : offers.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="No offers yet"
          description="List your company's pricing and stock on any product in the shared catalog — buyers then buy from you directly."
        >
          <Button className="rounded-xl" onClick={() => setNewOpen(true)}>
            <Plus size={15} className="mr-1.5" /> Create your first offer
          </Button>
        </EmptyState>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-2xl border lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-medium">Product</th>
                  <th scope="col" className="px-4 py-3 font-medium">Price</th>
                  <th scope="col" className="px-4 py-3 font-medium">Stock</th>
                  <th scope="col" className="px-4 py-3 font-medium">MOQ</th>
                  <th scope="col" className="px-4 py-3 font-medium">Lead time</th>
                  <th scope="col" className="px-4 py-3 font-medium">Sold</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {offers.map((o) => (
                  <tr key={o.id} className="border-b transition-colors last:border-0 hover:bg-accent/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <OfferThumb images={o.productImages} title={o.productTitle} />
                        <div className="min-w-0 max-w-60">
                          <p className="truncate font-semibold" title={o.productTitle}>
                            {o.productTitle}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {o.storeName ? (
                              <>
                                <StoreIcon size={11} className="mr-1 inline" />
                                {o.storeName}
                              </>
                            ) : (
                              'No store'
                            )}
                            <span className="mx-1.5">·</span>updated {timeAgo(o.updatedAt)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-semibold tabular-nums">{formatUSD(o.price)}</td>
                    <td className="px-4 py-3.5 tabular-nums">
                      <span
                        className={
                          o.stock <= 0
                            ? 'font-semibold text-rose-600 dark:text-rose-400'
                            : o.stock <= 5
                              ? 'font-semibold text-amber-600 dark:text-amber-400'
                              : ''
                        }
                      >
                        {o.stock <= 0 ? 'Out' : o.stock}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 tabular-nums text-muted-foreground">{o.moq ?? '—'}</td>
                    <td className="px-4 py-3.5 text-muted-foreground">
                      {o.processingDays != null ? `${o.processingDays}d` : '—'}
                    </td>
                    <td className="px-4 py-3.5 tabular-nums text-muted-foreground">{formatNumber(o.soldCount)}</td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={o.status} map={OFFER_STATUS} />
                    </td>
                    <td className="px-4 py-3.5">
                      <OfferRowActions
                        offer={o}
                        busy={busyId === o.id}
                        onEdit={setEditing}
                        onToggleStatus={(offer) =>
                          patchOffer(
                            offer,
                            { status: offer.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' },
                            offer.status === 'ACTIVE' ? 'Offer paused' : 'Offer activated',
                            offer.status === 'ACTIVE'
                              ? 'Buyers no longer see this offer.'
                              : 'The offer is live on the product page again.'
                          )
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile stacked cards */}
          <div className="space-y-3 lg:hidden">
            {offers.map((o) => (
              <Card key={o.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <OfferThumb images={o.productImages} title={o.productTitle} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold" title={o.productTitle}>
                          {o.productTitle}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {o.storeName ?? 'No store'} · {formatNumber(o.soldCount)} sold
                        </p>
                      </div>
                    </div>
                    <StatusBadge status={o.status} map={OFFER_STATUS} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
                    <p>
                      <span className="font-semibold text-foreground">{formatUSD(o.price)}</span> / unit
                    </p>
                    <p>
                      Stock <span className="font-semibold text-foreground">{o.stock}</span>
                    </p>
                    <p>
                      MOQ <span className="font-semibold text-foreground">{o.moq ?? '—'}</span>
                    </p>
                    <p>
                      Lead <span className="font-semibold text-foreground">{o.processingDays ?? '—'}d</span>
                    </p>
                  </div>
                  <div className="mt-3 border-t pt-3">
                    <OfferRowActions
                      offer={o}
                      busy={busyId === o.id}
                      onEdit={setEditing}
                      onToggleStatus={(offer) =>
                        patchOffer(
                          offer,
                          { status: offer.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' },
                          offer.status === 'ACTIVE' ? 'Offer paused' : 'Offer activated'
                        )
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <NewOfferDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        organizationId={organizationId}
        onCreated={() => void refetch()}
      />
      <EditOfferDialog
        offer={editing}
        organizationId={organizationId}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={() => void refetch()}
      />
    </div>
  )
}

function OfferThumb({ images, title }: { images: string[]; title: string }) {
  const src = cardImage(images) ?? images?.[0]
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted">
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <PackageSearch size={16} className="text-muted-foreground" />
      )}
    </span>
  )
}

function OfferRowActions({
  offer,
  busy,
  onEdit,
  onToggleStatus,
}: {
  offer: OfferRow
  busy: boolean
  onEdit: (o: OfferRow) => void
  onToggleStatus: (o: OfferRow) => void
}) {
  if (busy) {
    return (
      <span className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
        <Loader2 size={14} className="animate-spin" /> Saving…
      </span>
    )
  }
  const isActive = offer.status === 'ACTIVE'
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <Button variant="outline" size="sm" className="h-8 rounded-lg" onClick={() => onEdit(offer)}>
        <Pencil size={13} className="mr-1.5" /> Edit
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-8 rounded-lg"
        onClick={() => onToggleStatus(offer)}
        disabled={offer.status === 'DRAFT' || offer.status === 'ARCHIVED'}
        title={
          offer.status === 'DRAFT' || offer.status === 'ARCHIVED'
            ? 'Activate this offer first to manage it'
            : isActive
              ? 'Hide this offer from buyers'
              : 'Make this offer live again'
        }
      >
        {isActive ? (
          <>
            <Archive size={13} className="mr-1.5" /> Pause
          </>
        ) : (
          <>
            <ArchiveRestore size={13} className="mr-1.5" /> Activate
          </>
        )}
      </Button>
    </div>
  )
}

/** Shared numeric-field bundle for the create/edit offer dialogs. */
function useOfferFields(initial?: { price: number; stock: number; moq: number | null; processingDays: number | null }) {
  const [price, setPrice] = useState(initial ? String(initial.price) : '')
  const [stock, setStock] = useState(initial ? String(initial.stock) : '')
  const [moq, setMoq] = useState(initial?.moq != null ? String(initial.moq) : '')
  const [processingDays, setProcessingDays] = useState(
    initial?.processingDays != null ? String(initial.processingDays) : ''
  )
  const reset = (next?: { price: number; stock: number; moq: number | null; processingDays: number | null }) => {
    setPrice(next ? String(next.price) : '')
    setStock(next ? String(next.stock) : '')
    setMoq(next?.moq != null ? String(next.moq) : '')
    setProcessingDays(next?.processingDays != null ? String(next.processingDays) : '')
  }
  return { price, setPrice, stock, setStock, moq, setMoq, processingDays, setProcessingDays, reset }
}

function NumberField({
  id,
  label,
  value,
  onChange,
  placeholder,
  hint,
  min,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  hint?: string
  min?: number
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={min ?? 0}
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-xl"
      />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

function NewOfferDialog({
  open,
  onOpenChange,
  organizationId,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  onCreated: () => void
}) {
  const [product, setProduct] = useState<PickedProduct | null>(null)
  const f = useOfferFields()
  const [status, setStatus] = useState<'ACTIVE' | 'DRAFT'>('ACTIVE')
  const [storeId, setStoreId] = useState<string>('none')
  const [submitting, setSubmitting] = useState(false)

  // Stores power the optional fulfilment-point select; the org's default
  // store is preselected (user can still pick "No store").
  const { data: storesData } = useApi<{ stores: StoreRow[]; settings: PlatformStoreSettings }>(
    open ? `/api/stores?organizationId=${organizationId}` : null,
    { skip: !open }
  )
  const activeStores = (storesData?.stores ?? []).filter((s) => !s.isArchived)
  const defaultStore = activeStores.find((s) => s.isDefault) ?? activeStores[0]
  const effectiveStoreId = storeId || defaultStore?.id || 'none'

  const pick = (p: PickedProduct) => {
    setProduct(p)
    if (!f.price) f.setPrice(String(p.price))
    if (p.moq != null && !f.moq) f.setMoq(String(p.moq))
  }

  const close = () => {
    onOpenChange(false)
    setProduct(null)
    f.reset()
    setStatus('ACTIVE')
    setStoreId('none')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!product) {
      toast({ title: 'Pick a product first', description: 'Search the shared catalog and choose the product to offer.', variant: 'destructive' })
      return
    }
    const price = Number(f.price)
    if (!Number.isFinite(price) || price <= 0) {
      toast({ title: 'Invalid price', description: 'Enter a price greater than zero.', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    const res = await apiRequest<{ offer: OfferRow }>('/api/offers', {
      method: 'POST',
      body: JSON.stringify({
        organizationId,
        productId: product.id,
        ...(effectiveStoreId !== 'none' ? { storeId: effectiveStoreId } : {}),
        price,
        ...(f.stock.trim() ? { stock: Math.max(0, Math.floor(Number(f.stock))) } : {}),
        ...(f.moq.trim() ? { moq: Math.max(1, Math.floor(Number(f.moq))) } : {}),
        ...(f.processingDays.trim() ? { processingDays: Math.max(0, Math.floor(Number(f.processingDays))) } : {}),
        status,
      }),
    })
    setSubmitting(false)
    if (!res.ok) {
      toast({ title: 'Could not create offer', description: res.error, variant: 'destructive' })
      return
    }
    toast({
      title: status === 'ACTIVE' ? 'Offer is live' : 'Offer saved as draft',
      description: `${product.title} — ${formatUSD(price)} per unit.`,
    })
    close()
    onCreated()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(v) : close())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New offer</DialogTitle>
          <DialogDescription>
            Put your company&apos;s pricing and stock on a product from the shared catalog.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          {/* Product picker */}
          <div className="space-y-1.5">
            <Label>Product</Label>
            {product ? (
              <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted">
                  {product.image ? (
                    <img src={product.image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <PackageSearch size={16} className="text-muted-foreground" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{product.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    Retail {formatUSD(product.price)}
                    {product.sellerName ? ` · listed by ${product.sellerName}` : ''}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-lg"
                  onClick={() => setProduct(null)}
                >
                  Change
                </Button>
              </div>
            ) : (
              <ProductPicker onPick={pick} label="Search products for your offer" placeholder="Search the shared catalog…" />
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField id="offer-price" label="Price (USD) *" value={f.price} onChange={f.setPrice} placeholder="e.g. 24.99" />
            <NumberField id="offer-stock" label="Stock" value={f.stock} onChange={f.setStock} placeholder="e.g. 250" min={0} />
            <NumberField id="offer-moq" label="Minimum order qty" value={f.moq} onChange={f.setMoq} placeholder="e.g. 10" hint="Buyers must order at least this many." min={1} />
            <NumberField id="offer-lead" label="Lead time (days)" value={f.processingDays} onChange={f.setProcessingDays} placeholder="e.g. 3" hint="Dispatch preparation before shipping." min={0} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="offer-store">Fulfilment store</Label>
              <Select value={effectiveStoreId} onValueChange={setStoreId}>
                <SelectTrigger id="offer-store" className="w-full rounded-xl">
                  <SelectValue placeholder="No store" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No store</SelectItem>
                  {activeStores.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                      {s.isDefault ? ' (default)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="offer-status">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as 'ACTIVE' | 'DRAFT')}>
                <SelectTrigger id="offer-status" className="w-full rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active — visible to buyers</SelectItem>
                  <SelectItem value="DRAFT">Draft — not visible yet</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-xl" onClick={close} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" className="rounded-xl" disabled={submitting || !product}>
              {submitting ? (
                <>
                  <Loader2 size={15} className="mr-1.5 animate-spin" /> Creating…
                </>
              ) : (
                'Create offer'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditOfferDialog({
  offer,
  organizationId,
  onOpenChange,
  onSaved,
}: {
  offer: OfferRow | null
  organizationId: string
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const f = useOfferFields(offer ?? undefined)
  const [submitting, setSubmitting] = useState(false)

  // Re-seed the fields whenever a different offer opens (and clear on close
  // so re-opening the same offer shows its latest saved values, not stale edits)
  const [seededId, setSeededId] = useState<string | null>(null)
  if (offer && seededId !== offer.id) {
    setSeededId(offer.id)
    f.reset(offer)
  } else if (!offer && seededId !== null) {
    setSeededId(null)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!offer) return
    const price = Number(f.price)
    if (!Number.isFinite(price) || price <= 0) {
      toast({ title: 'Invalid price', description: 'Enter a price greater than zero.', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    const res = await apiRequest(`/api/offers/${offer.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        organizationId,
        price,
        ...(f.stock.trim() ? { stock: Math.max(0, Math.floor(Number(f.stock))) } : {}),
        ...(f.moq.trim() ? { moq: Math.max(1, Math.floor(Number(f.moq))) } : {}),
        ...(f.processingDays.trim() ? { processingDays: Math.max(0, Math.floor(Number(f.processingDays))) } : {}),
      }),
    })
    setSubmitting(false)
    if (!res.ok) {
      toast({ title: 'Could not save changes', description: res.error, variant: 'destructive' })
      return
    }
    toast({ title: 'Offer updated', description: `${offer.productTitle} — ${formatUSD(price)} per unit.` })
    onOpenChange(false)
    onSaved()
  }

  return (
    <Dialog open={!!offer} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit offer</DialogTitle>
          <DialogDescription className="line-clamp-2">{offer?.productTitle}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField id="edit-price" label="Price (USD) *" value={f.price} onChange={f.setPrice} />
            <NumberField id="edit-stock" label="Stock" value={f.stock} onChange={f.setStock} min={0} />
            <NumberField id="edit-moq" label="Minimum order qty" value={f.moq} onChange={f.setMoq} min={1} />
            <NumberField id="edit-lead" label="Lead time (days)" value={f.processingDays} onChange={f.setProcessingDays} min={0} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" className="rounded-xl" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 size={15} className="mr-1.5 animate-spin" /> Saving…
                </>
              ) : (
                'Save changes'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// b. Product proposals — new catalog entries pending platform approval
// ══════════════════════════════════════════════════════════════════════════════

function ProposalsSub({ organizationId }: { organizationId: string }) {
  const { data, loading, error, refetch } = useApi<{ proposals: ProposalRow[] }>(
    `/api/proposals?organizationId=${organizationId}`
  )
  const proposals = data?.proposals ?? []
  const [newOpen, setNewOpen] = useState(false)

  const pending = proposals.filter((p) => p.approvalState === 'PENDING_APPROVAL').length
  const approved = proposals.filter((p) => p.approvalState === 'APPROVED').length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-stretch justify-between gap-3">
        <div className="flex flex-wrap items-stretch gap-2.5">
          <MiniStat icon={PackageSearch} label="Proposals" value={String(proposals.length)} />
          <MiniStat icon={ClipboardCheck} label="Pending" value={String(pending)} />
          <MiniStat icon={BadgeCheck} label="Approved" value={String(approved)} />
        </div>
        <Button className="rounded-xl" onClick={() => setNewOpen(true)}>
          <Plus size={15} className="mr-1.5" /> New proposal
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState icon={ShieldAlert} title="Couldn't load proposals" description={error}>
          <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
            Try again
          </Button>
        </EmptyState>
      ) : proposals.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title="No product proposals yet"
          description="Can't find a product in the catalog? Propose a new listing — after platform approval it joins the shared catalog with your first offer attached."
        >
          <Button className="rounded-xl" onClick={() => setNewOpen(true)}>
            <Plus size={15} className="mr-1.5" /> Propose a product
          </Button>
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {proposals.map((p, i) => (
            <motion.li
              key={p.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.2) }}
            >
              <Card className="overflow-hidden transition-colors hover:border-primary/30">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted">
                        {p.images?.[0] ? (
                          <img src={cardImage(p.images) ?? p.images[0]} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <PackageSearch size={16} className="text-muted-foreground" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-semibold" title={p.title}>
                            {p.title}
                          </p>
                          <StatusBadge status={p.approvalState} map={PROPOSAL_STATE} />
                        </div>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                          <span className="font-semibold text-foreground">{formatUSD(p.price)}</span>
                          <span aria-hidden>·</span>
                          <span>{p.categoryName}</span>
                          <span aria-hidden>·</span>
                          <span>submitted {timeAgo(p.createdAt)}</span>
                        </p>
                      </div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <p className="font-semibold text-foreground">{formatNumber(p.offerCount)} offer{p.offerCount === 1 ? '' : 's'}</p>
                      <p>on approval</p>
                    </div>
                  </div>
                  {p.description && (
                    <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{p.description}</p>
                  )}
                  {p.reviewNote && (
                    <p
                      className={cn(
                        'mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs font-medium',
                        p.approvalState === 'REJECTED'
                          ? 'border-destructive/30 bg-destructive/10 text-destructive'
                          : 'border-primary/30 bg-primary/5 text-primary'
                      )}
                    >
                      <ShieldAlert size={13} className="mt-px shrink-0" />
                      <span className="min-w-0 break-words">
                        <span className="font-bold">Platform review:</span> {p.reviewNote}
                      </span>
                    </p>
                  )}
                </CardContent>
              </Card>
            </motion.li>
          ))}
        </ul>
      )}

      <NewProposalDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        organizationId={organizationId}
        onCreated={() => void refetch()}
      />
    </div>
  )
}

function NewProposalDialog({
  open,
  onOpenChange,
  organizationId,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  onCreated: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [images, setImages] = useState('')
  const [offerPrice, setOfferPrice] = useState('')
  const [offerStock, setOfferStock] = useState('')
  const [offerLead, setOfferLead] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const { data: catData } = useApi<{ categories: CategoryDTO[] }>(open ? '/api/categories' : null, {
    skip: !open,
  })
  const categories = catData?.categories ?? []

  const close = () => {
    onOpenChange(false)
    setTitle('')
    setDescription('')
    setPrice('')
    setCategoryId('')
    setImages('')
    setOfferPrice('')
    setOfferStock('')
    setOfferLead('')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (title.trim().length < 3) {
      toast({ title: 'Title too short', description: 'Use at least 3 characters.', variant: 'destructive' })
      return
    }
    if (description.trim().length < 10) {
      toast({ title: 'Description too short', description: 'Describe the product in at least 10 characters.', variant: 'destructive' })
      return
    }
    if (!categoryId) {
      toast({ title: 'Pick a category', description: 'The proposal needs a catalog category.', variant: 'destructive' })
      return
    }
    const parsedPrice = Number(price)
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      toast({ title: 'Invalid price', description: 'Enter the suggested retail price.', variant: 'destructive' })
      return
    }
    const imageList = images
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12)

    setSubmitting(true)
    const res = await apiRequest<{ proposal: ProposalRow }>('/api/proposals', {
      method: 'POST',
      body: JSON.stringify({
        organizationId,
        title: title.trim(),
        description: description.trim(),
        price: parsedPrice,
        categoryId,
        images: imageList,
        ...(offerPrice.trim() || offerStock.trim() || offerLead.trim()
          ? {
              initialOffer: {
                ...(offerPrice.trim() ? { price: Math.max(0, Number(offerPrice)) } : {}),
                ...(offerStock.trim() ? { stock: Math.max(0, Math.floor(Number(offerStock))) } : {}),
                ...(offerLead.trim() ? { leadTimeDays: Math.max(0, Math.floor(Number(offerLead))) } : {}),
              },
            }
          : {}),
      }),
    })
    setSubmitting(false)
    if (!res.ok) {
      toast({ title: 'Could not submit proposal', description: res.error, variant: 'destructive' })
      return
    }
    toast({
      title: 'Proposal submitted',
      description: 'The platform team reviews new catalog entries — you can track the status here.',
    })
    close()
    onCreated()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(v) : close())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New product proposal</DialogTitle>
          <DialogDescription>
            Propose a new listing for the shared catalog. Once the platform approves it, your initial offer goes live.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="prop-title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="prop-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. TitanWall 550W Bifacial Solar Panel"
              className="rounded-xl"
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prop-desc">
              Description <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="prop-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Specs, use cases, what makes this product right for the catalog…"
              className="min-h-24 rounded-xl"
              maxLength={8000}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField id="prop-price" label="Suggested price (USD) *" value={price} onChange={setPrice} placeholder="e.g. 189.00" />
            <div className="space-y-1.5">
              <Label>
                Category <span className="text-destructive">*</span>
              </Label>
              <Select value={categoryId || undefined} onValueChange={setCategoryId}>
                <SelectTrigger className="w-full rounded-xl" aria-label="Proposal category">
                  <SelectValue placeholder="Pick a category…" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prop-images">Image URLs (optional)</Label>
            <Textarea
              id="prop-images"
              value={images}
              onChange={(e) => setImages(e.target.value)}
              placeholder={'https://…/panel-front.jpg\nhttps://…/panel-back.jpg'}
              className="min-h-16 rounded-xl font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">One URL per line — up to 12 images.</p>
          </div>

          <Separator />
          <div>
            <p className="text-sm font-semibold">Initial offer (optional)</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Your company&apos;s offer attached to the product the moment it&apos;s approved.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <NumberField id="prop-offer-price" label="Offer price" value={offerPrice} onChange={setOfferPrice} placeholder="USD" />
            <NumberField id="prop-offer-stock" label="Stock" value={offerStock} onChange={setOfferStock} placeholder="e.g. 25" min={0} />
            <NumberField id="prop-offer-lead" label="Lead days" value={offerLead} onChange={setOfferLead} placeholder="e.g. 14" min={0} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-xl" onClick={close} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" className="rounded-xl" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 size={15} className="mr-1.5 animate-spin" /> Submitting…
                </>
              ) : (
                'Submit proposal'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// c. Stores — org fulfilment points (multi-store platform feature)
// ══════════════════════════════════════════════════════════════════════════════

function StoresSub({ organizationId }: { organizationId: string }) {
  const { data, loading, error, refetch } = useApi<{ stores: StoreRow[]; settings: PlatformStoreSettings }>(
    `/api/stores?organizationId=${organizationId}`
  )
  const stores = (data?.stores ?? []).filter((s) => !s.isArchived)
  const settings = data?.settings

  const [newOpen, setNewOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [archiveFor, setArchiveFor] = useState<StoreRow | null>(null)
  const [archiving, setArchiving] = useState(false)

  const canAdd = settings ? settings.multiStoreEnabled || stores.length === 0 : stores.length === 0

  const patchStore = async (store: StoreRow, body: Record<string, unknown>, okTitle: string, okDescription?: string) => {
    setBusyId(store.id)
    const res = await apiRequest(`/api/stores/${store.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ organizationId, ...body }),
    })
    setBusyId(null)
    if (!res.ok) {
      toast({ title: 'Update failed', description: res.error, variant: 'destructive' })
      return
    }
    toast({ title: okTitle, description: okDescription })
    void refetch()
  }

  const confirmArchive = async () => {
    if (!archiveFor) return
    setArchiving(true)
    const res = await apiRequest(`/api/stores/${archiveFor.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ organizationId, archive: true }),
    })
    setArchiving(false)
    setArchiveFor(null)
    if (!res.ok) {
      toast({ title: 'Could not archive store', description: res.error, variant: 'destructive' })
      return
    }
    toast({ title: 'Store archived', description: 'Its offers were paused and the store is hidden from the workspace.' })
    void refetch()
  }

  return (
    <div className="space-y-4">
      {/* Platform multi-store status */}
      {settings && (
        <div
          className={cn(
            'flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border px-4 py-3 text-sm',
            settings.multiStoreEnabled
              ? 'border-primary/30 bg-primary/5'
              : 'border-amber-500/30 bg-amber-500/5'
          )}
        >
          <Boxes size={16} className={settings.multiStoreEnabled ? 'text-primary' : 'text-amber-600 dark:text-amber-400'} />
          <p className="min-w-0 flex-1 text-muted-foreground">
            {settings.multiStoreEnabled ? (
              <>
                <span className="font-semibold text-foreground">Multi-store is on.</span> Your company can operate up
                to <span className="font-semibold text-foreground">{settings.maxStoresPerCompany}</span> store
                {settings.maxStoresPerCompany === 1 ? '' : 's'}.
              </>
            ) : (
              <>
                <span className="font-semibold text-foreground">Multi-store is currently platform-disabled.</span>{' '}
                Each company operates a single store — contact Vendora to enable branches.
              </>
            )}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-stretch justify-between gap-3">
        <div className="flex flex-wrap items-stretch gap-2.5">
          <MiniStat icon={StoreIcon} label="Stores" value={String(stores.length)} />
          <MiniStat
            icon={Tag}
            label="Active offers"
            value={formatNumber(stores.reduce((sum, s) => sum + s.offerCount, 0))}
          />
        </div>
        {canAdd ? (
          <Button className="rounded-xl" onClick={() => setNewOpen(true)}>
            <Plus size={15} className="mr-1.5" /> Add store
          </Button>
        ) : (
          <Button className="rounded-xl" disabled title="Multi-store is disabled by the platform">
            <Plus size={15} className="mr-1.5" /> Add store
          </Button>
        )}
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState icon={ShieldAlert} title="Couldn't load stores" description={error}>
          <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
            Try again
          </Button>
        </EmptyState>
      ) : stores.length === 0 ? (
        <EmptyState
          icon={StoreIcon}
          title="No store yet"
          description="Create your company's first store — it's the fulfilment point your offers ship from."
        >
          <Button className="rounded-xl" onClick={() => setNewOpen(true)}>
            <Plus size={15} className="mr-1.5" /> Create store
          </Button>
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {stores.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(i * 0.05, 0.2) }}
            >
              <Card className="h-full transition-colors hover:border-primary/30">
                <CardContent className="flex h-full flex-col p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <StoreIcon size={19} />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="truncate font-semibold" title={s.name}>
                            {s.name}
                          </p>
                          {s.isDefault && (
                            <Badge className="rounded-full border-0 bg-primary/15 text-[10px] font-bold text-primary">
                              Default
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                          {s.city ? (
                            <>
                              <MapPin size={11} /> {s.city}
                            </>
                          ) : (
                            'No city set'
                          )}
                          <span aria-hidden>·</span>
                          added {timeAgo(s.createdAt)}
                        </p>
                      </div>
                    </div>
                    {busyId === s.id ? (
                      <Loader2 size={16} className="animate-spin text-muted-foreground" />
                    ) : (
                      <Switch
                        checked={s.isActive}
                        onCheckedChange={(v) =>
                          patchStore(s, { isActive: v }, v ? 'Store activated' : 'Store paused', v ? undefined : 'Paused stores stop receiving new orders.')
                        }
                        aria-label={s.isActive ? `Pause ${s.name}` : `Activate ${s.name}`}
                      />
                    )}
                  </div>
                  {s.description && (
                    <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{s.description}</p>
                  )}
                  <div className="mt-auto flex items-end justify-between gap-3 pt-4">
                    <p className="text-xs text-muted-foreground">
                      <span className="text-sm font-bold text-foreground tabular-nums">{formatNumber(s.offerCount)}</span>{' '}
                      active offer{s.offerCount === 1 ? '' : 's'}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setArchiveFor(s)}
                      disabled={stores.length <= 1}
                      title={stores.length <= 1 ? 'A company keeps at least one store' : `Archive ${s.name}`}
                    >
                      <Archive size={13} className="mr-1.5" /> Archive
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <NewStoreDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        organizationId={organizationId}
        onCreated={() => void refetch()}
      />

      <AlertDialog open={!!archiveFor} onOpenChange={(open) => !open && setArchiveFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive “{archiveFor?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The store is hidden from your workspace and its offers are paused. Existing orders stay intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep store</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={archiving}
              onClick={(e) => {
                e.preventDefault()
                void confirmArchive()
              }}
            >
              {archiving ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Archive size={14} className="mr-1.5" />}
              Archive store
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function NewStoreDialog({
  open,
  onOpenChange,
  organizationId,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const close = () => {
    onOpenChange(false)
    setName('')
    setCity('')
    setDescription('')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim().length < 2) {
      toast({ title: 'Store name required', description: 'Use at least 2 characters.', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    const res = await apiRequest<{ store: StoreRow }>('/api/stores', {
      method: 'POST',
      body: JSON.stringify({
        organizationId,
        name: name.trim(),
        ...(city.trim() ? { city: city.trim() } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
      }),
    })
    setSubmitting(false)
    if (!res.ok) {
      toast({ title: 'Could not create store', description: res.error, variant: 'destructive' })
      return
    }
    toast({ title: 'Store created', description: `${res.data?.store.name ?? name.trim()} is ready to fulfil offers.` })
    close()
    onCreated()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(v) : close())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a store</DialogTitle>
          <DialogDescription>
            A store is a fulfilment point — offers can ship from it and staff can be scoped to it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="store-name">
              Store name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="store-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Riyadh Depot"
              className="rounded-xl"
              maxLength={80}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="store-city">City</Label>
            <Input
              id="store-city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Riyadh"
              className="rounded-xl"
              maxLength={80}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="store-desc">Description</Label>
            <Textarea
              id="store-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What ships from this location…"
              className="min-h-16 rounded-xl"
              maxLength={2000}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-xl" onClick={close} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" className="rounded-xl" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 size={15} className="mr-1.5 animate-spin" /> Creating…
                </>
              ) : (
                'Create store'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// d. Sales orders — incoming orders carrying this org's offers
// ══════════════════════════════════════════════════════════════════════════════

function SalesOrdersSub({ organizationId }: { organizationId: string }) {
  const { data, loading, error, refetch } = useApi<{ salesOrders: SalesOrderRow[]; canFulfill?: boolean }>(
    `/api/organizations/${organizationId}/sales-orders`
  )
  const orders = useMemo(() => data?.salesOrders ?? [], [data])
  const totalValue = orders.reduce((sum, o) => sum + o.total, 0)
  const [busyId, setBusyId] = useState<string | null>(null)

  // Fulfillment advance (org.sales.fulfill) — the server re-authorizes every
  // PATCH; this flag only decides whether the button renders.
  const NEXT_STEP: Record<string, { status: string; label: string }> = {
    PAID: { status: 'PROCESSING', label: 'Start processing' },
    PROCESSING: { status: 'SHIPPED', label: 'Mark shipped' },
    SHIPPED: { status: 'DELIVERED', label: 'Mark delivered' },
  }
  const advanceStatus = async (orderId: string, next: string) => {
    setBusyId(orderId)
    const res = await apiRequest<{ order: { id: string } }>(`/api/orders/${orderId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: next }),
    })
    setBusyId(null)
    if (!res.ok) return toastApiError(res.error, 'Could not advance fulfillment')
    toast({ title: `Order marked ${next.toLowerCase()}`, description: 'The buyer has been notified.' })
    void refetch()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-stretch gap-2.5">
        <MiniStat icon={Receipt} label="Orders" value={String(orders.length)} />
        <MiniStat icon={Truck} label="Value" value={formatUSD(totalValue)} />
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState icon={ShieldAlert} title="Couldn't load sales orders" description={error}>
          <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
            Try again
          </Button>
        </EmptyState>
      ) : orders.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No sales yet"
          description="Orders that contain your company's offers land here — keep your offers active so buyers can find them."
        />
      ) : (
        <ul className="space-y-3">
          {orders.map((o, i) => (
            <motion.li
              key={o.orderId}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.2) }}
            >
              <Card className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3 sm:px-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Receipt size={16} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        Order <span className="font-mono text-xs">#{o.orderId.slice(-8)}</span>
                      </p>
                      <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                        <CalendarDays size={11} /> {formatDate(o.placedAt)}
                        <span aria-hidden>·</span>
                        <Users size={11} /> {o.buyerName}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {o.paymentTerms && (
                      <Badge className="rounded-full border-0 bg-muted text-[11px] font-semibold text-muted-foreground">
                        {o.paymentTerms}
                      </Badge>
                    )}
                    <StatusBadge status={o.orderStatus} map={ORDER_STATUS} />
                  </div>
                </div>
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {o.city && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={11} /> {o.city}
                        {o.country ? `, ${o.country}` : ''}
                      </span>
                    )}
                  </div>
                  <ul className="mt-3 divide-y rounded-xl border">
                    {o.items.map((it) => (
                      <li key={it.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{it.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {it.variantName ? `${it.variantName} · ` : ''}
                            {formatUSD(it.price)} × {it.quantity}
                          </p>
                        </div>
                        <p className="shrink-0 font-semibold tabular-nums">{formatUSD(it.price * it.quantity)}</p>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Order total
                    </p>
                    <div className="flex items-center gap-3">
                      <p className="text-base font-bold tabular-nums">{formatUSD(o.total)}</p>
                      {data?.canFulfill && NEXT_STEP[o.orderStatus] && (
                        <Button
                          size="sm"
                          className="h-8 rounded-full text-xs"
                          disabled={busyId === o.orderId}
                          onClick={() => void advanceStatus(o.orderId, NEXT_STEP[o.orderStatus].status)}
                        >
                          {busyId === o.orderId && <Loader2 size={12} className="mr-1 animate-spin" />}
                          {NEXT_STEP[o.orderStatus].label}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  )
}
