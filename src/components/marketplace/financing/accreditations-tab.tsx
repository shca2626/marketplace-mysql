'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ACCREDITATIONS — the applicant company's accreditation programs: live grants
// (GET /api/accreditation/valid — the RFQ unlock), the request history
// (GET /api/accreditation/requests), detail reuse and renewal CTA
// (EXPIRED/REVOKED → new application for the same service).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  BadgeCheck,
  Ban,
  CalendarClock,
  FileSearch,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatDate, timeAgo } from '@/lib/format'
import { validityLeft } from '@/components/marketplace/b2b/b2b-shared'
import { apiRequest } from '@/components/marketplace/b2b/b2b-shared'
import { FinancingStatusBadge } from '@/components/marketplace/financier/financing-status-badge'
import { RequestDetail } from './request-detail'
import { ApplicationWizard } from './wizard'
import type {
  AccountDocumentDTO,
  MyAccreditationDTO,
  MyAccreditationDetailDTO,
  PublicServiceDetailDTO,
} from './shared'

export function AccreditationsTab({
  onManageDocuments,
  onBrowse,
}: {
  onManageDocuments: () => void
  onBrowse: () => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [wizardService, setWizardService] = useState<PublicServiceDetailDTO | null>(null)

  const { data: listData, loading, refetch: refetchList } = useApi<{ accreditations: MyAccreditationDTO[] }>(
    '/api/accreditation/requests',
    { pollMs: 30_000 }
  )
  const { data: validData, loading: validLoading, refetch: refetchValid } = useApi<{
    accreditations: MyAccreditationDTO[]
  }>('/api/accreditation/valid', { pollMs: 60_000 })
  const { data: docsData } = useApi<{ documents: AccountDocumentDTO[] }>('/api/documents')
  const documents = docsData?.documents ?? []

  const accreditations = listData?.accreditations ?? []
  const live = validData?.accreditations ?? []

  const { data: detailData, loading: detailLoading, refetch: refetchDetail } = useApi<{
    request: MyAccreditationDetailDTO
  }>(selectedId ? `/api/accreditation/requests/${selectedId}` : null)

  const refresh = () => {
    void refetchList({ silent: true })
    void refetchValid({ silent: true })
    void refetchDetail({ silent: true })
  }

  // ── Renewal: fetch the service detail and open the wizard on it ──
  const startRenewal = async (serviceId: string) => {
    const res = await apiRequest<{ service: PublicServiceDetailDTO }>(`/api/financing/services/${serviceId}`)
    if (!res.ok || !res.data) {
      toast({ title: 'Could not open the program', description: res.error ?? 'Please try again', variant: 'destructive' })
      return
    }
    setWizardService(res.data.service)
  }

  // ── Detail view ──
  if (selectedId) {
    if (detailLoading && !detailData) {
      return (
        <div className="space-y-5">
          <Skeleton className="h-10 w-64 rounded-xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      )
    }
    const request = detailData?.request
    if (!request) {
      return (
        <div className="rounded-2xl border border-dashed px-6 py-14 text-center">
          <FileSearch size={30} className="text-muted-foreground/40" />
          <p className="mt-3 text-sm font-semibold">Accreditation request not found</p>
          <Button variant="outline" className="mt-4 rounded-xl" onClick={() => setSelectedId(null)}>
            Back to accreditations
          </Button>
        </div>
      )
    }
    return (
      <RequestDetail
        key={request.id}
        request={request}
        isAccreditation
        documents={documents}
        onBack={() => setSelectedId(null)}
        onChanged={refresh}
        onManageDocuments={onManageDocuments}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Live grants (RFQ unlock) */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <ShieldCheck size={16} className="text-emerald-600 dark:text-emerald-400" /> Live accreditations
            <span className="rounded-full bg-emerald-100 px-1.5 text-[11px] font-bold tabular-nums text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              {live.length}
            </span>
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Live grants unlock RFQ participation with the financier and auto-pass matching requirements.
          </p>
        </div>
        {validLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
          </div>
        ) : live.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-10 text-center">
            <BadgeCheck size={30} className="text-muted-foreground/40" />
            <p className="mt-3 text-sm font-semibold">No live accreditations</p>
            <p className="mt-1 max-w-md text-xs text-muted-foreground">
              Accredited companies unlock vendor RFQ participation with the financing institution and skip
              re-verification on their other services.
            </p>
            <Button variant="outline" className="mt-4 rounded-xl" onClick={onBrowse}>
              Browse accreditation programs
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {live.map((a, i) => {
              const validity = validityLeft(a.validUntil)
              return (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(i * 0.06, 0.25) }}
                  className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/20"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
                        {a.serviceName}
                        <FinancingStatusBadge status={a.status} />
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {a.financierName ?? '—'} · {a.organizationName ?? '—'}
                      </p>
                    </div>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      <BadgeCheck size={19} />
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={cn(
                        'flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold',
                        validity.urgent
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : 'bg-background text-foreground'
                      )}
                    >
                      <CalendarClock size={12} />
                      Valid until {a.validUntil ? formatDate(a.validUntil) : '—'}
                      {validity.text ? ` · ${validity.text}` : ''}
                    </span>
                    <button
                      type="button"
                      className="font-semibold text-primary hover:underline"
                      onClick={() => setSelectedId(a.id)}
                    >
                      View record
                    </button>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </section>

      {/* History */}
      <section>
        <h3 className="mb-3 text-sm font-bold">All accreditation requests</h3>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-2xl" />
            ))}
          </div>
        ) : accreditations.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-10 text-center">
            <FileSearch size={30} className="text-muted-foreground/40" />
            <p className="mt-3 text-sm font-semibold">No accreditation requests yet</p>
            <p className="mt-1 max-w-md text-xs text-muted-foreground">
              Apply to an accreditation program from the services directory — the platform verifies your file and the
              financier grants the accreditation.
            </p>
            <Button className="mt-4 rounded-xl" onClick={onBrowse}>
              <Sparkles size={15} className="mr-1.5" /> Find programs
            </Button>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {accreditations.map((a) => {
              const renewable = ['EXPIRED', 'REVOKED'].includes(a.status)
              return (
                <li key={a.id}>
                  <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border bg-card px-5 py-4 shadow-sm transition-all hover:border-primary/40 hover:shadow-md">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-4 text-left"
                      onClick={() => setSelectedId(a.id)}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        {a.status === 'REVOKED' ? <Ban size={18} /> : <BadgeCheck size={19} />}
                      </span>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
                          <span className="font-mono">{a.number}</span>
                          <FinancingStatusBadge status={a.status} />
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {a.serviceName} · {a.financierName ?? '—'}
                          {a.submittedAt ? ` · submitted ${timeAgo(a.submittedAt)}` : ''}
                        </p>
                      </div>
                    </button>
                    {renewable && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 shrink-0 rounded-xl text-xs"
                        onClick={() => void startRenewal(a.serviceId)}
                      >
                        <RotateCcw size={13} className="mr-1" /> Renew accreditation
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {wizardService && (
        <ApplicationWizard
          services={[wizardService]}
          onClose={() => setWizardService(null)}
          onSubmitted={() => {
            setWizardService(null)
            refresh()
          }}
          onManageDocuments={onManageDocuments}
        />
      )}
    </div>
  )
}
