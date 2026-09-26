'use client'

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD NAVIGATION REGISTRY
// Single source of truth for every internal console (Admin / Seller / Buyer).
// Each console is a tree of groups → items. Items either switch an internal
// section (adminTab / sellerTab) or navigate to another dashboard view
// (buyer console). Adding a future module = adding one entry here — the
// sidebar, topbar breadcrumb and mobile drawer all pick it up automatically.
// ─────────────────────────────────────────────────────────────────────────────

import {
  type LucideIcon,
  LayoutDashboard,
  Building2,
  FileText,
  Heart,
  Package,
  Palette,
  Scale,
  ScrollText,
  Store,
  Tags,
  Ticket,
  ShoppingBag,
  SlidersHorizontal,
  Briefcase,
  StoreIcon,
  Receipt,
  Banknote,
  Wallet,
} from 'lucide-react'
import type { View, ViewParams } from '@/store/marketplace'

export type RoleKey = 'admin' | 'seller' | 'buyer'

export interface NavItem {
  /** Section id — matches adminTab/sellerTab keys or (buyer) the view name. */
  key: string
  label: string
  icon: LucideIcon
  description?: string
  /** Buyer console items navigate across dashboard views. */
  view?: View
  params?: ViewParams
  /** Optional static badge (e.g. "New") rendered on the item. */
  badge?: string
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export interface NavConfig {
  /** Console name shown in the sidebar brand block + topbar breadcrumb root. */
  consoleName: string
  roleLabel: string
  groups: NavGroup[]
  /** Section key -> page title/description for the topbar breadcrumb + page header. */
  titles: Record<string, { title: string; description?: string }>
}

// ── Admin dashboard ───────────────────────────────────────────────────────

export const ADMIN_NAV: NavConfig = {
  consoleName: 'Admin Dashboard',
  roleLabel: 'Platform Administrator',
  groups: [
    {
      label: 'Platform',
      items: [
        {
          key: 'overview',
          label: 'Overview',
          icon: LayoutDashboard,
          description: 'Live marketplace KPIs & activity',
        },
      ],
    },
    {
      label: 'Operations',
      items: [
        { key: 'vendors', label: 'Vendors', icon: StoreIcon, description: 'Seller directory, verification & suspension' },
        { key: 'products', label: 'Products', icon: Package, description: 'Full catalog moderation & takedowns' },
        { key: 'orders', label: 'Orders', icon: ShoppingBag, description: 'Every order across the marketplace' },
        { key: 'organizations', label: 'Organizations', icon: Building2, description: 'Companies, banks, MFIs & e-wallets' },
        { key: 'pricing', label: 'Pricing & Lists', icon: Tags, description: 'Price lists & customer groups' },
        { key: 'coupons', label: 'Coupons', icon: Ticket, description: 'Promotions & discount codes' },
      ],
    },
    {
      label: 'Finance',
      items: [
        { key: 'payments', label: 'Payments', icon: Receipt, description: 'Money settlement & capture queue' },
        { key: 'payouts', label: 'Payouts', icon: Banknote, description: 'Vendor settlement & commission' },
      ],
    },
    {
      label: 'B2B Engine',
      items: [
        { key: 'rfqs', label: 'RFQ Pipeline', icon: FileText, description: 'Requests for quote & negotiations' },
        { key: 'disputes', label: 'Disputes', icon: Scale, description: 'Resolution queue & outcomes' },
      ],
    },
    {
      label: 'Configuration',
      items: [
        { key: 'rfq-settings', label: 'RFQ Settings', icon: SlidersHorizontal, description: '22 scoped behavior panels' },
        { key: 'storefront', label: 'Storefront Designer', icon: Palette, description: 'Branding, theme & hero slides' },
      ],
    },
    {
      label: 'Compliance',
      items: [
        { key: 'audit', label: 'Audit Log', icon: ScrollText, description: 'Immutable trail of critical actions' },
      ],
    },
  ],
  titles: {
    overview: { title: 'Platform Overview', description: 'Live marketplace KPIs, activity and health at a glance.' },
    vendors: { title: 'Vendors', description: 'Every seller on the marketplace — verify, suspend and set commissions.' },
    products: { title: 'Product Moderation', description: 'Browse and moderate every listing on the marketplace.' },
    orders: { title: 'Orders', description: 'Every order placed on the platform — buyers, sellers and money.' },
    payments: { title: 'Payments', description: 'Settlement console — bank transfers and invoices awaiting capture.' },
    payouts: { title: 'Payouts', description: 'Vendor settlement batches and commission configuration.' },
    organizations: { title: 'Organizations', description: 'Manage companies, banks, MFIs, e-wallets and their members.' },
    pricing: { title: 'Pricing & Lists', description: 'Price lists and customer groups that drive contract pricing.' },
    coupons: { title: 'Coupons', description: 'Create and monitor promotional discount codes.' },
    rfqs: { title: 'RFQ Pipeline', description: 'Every request for quote, negotiation and conversion on the platform.' },
    disputes: { title: 'Disputes', description: 'Resolution queue with escalation paths and outcomes.' },
    'rfq-settings': { title: 'RFQ Settings', description: 'Scoped behavior configuration with change history & rollback.' },
    storefront: { title: 'Storefront Designer', description: 'Brand the public marketplace: name, logo, theme, hero slides.' },
    audit: { title: 'Audit Log', description: 'Immutable, signed record of critical platform actions.' },
  },
}

// ── Seller dashboard ────────────────────────────────────────────────────────

export const SELLER_NAV: NavConfig = {
  consoleName: 'Seller Dashboard',
  roleLabel: 'Merchant',
  groups: [
    {
      label: 'Overview',
      items: [
        { key: 'overview', label: 'Dashboard', icon: LayoutDashboard, description: 'Sales, fulfilment & store health' },
      ],
    },
    {
      label: 'Catalog',
      items: [
        { key: 'products', label: 'Products', icon: Package, description: 'Listings, stock & variants' },
      ],
    },
    {
      label: 'Sales',
      items: [
        { key: 'orders', label: 'Orders', icon: ShoppingBag, description: 'Incoming orders & fulfilment' },
        { key: 'earnings', label: 'Earnings', icon: Wallet, description: 'Settlement & payout history' },
        { key: 'rfqs', label: 'RFQ Inbox', icon: FileText, description: 'Quote requests for your catalog' },
        { key: 'disputes', label: 'Disputes', icon: Scale, description: 'Buyer disputes on your orders' },
      ],
    },
  ],
  titles: {
    overview: { title: 'Seller Dashboard', description: 'Your store performance, sales and activity.' },
    products: { title: 'Products', description: 'Manage listings, pricing, stock and variants.' },
    orders: { title: 'Orders', description: 'Incoming orders and fulfilment status.' },
    earnings: { title: 'Earnings', description: 'Your settlement balance, commission rate and payout history.' },
    rfqs: { title: 'RFQ Inbox', description: 'Quote requests that reference your catalog — respond with winning quotes.' },
    disputes: { title: 'Disputes', description: 'Buyer disputes raised against your orders.' },
  },
}

// ── Buyer dashboard ─────────────────────────────────────────────────────────

export const BUYER_NAV: NavConfig = {
  consoleName: 'My Account',
  roleLabel: 'Buyer',
  groups: [
    {
      label: 'Overview',
      items: [
        { key: 'account', label: 'Dashboard', icon: LayoutDashboard, description: 'Profile, security & quick access' },
      ],
    },
    {
      label: 'Procurement',
      items: [
        { key: 'rfqs', label: 'My RFQs', icon: FileText, description: 'Requests for quote & negotiations', view: 'rfqs' },
        { key: 'business', label: 'Business Account', icon: Briefcase, description: 'Organization, team & contract pricing', view: 'business' },
      ],
    },
    {
      label: 'Shopping Activity',
      items: [
        { key: 'orders', label: 'Orders', icon: Package, description: 'Purchases, tracking & invoices', view: 'orders' },
        { key: 'favorites', label: 'Favorites', icon: Heart, description: 'Products saved for later', view: 'favorites' },
      ],
    },
  ],
  titles: {
    account: { title: 'Account Dashboard', description: 'Your profile, security and everything you do on Vendora.' },
    rfqs: { title: 'My RFQs', description: 'Requests for quote, negotiations and recurring schedules.' },
    business: { title: 'Business Account', description: 'Your organization, team members and contract pricing.' },
    orders: { title: 'My Orders', description: 'Purchases, delivery tracking and invoices.' },
    favorites: { title: 'Favorites', description: 'Products you saved for later.' },
  },
}

export const NAV_CONFIGS: Record<RoleKey, NavConfig> = {
  admin: ADMIN_NAV,
  seller: SELLER_NAV,
  buyer: BUYER_NAV,
}

/** Views that render inside the internal DashboardLayout (vs. storefront). */
export const DASHBOARD_VIEWS = new Set<View>([
  'admin',
  'seller',
  'account',
  'rfqs',
  'business',
  'orders',
  'favorites',
  'financing',
  'financier',
])

/** Topbar "back to storefront" label per role. */
export const STOREFRONT_LINK: Record<RoleKey, { label: string; icon: LucideIcon }> = {
  admin: { label: 'View storefront', icon: Store },
  seller: { label: 'View storefront', icon: Store },
  buyer: { label: 'Continue shopping', icon: ShoppingBag },
}
