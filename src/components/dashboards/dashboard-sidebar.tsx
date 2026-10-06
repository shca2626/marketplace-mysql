'use client'

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD SIDEBAR — the primary navigation for every internal dashboard.
// Desktop: sticky rail (264px expanded / 72px icon-only collapsed, persisted).
// Mobile: the same nav tree inside a Sheet drawer. Role-aware brand block,
// grouped sections and active-item highlighting. The "view storefront"
// shortcut lives in the topbar next to the theme switch.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { ChevronsLeft, ChevronsRight, Store } from 'lucide-react'
import type { NavConfig, NavItem, RoleKey } from './nav-config'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'vendora.console.sidebar.collapsed'

/** Reusable nav tree — rendered in the desktop rail and the mobile drawer. */
function SidebarNavBody({
  nav,
  activeKey,
  onNavigate,
  collapsed = false,
  onAfterNavigate,
}: {
  nav: NavConfig
  activeKey: string
  onNavigate: (item: NavItem) => void
  collapsed?: boolean
  onAfterNavigate?: () => void
}) {
  return (
    <nav aria-label={`${nav.consoleName} navigation`} className="flex h-full flex-col overflow-y-auto px-3 pb-4">
      {nav.groups.map((group, gi) => (
        <div key={group.label} className={cn('pb-3', gi > 0 && 'pt-1')}>
          <p
            className={cn(
              'px-2.5 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80',
              collapsed && 'sr-only'
            )}
          >
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = item.key === activeKey
              const Icon = item.icon
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    title={collapsed ? item.label : undefined}
                    onClick={() => {
                      onNavigate(item)
                      onAfterNavigate?.()
                    }}
                    className={cn(
                      'group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] font-medium outline-none transition-colors',
                      'focus-visible:ring-2 focus-visible:ring-ring',
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground/70 hover:bg-muted hover:text-foreground',
                      collapsed && 'justify-center px-0 py-2.5'
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors',
                        active
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'bg-transparent text-muted-foreground group-hover:text-foreground'
                      )}
                    >
                      <Icon size={15} />
                    </span>
                    {!collapsed && (
                      <>
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {item.badge && (
                          <span className="rounded-full bg-primary/15 px-1.5 py-px text-[10px] font-bold uppercase text-primary">
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

/** Brand block + (desktop) collapse toggle. `roleChip` is the console-aware
 * identity shown in the rail (e.g. "FINANCIER" on the financier console — the
 * user's GLOBAL platform role would wrongly read "BUYER" there, since financier
 * access comes from org membership, not the role). */
function SidebarHeader({
  nav,
  roleChip,
  collapsed,
  onToggleCollapsed,
}: {
  nav: NavConfig
  roleChip: string
  collapsed: boolean
  onToggleCollapsed?: () => void
}) {
  return (
    <div
      className={cn(
        'relative flex h-16 shrink-0 items-center border-b px-3',
        collapsed ? 'justify-center px-0' : 'justify-between gap-2'
      )}
    >
      {collapsed ? (
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Store size={18} />
        </span>
      ) : (
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Store size={18} />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[15px] font-extrabold tracking-tight">Vendora</p>
            <p className="truncate text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
              {nav.consoleName}
            </p>
          </div>
        </div>
      )}
      {!collapsed && (
        <span className="max-w-[92px] shrink-0 truncate rounded-full border bg-muted/60 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground">
          {roleChip}
        </span>
      )}
      {onToggleCollapsed && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={onToggleCollapsed}
          className={cn(
            'h-8 w-8 shrink-0 rounded-lg text-muted-foreground hover:text-foreground',
            collapsed && 'absolute -right-3 top-4 z-20 hidden h-6 w-6 rounded-full border bg-background shadow-sm hover:text-foreground lg:flex'
          )}
        >
          {collapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={16} />}
        </Button>
      )}
    </div>
  )
}

// ── Desktop rail ────────────────────────────────────────────────────────────

export function DashboardSidebar({
  nav,
  role,
  roleChip,
  activeKey,
  onNavigate,
}: {
  nav: NavConfig
  role: RoleKey
  /** Console-aware rail chip label — defaults to the platform role. */
  roleChip?: string
  activeKey: string
  onNavigate: (item: NavItem) => void
}) {
  // Collapse choice persisted across sessions. Read lazily during the first
  // client render (render-time state adjustment — the same pattern the app
  // uses for the storefront cover choice; SSR renders the default and the
  // browser corrects before paint).
  const [collapseState, setCollapseState] = useState<{ read: boolean; value: boolean }>({
    read: false,
    value: false,
  })
  if (!collapseState.read && typeof window !== 'undefined') {
    let stored = false
    try {
      stored = window.localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      /* private mode — session state only */
    }
    setCollapseState({ read: true, value: stored })
  }
  const collapsed = collapseState.value

  const toggleCollapsed = () => {
    setCollapseState((c) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, c.value ? '0' : '1')
      } catch {
        /* ignore */
      }
      return { read: true, value: !c.value }
    })
  }

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-screen shrink-0 flex-col border-r bg-background transition-[width] duration-200 lg:flex',
        collapsed ? 'w-[76px]' : 'w-[264px]'
      )}
    >
      <SidebarHeader nav={nav} roleChip={roleChip ?? role.toUpperCase()} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      <SidebarNavBody nav={nav} activeKey={activeKey} onNavigate={onNavigate} collapsed={collapsed} />
    </aside>
  )
}

// ── Mobile drawer ────────────────────────────────────────────────────────────

export function DashboardMobileNav({
  nav,
  role,
  activeKey,
  onNavigate,
  open,
  onOpenChange,
}: {
  nav: NavConfig
  role: RoleKey
  activeKey: string
  onNavigate: (item: NavItem) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="flex w-[290px] flex-col gap-0 p-0">
        <SheetHeader className="space-y-0 border-b px-0 py-0">
          <div className="px-3">
            <SheetTitle className="flex h-16 items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Store size={18} />
              </span>
              <span className="leading-tight">
                <span className="block text-[15px] font-extrabold tracking-tight">Vendora</span>
                <span className="block text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
                  {nav.consoleName}
                </span>
              </span>
            </SheetTitle>
          </div>
        </SheetHeader>
        <div className="min-h-0 flex-1">
          <SidebarNavBody
            nav={nav}
            activeKey={activeKey}
            onNavigate={onNavigate}
            onAfterNavigate={() => onOpenChange(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
