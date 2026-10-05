'use client'

import { useState } from 'react'
import {
  BadgeCheck,
  Ban,
  Loader2,
  Percent,
  RotateCcw,
  SearchX,
  ShieldAlert,
  ShieldQuestion,
  Star,
  Store,
  Users,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { formatDate, formatNumber, formatUSD, initials, timeAgo } from '@/lib/format'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  AdminEmptyState,
  SearchInput,
  StatusBadge,
  apiRequest,
  toastApiError,
  useDebounced,
} from './shared'

// ── Types (contract of GET /api/admin/vendors) ──────────────────────────────

type SellerVerificationState = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED'

interface VendorRow {
  id: string
  name: string
  email: string
  storeName: string | null
  storeBio: string | null
  image: string | null
  status: 'ACTIVE' | 'SUSPENDED'
  suspendedAt: string | null
  verified: boolean
  verifiedAt: string | null
  commissionRate: number | null
  memberSince: string
  // Phase 7.0 — the seller-org tenant + its verification state (S3:
  // verification lives on SellerProfile, not Organization.status).
  sellerOrg: {
    organizationId: string
    organizationName: string
    organizationStatus: string
    verificationState: SellerVerificationState
    verifiedAt: string | null
  } | null
  products: number
  unitsSold: number
  gmv: number
  rating: number
  reviews: number
}

interface VendorsResponse {
  total: number
  page: number
  pages: number
  vendors: VendorRow[]
}

const VENDOR_STATUS_MAP: Record<string, { label: string; badge: string }> = {
  ACTIVE: { label: 'Active', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  SUSPENDED: { label: 'Suspended', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
}

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'SUSPENDED', label: 'Suspended' },
]

const VERIFIED_FILTERS = [
  { value: '', label: 'Any verification' },
  { value: 'yes', label: 'Verified' },
  { value: 'no', label: 'Unverified' },
]

// Phase 7.0 — seller-org store verification pill (SellerProfile state).
const VERIFICATION_STATE_MAP: Record<
  SellerVerificationState,
  { label: string; badge: string; hint: string }
> = {
  VERIFIED: {
    label: 'Verified store',
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    hint: 'The seller org passed verification — RFQ routing trusts this store.',
  },
  PENDING: {
    label: 'Review pending',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    hint: 'Documents submitted — awaiting your decision.',
  },
  REJECTED: {
    label: 'Rejected',
    badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
    hint: 'Verification was refused — the store can still operate unverified.',
  },
  UNVERIFIED: {
    label: 'Unverified store',
    badge: 'border border-dashed bg-background text-muted-foreground',
    hint: 'No verification attempt recorded for this seller org.',
  },
}

const PAGE_SIZE = 20

// ── Vendors tab ──────────────────────────────────────────────────────────────

