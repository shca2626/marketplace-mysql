'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FINANCING · OVERVIEW — my requests + accreditation status + documents summary
// cards + quick actions (the financing console landing page).
// ─────────────────────────────────────────────────────────────────────────────

import { motion } from 'framer-motion'
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  CheckCircle2,
  FileText,
  FolderLock,
  HandCoins,
  Hourglass,
  ScrollText,
  ShieldCheck,
} from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import type {
  AccreditationRequestSummaryDTO,
  AccountDocumentDTO,
  FinancingRequestSummaryDTO,
} from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ACC_STATUS_MAP,
  EmptyState,
  FIN_REQUEST_STATUS_MAP,
  formatDate,
  formatMoney,
  StatusBadge,
  timeAgo,
} from '@/components/marketplace/financing/financing-shared'

export function OverviewSection({
  onGoto,
}: {
  onGoto: (section: 'services' | 'requests' | 'accreditation' | 'documents' | 'agreements') => void
}) {
  const { data: reqData, loading: reqLoading } = useApi<{ requests: FinancingRequestSummaryDTO[] }>(
    '/api/financing/requests'
  )
  const { data: accData } = useApi<{ live: AccreditationRequestSummaryDTO[] }>('/api/accreditation/requests')
  const { data: docData } = useApi<{ documents: AccountDocumentDTO[] }>('/api/documents')

  const requests = reqData?.requests ?? []
  const activeRequests = requests.filter((r) => !['ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED'].includes(r.status))
  const inGate = requests.filter((r) =>
    ['SUBMITTED', 'UNDER_PLATFORM_REVIEW', 'RETURNED_FOR_COMPLETION'].includes(r.status)
  )
  const offered = requests.filter((r) => r.status === 'OFFERED')
  const liveAccreds = accData?.live ?? []
  const docs = docData?.documents ?? []
  const verifiedDocs = docs.filter((d) => d.status === 'VERIFIED').length
  const pendingDocs = docs.filter((d) => d.status === 'PENDING').length

  if (reqLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    )
  }

  const tiles = [
    { label: 'Active applications', value: activeRequests.length, sub: `${inGate.length} in platform gate`, icon: Hourglass, onClick: () => onGoto('requests') },
    { label: 'Offers waiting', value: offered.length, sub: offered.length > 0 ? 'review & accept' : 'none yet', icon: HandCoins, onClick: () => onGoto('requests') },
    { label: 'Live accreditations', value: liveAccreds.length, sub: liveAccreds.length > 0 ? 'RFQ participation unlocked' : 'apply as a company', icon: BadgeCheck, onClick: () => onGoto('accreditation') },
    {
      label: 'Verified documents',
      value: verifiedDocs,
      sub: pendingDocs > 0 ? `${pendingDocs} pending review` : docs.length === 0 ? 'vault is empty' : 'vault healthy',
      icon: FolderLock,
      onClick: () => onGoto('documents'),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((t) => (
          <motion.button
            key={t.label}
            type="button"
            onClick={t.onClick}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border bg-card p-4 text-left transition-shadow hover:shadow-md"
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <t.icon size={14} className="text-primary" />
              <span className="text-[11px] font-semibold uppercase tracking-wide">{t.label}</span>
            </div>
            <p className="mt-1.5 text-2xl font-bold">{t.value}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{t.sub}</p>
          </motion.button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* latest requests */}
        <Card>
          <CardContent className="space-y-3 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-bold">
                <FileText size={15} className="text-primary" /> My applications
              </h3>
              <Button variant="ghost" size="sm" className="h-9 rounded-lg text-xs" onClick={() => onGoto('requests')}>
                View all <ArrowRight size={12} className="ml-1" />
              </Button>
            </div>
            {requests.length === 0 ? (
              <EmptyState
                icon={Banknote}
                title="No applications yet"
                description="Browse financing services and apply in three steps."
              >
                <Button className="rounded-xl" onClick={() => onGoto('services')}>
                  Browse services
                </Button>
              </EmptyState>
            ) : (
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {requests.slice(0, 5).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onGoto('requests')}
                    className="flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-xs transition-colors hover:bg-muted/50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{r.serviceName}</span>
                      <span className="block truncate text-muted-foreground">
                        {r.number} · {formatMoney(r.amountRequested, r.currency)} · {timeAgo(r.createdAt)}
                      </span>
                    </span>
                    <StatusBadge status={r.status} map={FIN_REQUEST_STATUS_MAP} />
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* accreditation + documents */}
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-bold">
                  <BadgeCheck size={15} className="text-primary" /> Accreditation status
                </h3>
                <Button variant="ghost" size="sm" className="h-9 rounded-lg text-xs" onClick={() => onGoto('accreditation')}>
                  Manage <ArrowRight size={12} className="ml-1" />
                </Button>
              </div>
              {liveAccreds.length === 0 ? (
                <p className="rounded-xl border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                  No live accreditations — accredited companies unlock RFQ participation and auto-pass on covered
                  requirements.
                </p>
              ) : (
                <div className="space-y-2">
                  {liveAccreds.map((l) => (
                    <div key={l.id} className="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-xs">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">{l.serviceName}</span>
                        <span className="block truncate text-muted-foreground">
                          {l.financierOrgName} · until {formatDate(l.validUntil)}
                        </span>
                      </span>
                      <StatusBadge status={l.status} map={ACC_STATUS_MAP} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-bold">
                  <FolderLock size={15} className="text-primary" /> Document vault
                </h3>
                <Button variant="ghost" size="sm" className="h-9 rounded-lg text-xs" onClick={() => onGoto('documents')}>
                  Manage <ArrowRight size={12} className="ml-1" />
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border bg-muted/20 p-3">
                  <p className="text-lg font-bold">{verifiedDocs}</p>
                  <p className="flex items-center justify-center gap-1 text-[10.5px] font-semibold text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 size={11} /> verified
                  </p>
                </div>
                <div className="rounded-xl border bg-muted/20 p-3">
                  <p className="text-lg font-bold">{pendingDocs}</p>
                  <p className="text-[10.5px] font-semibold text-amber-700 dark:text-amber-400">pending</p>
                </div>
                <div className="rounded-xl border bg-muted/20 p-3">
                  <p className="text-lg font-bold">{docs.length - verifiedDocs - pendingDocs}</p>
                  <p className="text-[10.5px] font-semibold text-rose-700 dark:text-rose-400">rejected</p>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                <ShieldCheck size={11} className="mr-1 inline" />
                Upload once — every application reuses the same verified documents.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
              <div className="flex items-center gap-2.5">
                <ScrollText size={16} className="text-primary" />
                <div>
                  <p className="text-sm font-bold">Agreements</p>
                  <p className="text-[11px] text-muted-foreground">Accepted offers, schedules & events</p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="h-10 rounded-xl" onClick={() => onGoto('agreements')}>
                Open <ArrowRight size={12} className="ml-1" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
