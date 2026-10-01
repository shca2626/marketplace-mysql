'use client'

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD LAYOUT — the dedicated, independent shell for every internal
// console (Admin / Seller / Buyer). It is architecturally separate from the
// public storefront: no promo bar, no catalog search, no category nav and no
// marketing footer. Structure:
//
//   ┌──────────┬──────────────────────────────────────┐
//   │ Sidebar  │ Topbar (breadcrumb · bell · theme)  │
//   │ (role    ├──────────────────────────────────────┤
//   │  aware)  │ Main content — spacious, max-w-1400 │
//   │          ├──────────────────────────────────────┤
//   │          │ Slim utility footer (mt-auto)        │
//   └──────────┴──────────────────────────────────────┘
// ─────────────────────────────────────────────────────────────────────────────

import { useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { useMarketplace } from '@/store/marketplace'
import type { View } from '@/store/marketplace'
import { Button } from '@/components/ui/button'
import { DashboardSidebar, DashboardMobileNav } from './dashboard-sidebar'
import { DashboardTopbar } from './dashboard-topbar'
import type { NavConfig, NavItem, RoleKey } from './nav-config'

export function DashboardLayout({
  role,
  nav,
  activeKey,
  onNavigate,
  children,
  roleBadgeLabel,
  topbarSlot,
}: {
  role: RoleKey
  nav: NavConfig
  activeKey: string
  onNavigate: (item: NavItem) => void
  children: ReactNode
  /** Optional context-aware label for the topbar account chip (e.g. "Institution Staff"). */
  roleBadgeLabel?: string
  /** Optional compact control injected into the topbar (e.g. org switcher). */
  topbarSlot?: ReactNode
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const activeItem = [...nav.groups.flatMap((g) => g.items)].find((i) => i.key === activeKey)
  const sectionLabel = activeItem?.label ?? nav.titles[activeKey]?.title ?? 'Dashboard'

  return (
    <div className="flex min-h-screen bg-muted/40 text-foreground">
      <DashboardSidebar nav={nav} role={role} activeKey={activeKey} onNavigate={onNavigate} />
      <DashboardMobileNav
        nav={nav}
        role={role}
        activeKey={activeKey}
        onNavigate={onNavigate}
        open={mobileNavOpen}
        onOpenChange={setMobileNavOpen}
      />

      {/* Content column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardTopbar
          consoleName={nav.consoleName}
          sectionLabel={sectionLabel}
          role={role}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          roleBadgeLabel={roleBadgeLabel}
          topbarSlot={topbarSlot}
        />

        <main className="flex-1">
          <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
        </main>

        {/* Slim utility footer — sticky to the bottom on short pages. */}
        <footer className="mt-auto border-t bg-background">
          <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-2 px-4 py-3.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
            <p>
              <span className="font-semibold text-foreground/70">Vendora</span> {nav.consoleName} · v1.0
            </p>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                All systems operational
              </span>
              <span>© {new Date().getFullYear()} Vendora B2B Marketplace</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}

// ── Page header pattern ──────────────────────────────────────────────────────
// Every console page starts with this: icon + title + description + actions.
// It gives all dashboards one consistent, scannable visual hierarchy.
export function PageHeader({
  icon: Icon,
  title,
  description,
  actions,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3.5">
        {Icon && (
          <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border bg-card text-primary shadow-sm">
            <Icon size={20} />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight sm:text-[1.55rem]">{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

// ── Access guards ────────────────────────────────────────────────────────────

export function SignInRequired({
  icon: Icon,
  title,
  description,
  afterView,
}: {
  icon: LucideIcon
  title: string
  description?: string
  afterView?: View
}) {
  const openAuth = useMarketplace((s) => s.openAuth)
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon size={26} />
      </span>
      <h1 className="mt-4 text-xl font-bold">{title}</h1>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <Button
        className="mt-6 rounded-xl"
        onClick={() => openAuth('login', afterView ? { view: afterView } : undefined)}
      >
        Sign in
      </Button>
    </div>
  )
}

export function AccessDenied({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description?: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <Icon size={26} />
      </span>
      <h1 className="mt-4 text-xl font-bold">{title}</h1>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
    </div>
  )
}
