'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN · FINANCING — INSTITUTIONS. Financier organizations (BANK/MFI/EWALLET
// with a FinancierProfile): license, stats, verify / suspend actions.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import {
  BadgeCheck,
  Ban,
  Building2,
  Landmark,
  Loader2,
  SearchX,
  ShieldAlert,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import type { FinancierInstitutionDTO } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { Skeleton } from '@/components/ui/skeleton'
import { motion } from 'framer-motion'
import { SearchInput, StatusBadge, apiRequest, toastApiError, useDebounced } from '../shared'
import {
  ORG_TYPE_MAP,
  formatDate,
  formatMoney,
} from '../../financing/financing-shared'

const ORG_STATUS_MAP = {
  PENDING_VERIFICATION: { label: 'Pending', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  ACTIVE: { label: 'Active', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  SUSPENDED: { label: 'Suspended', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
  REJECTED: { label: 'Rejected', badge: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
}

export function InstitutionsSection() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [busy, setBusy] = useState<string | null>(null)

  const query = new URLSearchParams()
  if (debouncedSearch.trim()) query.set('search', debouncedSearch.trim())
  const { data, loading, error, refetch } = useApi<{ institutions: FinancierInstitutionDTO[] }>(
    `/api/admin/financing/institutions?${query.toString()}`
  )
  const institutions = data?.institutions ?? []

  const act = async (
    org: FinancierInstitutionDTO,
    action: 'verify' | 'suspend',
    e?: React.MouseEvent
  ) => {
    e?.stopPropagation()
    setBusy(org.organizationId)
    const res = await apiRequest(`/api/admin/financing/institutions/${org.organizationId}/${action}`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    setBusy(null)
    if (!res.ok) {
      toastApiError(res.error, action === 'verify' ? 'Verify failed' : 'Suspend failed')
      return
    }
    toast({
      title: action === 'verify' ? `${org.name} verified` : `${org.name} suspended`,
      description:
        action === 'verify'
          ? 'Their staff was notified — services can be published and receive applications.'
          : 'New applications are blocked until reactivation.',
    })
    void refetch()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-xs text-muted-foreground">
          Banks, microfinance institutions and e-wallets offering financing on Vendora. Verified
          institutions can publish services; suspended ones receive no new applications.
        </p>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search institutions…"
          ariaLabel="Search institutions"
          className="min-w-0 flex-1 md:max-w-72"
        />
      </div>

      {loading && (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-12 text-center">
          <ShieldAlert size={34} className="text-muted-foreground/40" />
          <p className="mt-3 text-sm font-semibold">Couldn't load the institutions</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">{error}</p>
          <Button variant="outline" className="mt-4 rounded-xl" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}

      {!loading && !error && institutions.length === 0 && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-12 text-center">
          <SearchX size={34} className="text-muted-foreground/40" />
          <p className="mt-3 text-sm font-semibold">No financier institutions yet</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            Organizations that register a financier profile will appear here.
          </p>
        </div>
      )}

      {!loading && !error && institutions.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {institutions.map((org, i) => (
            <motion.div
              key={org.organizationId}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, delay: i * 0.03 }}
            >
              <Card className="h-full">
                <CardContent className="flex h-full flex-col gap-3 p-4 sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Landmark size={19} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{org.name}</p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <StatusBadge status={org.orgType} map={ORG_TYPE_MAP} />
                          {org.profile.licenseNumber && <span>· {org.profile.licenseNumber}</span>}
                        </p>
                      </div>
                    </div>
                    <StatusBadge status={org.status} map={ORG_STATUS_MAP} />
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
                    <Stat label="Services" value={`${org.stats.activeServices} active`} />
                    <Stat label="Forwarded" value={String(org.stats.requestsForwarded)} />
                    <Stat label="Accreditations" value={String(org.stats.liveAccreditations)} />
                    <Stat label="Fees accrued" value={formatMoney(org.stats.feesAccrued)} />
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Building2 size={11} /> {org.profile.branchCount} branches
                    </span>
                    {org.profile.regulator && <span>· {org.profile.regulator}</span>}
                    {org.profile.contactEmail && <span className="truncate">· {org.profile.contactEmail}</span>}
                    {org.verifiedAt && <span>· verified {formatDate(org.verifiedAt)}</span>}
                  </div>

                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                    {org.status !== 'ACTIVE' ? (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" className="h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700" disabled={busy === org.organizationId}>
                            {busy === org.organizationId ? <Loader2 size={13} className="mr-1 animate-spin" /> : <BadgeCheck size={13} className="mr-1" />}
                            Verify
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Verify {org.name}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              The institution becomes ACTIVE and its staff is notified — services can
                              be published and receive applications.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="rounded-xl bg-emerald-600 hover:bg-emerald-700"
                              onClick={(e) => void act(org, 'verify', e)}
                            >
                              Verify institution
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ) : (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="outline" className="h-9 rounded-xl text-rose-600 hover:text-rose-700" disabled={busy === org.organizationId}>
                            {busy === org.organizationId ? <Loader2 size={13} className="mr-1 animate-spin" /> : <Ban size={13} className="mr-1" />}
                            Suspend
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Suspend {org.name}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              New applications are blocked until the institution is reactivated.
                              Existing agreements stay untouched.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="rounded-xl bg-rose-600 hover:bg-rose-700"
                              onClick={(e) => void act(org, 'suspend', e)}
                            >
                              Suspend institution
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate text-xs font-semibold">{value}</p>
    </div>
  )
}
