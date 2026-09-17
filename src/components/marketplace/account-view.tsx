'use client'

import { AtSign, BadgeCheck, Heart, LayoutDashboard, Package, Settings, ShieldCheck, Store } from 'lucide-react'
import { useMarketplace } from '@/store/marketplace'
import { formatDate, initials } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

export function AccountView() {
  const user = useMarketplace((s) => s.user)
  const navigate = useMarketplace((s) => s.navigate)
  const openAuth = useMarketplace((s) => s.openAuth)

  if (!user) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <Settings size={44} className="text-muted-foreground/40" />
        <h1 className="mt-4 text-xl font-bold">Sign in to manage your account</h1>
        <Button className="mt-6 rounded-xl" onClick={() => openAuth('login', { view: 'account' })}>
          Sign in
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Account settings</h1>

      <div className="mt-6 space-y-6">
        {/* Profile card */}
        <Card>
          <CardContent className="flex flex-wrap items-center gap-5 p-6">
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
                <p className="mt-1 text-xs text-muted-foreground">Member since {formatDate(user.createdAt)}</p>
              )}
            </div>
            {user.role === 'SELLER' && user.storeName && (
              <div className="flex items-center gap-1.5 rounded-xl bg-muted/60 px-4 py-2.5">
                <Store size={15} className="text-primary" />
                <div>
                  <p className="text-sm font-semibold leading-tight">{user.storeName}</p>
                  <p className="text-xs text-muted-foreground">Verified store</p>
                </div>
                <BadgeCheck size={15} className="text-primary" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick links */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Quick links</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {[
              { icon: Package, title: 'My orders', text: 'Track purchases and deliveries', onClick: () => navigate('orders') },
              { icon: Heart, title: 'Favorites', text: 'Products you saved for later', onClick: () => navigate('favorites') },
              {
                icon: LayoutDashboard,
                title: user.role === 'SELLER' ? 'Seller dashboard' : 'Start selling',
                text:
                  user.role === 'SELLER'
                    ? 'Manage listings, orders and stats'
                    : 'Open your own storefront in minutes',
                onClick: () => navigate('seller'),
              },
            ].map((link) => (
              <button
                key={link.title}
                onClick={link.onClick}
                className="flex items-center gap-4 rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <link.icon size={19} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{link.title}</p>
                  <p className="text-xs text-muted-foreground">{link.text}</p>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Security info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck size={16} className="text-primary" /> Security
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>Password</span>
              <Badge variant="secondary" className="rounded-full text-xs">
                Set at registration
              </Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span>Two-factor authentication</span>
              <Badge variant="outline" className="rounded-full text-xs">
                Coming soon
              </Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span>Session</span>
              <Badge className="rounded-full bg-emerald-500 text-xs hover:bg-emerald-500">Active</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
