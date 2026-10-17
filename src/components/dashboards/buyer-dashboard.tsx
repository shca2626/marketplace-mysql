'use client'

// ─────────────────────────────────────────────────────────────────────────────
// BUYER DASHBOARD — the signed-in user's account hub ("My Account" console).
// Replaces the old flat AccountView quick-links page: real activity counts,
// clear profile & security sections and one consistent page header. All other
// buyer surfaces (RFQs, Business, Orders, Favorites) are sidebar entries that
// stay inside this same console shell.
//
// Tabs (IA-100): ?view=account is the overview; ?view=account&tab=profile is
// the dedicated Profile & Security panel (BUY-211). The storefront account
// dropdown's "Account settings" entry points at the profile tab while "My
// dashboard" keeps the overview.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import {
  AtSign,
  BadgeCheck,
  Briefcase,
  Building2,
  CalendarDays,
  FileText,
  Heart,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MailCheck,
  Package,
  RefreshCw,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  UserCog,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'
import { useApi } from '@/hooks/use-api'
import { formatDate, initials } from '@/lib/format'
import type { OrderDTO, RfqDTO } from '@/lib/types'
import { DashboardLayout, PageHeader, SignInRequired } from './dashboard-layout'
import { ProfileSecurityPanel } from './buyer-profile-security'
import { ReferralCard } from '@/components/marketplace/referral-card'
import { BUYER_NAV } from './nav-config'
import type { NavItem } from './nav-config'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'