export function VendorsTab() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [statusFilter, setStatusFilter] = useState('')
  const [verifiedFilter, setVerifiedFilter] = useState('')
  const [page, setPage] = useState(1)

  // Lifecycle-action UI state
  const [busyId, setBusyId] = useState<string | null>(null)
  const [suspendFor, setSuspendFor] = useState<VendorRow | null>(null)
  const [suspendReason, setSuspendReason] = useState('')
  const [commissionFor, setCommissionFor] = useState<VendorRow | null>(null)

  // Phase 7.0 — seller-org verification dialog
  const [verificationFor, setVerificationFor] = useState<VendorRow | null>(null)

  // Render-time keyed sync: jump back to page 1 whenever filters change
  const filterKey = `${debouncedSearch}|${statusFilter}|${verifiedFilter}`
  const [appliedKey, setAppliedKey] = useState<string | null>(null)
  if (appliedKey !== filterKey) {
    setAppliedKey(filterKey)
    setPage(1)
  }

  // Directory list (filtered + paginated)
  const query = new URLSearchParams()
  if (debouncedSearch.trim()) query.set('q', debouncedSearch.trim())
  if (statusFilter) query.set('status', statusFilter)
  if (verifiedFilter) query.set('verified', verifiedFilter)
  query.set('page', String(page))
  query.set('limit', String(PAGE_SIZE))
  const {
    data,
    loading,
    error,
    refetch: refetchList,
  } = useApi<VendorsResponse>(`/api/admin/vendors?${query.toString()}`)
  const vendors = data?.vendors ?? []

  // Header-strip counts — one tiny request per bucket so the numbers stay
  // exact regardless of the filters applied to the directory below.
  const { data: allData, refetch: refetchAll } = useApi<{ total: number }>('/api/admin/vendors?limit=1')
  const { data: activeData, refetch: refetchActive } = useApi<{ total: number }>('/api/admin/vendors?status=ACTIVE&limit=1')
  const { data: suspendedData, refetch: refetchSuspended } = useApi<{ total: number }>('/api/admin/vendors?status=SUSPENDED&limit=1')
  const { data: unverifiedData, refetch: refetchUnverified } = useApi<{ total: number }>('/api/admin/vendors?verified=no&limit=1')

  const refreshCounts = () => {
    void refetchAll()
    void refetchActive()
    void refetchSuspended()
    void refetchUnverified()
  }

  const patchVendor = async (
    vendor: VendorRow,
    body: Record<string, unknown>,
    okTitle: string,
    okDescription?: string
  ): Promise<boolean> => {
    setBusyId(vendor.id)
    const res = await apiRequest(`/api/admin/vendors/${vendor.id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
    setBusyId(null)
    if (!res.ok) {
      toastApiError(res.error)
      return false
    }
    toast({ title: okTitle, description: okDescription })
    void refetchList()
    refreshCounts()
    return true
  }

  const openSuspend = (vendor: VendorRow) => {
    setSuspendReason('')
    setSuspendFor(vendor)
  }

  const confirmSuspend = async () => {
    if (!suspendFor) return
    const vendor = suspendFor
    setSuspendFor(null)
    await patchVendor(
      vendor,
      { action: 'suspend', reason: suspendReason.trim() || undefined },
      `${displayName(vendor)} suspended`,
      'Listings hidden from the storefront and sign-in blocked.'
    )
  }

  const busy = (id: string) => busyId === id

  const countTiles = [
    {
      icon: Users,
      label: 'Total vendors',
      value: allData?.total,
      onClick: () => {
        setStatusFilter('')
        setVerifiedFilter('')
      },
      active: statusFilter === '' && verifiedFilter === '',
    },
    {
      icon: BadgeCheck,
      label: 'Active',
      value: activeData?.total,
      onClick: () => setStatusFilter('ACTIVE'),
      active: statusFilter === 'ACTIVE',
    },
    {
      icon: Ban,
      label: 'Suspended',
      value: suspendedData?.total,
      onClick: () => setStatusFilter('SUSPENDED'),
      active: statusFilter === 'SUSPENDED',
    },
    {
      icon: ShieldQuestion,
      label: 'Unverified',
      value: unverifiedData?.total,
      onClick: () => setVerifiedFilter('no'),
      active: verifiedFilter === 'no',
    },
  ]

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-5">
        {/* Count strip */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {countTiles.map((tile) => (
            <button
              key={tile.label}
              type="button"
              onClick={tile.onClick}
              aria-label={`Show ${tile.label.toLowerCase()} vendors`}
              className={cnCard(tile.active)}
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {tile.label}
                </p>
                <tile.icon size={15} className="shrink-0 text-primary" />
              </div>
              <p className="mt-1.5 text-2xl font-extrabold tabular-nums">
                {tile.value ?? '—'}
              </p>
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search vendors — store, owner, email…"
            ariaLabel="Search vendors"
            className="min-w-0 flex-1 xl:max-w-80"
          />
          <div className="flex flex-wrap items-center gap-2.5">
            <Select value={statusFilter || 'any-status'} onValueChange={(v) => setStatusFilter(v === 'any-status' ? '' : v)}>
              <SelectTrigger className="h-10 w-40 rounded-xl" aria-label="Filter by status">
                <SelectValue placeholder="Any status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((f) => (
                  <SelectItem key={f.value || 'any-status'} value={f.value || 'any-status'}>
                    {f.label === 'All' ? 'Any status' : f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={verifiedFilter || 'any-verified'} onValueChange={(v) => setVerifiedFilter(v === 'any-verified' ? '' : v)}>
              <SelectTrigger className="h-10 w-44 rounded-xl" aria-label="Filter by verification">
                <SelectValue placeholder="Any verification" />
              </SelectTrigger>
              <SelectContent>
                {VERIFIED_FILTERS.map((f) => (
                  <SelectItem key={f.value || 'any-verified'} value={f.value || 'any-verified'}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl" />
            ))}
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <AdminEmptyState icon={ShieldAlert} title="Couldn't load vendors" description={error}>
            <Button variant="outline" className="rounded-xl" onClick={() => void refetchList()}>
              Try again
            </Button>
          </AdminEmptyState>
        )}

        {/* Empty */}
        {!loading && !error && vendors.length === 0 && (
          <AdminEmptyState
            icon={SearchX}
            title={debouncedSearch.trim() || statusFilter || verifiedFilter ? 'No vendors match' : 'No vendors yet'}
            description={
              debouncedSearch.trim() || statusFilter || verifiedFilter
                ? 'Try clearing the search or switching the filters.'
                : 'Sellers who register on the platform will appear here.'
            }
          />
        )}

        {/* Desktop table */}
        {!loading && !error && vendors.length > 0 && (
          <div className="hidden overflow-x-auto rounded-2xl border lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-medium">Vendor</th>
                  <th scope="col" className="px-4 py-3 font-medium">Performance</th>
                  <th scope="col" className="px-4 py-3 font-medium">Commission</th>
                  <th scope="col" className="px-4 py-3 font-medium">Verification</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((vendor) => (
                  <tr key={vendor.id} className="border-b transition-colors last:border-0 hover:bg-accent/50">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 shrink-0 rounded-xl border">
                          {vendor.image ? (
                            <AvatarImage src={vendor.image} alt={displayName(vendor)} />
                          ) : null}
                          <AvatarFallback className="rounded-xl bg-primary/10 text-xs font-extrabold text-primary">
                            {initials(displayName(vendor))}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{displayName(vendor)}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {vendor.name} · {vendor.email}
                          </p>
                          {vendor.sellerOrg && (
                            <p
                              className="truncate text-xs text-muted-foreground"
                              title={`${vendor.sellerOrg.organizationName} — ${vendor.sellerOrg.organizationStatus}`}
                            >
                              Org: {vendor.sellerOrg.organizationName}
                            </p>
                          )}
                          <p className="truncate text-xs text-muted-foreground" title={formatDate(vendor.memberSince)}>
                            Member since {formatDate(vendor.memberSince)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <VendorStats vendor={vendor} />
                    </td>
                    <td className="px-4 py-3.5">
                      {vendor.commissionRate != null ? (
                        <span className="font-semibold tabular-nums">{vendor.commissionRate}%</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Platform default</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <VerificationCell vendor={vendor} />
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadgeCell vendor={vendor} />
                    </td>
                    <td className="px-4 py-3.5">
                      <VendorActions
                        vendor={vendor}
                        busy={busy(vendor.id)}
                        onVerify={(v, action) =>
                          patchVendor(
                            v,
                            { action },
                            action === 'verify' ? `${displayName(v)} verified` : 'Verification removed',
                            action === 'verify' ? 'RFQ routing can now auto-approve this vendor.' : undefined
                          )
                        }
                        onSetVerification={setVerificationFor}
                        onCommission={setCommissionFor}
                        onSuspend={openSuspend}
                        onReactivate={(v) =>
                          patchVendor(v, { action: 'reactivate' }, `${displayName(v)} reactivated`, 'Storefront and sign-in restored.')
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Mobile + tablet stacked cards */}
        {!loading && !error && vendors.length > 0 && (
          <div className="space-y-3 lg:hidden">
            {vendors.map((vendor) => (
              <Card key={vendor.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar className="h-10 w-10 shrink-0 rounded-xl border">
                        {vendor.image ? (
                          <AvatarImage src={vendor.image} alt={displayName(vendor)} />
                        ) : null}
                        <AvatarFallback className="rounded-xl bg-primary/10 text-xs font-extrabold text-primary">
                          {initials(displayName(vendor))}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{displayName(vendor)}</p>
                        <p className="truncate text-xs text-muted-foreground">{vendor.email}</p>
                        {vendor.sellerOrg && (
                          <p
                            className="truncate text-xs text-muted-foreground"
                            title={`${vendor.sellerOrg.organizationName} — ${vendor.sellerOrg.organizationStatus}`}
                          >
                            Org: {vendor.sellerOrg.organizationName}
                          </p>
                        )}
                        <p className="truncate text-xs text-muted-foreground">
                          Since {formatDate(vendor.memberSince)}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <StatusBadgeCell vendor={vendor} />
                      <VerificationCell vendor={vendor} compact />
                    </div>
                  </div>
                  <div className="mt-3">
                    <VendorStats vendor={vendor} />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      Commission:{' '}
                      {vendor.commissionRate != null ? (
                        <span className="font-semibold tabular-nums text-foreground">{vendor.commissionRate}%</span>
                      ) : (
                        'platform default'
                      )}
                    </span>
                  </div>
                  <div className="mt-3 border-t pt-3">
                    <VendorActions
                      vendor={vendor}
                      busy={busy(vendor.id)}
                      onVerify={(v, action) =>
                        patchVendor(
                          v,
                          { action },
                          action === 'verify' ? `${displayName(v)} verified` : 'Verification removed',
                          action === 'verify' ? 'RFQ routing can now auto-approve this vendor.' : undefined
                        )
                      }
                      onSetVerification={setVerificationFor}
                      onCommission={setCommissionFor}
                      onSuspend={openSuspend}
                      onReactivate={(v) =>
                        patchVendor(v, { action: 'reactivate' }, `${displayName(v)} reactivated`, 'Storefront and sign-in restored.')
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Pagination */}
        {!loading && !error && data && data.pages > 1 && (
          <Pager page={page} pages={data.pages} total={data.total} onPage={setPage} />
        )}

        {/* Suspend confirm */}
        <AlertDialog open={!!suspendFor} onOpenChange={(open) => !open && setSuspendFor(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Suspend {suspendFor ? displayName(suspendFor) : ''}?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3">
                  <p>
                    Their listings disappear from every public surface, and their sign-in is blocked until you
                    reactivate the account. Order history is preserved.
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="suspend-reason" className="text-xs text-muted-foreground">
                      Reason (optional — recorded in the audit log)
                    </Label>
                    <Textarea
                      id="suspend-reason"
                      value={suspendReason}
                      onChange={(e) => setSuspendReason(e.target.value.slice(0, 300))}
                      placeholder="e.g. Policy violation — counterfeit report #1042"
                      className="min-h-[72px]"
                    />
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep active</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={(e) => {
                  e.preventDefault()
                  void confirmSuspend()
                }}
              >
                <Ban size={14} className="mr-1.5" /> Suspend vendor
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Commission dialog */}
        <CommissionDialog
          vendor={commissionFor}
          onClose={() => setCommissionFor(null)}
          saving={!!commissionFor && busy(commissionFor.id)}
          onSave={async (rate) => {
            if (!commissionFor) return
            const ok = await patchVendor(
              commissionFor,
              { action: 'set-commission', rate },
              rate == null ? 'Commission reset to platform default' : `Commission set to ${rate}%`,
              `Applies to ${displayName(commissionFor)}'s next payout.`
            )
            if (ok) setCommissionFor(null)
          }}
        />

        {/* Phase 7.0 — seller-org verification dialog */}
        <VerificationDialog
          vendor={verificationFor}
          onClose={() => setVerificationFor(null)}
          onSaved={() => {
            void refetchList()
            refreshCounts()
          }}
        />
      </div>
    </TooltipProvider>
  )
}

