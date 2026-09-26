'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FINANCIER · PROFILE — institution facts: the organization (from /api/orgs)
// + the FinancierProfile (license, regulator, contact, ticket range — read
// via /api/financier/profile) + offering stats.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react'
import { BadgeCheck, Banknote, Building2, Landmark, Loader2, Mail, Phone, Star, Wallet } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import type { FinancierServiceDTO } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  EmptyState,
  formatDate,
  formatMoney,
  LabeledValue,
  ORG_TYPE_MAP,
  SERVICE_KIND_MAP,
  StatusBadge,
} from '@/components/marketplace/financing/financing-shared'

interface FinancierProfileResponse {
  organization: {
    id: string
    name: string
    legalName: string | null
    orgType: string
    status: string
    verifiedAt: string | null
    taxId: string | null
    registrationNumber: string | null
    industry: string | null
    website: string | null
    createdAt: string
  } | null
  profile: {
    about: string | null
    licenseNumber: string | null
    regulator: string | null
    contactEmail: string | null
    contactPhone: string | null
    minTicket: number | null
    maxTicket: number | null
    viewCount: number
  } | null
}

export function ProfileSection() {
  const { data, loading, error } = useApi<FinancierProfileResponse>('/api/financier/profile')
  const { data: servicesData } = useApi<{ services: FinancierServiceDTO[] }>('/api/financier/services')

  const org = data?.organization
  const profile = data?.profile
  const services = servicesData?.services ?? []
  const stats = useMemo(
    () => ({
      total: services.length,
      active: services.filter((s) => s.status === 'ACTIVE').length,
      financing: services.filter((s) => s.serviceKind === 'FINANCING').length,
      accreditation: services.filter((s) => s.serviceKind === 'ACCREDITATION').length,
      views: services.reduce((sum, s) => sum + s.viewCount, 0),
    }),
    [services]
  )

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    )
  }
  if (error || !org) {
    return <EmptyState icon={Building2} title="Could not load the institution profile" description={error ?? undefined} />
  }

  return (
    <div className="space-y-5">
      {/* Identity card */}
      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Landmark size={26} />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold tracking-tight">{org.name}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <StatusBadge status={org.orgType} map={ORG_TYPE_MAP} />
                <StatusBadge status={org.status} map={ORG_TYPE_MAP} />
                {org.verifiedAt && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    <BadgeCheck size={10} /> Verified {formatDate(org.verifiedAt)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {profile?.about && <p className="text-sm leading-relaxed text-muted-foreground">{profile.about}</p>}

          <div className="grid grid-cols-2 gap-4 border-t pt-4 text-sm sm:grid-cols-3">
            <LabeledValue label="Legal name">{org.legalName ?? '—'}</LabeledValue>
            <LabeledValue label="Tax ID">{org.taxId ?? '—'}</LabeledValue>
            <LabeledValue label="Registration no.">{org.registrationNumber ?? '—'}</LabeledValue>
            <LabeledValue label="Industry">{org.industry ?? '—'}</LabeledValue>
            <LabeledValue label="Website">{org.website ?? '—'}</LabeledValue>
            <LabeledValue label="Member since">{formatDate(org.createdAt)}</LabeledValue>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Financier profile facts */}
        <Card>
          <CardContent className="space-y-3.5 p-4 sm:p-6">
            <h3 className="flex items-center gap-1.5 text-sm font-bold">
              <Building2 size={14} className="text-primary" /> Financier profile
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <LabeledValue label="License number">{profile?.licenseNumber ?? '—'}</LabeledValue>
              <LabeledValue label="Regulator">{profile?.regulator ?? '—'}</LabeledValue>
              <LabeledValue label="Min ticket">
                {profile?.minTicket != null ? formatMoney(profile.minTicket) : '—'}
              </LabeledValue>
              <LabeledValue label="Max ticket">
                {profile?.maxTicket != null ? formatMoney(profile.maxTicket) : '—'}
              </LabeledValue>
            </div>
            <div className="space-y-1.5 text-sm">
              {profile?.contactEmail && (
                <p className="flex items-center gap-1.5">
                  <Mail size={13} className="text-muted-foreground" /> {profile.contactEmail}
                </p>
              )}
              {profile?.contactPhone && (
                <p className="flex items-center gap-1.5">
                  <Phone size={13} className="text-muted-foreground" /> {profile.contactPhone}
                </p>
              )}
            </div>
            <p className="rounded-xl bg-muted/40 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
              License, regulator and contact facts are set during platform onboarding and maintained by Vendora&apos;s
              admin team — flag any change through your relationship manager.
            </p>
          </CardContent>
        </Card>

        {/* Offering stats */}
        <Card>
          <CardContent className="space-y-4 p-4 sm:p-6">
            <h3 className="flex items-center gap-1.5 text-sm font-bold">
              <Banknote size={14} className="text-primary" /> Offering at a glance
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <StatTile icon={Banknote} label="Active services" value={`${stats.active} of ${stats.total}`} />
              <StatTile icon={Wallet} label="Financing services" value={String(stats.financing)} />
              <StatTile icon={BadgeCheck} label="Accreditation programs" value={String(stats.accreditation)} />
              <StatTile icon={Star} label="Directory views" value={String(stats.views)} />
            </div>
            {services.length > 0 && (
              <div className="space-y-1.5 border-t pt-3">
                {services.slice(0, 4).map((s) => (
                  <div key={s.id} className="flex items-center gap-2 text-xs">
                    <StatusBadge status={s.serviceKind} map={SERVICE_KIND_MAP} />
                    <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
                    <span className="text-muted-foreground">{s.requirementCount ?? 0} reqs</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border bg-muted/30 p-3">
      <Icon size={15} className="text-primary" />
      <p className="mt-1.5 text-lg font-bold leading-none">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}
