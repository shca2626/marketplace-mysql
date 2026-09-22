'use client'

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD TOPBAR — the contextual header for every internal console.
// Left: mobile menu + collapse toggle + breadcrumb (console / section).
// Right: notifications, theme and a role-aware account menu. It deliberately
// contains ZERO storefront elements (no promo bar, no catalog search, no
// category nav) — that chrome belongs exclusively to the public storefront.
// ─────────────────────────────────────────────────────────────────────────────

import { useTheme } from 'next-themes'
import { ChevronRight, LogOut, Menu, Moon, Store, Sun } from 'lucide-react'
import { useMarketplace } from '@/store/marketplace'
import { initials } from '@/lib/format'
import { NotificationsBell } from '@/components/marketplace/notifications-bell'
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

const ROLE_BADGE_CLASS: Record<string, string> = {
  ADMIN: 'rounded-full bg-primary/10 text-primary',
  SELLER: 'rounded-full bg-emerald-600/10 text-emerald-700 dark:text-emerald-400',
  BUYER: 'rounded-full bg-muted',
}

export function DashboardTopbar({
  consoleName,
  sectionLabel,
  onOpenMobileNav,
}: {
  consoleName: string
  sectionLabel: string
  onOpenMobileNav: () => void
}) {
  const user = useMarketplace((s) => s.user)
  const setUser = useMarketplace((s) => s.setUser)
  const navigate = useMarketplace((s) => s.navigate)
  const { theme, setTheme } = useTheme()

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
    navigate('home')
  }

  return (
    <header className="sticky top-0 z-30 w-full border-b bg-background/90 backdrop-blur-md">
      <div className="flex h-14 items-center gap-2 px-4 sm:gap-3 sm:px-6">
        {/* Mobile nav */}
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="Open navigation"
          onClick={onOpenMobileNav}
        >
          <Menu size={19} />
        </Button>

        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px]">
          <span className="hidden shrink-0 font-semibold text-muted-foreground sm:block">{consoleName}</span>
          <ChevronRight size={13} className="hidden shrink-0 text-muted-foreground/50 sm:block" />
          <span className="truncate font-semibold" aria-current="page">
            {sectionLabel}
          </span>
        </nav>

        {/* Right cluster */}
        <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="hidden text-muted-foreground sm:inline-flex"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label="Toggle theme"
          >
            <Sun size={17} className="rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
            <Moon size={17} className="absolute rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
          </Button>

          <NotificationsBell />

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="ml-0.5 flex h-9 w-9 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Account menu"
                >
                  <Avatar className="h-9 w-9 border">
                    <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                      {initials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">{user.name}</p>
                    <Badge variant="secondary" className={ROLE_BADGE_CLASS[user.role] ?? 'rounded-full'}>
                      {user.role}
                    </Badge>
                  </div>
                  <p className="truncate text-xs font-normal text-muted-foreground">{user.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer" onClick={() => navigate('home')}>
                  <Store size={15} className="mr-2" /> View storefront
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut size={15} className="mr-2" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
    </header>
  )
}