// ── Row pieces ───────────────────────────────────────────────────────────────

function displayName(vendor: VendorRow): string {
  return vendor.storeName?.trim() || vendor.name
}

function cnCard(active: boolean): string {
  return [
    'rounded-2xl border bg-card p-4 text-left transition-all hover:shadow-md',
    active ? 'border-primary/60 ring-1 ring-primary/30' : 'hover:border-primary/40',
  ].join(' ')
}

function VendorStats({ vendor }: { vendor: VendorRow }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Listings</p>
        <p className="mt-0.5 font-semibold tabular-nums">{formatNumber(vendor.products)}</p>
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Units sold</p>
        <p className="mt-0.5 font-semibold tabular-nums">{formatNumber(vendor.unitsSold)}</p>
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">GMV</p>
        <p className="mt-0.5 font-semibold tabular-nums">{formatUSD(vendor.gmv)}</p>
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Rating</p>
        <p className="mt-0.5 flex items-center gap-1 font-semibold tabular-nums">
          {vendor.rating > 0 ? (
            <>
              <Star size={11} className="fill-amber-400 text-amber-400" />
              {vendor.rating.toFixed(1)}
              <span className="font-normal text-muted-foreground">({vendor.reviews})</span>
            </>
          ) : (
            <span className="font-normal text-muted-foreground">No reviews</span>
          )}
        </p>
      </div>
    </div>
  )
}

