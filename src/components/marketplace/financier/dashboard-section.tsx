'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FINANCIER · DASHBOARD — inbox counts, offers, accreditations, active
// services + quick stats + the freshest forwarded requests.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  HandCoins,
  Inbox,
  RotateCcw,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import { useMarketplace } from '@/store/marketplace'
import { useApi } from '@/hooks/use-api'
import type {
  AccreditationRequestSummaryDTO,
  FinancingAgreementDTO,
  FinancingRequestSummaryDTO,
  FinancierServiceDTO,
} from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  ACC_STATUS_MAP,
  EmptyState,
  FIN_REQUEST_STATUS_MAP,
  formatDate,
  formatMoney,
  StatusBadge,
  timeAgo,
} from '@/components/marketplace/financing/financing-shared'

export function DashboardSection({ onNavigate }: { onNavigate: (section: string) => void }) {
  const navigate = useMarketplace((s) => s.navigate)
  const { data: inboxData, loading: inboxLoading, error: inboxError, refetch: refetchInbox } = useApi<{
    requests: FinancingRequestSummaryDTO[]
    total: number
  }>('/api/financier/requests?limit=100')
  const { data: accData, error: accError, refetch: refetchAcc } = useApi<{ requests: AccreditationRequestSummaryDTO[]; total: number }>(
    '/api/financier/accreditations?limit=100'
  )
  const { data: servicesData, error: servicesError, refetch: refetchServices } = useApi<{ services: FinancierServiceDTO[] }>('/api/financier/services')
  const { data: agreementsData, error: agreementsError, refetch: refetchAgreements } = useApi<{ agreements: FinancingAgreementDTO[] }>('/api/financier/agreements')

  const inbox = inboxData?.requests ?? []
  const accreditations = accData?.requests ?? []
  const services = servicesData?.services ?? []
  const agreements = agreementsData?.agreements ?? []

  const counts = useMemo(() => {
    const newInbox = inbox.filter((r) => r.status === 'FORWARDED_TO_FINANCIER').length
    const inReview = inbox.filter((r) => r.status === 'UNDER_FINANCIER_REVIEW').length
    const offered = inbox.filter((r) => r.status === 'OFFERED').length
    const accepted = inbox.filter((r) => r.status === 'ACCEPTED').length
    const accPending = accreditations.filter((r) => ['FORWARDED_TO_FINANCIER', 'UNDER_FINANCIER_REVIEW'].includes(r.status)).length
    const accLive = accreditations.filter((r) => r.isLive).length
    return { newInbox, inReview, offered, accepted, accPending, accLive }
  }, [inbox, accreditations])

  const activeServices = services.filter((s) => s.status === 'ACTIVE')
  const recent = [...inbox].sort((a, b) => (b.forwardedAt ?? '').localeCompare(a.forwardedAt ?? '')).slice(0, 5)

  // FIN-001 follow-up: a failing financier API call must surface loudly —
  // never silent zeros (the sections below already follow this pattern).
  const loadError = inboxError ?? accError ?? servicesError ?? agreementsError ?? null
  const retryAll = () => {
    void refetchInbox()
    void refetchAcc()
    void refetchServices()
    void refetchAgreements()
  }

  return (
    <div className="space-y-5">
      {loadError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5 text-sm">
            <ShieldAlert size={16} className="shrink-0 text-destructive" />
            <span className="font-semibold">Could not load your institution data</span>
            <span className="hidden truncate text-xs text-muted-foreground sm:inline">{loadError}</span>
          </div>
          <Button variant="outline" size="sm" className="rounded-xl" onClick={retryAll}>
            <RotateCcw size={13} className="mr-1" /> Retry
          </Button>
        </div>
      )}

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatTile
          icon={Inbox}
          label="Awaiting review"
          value={counts.newInbox}
          loading={inboxLoading}
          hint="forwarded, untouched"
          onClick={() => onNavigate('inbox')}
        />
        <StatTile icon={HandCoins} label="Offers out" value={counts.offered} hint="request status OFFERED" onClick={() => onNavigate('offers')} />
        <StatTile
          icon={BadgeCheck}
          label="Accreditations"
          value={counts.accPending}
          hint={`${counts.accLive} live grants`}
          onClick={() => onNavigate('accreditations')}
        />
        <StatTile
          icon={Banknote}
          label="Active services"
          value={activeServices.length}
          hint={`${services.length} total`}
          onClick={() => onNavigate('services')}
        />
        <StatTile icon={ScrollText} label="Agreements" value={agreements.length} hint="accepted offers" onClick={() => onNavigate('agreements')} />
        <StatTile icon={ShieldCheck} label="Financed (accepted)" value={counts.accepted} hint="requests accepted" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* Recent forwarded requests */}
        <Card>
          <CardContent className="space-y-3 p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Latest gate-passed requests</h3>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                onClick={() => onNavigate('inbox')}
              >
                Open inbox <ArrowRight size={12} />
              </button>
            </div>
            {inboxLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-14 rounded-xl" />
                ))}
              </div>
            ) : recent.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="Nothing forwarded yet"
                description="The platform forwards only fully-verified applications — they will appear here the moment they pass the gate."
              />
            ) : (
              <ul className="space-y-2">
                {recent.map((r) => (
                  <motion.li key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <button
                      type="button"
                      onClick={() => onNavigate('inbox')}
                      className="flex w-full flex-wrap items-center gap-2 rounded-xl border bg-background px-3.5 py-2.5 text-left transition-colors hover:bg-muted/50"
                    >
                      <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] font-bold">{r.number}</span>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{r.serviceName}</span>
                      <span className="hidden text-xs text-muted-foreground sm:block">
                        {r.organizationName ?? r.applicant.name} · {timeAgo(r.forwardedAt)}
                      </span>
                      <span className="text-xs font-bold">{formatMoney(r.amountRequested, r.currency)}</span>
                      <StatusBadge status={r.status} map={FIN_REQUEST_STATUS_MAP} />
                    </button>
                  </motion.li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Side column: accreditation queue + platform note */}
        <div className="space-y-5">
          <Card>
            <CardContent className="space-y-3 p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">Accreditation queue</h3>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  onClick={() => onNavigate('accreditations')}
                >
                  Review <ArrowRight size={12} />
                </button>
              </div>
              {counts.accPending > 0 ? (
                <ul className="space-y-2">
                  {accreditations
                    .filter((r) => ['FORWARDED_TO_FINANCIER', 'UNDER_FINANCIER_REVIEW'].includes(r.status))
                    .slice(0, 4)
                    .map((r) => (
                      <li key={r.id} className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2">
                        <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] font-bold">{r.number}</span>
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{r.organizationName}</span>
                        <StatusBadge status={r.status} map={ACC_STATUS_MAP} />
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="rounded-xl border border-dashed px-4 py-6 text-center text-xs text-muted-foreground">
                  {counts.accLive > 0
                    ? `${counts.accLive} live grant${counts.accLive === 1 ? '' : 's'} — no pending decisions.`
                    : 'No forwarded accreditation requests right now.'}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 p-4 sm:p-5">
              <h3 className="text-sm font-bold">How Vendora works for you</h3>
              <ul className="space-y-2 text-xs leading-relaxed text-muted-foreground">
                <li className="flex gap-2">
                  <ShieldCheck size={14} className="mt-0.5 shrink-0 text-primary" />
                  The platform verification gate checks every application against your service&apos;s requirements before
                  it reaches your inbox — you only see verified, complete files.
                </li>
                <li className="flex gap-2">
                  <BadgeCheck size={14} className="mt-0.5 shrink-0 text-primary" />
                  Accredited companies unlock RFQ participation with you and auto-pass the requirements you flag.
                </li>
                <li className="flex gap-2">
                  <ScrollText size={14} className="mt-0.5 shrink-0 text-primary" />
                  Funding is reported, never handled — Vendora only records typed events and invoices the success fee
                  externally.
                </li>
              </ul>
              <p className="pt-1 text-[11px] text-muted-foreground">
                Your last accepted agreement:{' '}
                {agreements[0] ? (
                  <span className="font-semibold text-foreground">
                    {agreements[0].number} · {formatDate(agreements[0].acceptedAt)}
                  </span>
                ) : (
                  'none yet'
                )}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <p className="sr-only">
        Financier console — {counts.newInbox} requests awaiting review, {counts.offered} offers out,{' '}
        {counts.accPending} accreditation decisions pending.{' '}
        <button type="button" className="pointer-events-none" onClick={() => navigate('financier')} aria-hidden />
      </p>
    </div>
  )
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  loading,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: number
  hint?: string
  loading?: boolean
  onClick?: () => void
}) {
  const body = (
    <>
      <Icon size={15} className="text-primary" />
      {loading ? (
        <Skeleton className="mt-2 h-6 w-12" />
      ) : (
        <p className="mt-1.5 text-2xl font-bold leading-none">{value.toLocaleString('en-US')}</p>
      )}
      <p className="mt-1.5 text-[11.5px] font-medium">{label}</p>
      {hint && <p className="text-[10.5px] text-muted-foreground">{hint}</p>}
    </>
  )
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border bg-card p-3.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
    >
      {body}
    </button>
  ) : (
    <div className={cn('rounded-2xl border bg-card p-3.5')}>{body}</div>
  )
}
