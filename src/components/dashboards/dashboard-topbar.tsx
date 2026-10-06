'use client'

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD TOPBAR — the contextual header for every internal dashboard.
// Left: mobile menu + breadcrumb (dashboard / section).
// Right: "view storefront" shortcut (next to the theme switch), notifications,
// and a role-aware account menu. It deliberately contains ZERO storefront
// elements (no promo bar, no catalog search, no category nav) — that chrome
// belongs exclusively to the public storefront.
// ─────────────────────────────────────────────────────────────────────────────

import { useTheme } from 'next-themes'
import type { ReactNode } from 'react'
import { ChevronRight, LogOut, Menu, Moon, Sun } from 'lucide-react'
import { useMarketplace } from '@/store/marketplace'
import { initials } from '@/lib/format'
import { signOut } from '@/lib/signout'
import { NotificationsBell } from '@/components/marketplace/notifications-bell'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { RoleKey } from './nav-config'
import { STOREFRONT_LINK } from './nav-config'

const ROLE_BADGE_CLASS: Record<string, string> = {
  ADMIN: 'rounded-full bg-primary/10 text-primary',
  SELLER: 'rounded-full bg-emerald-600/10 text-emerald-700 dark:text-emerald-400',
  BUYER: 'rounded-full bg-muted',
}

export function DashboardTopbar({
  consoleName,
  sectionLabel,
  role,
  onOpenMobileNav,
  roleBadgeLabel,
  topbarSlot,
}: {
  consoleName: string
  sectionLabel: string
  role: RoleKey
  onOpenMobileNav: () => void
  /** Optional context-aware chip label (e.g. "Institution Staff") — falls back to the platform role. */
  roleBadgeLabel?: string
  /** Optional compact control between the breadcrumb and the right cluster (e.g. org switcher). */
  topbarSlot?: ReactNode
}) {
  const user = useMarketplace((s) => s.user)
  const navigate = useMarketplace((s) => s.navigate)
  const { theme, setTheme } = useTheme()
  const storefront = STOREFRONT_LINK[role]

  // TENANT-AUDIT C-1: shared sign-out — clears persisted user state too.
  const logout = async () => {
    await signOut()
    navigate('home')
  }

  // SEL-010: for sellers, "View storefront" must open THEIR OWN public store
  // page — not the marketplace home.
  const openStorefront = () => {
    if (role === 'seller' && user?.id) navigate('store', { sellerId: user.id })
    else navigate('home')
  }

  return (
    <header className="sticky top-0 z-30 w-full border-b bg-background/90 backdrop-blur-md">
      <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-6">
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

        {/* Injected control (org switcher on the financier console) */}
        {topbarSlot && <div className="ml-1 hidden min-w-0 sm:block">{topbarSlot}</div>}

        {/* Right cluster */}
        <TooltipProvider delayDuration={250}>
          <div className="ml-auto flex items-center gap-0.5 sm:gap-1.5">
            {/* View storefront — the public site lives one click away, right
                next to the theme switch (moved here from the account menu). */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={openStorefront}
                  aria-label={storefront.label}
                >
                  <storefront.icon size={17} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {storefront.label}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground"
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  aria-label="Toggle theme"
                >
                  <Sun size={17} className="rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
                  <Moon size={17} className="absolute rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Toggle light / dark
              </TooltipContent>
            </Tooltip>

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
                      <Badge
                        variant="secondary"
                        className={
                          roleBadgeLabel
                            ? 'rounded-full bg-bh-bg-gold text-bh-gold-dark'
                            : ROLE_BADGE_CLASS[user.role] ?? 'rounded-full'
                        }
                      >
                        {roleBadgeLabel ?? user.role}
                      </Badge>
                    </div>
                    <p className="truncate text-xs font-normal text-muted-foreground">{user.email}</p>
                  </DropdownMenuLabel>
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
        </TooltipProvider>
      </div>
    </header>
  )
}