function VerifiedBadge({ verified, verifiedAt }: { verified: boolean; verifiedAt: string | null }) {
  if (verified) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className="shrink-0 rounded-full border-0 bg-emerald-100 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            <BadgeCheck size={12} className="mr-1" />
            Verified
          </Badge>
        </TooltipTrigger>
        <TooltipContent>Verification stamp{verifiedAt ? ` — ${formatDate(verifiedAt)}` : ''}</TooltipContent>
      </Tooltip>
    )
  }
  return (
    <Badge className="shrink-0 rounded-full border border-dashed bg-background text-[11px] font-semibold text-muted-foreground">
      Unverified
    </Badge>
  )
}

// Phase 7.0 — store verification cell: the seller-org state pill plus the
// legacy verified badge (derived from the new state when a seller org exists).
function VerificationCell({ vendor, compact = false }: { vendor: VendorRow; compact?: boolean }) {
  const state = vendor.sellerOrg?.verificationState ?? null
  const legacyVerified = vendor.sellerOrg ? state === 'VERIFIED' : vendor.verified
  return (
    <div className="flex flex-col items-start gap-1.5">
      {state ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              className={cn(
                'shrink-0 rounded-full border-0 text-[11px] font-semibold',
                VERIFICATION_STATE_MAP[state].badge
              )}
            >
              {VERIFICATION_STATE_MAP[state].label}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            Seller-org verification
            {vendor.sellerOrg?.verifiedAt && state === 'VERIFIED'
              ? ` — ${formatDate(vendor.sellerOrg.verifiedAt)}`
              : ''}
          </TooltipContent>
        </Tooltip>
      ) : (
        <Badge className="shrink-0 rounded-full border border-dashed bg-background text-[11px] font-semibold text-muted-foreground">
          No seller org
        </Badge>
      )}
      {!compact && <VerifiedBadge verified={legacyVerified} verifiedAt={vendor.verifiedAt} />}
    </div>
  )
}

