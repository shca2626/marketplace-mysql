'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import {
  ChevronDown,
  Heart,
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
import type { CategoryDTO } from '@/lib/types'
import { initials } from '@/lib/format'
import { SearchBox } from './search-box'
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
  const setCartOpen = useMarketplace((s) => s.setCartOpen)
  const openAuth = useMarketplace((s) => s.openAuth)
  const setUser = useMarketplace((s) => s.setUser)
  const view = useMarketplace((s) => s.view)
  const activeCategory = useMarketplace((s) => s.params.category)
  const { theme, setTheme } = useTheme()
  const [mobileOpen, setMobileOpen] = useState(false)

  const { data: catData } = useApi<{ categories: CategoryDTO[] }>('/api/categories')
  const categories = catData?.categories ?? []

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
    navigate('home')
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/85 backdrop-blur-md">
      {/* Announcement bar */}
      <div className="bg-primary text-primary-foreground">
        <p className="mx-auto max-w-7xl px-4 py-1.5 text-center text-xs font-medium tracking-wide sm:text-[13px]">
          Free shipping on orders over $75 · Use code <span className="font-bold">WELCOME10</span> for 10% off your
          first order
        </p>
      </div>

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
                <Store className="text-primary" size={20} /> Vendora
              </SheetTitle>
            </SheetHeader>
            <div className="mt-2 space-y-1 px-2">
              {/* Mobile search (desktop search lives in the top bar) */}
              <div className="mb-2 md:hidden">
                <SearchBox
                  inputClassName="h-11 rounded-xl bg-muted/60 pl-10 text-sm"
                  onNavigate={() => setMobileOpen(false)}
                />
              </div>
              <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
                  <span className="text-xs text-muted-foreground">{c.productCount}</span>
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
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Store size={19} />
          </span>
          <span className="hidden text-xl font-extrabold tracking-tight sm:block">Vendora</span>
        </Link>

        {/* Search (desktop) — with live product suggestions */}
        <SearchBox
          className="hidden flex-1 md:block"
          placeholder="Search products, brands and stores…"
          inputClassName="h-10 rounded-full border-input bg-muted/50 pr-12 text-sm shadow-none focus-visible:ring-1"
        />

        {/* Actions */}
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label="Toggle theme"
          >
            <Sun size={18} className="rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
            <Moon size={18} className="absolute rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="relative text-muted-foreground"
            onClick={() => (user ? navigate('favorites') : openAuth('login', { view: 'favorites' }))}
            aria-label="Favorites"
          >
            <Heart size={19} />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="relative text-muted-foreground"
            onClick={() => setCartOpen(true)}
            aria-label={`Cart with ${cartCount} items`}
          >
            <ShoppingCart size={19} />
            {cartCount > 0 && (
              <Badge className="absolute -right-0.5 -top-0.5 h-5 min-w-5 justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
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
                    <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                      {initials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>
                  <p className="truncate text-sm font-semibold">{user.name}</p>
                  <p className="truncate text-xs font-normal text-muted-foreground">{user.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('orders')} className="cursor-pointer">
                  <Package size={15} className="mr-2" /> My Orders
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('favorites')} className="cursor-pointer">
                  <Heart size={15} className="mr-2" /> Favorites
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('account')} className="cursor-pointer">
                  <Settings size={15} className="mr-2" /> Account
                </DropdownMenuItem>
                {(user.role === 'SELLER' || true) && (
                  <DropdownMenuItem onClick={() => navigate('seller')} className="cursor-pointer">
                    <LayoutDashboard size={15} className="mr-2" />
                    {user.role === 'SELLER' ? 'Seller Dashboard' : 'Start Selling'}
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

      {/* Category nav (desktop) */}
      <nav className="hidden border-t lg:block" aria-label="Categories">
        <div className="mx-auto flex h-10 max-w-7xl items-center gap-1 px-4">
          <button
            onClick={() => navigate('catalog')}
            className={cn(
              'flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent hover:text-foreground',
              view === 'catalog' && !activeCategory ? 'bg-accent text-primary' : 'text-foreground/80'
            )}
          >
            All Products
            <ChevronDown size={13} className="text-muted-foreground" />
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => navigate('catalog', { category: c.slug })}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-accent hover:text-foreground',
                view === 'catalog' && activeCategory === c.slug
                  ? 'bg-accent font-medium text-primary'
                  : 'text-foreground/70'
              )}
            >
              {c.name}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-border" />
          <button
            onClick={() => navigate('seller')}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-accent"
          >
            Sell on Vendora
          </button>
        </div>
      </nav>
    </header>
  )
}
