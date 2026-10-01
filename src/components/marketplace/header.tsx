'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import {
  BarChart3,
  Building2,
  ChevronDown,
  FileText,
  Heart,
  Landmark,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Moon,
  Package,
  Settings,
  ShoppingCart,
  Store,
  Sun,
  User,
} from 'lucide-react'
import { useMarketplace } from '@/store/marketplace'
import { useApi } from '@/hooks/use-api'
import type { CategoryDTO, OrganizationDTO } from '@/lib/types'
import { initials } from '@/lib/format'
import { SearchBox } from './search-box'
import { NotificationsBell } from './notifications-bell'
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

export function Header() {
  const navigate = useMarketplace((s) => s.navigate)
  const user = useMarketplace((s) => s.user)
  const cartCount = useMarketplace((s) => s.cart).reduce((sum, i) => sum + i.quantity, 0)
  const announcement = useMarketplace((s) => s.settings?.general)
  const setCartOpen = useMarketplace((s) => s.setCartOpen)
  const openAuth = useMarketplace((s) => s.openAuth)
  const setUser = useMarketplace((s) => s.setUser)
  const view = useMarketplace((s) => s.view)
  const activeCategory = useMarketplace((s) => s.params.category)
  const { theme, setTheme } = useTheme()
  const [mobileOpen, setMobileOpen] = useState(false)

  const { data: catData } = useApi<{ categories: CategoryDTO[] }>('/api/categories')
  const categories = catData?.categories ?? []

  // Financier console entry (FIN-005): visible for OWNER/ADMIN members of a
  // BANK/MFI/EWALLET org — same membership the console guard checks.
  const { data: myOrgsData } = useApi<{ organizations: OrganizationDTO[] }>(
    user ? '/api/organizations' : null,
    { skip: !user }
  )
  const isFinancierStaff = (myOrgsData?.organizations ?? []).some(
    (o) =>
      ['BANK', 'MFI', 'EWALLET'].includes(o.orgType ?? '') &&
      (o.myRole === 'OWNER' || o.myRole === 'ADMIN')
  )

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
    navigate('home')
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-bh-border bg-bh-card/95 backdrop-blur-md">
      {/* Announcement bar — admin-controlled (Platform Settings → Branding) */}
      {announcement?.announcementEnabled !== false && (
        <div className="bg-gradient-to-r from-[#052e56] via-[#06396c] to-[#0a4a8c]">
          <p className="mx-auto max-w-7xl px-4 py-1.5 text-center text-xs font-medium tracking-wide text-white/90 sm:text-[13px]">
            {announcement?.announcementText ||
              'Free shipping on orders over $100 · Engineer-reviewed solar gear · Use code SUN10 for 10% off your first array'}
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
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-bh-navy-deep text-bh-gold">
                  <Store size={15} />
                </span>
                Vendora
              </SheetTitle>
            </SheetHeader>
            <div className="mt-2 space-y-1 px-2">
              {/* Mobile search (desktop search lives in the top bar) */}
              <div className="mb-2 md:hidden">
                <SearchBox
                  inputClassName="h-11 rounded-xl bg-bh-soft-blue/70 pl-10 text-sm focus-visible:border-bh-gold/60 focus-visible:ring-bh-gold/40"
                  onNavigate={() => setMobileOpen(false)}
                />
              </div>
              <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-bh-muted">
                Shop
              </p>
              <Button
                variant="ghost"
                className="w-full justify-start"
                onClick={() => {
                  setMobileOpen(false)
                  navigate('catalog')
                }}
              >
                All Products
              </Button>
              {categories.map((c) => (
                <Button
                  key={c.id}
                  variant="ghost"
                  className="w-full justify-between"
                  onClick={() => {
                    setMobileOpen(false)
                    navigate('catalog', { category: c.slug })
                  }}
                >
                  <span>{c.name}</span>
                  <span className="text-xs text-bh-muted">{c.productCount}</span>
                </Button>
              ))}
            </div>
          </SheetContent>
        </Sheet>

        {/* Logo */}
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2"
          onClick={(e) => {
            e.preventDefault()
            navigate('home')
          }}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-bh-navy-deep text-bh-gold shadow-card">
            <Store size={19} />
          </span>
          <span className="hidden text-xl font-extrabold tracking-tight text-bh-navy sm:block">Vendora</span>
        </Link>

        {/* Search (desktop) — with live product suggestions */}
        <SearchBox
          className="hidden flex-1 md:block"
          placeholder="Search products, brands and stores…"
          inputClassName="h-10 rounded-full border-bh-border-dark bg-bh-card pr-12 text-sm shadow-none focus-visible:border-bh-gold/60 focus-visible:ring-bh-gold/40"
        />

        {/* Actions */}
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="text-bh-muted hover:text-bh-gold-dark"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label="Toggle theme"
          >
            <Sun size={18} className="rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
            <Moon size={18} className="absolute rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="relative text-bh-muted hover:text-bh-gold-dark"
            onClick={() => (user ? navigate('favorites') : openAuth('login', { view: 'favorites' }))}
            aria-label="Favorites"
          >
            <Heart size={19} />
          </Button>

          <NotificationsBell />

          <Button
            variant="ghost"
            size="icon"
            className="relative text-bh-muted hover:text-bh-gold-dark"
            onClick={() => setCartOpen(true)}
            aria-label={`Cart with ${cartCount} items`}
          >
            <ShoppingCart size={19} />
            {cartCount > 0 && (
              <Badge className="absolute -right-0.5 -top-0.5 h-5 min-w-5 justify-center rounded-full bg-bh-gold px-1 text-[10px] font-bold leading-none text-bh-navy-deep">
                {cartCount > 99 ? '99+' : cartCount}
              </Badge>
            )}
          </Button>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex h-9 w-9 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Account menu"
                >
                  <Avatar className="h-9 w-9 border">
                    <AvatarFallback className="bg-bh-bg-gold text-xs font-bold text-bh-gold-dark">
                      {initials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>
                  <p className="truncate text-sm font-semibold text-bh-navy">{user.name}</p>
                  <p className="truncate text-xs font-normal text-bh-muted">{user.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {/* Role-aware dashboard entry — the internal dashboards are separate
                    surfaces; the storefront menu is the doorway to them.
                    RBAC Phase 2: platform staff (scoped role holders) enter the
                    admin console too — the server guards their actual reach. */}
                {(user.role === 'ADMIN' || user.isPlatformStaff) && (
                  <DropdownMenuItem onClick={() => navigate('admin')} className="cursor-pointer font-medium">
                    <BarChart3 size={15} className="mr-2" /> Admin dashboard
                  </DropdownMenuItem>
                )}
                {user.role === 'SELLER' && (
                  <DropdownMenuItem onClick={() => navigate('seller')} className="cursor-pointer font-medium">
                    <LayoutDashboard size={15} className="mr-2" /> Seller dashboard
                  </DropdownMenuItem>
                )}
                {user.role !== 'ADMIN' && user.role !== 'SELLER' && (
                  <DropdownMenuItem onClick={() => navigate('account')} className="cursor-pointer font-medium">
                    <LayoutDashboard size={15} className="mr-2" /> My dashboard
                  </DropdownMenuItem>
                )}
                {isFinancierStaff && (
                  <DropdownMenuItem onClick={() => navigate('financier')} className="cursor-pointer font-medium">
                    <Landmark size={15} className="mr-2" /> Financier console
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('orders')} className="cursor-pointer">
                  <Package size={15} className="mr-2" /> My Orders
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('rfqs')} className="cursor-pointer">
                  <FileText size={15} className="mr-2" /> Request for Quotes
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('favorites')} className="cursor-pointer">
                  <Heart size={15} className="mr-2" /> Favorites
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('business')} className="cursor-pointer">
                  <Building2 size={15} className="mr-2" /> Business Account
                </DropdownMenuItem>
                {/* IA-100: "Account settings" opens the dedicated Profile &
                    Security tab; "My dashboard" above keeps the overview. */}
                <DropdownMenuItem
                  onClick={() => navigate('account', { accountTab: 'profile' })}
                  className="cursor-pointer"
                >
                  <Settings size={15} className="mr-2" /> Account settings
                </DropdownMenuItem>
                {(user.role === 'BUYER' || !user.role) && (
                  <DropdownMenuItem onClick={() => navigate('seller')} className="cursor-pointer">
                    <Store size={15} className="mr-2" /> Start selling
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive">
                  <LogOut size={15} className="mr-2" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button size="sm" className="rounded-full" onClick={() => openAuth('login')}>
              <LogIn size={15} className="mr-1.5" />
              <span className="hidden sm:inline">Sign in</span>
            </Button>
          )}
        </div>
      </div>

      {/* Category nav (desktop) — bh pill chips */}
      <nav className="hidden border-t border-bh-border lg:block" aria-label="Categories">
        <div className="mx-auto flex h-10 max-w-7xl items-center gap-1.5 px-4">
          <button
            onClick={() => navigate('catalog')}
            className={cn(
              'flex items-center gap-1 rounded-full border px-3 py-1 text-[13px] font-medium transition-colors',
              view === 'catalog' && !activeCategory
                ? 'border-bh-navy bg-bh-navy text-white'
                : 'border-transparent text-bh-subtle hover:border-bh-gold/50 hover:text-bh-navy'
            )}
          >
            All Products
            <ChevronDown size={13} className="opacity-60" />
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => navigate('catalog', { category: c.slug })}
              className={cn(
                'group rounded-full border px-3 py-1 text-[13px] transition-colors',
                view === 'catalog' && activeCategory === c.slug
                  ? 'border-bh-navy bg-bh-navy font-medium text-white'
                  : 'border-transparent text-bh-subtle hover:border-bh-gold/50 hover:text-bh-navy'
              )}
            >
              {c.name}
              <span
                className={cn(
                  'ml-1.5 inline-block rounded-full px-1.5 py-px text-[10px] font-semibold leading-none tabular-nums transition-colors',
                  view === 'catalog' && activeCategory === c.slug
                    ? 'bg-white/20 text-white'
                    : 'bg-bh-soft-blue text-bh-muted group-hover:bg-bh-bg-gold group-hover:text-bh-gold-dark'
                )}
              >
                {c.productCount}
              </span>
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-bh-border" />
          {user?.role !== 'ADMIN' && (
            <button
              onClick={() => navigate('seller')}
              className="rounded-full px-3 py-1 text-[13px] font-semibold text-bh-gold-dark transition-colors hover:bg-bh-bg-gold/60 hover:text-bh-navy"
            >
              Sell on Vendora
            </button>
          )}
        </div>
      </nav>
    </header>
  )
}