export function BuyerDashboard() {
  const user = useMarketplace((s) => s.user)
  const authChecked = useMarketplace((s) => s.authChecked)
  const navigate = useMarketplace((s) => s.navigate)
  const setUser = useMarketplace((s) => s.setUser)
  const params = useMarketplace((s) => s.params)
  const [sendingVerify, setSendingVerify] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  // IA-100: ?view=account&tab=profile opens the Profile & Security panel;
  // every other value (or none) lands on the overview. (routing only parses
  // `tab` while the account view is active, so this can't leak across views.)
  const tab = params.accountTab === 'profile' ? 'profile' : 'overview'

  const resendVerification = async () => {
    if (sendingVerify) return
    setSendingVerify(true)
    try {
      const res = await fetch('/api/auth/verify-email/request', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Couldn\u2019t send the email', description: json.error, variant: 'destructive' })
        return
      }
      toast({
        title: 'Verification email sent',
        description: 'Check your inbox (and spam folder) — the link is valid for 48 hours.',
      })
    } catch {
      toast({ title: 'Error', description: 'Network error — please try again', variant: 'destructive' })
    } finally {
      setSendingVerify(false)
    }
  }

  const signOutEverywhere = async () => {
    if (signingOut) return
    setSigningOut(true)
    try {
      const res = await fetch('/api/auth/sign-out-everywhere', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Action failed', description: json.error, variant: 'destructive' })
        return
      }
      setUser(null)
      navigate('home')
      toast({
        title: 'Signed out everywhere',
        description: 'All devices were disconnected from your account.',
      })
    } catch {
      toast({ title: 'Error', description: 'Network error — please try again', variant: 'destructive' })
    } finally {
      setSigningOut(false)
    }
  }

  const { data: ordersData } = useApi<{ orders: OrderDTO[] }>(user ? '/api/orders' : null, { skip: !user })
  const { data: rfqData } = useApi<{ rfqs: RfqDTO[] }>(user ? '/api/rfqs' : null, { skip: !user })

  // Sidebar items carry their own view + params (nav-config); the Profile &
  // Security item navigates to this same view with accountTab=profile.
  const onNavigate = (item: NavItem) => navigate(item.view ?? 'account', item.params)

  const tiles = useMemo(
    () => [
      {
        key: 'orders',
        icon: Package,
        title: 'My Orders',
        description: 'Purchases, tracking & invoices',
        value: ordersData?.orders?.length,
        view: 'orders' as const,
      },
      {
        key: 'rfqs',
        icon: FileText,
        title: 'My RFQs',
        description: 'Quote requests & negotiations',
        value: rfqData?.rfqs?.length,
        view: 'rfqs' as const,
      },
      {
        key: 'favorites',
        icon: Heart,
        title: 'Favorites',
        description: 'Products saved for later',
        value: undefined,
        view: 'favorites' as const,
      },
      {
        key: 'business',
        icon: Briefcase,
        title: 'Business Account',
        description: 'Organization, team & pricing',
        value: undefined,
        view: 'business' as const,
      },
    ],
    [ordersData, rfqData]
  )

  if (!user && authChecked) {
    return (
      <SignInRequired
        icon={Settings}
        title="My account"
        description="Sign in to manage your orders, quotes and preferences."
        afterView="account"
      />
    )
  }
  if (!user) return null

  // ── Profile & Security tab (BUY-211 / IA-100) ──
  if (tab === 'profile') {
    return (
      <DashboardLayout role="buyer" nav={BUYER_NAV} activeKey="profile" onNavigate={onNavigate}>
        <ProfileSecurityPanel />
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout role="buyer" nav={BUYER_NAV} activeKey="account" onNavigate={onNavigate}>
      <PageHeader
        icon={LayoutDashboard}
        title={`Welcome back, ${user.name.split(' ')[0]}`}
        description="Your profile, security and everything you do on Vendora — in one place."
        actions={
          <Button variant="outline" className="rounded-xl" onClick={() => navigate('home')}>
            <ShoppingBag size={15} className="mr-1.5" /> Continue shopping
          </Button>
        }
      />

      {/* Activity tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((tile) => (
          <button
            key={tile.key}
            type="button"
            onClick={() => navigate(tile.view)}
            className="group flex flex-col items-start gap-3 rounded-2xl border bg-card p-5 text-left shadow-sm outline-none transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <tile.icon size={19} />
            </span>
            <div className="w-full min-w-0">
              <p className="flex min-w-0 items-baseline gap-2 text-sm font-semibold">
                <span className="truncate">{tile.title}</span>
                {typeof tile.value === 'number' && (
                  <span className="rounded-full bg-muted px-1.5 py-px text-[10.5px] font-bold tabular-nums text-muted-foreground">
                    {tile.value}
                  </span>
                )}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{tile.description}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Profile */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BadgeCheck size={16} className="text-primary" /> Profile
            </CardTitle>
            <Button size="sm" variant="outline" className="rounded-lg" onClick={() => navigate('account', { accountTab: 'profile' })}>
              <UserCog size={13} className="mr-1.5" /> Edit profile & security
            </Button>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap items-center gap-5">
              <Avatar className="h-16 w-16 border-2">
                <AvatarFallback className="bg-primary/10 text-lg font-bold text-primary">
                  {initials(user.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold">{user.name}</h2>
                  <Badge
                    variant="secondary"
                    className={
                      user.role === 'SELLER'
                        ? 'rounded-full bg-primary/10 text-primary'
                        : 'rounded-full'
                    }
                  >
                    {user.role === 'SELLER' ? 'Seller' : 'Buyer'}
                  </Badge>
                </div>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <AtSign size={13} /> {user.email}
                </p>
                {user.createdAt && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarDays size={12} /> Member since {formatDate(user.createdAt)}
                  </p>
                )}
              </div>
            </div>

            {user.role === 'SELLER' && user.storeName && (
              <>
                <Separator />
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/50 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Store size={16} className="text-primary" />
                    <div>
                      <p className="text-sm font-semibold leading-tight">{user.storeName}</p>
                      <p className="text-xs text-muted-foreground">
                        {user.storeBio ? user.storeBio : 'Your public storefront'}
                      </p>
                    </div>
                    <BadgeCheck size={15} className="text-primary" />
                  </div>
                  <Button size="sm" variant="outline" className="rounded-lg" onClick={() => navigate('seller')}>
                    Open seller dashboard
                  </Button>
                </div>
              </>
            )}

            {user.role !== 'SELLER' && (
              <>
                <Separator />
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-primary/40 bg-primary/[0.04] px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <Building2 size={16} className="text-primary" />
                    <div>
                      <p className="text-sm font-semibold leading-tight">Buying for a business?</p>
                      <p className="text-xs text-muted-foreground">
                        Register your company for team purchasing, NET payment terms and financing.
                      </p>
                    </div>
                  </div>
                  <Button size="sm" className="rounded-lg" onClick={() => navigate('register-company')}>
                    Register a company
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Security — AUTHSEC-1: live verification status, resend link, global sign-out */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck size={16} className="text-primary" /> Security
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Two-factor authentication</span>
              <Badge variant="outline" className="rounded-full text-xs">
                Coming soon
              </Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Session</span>
              <Badge className="rounded-full bg-emerald-500 text-xs hover:bg-emerald-500">Active</Badge>
            </div>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Email verification</span>
                {user.emailVerifiedAt ? (
                  <Badge className="rounded-full bg-emerald-500 text-[11px] font-semibold text-white hover:bg-emerald-500">
                    <MailCheck size={11} className="mr-1" /> Verified
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="rounded-full text-[11px]">
                    Not verified
                  </Badge>
                )}
              </div>
              {!user.emailVerifiedAt && (
                <div className="space-y-2 rounded-xl bg-muted/50 p-3">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Verify your email to secure account recovery and order notifications.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full rounded-lg"
                    disabled={sendingVerify}
                    onClick={resendVerification}
                  >
                    {sendingVerify ? (
                      <RefreshCw size={13} className="mr-1.5 animate-spin" />
                    ) : (
                      <MailCheck size={13} className="mr-1.5" />
                    )}
                    Resend verification email
                  </Button>
                </div>
              )}
            </div>
            <Separator />
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-muted-foreground">Password</span>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 rounded-lg px-2.5 text-xs text-primary hover:text-primary"
                    onClick={() => navigate('account', { accountTab: 'profile' })}
                  >
                    <KeyRound size={12} className="mr-1" /> Change password
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 rounded-lg px-2.5 text-xs text-muted-foreground hover:text-muted-foreground"
                    onClick={() => navigate('forgot-password')}
                  >
                    <MailCheck size={12} className="mr-1" /> Reset via email
                  </Button>
                </div>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Change it right here while signed in — other devices sign out, this one stays.
              </p>
            </div>
            <Separator />
            <Button
              size="sm"
              variant="destructive"
              className="w-full rounded-lg"
              disabled={signingOut}
              onClick={signOutEverywhere}
            >
              {signingOut ? (
                <RefreshCw size={13} className="mr-1.5 animate-spin" />
              ) : (
                <LogOut size={13} className="mr-1.5" />
              )}
              Sign out of all devices
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* NETW-1: referral program — code, invites and join stats */}
      <ReferralCard />
    </DashboardLayout>
  )
}
