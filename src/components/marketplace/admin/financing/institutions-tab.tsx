'use client'

// ─────────────────────────────────────────────────────────────────────────────
// INSTITUTIONS — financier organizations (FIN-7 sub-tab 3).
// Every org with a FinancierProfile: license, regulator, service counts and
// open-request load, with the org-status actions verify / suspend / reactivate.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { BadgeCheck, Ban, Landmark, Loader2, RotateCcw, SearchX, ShieldCheck } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { AdminEmptyState, apiRequest, toastApiError } from '../shared'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { orgTypeLabel, type AdminInstitutionDTO } from './shared'

type InstitutionAction = 'verify' | 'suspend' | 'reactivate'

const ACTION_COPY: Record<InstitutionAction, { title: string; description: string; cta: string; toast: string }> = {
  verify: {
    title: 'Verify this institution?',
    description:
      'Verification stamps the organization as a vetted financier (licensed by its regulator). Their services stay live either way — this is the platform trust mark.',
    cta: 'Verify institution',
    toast: 'Institution verified',
  },
  suspend: {
    title: 'Suspend this institution?',
    description:
      'A suspended organization is taken off the platform. Their financing and accreditation programs stop receiving applications until reactivated.',
    cta: 'Suspend institution',
    toast: 'Institution suspended',
  },
  reactivate: {
    title: 'Reactivate this institution?',
    description: 'The organization returns to active status and its services resume receiving applications.',
    cta: 'Reactivate institution',
    toast: 'Institution reactivated',
  },
}

export function InstitutionsTab() {
  const { data, loading, error, refetch } = useApi<{ institutions: AdminInstitutionDTO[] }>(
    '/api/admin/financing/institutions'
  )
  const [busyId, setBusyId] = useState<string | null>(null)
  const [pending, setPending] = useState<{ inst: AdminInstitutionDTO; action: InstitutionAction } | null>(null)

  const institutions = data?.institutions ?? []

  const runAction = async () => {
    if (!pending) return
    setBusyId(pending.inst.organizationId)
    const res = await apiRequest<{ organization: { status: string } }>(
      `/api/admin/financing/institutions/${pending.inst.organizationId}`,
      { method: 'PATCH', body: JSON.stringify({ action: pending.action }) }
    )
    setBusyId(null)
    const copy = ACTION_COPY[pending.action]
    if (!res.ok) {
      toastApiError(res.error, `${copy.toast} failed`)
      return
    }
    toast({
      title: copy.toast,
      description: `${pending.inst.name} is now ${res.data?.organization.status.toLowerCase()}.`,
    })
    setPending(null)
    void refetch()
  }

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <AdminEmptyState icon={SearchX} title="Couldn't load institutions" description={error} />
      ) : institutions.length === 0 ? (
        <AdminEmptyState
          icon={Landmark}
          title="No financier institutions yet"
          description="Organizations with a financier profile appear here once onboarded."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {institutions.map((inst) => {
            const suspended = inst.status === 'SUSPENDED'
            const unverified = !inst.verifiedAt && inst.status !== 'SUSPENDED'
            return (
              <Card key={inst.organizationId} className={cn(suspended && 'opacity-75')}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
                        <Landmark size={15} className="shrink-0 text-primary" />
                        <span className="truncate">{inst.name}</span>
                        <Badge className="rounded-full border-0 bg-muted text-[11px] font-semibold text-muted-foreground">
                          {orgTypeLabel(inst.orgType)}
                        </Badge>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {inst.profile.licenseNumber ? `License ${inst.profile.licenseNumber}` : 'No license on file'}
                        {inst.profile.regulator ? ` · ${inst.profile.regulator}` : ''}
                        {inst.verifiedAt ? ` · verified ${formatDate(inst.verifiedAt)}` : ''}
                      </p>
                      {(inst.profile.contactEmail || inst.profile.contactPhone) && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {[inst.profile.contactEmail, inst.profile.contactPhone].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    <Badge
                      className={cn(
                        'rounded-full border-0 text-[11px] font-semibold',
                        suspended
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          : unverified
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      )}
                    >
                      {suspended ? 'Suspended' : unverified ? 'Unverified' : 'Active'}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
                    {[
                      ['Members', inst.memberCount],
                      ['Services', `${inst.activeServiceCount}/${inst.serviceCount}`],
                      ['Open reqs', inst.openRequestCount],
                      ['Open accs', inst.openAccreditationCount],
                      ['Live grants', inst.liveAccreditationCount],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="rounded-xl bg-muted/50 px-2 py-1.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                        <p className="text-sm font-bold tabular-nums">{value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
                    {!inst.verifiedAt && !suspended && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-xl text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
                        disabled={busyId === inst.organizationId}
                        onClick={() => setPending({ inst, action: 'verify' })}
                      >
                        <ShieldCheck size={14} className="mr-1.5" /> Verify
                      </Button>
                    )}
                    {suspended ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-xl"
                        disabled={busyId === inst.organizationId}
                        onClick={() => setPending({ inst, action: 'reactivate' })}
                      >
                        <RotateCcw size={14} className="mr-1.5" /> Reactivate
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-xl text-destructive hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                        disabled={busyId === inst.organizationId}
                        onClick={() => setPending({ inst, action: 'suspend' })}
                      >
                        <Ban size={14} className="mr-1.5" /> Suspend
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* action confirmation */}
      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {pending?.action === 'suspend' ? (
                <Ban size={17} className="text-destructive" />
              ) : pending?.action === 'verify' ? (
                <BadgeCheck size={17} className="text-emerald-600 dark:text-emerald-400" />
              ) : (
                <RotateCcw size={17} className="text-primary" />
              )}
              {pending ? ACTION_COPY[pending.action].title : ''}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending ? `${ACTION_COPY[pending.action].description} (${pending.inst.name})` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn('rounded-xl', pending?.action === 'suspend' && 'bg-destructive text-white hover:bg-destructive/90')}
              onClick={() => void runAction()}
              disabled={!!busyId}
            >
              {busyId && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              {pending ? ACTION_COPY[pending.action].cta : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
