'use client'

import { useState } from 'react'
import {
  BarChart3,
  Building2,
  FileText,
  ScrollText,
  Settings2,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Tags,
  Ticket,
} from 'lucide-react'
import { useMarketplace } from '@/store/marketplace'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AuditTab } from './admin/audit-tab'
import { CouponsTab } from './admin/coupons-tab'
import { OrganizationsTab } from './admin/organizations-tab'
import { OverviewTab } from './admin/overview-tab'
import { PricingTab } from './admin/pricing-tab'
import { RfqsTab } from './admin/rfqs-tab'
import { DisputesTab } from './admin/disputes-tab'
import { AdminSettings } from './admin-settings'
import { RfqSettings } from './admin/settings/rfq-settings'

/**
 * Settings workspace — two areas: the storefront designer (branding, theme,
 * layout, hero slides) and the RFQ configuration cockpit (scoped panels with
 * change history + rollback).
 */
function SettingsWorkspace() {
  const [area, setArea] = useState<'rfq' | 'storefront'>('rfq')
  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-xl border bg-muted/50 p-1">
        <button
          className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${area === 'rfq' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => setArea('rfq')}
        >
          RFQ settings
        </button>
        <button
          className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${area === 'storefront' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => setArea('storefront')}
        >
          Storefront
        </button>
      </div>
      {area === 'rfq' ? <RfqSettings /> : <AdminSettings />}
    </div>
  )
}

/**
 * Admin Control Tower — full operations workspace for the platform owner.
 * Overview keeps the original analytics; the other tabs manage the B2B
 * engine (organizations, pricing, RFQs, coupons) and the audit trail.
 */
export function AdminView() {
  const user = useMarketplace((s) => s.user)
  const authChecked = useMarketplace((s) => s.authChecked)
  const openAuth = useMarketplace((s) => s.openAuth)
  const [activeTab, setActiveTab] = useState('overview')

  // ── Signed-out state ──
  if (!user && authChecked) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <BarChart3 size={44} className="text-muted-foreground/40" />
        <h1 className="mt-4 text-xl font-bold">Admin control tower</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in with an admin account to operate the marketplace.
        </p>
        <Button className="mt-6 rounded-xl" onClick={() => openAuth('login', { view: 'admin' })}>
          Sign in
        </Button>
      </div>
    )
  }

  // ── Non-admin state ──
  if (user && user.role !== 'ADMIN') {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <ShieldAlert size={26} />
        </span>
        <h1 className="mt-4 text-xl font-bold">Admin access required</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The control tower is restricted to marketplace administrators.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck size={20} />
            </span>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Admin control tower</h1>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Analytics, organizations, pricing, negotiations, coupons & the audit trail · {user?.name}
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-8">
        <TabsList className="h-11 w-full justify-start gap-1 overflow-x-auto rounded-xl bg-muted/60 p-1 sm:w-auto">
          <TabsTrigger value="overview" className="gap-1.5 rounded-lg px-4 text-sm">
            <BarChart3 size={14} /> Overview
          </TabsTrigger>
          <TabsTrigger value="organizations" className="gap-1.5 rounded-lg px-4 text-sm">
            <Building2 size={14} /> Organizations
          </TabsTrigger>
          <TabsTrigger value="pricing" className="gap-1.5 rounded-lg px-4 text-sm">
            <Tags size={14} /> Pricing
          </TabsTrigger>
          <TabsTrigger value="rfqs" className="gap-1.5 rounded-lg px-4 text-sm">
            <FileText size={14} /> RFQs
          </TabsTrigger>
          <TabsTrigger value="disputes" className="gap-1.5 rounded-lg px-4 text-sm">
            <Scale size={14} /> Disputes
          </TabsTrigger>
          <TabsTrigger value="coupons" className="gap-1.5 rounded-lg px-4 text-sm">
            <Ticket size={14} /> Coupons
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5 rounded-lg px-4 text-sm">
            <Settings2 size={14} /> Settings
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5 rounded-lg px-4 text-sm">
            <ScrollText size={14} /> Audit log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <OverviewTab />
        </TabsContent>
        <TabsContent value="organizations" className="mt-6">
          <OrganizationsTab />
        </TabsContent>
        <TabsContent value="pricing" className="mt-6">
          <PricingTab />
        </TabsContent>
        <TabsContent value="rfqs" className="mt-6">
          <RfqsTab />
        </TabsContent>
        <TabsContent value="disputes" className="mt-6">
          <DisputesTab />
        </TabsContent>
        <TabsContent value="coupons" className="mt-6">
          <CouponsTab />
        </TabsContent>
        <TabsContent value="settings" className="mt-6">
          <SettingsWorkspace />
        </TabsContent>
        <TabsContent value="audit" className="mt-6">
          <AuditTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
