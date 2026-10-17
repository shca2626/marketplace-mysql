'use client'

// ── NETW-1: Selling → Audience (company followers) ──────────────────────────
// The company-side view of its follower graph: total audience, weekly growth
// and the recent followers list (public identities only — name + their own
// company). Read-only intel for the team; the follow itself lives on the
// storefront and in each follower's Following console.

import { Building2, Heart, TrendingUp, Users } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { timeAgo } from '@/lib/format'
import type { OrgAudienceDTO } from '@/server/modules/follows/service'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface AudienceResponse {
  audience: OrgAudienceDTO
}

export function AudienceSub({ organizationId, orgName }: { organizationId: string; orgName: string }) {
  const { data, loading, error } = useApi<AudienceResponse>(
    `/api/follows/org?organizationId=${organizationId}`
  )
  const audience = data?.audience

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="flex flex-wrap items-stretch gap-2.5">
        <MiniStat icon={Users} label="Total followers" value={audience?.total ?? 0} tone="violet" />
        <MiniStat icon={TrendingUp} label="New this week" value={audience?.newThisWeek ?? 0} tone="emerald" />
        <MiniStat icon={Heart} label="Engagement" value={audience && audience.total > 0 ? 'Live' : '—'} tone="rose" />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <Card className="flex flex-col items-center p-10 text-center">
          <Users size={32} className="text-muted-foreground/40" />
          <p className="mt-2 text-sm font-semibold">Couldn&apos;t load your audience</p>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
        </Card>
      ) : !audience || audience.followers.length === 0 ? (
        <Card className="flex flex-col items-center p-10 text-center">
          <Users size={36} className="text-muted-foreground/40" />
          <h3 className="mt-3 text-sm font-bold">No followers yet</h3>
          <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
            Buyers, partners and financiers who follow {orgName} show up here. Great storefront
            photos, fresh offers and sponsored placements grow your audience fastest.
          </p>
        </Card>
      ) : (
        <Card className="rounded-2xl py-0">
          <CardContent className="divide-y px-4 py-2 sm:px-5">
            {audience.followers.map((f) => (
              <div key={f.userId} className="flex items-center gap-3 py-3">
                <Avatar className="h-9 w-9 shrink-0 border">
                  <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                    {f.name
                      .split(' ')
                      .map((w) => w[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-sm font-semibold">{f.name}</p>
                    <Badge
                      variant="secondary"
                      className={cn(
                        'rounded-full text-[10px]',
                        f.role === 'SELLER' && 'bg-primary/10 text-primary'
                      )}
                    >
                      {f.role === 'SELLER' ? 'Merchant' : f.role === 'ADMIN' ? 'Platform' : 'Buyer'}
                    </Badge>
                  </div>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                    {f.memberOrgName ? (
                      <>
                        <Building2 size={10} /> {f.memberOrgName}
                      </>
                    ) : (
                      'Individual member'
                    )}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(f.followedAt)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function MiniStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: number | string
  tone: 'violet' | 'emerald' | 'rose'
}) {
  const tones = {
    violet: 'text-violet-600 dark:text-violet-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    rose: 'text-rose-600 dark:text-rose-400',
  } as const
  return (
    <div className="flex min-w-36 items-center gap-2.5 rounded-xl border bg-muted/30 px-3.5 py-2.5">
      <Icon size={15} className={cn('shrink-0', tones[tone])} />
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-sm font-bold leading-tight">{value}</p>
      </div>
    </div>
  )
}
