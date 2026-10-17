'use client'

// ── NETW-1: SSR storefront follow button ────────────────────────────────────
// Client island mounted in the server-rendered /market/store/[id] hero. It
// self-fetches the public seller profile (which carries the company follow
// context + viewer state) and toggles the follow server-side. Signed-out
// visitors get the auth modal first (the public shell mounts the SPA store).

import { useEffect, useState } from 'react'
import { Check, Loader2, UserPlus } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'

interface FollowState {
  orgId: string
  orgName: string
  followerCount: number
  viewerFollows: boolean
}

export function StoreFollowButton({
  sellerId,
  storeName,
}: {
  sellerId: string
  storeName: string
}) {
  const user = useMarketplace((s) => s.user)
  const authChecked = useMarketplace((s) => s.authChecked)
  const openAuth = useMarketplace((s) => s.openAuth)
  const [follow, setFollow] = useState<FollowState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    // (re)fetch once the session is known — the follow state is viewer-scoped
    if (!authChecked) return
    let cancelled = false
    void fetch(`/api/sellers/${sellerId}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled && json?.follow) setFollow(json.follow as FollowState)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [sellerId, authChecked, user?.id])

  if (!follow) return null // sellers without a COMPANY org: no follow surface

  const toggle = async () => {
    if (!user) {
      openAuth('login', { view: 'store', params: { sellerId } })
      return
    }
    setBusy(true)
    const next = !follow.viewerFollows
    const res = next
      ? await fetch('/api/follows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orgId: follow.orgId }),
        }).catch(() => null)
      : await fetch(`/api/follows/${follow.orgId}`, { method: 'DELETE' }).catch(() => null)
    setBusy(false)
    if (!res || !res.ok) {
      const json = res ? await res.json().catch(() => ({})) : {}
      toast({
        title: next ? 'Could not follow' : 'Could not unfollow',
        description: (json as { error?: string }).error ?? 'Please try again in a moment.',
        variant: 'destructive',
      })
      return
    }
    setFollow({ ...follow, viewerFollows: next, followerCount: Math.max(0, follow.followerCount + (next ? 1 : -1)) })
    toast(
      next
        ? { title: `Following ${storeName}`, description: 'Their storefront pulse lands in your Following feed.' }
        : { title: `Unfollowed ${storeName}` }
    )
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy}
      aria-pressed={follow.viewerFollows}
      className={
        follow.viewerFollows
          ? 'inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/20 disabled:opacity-60'
          : 'inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-bh-gold px-4 text-sm font-bold text-bh-navy transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60'
      }
    >
      {busy ? (
        <Loader2 size={15} className="animate-spin" />
      ) : follow.viewerFollows ? (
        <Check size={15} />
      ) : (
        <UserPlus size={15} />
      )}
      {follow.viewerFollows ? 'Following' : 'Follow'}
      {follow.followerCount > 0 && (
        <span className="rounded-full bg-black/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
          {follow.followerCount}
        </span>
      )}
    </button>
  )
}
