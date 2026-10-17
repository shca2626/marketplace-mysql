'use client'

// ─────────────────────────────────────────────────────────────────────────────
// NETW-1: Following — the buyer-side company console (?view=following).
// Every company this user follows, with storefront stats, one-tap store access
// and unfollow. The audience list a company sees lives in the company
// workspace (Selling → Audience); this is the follower's own list.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  BadgeCheck,
  Building2,
  CalendarCheck,
  Loader2,
  Package,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { useMarketplace } from '@/store/marketplace'
import { formatDate, formatNumber, initials } from '@/lib/format'
import type { FollowedOrgDTO } from '@/server/modules/follows/service'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

interface FollowingResponse {
  following: FollowedOrgDTO[]
}

export function FollowingView() {
  const navigate = useMarketplace((s) => s.navigate)
  const { data, loading, error, refetch } = useApi<FollowingResponse>('/api/follows')
  const following = data?.following ?? []

  const [removing, setRemoving] = useState<string | null>(null)

  const unfollow = async (org: FollowedOrgDTO) => {
    setRemoving(org.orgId)
    const res = await fetch(`/api/follows/${org.orgId}`, { method: 'DELETE' })
    setRemoving(null)
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      toast({ title: 'Could not unfollow', description: json.error ?? 'Please try again.', variant: 'destructive' })
      return
    }
    toast({ title: `Unfollowed ${org.name}`, description: 'You can follow them again anytime.' })
    void refetch()
  }

  const totalListings = following.reduce((sum, f) => sum + f.activeListings, 0)

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="flex flex-wrap items-stretch gap-2.5">
        <MiniStat icon={Building2} label="Companies" value={following.length} tone="primary" />
        <MiniStat icon={Package} label="Active listings" value={totalListings} tone="amber" />
        <MiniStat
          icon={Users}
          label="Combined audience"
          value={following.reduce((sum, f) => sum + f.followerCount, 0)}
          tone="violet"
        />
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <Card className="flex flex-col items-center p-12 text-center">
          <UserMinus size={36} className="text-muted-foreground/40" />
          <p className="mt-3 font-semibold">Couldn&apos;t load your following list</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" className="mt-5 rounded-xl" onClick={() => void refetch()}>
            Try again
          </Button>
        </Card>
      ) : following.length === 0 ? (
        <Card className="flex flex-col items-center p-12 text-center">
          <UserPlus size={40} className="text-muted-foreground/40" />
          <h3 className="mt-4 text-lg font-bold">You don&apos;t follow any company yet</h3>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Follow the companies you buy from, sell to or simply admire — their storefront
            pulse lands here, and they&apos;ll know their audience is listening.
          </p>
          <Button className="mt-6 rounded-xl" onClick={() => navigate('catalog')}>
            <Package size={15} className="mr-1.5" /> Browse the marketplace
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {following.map((f, i) => (
            <motion.div
              key={f.orgId}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(i * 0.05, 0.3) }}
            >
              <Card className="h-full rounded-2xl py-0 transition-shadow hover:shadow-md">
                <CardContent className="flex h-full flex-col gap-4 px-5 py-5">
                  <div className="flex items-start gap-3.5">
                    <Avatar className="h-12 w-12 shrink-0 border">
                      <AvatarFallback className="bg-primary/10 text-base font-bold text-primary">
                        {initials(f.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h3 className="truncate font-semibold">{f.name}</h3>
                        {f.verified && (
                          <BadgeCheck size={15} className="shrink-0 text-primary" aria-label="Verified company" />
                        )}
                      </div>
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <CalendarCheck size={11} /> followed since {formatDate(f.followedAt)}
                      </p>
                    </div>
                    <Badge variant="secondary" className="shrink-0 gap-1 rounded-full">
                      <Users size={10} /> {formatNumber(f.followerCount)}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl border bg-muted/30 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Listings</p>
                      <p className="mt-0.5 text-sm font-bold tabular-nums">{formatNumber(f.activeListings)}</p>
                    </div>
                    <div className="rounded-xl border bg-muted/30 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Member since</p>
                      <p className="mt-0.5 text-sm font-bold">{formatDate(f.memberSince)}</p>
                    </div>
                  </div>

                  <div className="mt-auto flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg text-xs"
                      disabled={removing === f.orgId}
                      onClick={() => void unfollow(f)}
                    >
                      {removing === f.orgId ? (
                        <Loader2 size={13} className="mr-1.5 animate-spin" />
                      ) : (
                        <UserMinus size={13} className="mr-1.5" />
                      )}
                      Unfollow
                    </Button>
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

function MiniStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: number
  tone: 'primary' | 'amber' | 'violet'
}) {
  const tones = {
    primary: 'text-primary',
    amber: 'text-amber-600 dark:text-amber-400',
    violet: 'text-violet-600 dark:text-violet-400',
  } as const
  return (
    <div className="flex min-w-36 items-center gap-2.5 rounded-xl border bg-muted/30 px-3.5 py-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Icon size={15} className={tones[tone]} />
      </span>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-sm font-bold tabular-nums">{formatNumber(value)}</p>
      </div>
    </div>
  )
}
