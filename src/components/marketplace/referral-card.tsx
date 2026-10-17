'use client'


// ─────────────────────────────────────────────────────────────────────────────
// NETW-1: Referral program card — shared by the buyer account dashboard and
// the legacy account view. Shows the user's code, copy/share actions, join
// stats and the recent referrals list.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { Check, Copy, Gift, Share2, Users } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { initials, timeAgo } from '@/lib/format'
import { absoluteUrl } from '@/lib/share'
import type { ReferralDTO } from '@/server/modules/referrals/service'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

// ── NETW-1: referral program card ─────────────────────────────────────────

interface ReferralResponse {
  referral: ReferralDTO
}

export function ReferralCard() {
  const { data, loading, error, refetch } = useApi<ReferralResponse>('/api/referrals')
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)

  const copy = async (what: 'code' | 'link') => {
    if (!data) return
    const text = what === 'code' ? data.referral.code : absoluteUrl(data.referral.shareUrl)
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      toast({ title: 'Copy failed', description: 'Select and copy manually instead.', variant: 'destructive' })
      return
    }
    setCopied(what)
    setTimeout(() => setCopied(null), 1800)
    toast({ title: what === 'code' ? 'Code copied' : 'Invite link copied', description: 'Share it anywhere you like.' })
  }

  const shareLink = async () => {
    if (!data) return
    const url = absoluteUrl(data.referral.shareUrl)
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Join me on Vendora', text: 'Discover Vendora — the solar B2B marketplace.', url })
        return
      } catch {
        // user dismissed — fall through to copy
      }
    }
    void copy('link')
  }

  return (
    <Card id="referral-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gift size={16} className="text-primary" /> Referral program
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : error || !data ? (
          <div className="flex flex-col items-center py-4 text-center">
            <p className="text-sm font-semibold">Couldn&apos;t load your referral code</p>
            <p className="mt-1 text-xs text-muted-foreground">{error ?? 'Please try again.'}</p>
            <Button variant="outline" size="sm" className="mt-3 rounded-xl" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 rounded-2xl border bg-gradient-to-br from-primary/10 via-card to-amber-500/10 p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Your referral code</p>
                <p className="mt-1 font-mono text-2xl font-bold tracking-[0.2em] text-primary">{data.referral.code}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="outline" className="rounded-xl" onClick={() => void copy('code')}>
                  {copied === 'code' ? <Check size={14} className="mr-1.5" /> : <Copy size={14} className="mr-1.5" />}
                  {copied === 'code' ? 'Copied!' : 'Copy code'}
                </Button>
                <Button size="sm" className="rounded-xl" onClick={() => void shareLink()}>
                  <Share2 size={14} className="mr-1.5" /> Invite
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Stat label="Total joins" value={data.referral.stats.total} />
              <Stat label="Last 30 days" value={data.referral.stats.last30Days} />
              <Stat label="Merchants" value={data.referral.stats.sellers} />
            </div>

            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <Users size={12} /> Recent joins
              </p>
              {data.referral.recent.length === 0 ? (
                <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
                  Nobody has joined with your code yet — share it with colleagues in the solar trade.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {data.referral.recent.map((r, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-xl border bg-muted/30 px-3 py-2">
                      <Avatar className="h-7 w-7 border">
                        <AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">
                          {initials(r.name)}
                        </AvatarFallback>
                      </Avatar>
                      <p className="min-w-0 flex-1 truncate text-xs font-semibold">{r.name}</p>
                      <Badge variant="secondary" className="rounded-full text-[10px]">
                        {r.role === 'SELLER' ? 'Merchant' : 'Buyer'}
                      </Badge>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(r.joinedAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Anyone who registers with your code is attributed to you forever — as the network grows,
              referral rewards unlock on your account.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}



function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-muted/30 px-3 py-2.5 text-center">
      <p className="text-lg font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  )
}