function StatusBadgeCell({ vendor }: { vendor: VendorRow }) {
  if (vendor.status === 'SUSPENDED') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <StatusBadge status="SUSPENDED" map={VENDOR_STATUS_MAP} />
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {vendor.suspendedAt ? `Suspended ${formatDate(vendor.suspendedAt)}` : 'Suspended'}
          {vendor.suspendedAt ? ` · ${timeAgo(vendor.suspendedAt)}` : ''} — listings hidden, sign-in blocked
        </TooltipContent>
      </Tooltip>
    )
  }
  return <StatusBadge status={vendor.status} map={VENDOR_STATUS_MAP} />
}

function VendorActions({
  vendor,
  busy,
  onVerify,
  onSetVerification,
  onCommission,
  onSuspend,
  onReactivate,
}: {
  vendor: VendorRow
  busy: boolean
  onVerify: (vendor: VendorRow, action: 'verify' | 'unverify') => void
  onSetVerification: (vendor: VendorRow) => void
  onCommission: (vendor: VendorRow) => void
  onSuspend: (vendor: VendorRow) => void
  onReactivate: (vendor: VendorRow) => void
}) {
  if (busy) {
    return (
      <span className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
        <Loader2 size={14} className="animate-spin" /> Working…
      </span>
    )
  }
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <Button
        variant="outline"
        size="sm"
        className="h-8 rounded-lg"
        onClick={() => onVerify(vendor, vendor.verified ? 'unverify' : 'verify')}
        aria-label={vendor.verified ? `Remove verification from ${displayName(vendor)}` : `Verify ${displayName(vendor)}`}
      >
        {vendor.verified ? <BadgeCheck size={13} className="mr-1.5 opacity-60" /> : <BadgeCheck size={13} className="mr-1.5 text-emerald-600 dark:text-emerald-400" />}
        {vendor.verified ? 'Unverify' : 'Verify'}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-8 rounded-lg border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
        onClick={() => onSetVerification(vendor)}
        aria-label={`Set the store verification state for ${displayName(vendor)}`}
      >
        <ShieldQuestion size={13} className="mr-1.5" />
        Set verification
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-8 rounded-lg"
        onClick={() => onCommission(vendor)}
        aria-label={`Set commission for ${displayName(vendor)}`}
      >
        <Percent size={13} className="mr-1.5" />
        Commission
      </Button>
      {vendor.status === 'ACTIVE' ? (
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-lg border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => onSuspend(vendor)}
          aria-label={`Suspend ${displayName(vendor)}`}
        >
          <Ban size={13} className="mr-1.5" /> Suspend
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-lg border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950"
          onClick={() => onReactivate(vendor)}
          aria-label={`Reactivate ${displayName(vendor)}`}
        >
          <RotateCcw size={13} className="mr-1.5" /> Reactivate
        </Button>
      )}
    </div>
  )
}

