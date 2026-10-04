'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN SECURITY TAB (lastplan v5 · 6.7.10) — platform MFA policy + the staff
// MFA overview.
//   • Platform policy card — the `requireForStaff` toggle (PUT /api/admin/security).
//     The toggle itself is a sensitive action: it is step-up guarded, so an
//     enrolled admin confirms with a fresh code when the 5-minute window has
//     expired (guard retries the PUT once).
//   • Staff MFA table — enrollment state per platform-staff account plus the
//     per-account "Require MFA" switch (POST /api/admin/security), also
//     step-up guarded. Break-glass accounts carry a distinct badge.
// Visibility: the nav item requires the `staff.manage` permission; the API
// enforces the same key server-side.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  BadgeCheck,
  KeyRound,
  Loader2,
  RefreshCcw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import type { SessionUser } from '@/lib/types'
import { initials } from '@/lib/format'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { AdminEmptyState, SearchInput, apiRequest, toastApiError, useDebounced } from './shared'
import { useStepUp } from './step-up-guard'

interface SecurityStaffRow {
  userId: string
  name: string
  email: string | null
  phone: string | null
  /** The explicit per-account requirement flag (what the switch writes). */
  mfaRequired: boolean
  isBreakGlass: boolean
  roles: string[]
  mfaEnrolled: boolean
  /** Role/policy-derived effective requirement (flag OR platform policy). */
  mfaRequiredEffective: boolean
}

interface SecurityResponse {
  policy: { requireForStaff: boolean }
  staff: SecurityStaffRow[]
}

