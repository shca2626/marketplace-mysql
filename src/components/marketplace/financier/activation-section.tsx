'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FINANCIER ACTIVATION SCREEN — Phase 5.1 (financier onboarding completion).
//
// What a PENDING_VERIFICATION (or REJECTED) institution sees instead of the
// full lender console: where the application stands, what was submitted, the
// license documents on file and what happens next. This closes the Audit A/B
// conflict — the console exists, but self-registered institutions get a real
// activation journey instead of a half-working console.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react'
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Clock,
  FileText,
  Landmark,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface ProfileResponse {
  organization: {
    name: string
    legalName: string | null
    orgType: string
    status: string
    verifiedAt: string | null
    taxId: string | null
    registrationNumber: string | null
    website: string | null
    createdAt: string
  } | null
  profile: {
    about: string | null
    licenseNumber: string | null
    regulator: string | null
    contactEmail: string | null
    contactPhone: string | null
  } | null
}

interface VaultDoc {
  id: string
  documentType: string
  title: string | null
  status: string
  createdAt: string
  media?: { fileName: string | null } | null
}

const ORG_TYPE_LABELS: Record<string, string> = {
  BANK: 'Bank',
  MFI: 'Microfinance institution',
  EWALLET: 'E-wallet provider',
  COMPANY: 'Company',
}

function StatusTimeline({ status }: { status: string }) {
  const steps = [
    { key: 'submitted', label: 'Application submitted', description: 'Institution facts + license received' },
    { key: 'review', label: 'Vendora review', description: 'The team verifies your license and contacts' },
    { key: 'activated', label: 'Institution activated', description: 'Full lender console unlocks for your team' },
  ]
  const rejected = status === 'REJECTED'
  const activeIndex = rejected ? 1 : status === 'ACTIVE' ? 2 : 1 // submitted ✓, review current until ACTIVE
  return (
    <ol className="space-y-0" aria-label="Activation progress">
      {steps.map((s, i) => {
        const done = i < activeIndex
        const current = i === activeIndex && !rejected && status !== 'ACTIVE'
        const failed = rejected && i === 1
        return (
          <li key={s.key} className="relative flex gap-4 pb-6 last:pb-0">
            {i < steps.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  'absolute left-[15px] top-8 h-[calc(100%-2rem)] w-0.5',
                  done ? 'bg-emerald-400' : 'bg-border'
                )}
              />
            )}
            <span
              className={cn(
                'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 bg-background',
                done && 'border-emerald-400 text-emerald-600',
                current && 'border-primary text-primary',
                failed && 'border-destructive text-destructive',
                !done && !current && !failed && 'border-border text-muted-foreground'
              )}
            >
              {done ? (
                <CheckCircle2 size={16} />
              ) : failed ? (
                <XCircle size={16} />
              ) : current ? (
                status === 'ACTIVE' ? (
                  <BadgeCheck size={16} />
                ) : (
                  <Loader2 size={14} className="animate-spin" />
                )
              ) : (
                <span className="h-2 w-2 rounded-full bg-current opacity-40" />
              )}
            </span>
            <div className="min-w-0 pt-1">
              <p className={cn('text-sm font-semibold', !done && !current && !failed && 'text-muted-foreground')}>
                {s.label}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{s.description}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export function ActivationSection({
  organizationId,
  organizationName,
}: {
  organizationId: string
  organizationName: string
}) {
  const { data: profileData, loading: profileLoading, refetch } = useApi<ProfileResponse>('/api/financier/profile')
  const { data: docsData, loading: docsLoading } = useApi<{ documents: VaultDoc[] }>(
    `/api/documents?organizationId=${encodeURIComponent(organizationId)}`
  )

  const org = profileData?.organization
  const profile = profileData?.profile
  const docs = useMemo(() => docsData?.documents ?? [], [docsData])

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Status hero */}
      <Card className="overflow-hidden border-0 shadow-card">
        <div className="bg-gradient-to-br from-bh-navy to-bh-navy-deep px-6 py-7 text-white sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-bh-gold">
                <Landmark size={13} aria-hidden /> Institution onboarding
              </p>
              <h2 className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">{organizationName}</h2>
              <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-white/70">
                Your application is with the Vendora team. Once your license is verified, the full lender console —
                services, requests, offers and agreements — unlocks for your staff.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-lg border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              onClick={() => void refetch()}
            >
              <RefreshCw size={13} className="mr-1.5" /> Refresh
            </Button>
          </div>
        </div>
        <CardContent className="p-6 sm:p-8">
          <StatusTimeline status={org?.status ?? 'PENDING_VERIFICATION'} />
          {org?.status === 'REJECTED' && (
            <div role="alert" className="mt-2 flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-destructive" />
              <p className="text-sm text-destructive">
                This application was declined. The Vendora team has reached out with the reason — fix the facts below
                and reapply.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submitted facts */}
      <Card>
        <CardContent className="p-6 sm:p-8">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <Building2 size={15} className="text-primary" /> Submitted facts
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">Exactly what the review team sees — report changes via WhatsApp support.</p>
          {profileLoading ? (
            <div className="mt-4 space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-9 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {[
                ['Legal name', org?.legalName ?? org?.name],
                ['Institution type', ORG_TYPE_LABELS[org?.orgType ?? ''] ?? org?.orgType],
                ['License number', profile?.licenseNumber],
                ['Regulator', profile?.regulator],
                ['Registration no.', org?.registrationNumber],
                ['Website', org?.website],
                ['Contact email', profile?.contactEmail],
                ['Contact phone', profile?.contactPhone],
              ]
                .filter(([, v]) => v)
                .map(([label, value]) => (
                  <div key={label} className="flex flex-col gap-0.5 border-b border-dashed pb-2.5">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
                    <dd className="truncate text-sm font-medium">{value}</dd>
                  </div>
                ))}
              {profile?.about && (
                <div className="flex flex-col gap-1 border-b border-dashed pb-2.5 sm:col-span-2">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">About</dt>
                  <dd className="text-sm leading-relaxed text-muted-foreground">{profile.about}</dd>
                </div>
              )}
            </dl>
          )}
        </CardContent>
      </Card>

      {/* License documents */}
      <Card>
        <CardContent className="p-6 sm:p-8">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <FileText size={15} className="text-primary" /> License documents
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            The vault documents linked to this institution — reviewers verify each one.
          </p>
          {docsLoading ? (
            <div className="mt-4 space-y-2">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : docs.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed p-5 text-center">
              <Clock size={18} className="mx-auto text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">No documents uploaded yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Upload your banking license and supporting documents from the document vault — the review team needs
                them to activate the institution.
              </p>
            </div>
          ) : (
            <ul className="mt-4 space-y-2">
              {docs.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-3 rounded-xl border bg-muted/30 px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <FileText size={16} className="shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{d.title || d.media?.fileName || d.documentType}</p>
                      <p className="text-xs text-muted-foreground">
                        {d.documentType} · uploaded {new Date(d.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold',
                      d.status === 'VERIFIED' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
                      d.status === 'PENDING' && 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
                      d.status === 'REJECTED' && 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                    )}
                  >
                    {d.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <Clock size={12} /> Review typically completes within a few business days — the team contacts you on
        WhatsApp/email.
      </p>
    </div>
  )
}