// ── Commission dialog ────────────────────────────────────────────────────────

function CommissionDialog({
  vendor,
  onClose,
  saving,
  onSave,
}: {
  vendor: VendorRow | null
  onClose: () => void
  saving: boolean
  onSave: (rate: number | null) => void
}) {
  const [input, setInput] = useState('')
  const [useDefault, setUseDefault] = useState(false)
  const [initializedFor, setInitializedFor] = useState<VendorRow | null>(null)

  // Re-seed the fields every time a different vendor opens the dialog
  // (render-time sync, the OrgManageDialog pattern)
  if (vendor && initializedFor !== vendor) {
    setInitializedFor(vendor)
    setInput(vendor.commissionRate != null ? String(vendor.commissionRate) : '')
    setUseDefault(vendor.commissionRate == null)
  }

  if (!vendor) return null

  const rate = Number(input)
  const valid = useDefault || (input.trim() !== '' && Number.isFinite(rate) && rate >= 0 && rate <= 90)

  return (
    <Dialog open={!!vendor} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Percent size={16} className="text-primary" /> Commission — {displayName(vendor)}
          </DialogTitle>
          <DialogDescription>
            Overrides the platform default for this vendor&apos;s payouts. Applies to future settlement batches.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border p-3.5">
            <div className="min-w-0">
              <Label htmlFor="vendor-use-default" className="text-sm font-medium">
                Use platform default
              </Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Clears the override — this vendor settles at the global rate.
              </p>
            </div>
            <Switch
              id="vendor-use-default"
              checked={useDefault}
              onCheckedChange={setUseDefault}
              aria-label="Use platform default commission rate"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vendor-commission" className="text-xs text-muted-foreground">
              Custom commission rate (0–90%)
            </Label>
            <div className="relative">
              <Input
                id="vendor-commission"
                type="number"
                min={0}
                max={90}
                step="0.5"
                value={useDefault ? '' : input}
                disabled={useDefault}
                onChange={(e) => setInput(e.target.value)}
                placeholder="e.g. 12.5"
                className="h-10 rounded-xl pr-8"
                aria-describedby="vendor-commission-hint"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
            </div>
            <p id="vendor-commission-hint" className="text-xs text-muted-foreground">
              {useDefault
                ? 'Overridden — the platform default applies.'
                : 'Deducted from the vendor’s gross sales on each payout batch.'}
            </p>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" className="rounded-xl" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button className="rounded-xl" disabled={!valid || saving} onClick={() => onSave(useDefault ? null : rate)}>
            {saving ? <Loader2 size={15} className="mr-2 animate-spin" /> : null}
            Save commission
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Seller-org verification dialog (Phase 7.0) ────────────────────────────────

const VERIFICATION_STATE_ORDER: SellerVerificationState[] = ['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED']

function VerificationDialog({
  vendor,
  onClose,
  onSaved,
}: {
  vendor: VendorRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const [state, setState] = useState<SellerVerificationState>('UNVERIFIED')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [initializedFor, setInitializedFor] = useState<VendorRow | null>(null)

  // Re-seed the fields every time a different vendor opens the dialog
  // (render-time keyed sync, the CommissionDialog pattern)
  if (vendor && initializedFor !== vendor) {
    setInitializedFor(vendor)
    setState(vendor.sellerOrg?.verificationState ?? 'UNVERIFIED')
    setNote('')
    setError(null)
  }
  if (!vendor && initializedFor !== null) setInitializedFor(null)

  const save = async () => {
    if (!vendor) return
    setSaving(true)
    setError(null)
    const res = await apiRequest<{ verification: { verificationState: SellerVerificationState } }>(
      `/api/admin/vendors/${vendor.id}/verification`,
      {
        method: 'PATCH',
        body: JSON.stringify({ state, note: note.trim() || undefined }),
      }
    )
    setSaving(false)
    if (!res.ok) {
      setError(res.error ?? 'Failed to set the verification state')
      return
    }
    toast({
      title: `${displayName(vendor)} — store ${state.toLowerCase()}`,
      description:
        state === 'VERIFIED'
          ? 'The seller org is verified. RFQ routing and trust signals pick this up immediately.'
          : `Seller-org verification set to ${state}.`,
    })
    onClose()
    onSaved()
  }

  return (
    <Dialog open={!!vendor} onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldQuestion size={16} className="text-primary" /> Store verification —{' '}
            {vendor ? displayName(vendor) : ''}
          </DialogTitle>
          <DialogDescription>
            The seller-org verification state (Phase 7.0). Verification is separate from suspension — the
            organization&apos;s operational status is untouched.
            {vendor?.sellerOrg ? ` Org: ${vendor.sellerOrg.organizationName}.` : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <RadioGroup
            value={state}
            onValueChange={(v) => setState(v as SellerVerificationState)}
            className="gap-2.5"
            aria-label="Verification state"
          >
            {VERIFICATION_STATE_ORDER.map((s) => (
              <Label
                key={s}
                htmlFor={`verification-state-${s}`}
                className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors hover:border-primary/40"
              >
                <RadioGroupItem id={`verification-state-${s}`} value={s} className="mt-0.5" />
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <Badge className={cn('rounded-full border-0 text-[11px] font-semibold', VERIFICATION_STATE_MAP[s].badge)}>
                      {VERIFICATION_STATE_MAP[s].label}
                    </Badge>
                    {vendor?.sellerOrg?.verificationState === s && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        current
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    {VERIFICATION_STATE_MAP[s].hint}
                  </span>
                </span>
              </Label>
            ))}
          </RadioGroup>
          <div className="space-y-1.5">
            <Label htmlFor="verification-note" className="text-xs text-muted-foreground">
              Note (optional — recorded with the decision)
            </Label>
            <Textarea
              id="verification-note"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 1000))}
              placeholder="e.g. Trade license + tax certificate matched — approved"
              className="min-h-[72px]"
            />
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive"
            >
              {error}
            </p>
          )}
        </div>
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" className="rounded-xl" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button className="rounded-xl" disabled={saving} onClick={() => void save()}>
            {saving ? <Loader2 size={15} className="mr-2 animate-spin" /> : null}
            Save state
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Pager ──────────────────────────────────────────────────────────────────────

function Pager({
  page,
  pages,
  total,
  onPage,
}: {
  page: number
  pages: number
  total: number
  onPage: (p: number) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">
        Page <span className="font-semibold tabular-nums text-foreground">{page}</span> of{' '}
        <span className="font-semibold tabular-nums text-foreground">{pages}</span> · {total} total
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-lg"
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          Prev
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-lg"
          onClick={() => onPage(Math.min(pages, page + 1))}
          disabled={page >= pages}
          aria-label="Next page"
        >
          Next
        </Button>
      </div>
    </div>
  )
}