export function SecurityTab({ user }: { user: SessionUser | null }) {
  const { data, loading, error, refetch } = useApi<SecurityResponse>('/api/admin/security')

  // Phase 6 (6.7.5) — both mutation types need a fresh MFA step-up.
  const { guard, node: stepUpDialog } = useStepUp()

  const [policyBusy, setPolicyBusy] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounced(query)

  // The nav already hides this tab without staff.manage; the switch state is
  // a UX nicety — the API remains the boundary (legacy admins hold everything).
  const isSuperAdmin = user?.role === 'ADMIN'
  const perms = useMemo(() => new Set(user?.permissions ?? []), [user])
  const canManage = isSuperAdmin || perms.has('staff.manage')

  const policy = data?.policy
  const staff = data?.staff ?? []

  const filteredStaff = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase()
    if (!q) return staff
    return staff.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.email ?? '').toLowerCase().includes(q) ||
        (s.phone ?? '').toLowerCase().includes(q)
    )
  }, [staff, debouncedQuery])

  const setPolicy = async (next: boolean) => {
    if (policyBusy) return
    setPolicyBusy(true)
    const res = await guard(() =>
      apiRequest<{ policy: { requireForStaff: boolean } }>('/api/admin/security', {
        method: 'PUT',
        body: JSON.stringify({ requireForStaff: next }),
      })
    )
    setPolicyBusy(false)
    if (!res) return // step-up cancelled / enrollment required
    if (!res.ok) {
      toastApiError(res.error, 'Policy not saved')
      return
    }
    toast({
      title: next ? 'Staff MFA now required' : 'Staff MFA no longer required',
      description: next
        ? 'Every platform staff account must enroll two-factor authentication before sensitive actions.'
        : 'Staff can still enroll voluntarily from their profile security settings.',
    })
    void refetch()
  }

  const setStaffRequired = async (row: SecurityStaffRow, required: boolean) => {
    if (togglingId) return
    setTogglingId(row.userId)
    const res = await guard(() =>
      apiRequest('/api/admin/security', {
        method: 'POST',
        body: JSON.stringify({ userId: row.userId, required }),
      })
    )
    setTogglingId(null)
    if (!res) return // step-up cancelled / enrollment required
    if (!res.ok) {
      toastApiError(res.error, 'Requirement not saved')
      return
    }
    toast({
      title: required ? `MFA required for ${row.name}` : `MFA optional for ${row.name}`,
      description: required
        ? 'They must enroll from their profile security settings before their next sensitive action.'
        : 'They can keep MFA enrolled voluntarily.',
    })
    void refetch()
  }

  return (
    <div className="space-y-5">
      {/* ── Platform policy ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck size={16} className="text-primary" /> Platform MFA policy
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && !data ? (
            <Skeleton className="h-14 w-full rounded-xl" />
          ) : error ? (
            <AdminEmptyState icon={ShieldAlert} title="Couldn’t load the security policy" description={error}>
              <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
                Try again
              </Button>
            </AdminEmptyState>
          ) : (
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <label htmlFor="require-staff-mfa" className="text-sm font-semibold">
                  Require MFA for every platform staff account
                </label>
                <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
                  Every platform staff account must enroll multi-factor authentication — they cannot perform
                  sensitive actions (role grants, payout changes, module flips) until they do. Toggling this
                  policy is audit-logged and itself needs a fresh MFA check.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 pt-0.5">
                {policyBusy && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
                <Switch
                  id="require-staff-mfa"
                  checked={!!policy?.requireForStaff}
                  disabled={policyBusy || !canManage}
                  onCheckedChange={(v) => void setPolicy(v)}
                  aria-label="Require multi-factor authentication for all platform staff"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Staff MFA table ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search staff — name, email or phone…"
          ariaLabel="Search platform staff"
        />
        <Button variant="ghost" size="sm" className="h-8 rounded-full px-3 text-xs" onClick={() => void refetch()} disabled={loading}>
          {loading ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <RefreshCcw size={13} className="mr-1.5" />}
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <AdminEmptyState icon={ShieldAlert} title="Couldn’t load the staff overview" description={error}>
          <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
            Try again
          </Button>
        </AdminEmptyState>
      ) : staff.length === 0 ? (
        <AdminEmptyState
          icon={Users}
          title="No platform staff yet"
          description="Grant a platform role in Roles & Access — the account appears here the moment it holds one."
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-2xl border md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-medium">Staff member</th>
                  <th scope="col" className="px-4 py-3 font-medium">Roles</th>
                  <th scope="col" className="px-4 py-3 font-medium">MFA status</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Require MFA</th>
                </tr>
              </thead>
              <tbody>
                {filteredStaff.map((row) => (
                  <tr key={row.userId} className="border-b align-middle transition-colors last:border-0 hover:bg-accent/50">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 border">
                          <AvatarFallback className="text-xs font-semibold">{initials(row.name)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="truncate text-sm font-semibold">{row.name}</p>
                            {row.isBreakGlass && (
                              <Badge
                                className="rounded-full border-0 bg-rose-100 text-[10px] font-bold text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                                title="Break-glass recovery account — every use is audited and alerts the platform"
                              >
                                <KeyRound size={10} className="mr-1" /> BREAK-GLASS
                              </Badge>
                            )}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {row.email ?? row.phone ?? '—'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-muted-foreground">
                      {row.roles.length} role{row.roles.length === 1 ? '' : 's'}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {row.mfaEnrolled ? (
                          <Badge className="rounded-full border-0 bg-emerald-100 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            <BadgeCheck size={11} className="mr-1" /> Enrolled
                          </Badge>
                        ) : (
                          <Badge className="rounded-full border-0 bg-amber-100 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            <AlertTriangle size={11} className="mr-1" /> Not enrolled
                          </Badge>
                        )}
                        {row.mfaRequiredEffective && (
                          <Badge className="rounded-full border-0 bg-orange-100 text-[11px] font-semibold text-orange-800 dark:bg-orange-950 dark:text-orange-300">
                            Required
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <Switch
                        checked={row.mfaRequired}
                        disabled={!canManage || togglingId === row.userId}
                        onCheckedChange={(v) => void setStaffRequired(row, v)}
                        aria-label={`Require multi-factor authentication for ${row.name}`}
                        title={canManage ? undefined : 'Requires the staff.manage permission'}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile stacked cards */}
          <div className="space-y-2.5 md:hidden">
            {filteredStaff.map((row) => (
              <div key={row.userId} className="rounded-2xl border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="h-9 w-9 border">
                      <AvatarFallback className="text-xs font-semibold">{initials(row.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{row.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{row.email ?? row.phone ?? '—'}</p>
                    </div>
                  </div>
                  {row.isBreakGlass && (
                    <Badge className="shrink-0 rounded-full border-0 bg-rose-100 text-[10px] font-bold text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                      <KeyRound size={10} className="mr-1" /> BREAK-GLASS
                    </Badge>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {row.mfaEnrolled ? (
                    <Badge className="rounded-full border-0 bg-emerald-100 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      <BadgeCheck size={11} className="mr-1" /> Enrolled
                    </Badge>
                  ) : (
                    <Badge className="rounded-full border-0 bg-amber-100 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      <AlertTriangle size={11} className="mr-1" /> Not enrolled
                    </Badge>
                  )}
                  {row.mfaRequiredEffective && (
                    <Badge className="rounded-full border-0 bg-orange-100 text-[11px] font-semibold text-orange-800 dark:bg-orange-950 dark:text-orange-300">
                      Required
                    </Badge>
                  )}
                  <Badge variant="outline" className="rounded-full text-[11px] text-muted-foreground">
                    {row.roles.length} role{row.roles.length === 1 ? '' : 's'}
                  </Badge>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Require MFA
                  </label>
                  <div className="flex items-center gap-2">
                    {togglingId === row.userId && <Loader2 size={13} className="animate-spin text-muted-foreground" />}
                    <Switch
                      checked={row.mfaRequired}
                      disabled={!canManage || togglingId === row.userId}
                      onCheckedChange={(v) => void setStaffRequired(row, v)}
                      aria-label={`Require multi-factor authentication for ${row.name}`}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filteredStaff.length === 0 && (
            <p className={cn('py-6 text-center text-xs text-muted-foreground')}>
              No staff match “{query.trim()}”.
            </p>
          )}

          <p className="flex items-center justify-center gap-1.5 pt-1 text-xs text-muted-foreground">
            <Shield size={13} /> Staff appear here when they hold a platform-scope role. Requirement changes are
            audit-logged and protected by a fresh MFA check.
          </p>
        </>
      )}

      {/* Phase 6 — step-up MFA dialog (shared retry guard) */}
      {stepUpDialog}
    </div>
  )
}
