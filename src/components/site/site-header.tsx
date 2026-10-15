'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import {
  Building2,
  ChevronDown,
  Heart,
  Landmark,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Moon,
  Package,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sun,
  Wallet,
} from 'lucide-react'
import { useMarketplace, markStoreHydrated } from '@/store/marketplace'
import { initials } from '@/lib/format'
import { AuthModal } from '@/components/marketplace/auth-modal'
import { SolarIcon } from './solar-icon'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

/**
 * Platform site header (pagedesign.md §4.1) — renders on every public page
 * OUTSIDE the market: the five primary pages, theme toggle, cross-page cart
 * badge (same persisted store as the market) and the shared auth modal.
 */
const emptySubscribe = () => () => {}

/** Hydration-safe "mounted" check without setState-in-effect (lint rule). */
function useIsClient() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  )
}

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/market', label: 'Market' },
  { href: '/funding', label: 'Funding' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
]

const DEFAULT_ANNOUNCEMENT =
  'Free shipping on orders over $100 · Engineer-reviewed solar gear · Use code SUN10 for 10% off your first array'

export function SiteHeader() {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const user = useMarketplace((s) => s.user)
  const setUser = useMarketplace((s) => s.setUser)
  const openAuth = useMarketplace((s) => s.openAuth)
  const cart = useMarketplace((s) => s.cart)

  const mounted = useIsClient()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [announcement, setAnnouncement] = useState<{ enabled: boolean; text: string } | null>(null)

  // Boot: rehydrate the persisted cart (shared with the market SPA), restore
  // the session and load admin-controlled announcement text. All setState
  // calls live inside async callbacks (external-system sync).
  useEffect(() => {
    void Promise.resolve(useMarketplace.persist.rehydrate()).then(markStoreHydrated)
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' })
        const json = (await res.json()) as { user: typeof user }
        if (!cancelled && json.user) setUser(json.user)
      } catch {
        // offline — stay signed out
      }
    })()
    void (async () => {
      try {
        const res = await fetch('/api/settings', { cache: 'no-store' })
        if (!res.ok) return
        const json = (await res.json()) as { settings?: { general?: { announcementEnabled?: boolean; announcementText?: string } } }
        const g = json.settings?.general
        if (!cancelled && g) {
          setAnnouncement({ enabled: g.announcementEnabled !== false, text: g.announcementText ?? DEFAULT_ANNOUNCEMENT })
        }
      } catch {
        // keep default announcement
      }
    })()
    return () => {
      cancelled = true
    }
  }, [setUser])

  const cartCount = mounted ? cart.reduce((sum, i) => sum + i.quantity, 0) : 0

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // best-effort
    }
    setUser(null)
  }

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)

  const accountLinks = [
    { href: '/market?view=account', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/market?view=orders', label: 'My orders', icon: Package },
    { href: '/market?view=favorites', label: 'Favorites', icon: Heart },
    { href: '/market?view=financing', label: 'My funding requests', icon: Wallet },
    { href: '/market?view=rfqs', label: 'RFQ inbox (B2B)', icon: Building2 },
    ...(user?.role === 'SELLER'
      ? [{ href: '/market?view=seller', label: 'Merchant console', icon: Settings }]
      : []),
    ...(user?.role === 'ADMIN'
      ? [{ href: '/market?view=admin', label: 'Admin console', icon: ShieldCheck }]
      : []),
  ]

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/85 backdrop-blur-md">
      {/* Announcement bar — admin-controlled (Platform Settings → Branding) */}
      {announcement?.enabled !== false && (
        <div className="bg-primary text-primary-foreground">
          <p className="mx-auto max-w-7xl px-4 py-1.5 text-center text-xs font-medium tracking-wide sm:text-[13px]">
            {announcement?.text || DEFAULT_ANNOUNCEMENT}
          </p>
        </div>
      )}

      {/* Main bar */}
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:gap-5">
        {/* Mobile menu */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
              <Menu size={20} />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 text-left">
                <SolarIcon size={20} className="text-primary" /> Vendora
              </SheetTitle>
            </SheetHeader>
            <nav aria-label="Platform" className="mt-2 space-y-1 px-2">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  aria-current={isActive(item.href) ? 'page' : undefined}
                  className={cn(
                    'flex min-h-11 items-center rounded-xl px-3 text-[15px] font-medium transition-colors',
                    isActive(item.href)
                      ? 'bg-primary/10 text-primary'
                      : 'text-foreground hover:bg-muted'
                  )}
                >
                  {item.label}
                </Link>
              ))}
              <div className="my-3 border-t" />
              <p className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                For business
              </p>
              <Link
                href="/market?view=register-company"
                onClick={() => setMobileOpen(false)}
                className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Building2 size={16} className="text-primary" /> Register a company
              </Link>
              <Link
                href="/market?view=register-financier"
                onClick={() => setMobileOpen(false)}
                className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Landmark size={16} className="text-primary" /> Financing entity
              </Link>
              <div className="my-3 border-t" />
              {user ? (
                <>
                  {accountLinks.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      onClick={() => setMobileOpen(false)}
                      className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <l.icon size={16} className="text-primary" /> {l.label}
                    </Link>
                  ))}
                  <button
                    onClick={() => {
                      setMobileOpen(false)
                      void logout()
                    }}
                    className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <LogOut size={16} className="text-primary" /> Sign out
                  </button>
                </>
              ) : (
                <Button
                  className="mt-1 w-full rounded-xl"
                  onClick={() => {
                    setMobileOpen(false)
                    openAuth('login')
                  }}
                >
                  <LogIn size={16} className="mr-2" /> Sign in
                </Button>
              )}
            </nav>
          </SheetContent>
        </Sheet>

        {/* Brand */}
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-md px-1 py-1 transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label="Vendora home"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <SolarIcon size={20} />
          </span>
          <span className="hidden text-lg font-extrabold tracking-tight sm:block">Vendora</span>
        </Link>

        {/* Desktop nav — the five primary pages */}
        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={cn(
                'rounded-full px-3.5 py-2 text-sm font-medium transition-colors',
                isActive(item.href)
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {item.label}
            </Link>
          ))}
          {/* For business — company & financier registration doors */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  'flex items-center gap-1 rounded-full px-3.5 py-2 text-sm font-medium transition-colors',
                  pathname.includes('view=register-')
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                For business <ChevronDown size={13} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wider">
                Join as a business
              </DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link href="/market?view=register-company">
                  <Building2 size={15} className="text-primary" />
                  <span className="min-w-0">
                    Merchant / Company
                    <span className="block text-xs font-normal text-muted-foreground">
                      Sell on the shared catalog & buy in bulk
                    </span>
                  </span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/market?view=register-financier">
                  <Landmark size={15} className="text-primary" />
                  <span className="min-w-0">
                    Financing entity
                    <span className="block text-xs font-normal text-muted-foreground">
                      Bank, MFI or e-wallet — fund solar buyers
                    </span>
                  </span>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {/* Theme toggle */}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle theme"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {mounted && theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
          </Button>

          {/* Cross-page cart — same persisted store as the market SPA */}
          <Button variant="ghost" size="icon" asChild className="relative" aria-label={`Cart, ${cartCount} items`}>
            <Link href="/market?view=cart">
              <ShoppingCart size={19} />
              {cartCount > 0 && (
                <Badge className="absolute -right-0.5 -top-0.5 min-w-[18px] justify-center rounded-full px-1 py-0 text-[10px] font-bold leading-[18px]">
                  {cartCount > 99 ? '99+' : cartCount}
                </Badge>
              )}
            </Link>
          </Button>

          {/* Account */}
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-1.5 rounded-full p-0.5 pr-1.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  aria-label="Account menu"
                >
                  <Avatar className="h-8 w-8 border">
                    <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                      {initials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <ChevronDown size={14} className="text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>
                  <p className="truncate text-sm font-semibold">{user.name}</p>
                  <p className="truncate text-xs font-normal text-muted-foreground">{user.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {accountLinks.map((l) => (
                  <DropdownMenuItem key={l.href} asChild>
                    <Link href={l.href}>
                      <l.icon size={15} className="text-primary" /> {l.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
                {!user.isPlatformStaff && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/market?view=register-company">
                        <Building2 size={15} className="text-primary" /> Register a company
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void logout()} className="text-destructive focus:text-destructive">
                  <LogOut size={15} /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button
                variant="ghost"
                className="hidden rounded-full sm:inline-flex"
                onClick={() => openAuth('login')}
              >
                Sign in
              </Button>
              <Button className="rounded-full" onClick={() => openAuth('register')}>
                Get started
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Shared auth modal — same store as the market's */}
      <AuthModal />
    </header>
  )
}
