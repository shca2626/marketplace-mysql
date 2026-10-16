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
  FolderLock,
  Heart,
  Package,
  Palette,
  Scale,
  ScrollText,
  ShieldCheck,
  Store,
  Tags,
  Ticket,
  ShoppingBag,
  SlidersHorizontal,
  Briefcase,
  StoreIcon,
  Receipt,
  Banknote,
  Landmark,
  Wallet,
  Inbox,
  ListChecks,
  HandCoins,
  BadgeCheck,
  UserCog,
  Users,
  BarChart3,
  ArrowLeftRight,
  Puzzle,
  Percent,
  Calculator,
  Layers,
  Lock,
  FileSignature,
  Fingerprint,
  Shapes,
  MessageCircle,
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
  /** RBAC Phase 2 — platform permission required to see this admin section.
   *  Undefined = visible to every console user; legacy ADMIN sees all. */
  permission?: string
  /** RBACSEC-1 — any-of permission list: the section is visible when the
   *  user holds at least one of these (overrides `permission` when set). */
  anyPermissions?: string[]
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
          permission: 'platform.overview.view',
        },
      ],
    },
    {
      label: 'Operations',
      items: [
        { key: 'vendors', label: 'Vendors', icon: StoreIcon, description: 'Seller directory, verification & suspension', permission: 'vendors.view' },
        { key: 'products', label: 'Products', icon: Package, description: 'Full catalog moderation & takedowns', permission: 'catalog.products.view' },
        { key: 'orders', label: 'Orders', icon: ShoppingBag, description: 'Every order across the marketplace', permission: 'orders.view' },
        { key: 'organizations', label: 'Organizations', icon: Building2, description: 'Companies, banks, MFIs & e-wallets', permission: 'orgs.view' },
        { key: 'pricing', label: 'Pricing & Lists', icon: Tags, description: 'Price lists & customer groups', permission: 'pricing.view' },
        { key: 'coupons', label: 'Coupons', icon: Ticket, description: 'Promotions & discount codes', permission: 'coupons.view' },
      ],
    },
    {
      label: 'Finance',
      items: [
        { key: 'payments', label: 'Payments', icon: Receipt, description: 'Money settlement & capture queue', permission: 'payments.view' },
        { key: 'commissions', label: 'Commissions', icon: Percent, description: 'Commission obligations, statements & invoices', permission: 'payouts.view' },
        { key: 'payouts', label: 'Payouts', icon: Banknote, description: 'Vendor settlement & commission', permission: 'payouts.view' },
        { key: 'monetization', label: 'Monetization', icon: Calculator, description: 'Fee rules, subscription plans, ledger & revenue', permission: 'payouts.view', badge: 'New' },
        { key: 'settlements', label: 'Settlements', icon: ArrowLeftRight, description: 'B2B external settlement evidence queue', permission: 'payouts.view' },
        { key: 'currencies', label: 'Currencies & FX', icon: Layers, description: 'Supported currencies & exchange rates', permission: 'storefront.manage' },
        { key: 'financing', label: 'Financing', icon: Landmark, description: 'Verification gate, financiers & fees', permission: 'financing.gate.view' },
      ],
    },
    {
      label: 'B2B Engine',
      items: [
        { key: 'rfqs', label: 'RFQ Pipeline', icon: FileText, description: 'Requests for quote & negotiations', permission: 'rfq.pipeline.view' },
        { key: 'disputes', label: 'Disputes', icon: Scale, description: 'Resolution queue & outcomes', permission: 'disputes.view' },
      ],
    },
    {
      label: 'Configuration',
      items: [
        { key: 'rbac', label: 'Roles & Access', icon: ShieldCheck, description: 'Permissions, staff & teams', anyPermissions: ['staff.view', 'rbac.roles.view', 'rbac.manage'] },
        { key: 'modules', label: 'Modules', icon: Puzzle, description: 'Marketplace module activation', permission: 'modules.manage' },
        { key: 'rfq-settings', label: 'RFQ Settings', icon: SlidersHorizontal, description: 'Scoped behavior panels', permission: 'rfq.settings.manage' },
        { key: 'storefront', label: 'Storefront Designer', icon: Palette, description: 'Branding, theme & hero slides', permission: 'storefront.manage' },
        { key: 'agreements', label: 'Agreements', icon: FileSignature, description: 'Publication agreement templates & consents', permission: 'catalog.products.moderate' },
        { key: 'certifications', label: 'Certifications', icon: BadgeCheck, description: 'Product certification library', permission: 'financing.documents.verify' },
        { key: 'spec-attributes', label: 'Spec Attributes', icon: Shapes, description: 'Category specification schema', permission: 'catalog.products.moderate' },
        { key: 'security', label: 'Security & MFA', icon: Lock, description: 'Session & MFA policy', permission: 'staff.manage' },
        { key: 'kyc', label: 'KYC Providers', icon: Fingerprint, description: 'Verification providers & cases', permission: 'staff.manage' },
        { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, description: 'Chat, templates & campaigns', anyPermissions: ['whatsapp.view', 'whatsapp.manage'] },
      ],
    },
    {
      label: 'Compliance',
      items: [
        { key: 'audit', label: 'Audit Log', icon: ScrollText, description: 'Immutable trail of critical actions', permission: 'audit.view' },
      ],
    },
  ],
  titles: {
    overview: { title: 'Platform Overview', description: 'Live marketplace KPIs, activity and health at a glance.' },
    vendors: { title: 'Vendors', description: 'Every seller on the marketplace — verify, suspend and set commissions.' },
    products: { title: 'Product Moderation', description: 'Browse and moderate every listing on the marketplace.' },
    orders: { title: 'Orders', description: 'Every order placed on the platform — buyers, sellers and money.' },
    payments: { title: 'Payments', description: 'Settlement console — bank transfers, refunds and invoices awaiting capture.' },
    commissions: { title: 'Commissions', description: 'Platform commission obligations, monthly statements and vendor invoices.' },
    modules: { title: 'Modules', description: 'Enable and disable marketplace capability modules per organization type.' },
    payouts: { title: 'Payouts', description: 'Vendor settlement batches and commission configuration.' },
    monetization: { title: 'Monetization', description: 'Configurable fee rules (per org / org type / platform), subscription plans, the immutable fee ledger and revenue reconciliation.' },
    settlements: { title: 'Settlements', description: 'External B2B settlement evidence — verify and close out direct company-to-company payments.' },
    currencies: { title: 'Currencies & FX', description: 'Supported currencies and exchange rates used across pricing and financing.' },
    financing: { title: 'Financing', description: 'The platform verification gate — review queues, financier institutions, fees and the shared requirements library.' },
    organizations: { title: 'Organizations', description: 'Manage companies, banks, MFIs, e-wallets and their members.' },
    pricing: { title: 'Pricing & Lists', description: 'Price lists and customer groups that drive contract pricing.' },
    coupons: { title: 'Coupons', description: 'Create and monitor promotional discount codes.' },
    rfqs: { title: 'RFQ Pipeline', description: 'Every request for quote, negotiation and conversion on the platform.' },
    disputes: { title: 'Disputes', description: 'Resolution queue with escalation paths and outcomes.' },
    'rfq-settings': { title: 'RFQ Settings', description: 'Scoped behavior configuration with change history & rollback.' },
    rbac: { title: 'Roles & Access', description: 'The RBAC control center — permissions, platform staff, organization teams and invitations.' },
    storefront: { title: 'Storefront Designer', description: 'Brand the public marketplace: name, logo, theme, hero slides.' },
    agreements: { title: 'Agreements', description: 'Publication agreement templates companies accept before selling on the marketplace.' },
    certifications: { title: 'Certifications', description: 'The product certification library companies attach to their offers.' },
    'spec-attributes': { title: 'Spec Attributes', description: 'Typed specification attributes that structure product data per category.' },
    security: { title: 'Security & MFA', description: 'Session policy, MFA enforcement and platform security posture.' },
    kyc: { title: 'KYC Providers', description: 'Verification provider configurations and the KYC case queue.' },
    whatsapp: { title: 'WhatsApp', description: 'The WhatsApp business channel — chats, templates, campaigns and the chatbot.' },
    audit: { title: 'Audit Log', description: 'Immutable, signed record of critical platform actions.' },
  },
}

// ── Merchant (seller) console ──────────────────────────────────────────────

export const SELLER_NAV: NavConfig = {
  consoleName: 'Merchant Console',
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
    overview: { title: 'Merchant Console', description: 'Your store performance, sales and activity.' },
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
      label: 'Financing',
      items: [
        { key: 'overview', label: 'Financing & Accreditation', icon: Wallet, description: 'Services, applications & agreements', view: 'financing' },
        { key: 'services', label: 'Financing Services', icon: Banknote, description: 'Browse financing & accreditation offerings', view: 'financing' },
        { key: 'requests', label: 'My Applications', icon: ListChecks, description: 'Requests, gate status, offers & agreements', view: 'financing' },
        { key: 'accreditation', label: 'Accreditation', icon: BadgeCheck, description: 'Company programs, grants & renewals', view: 'financing' },
        { key: 'agreements', label: 'Agreements', icon: ScrollText, description: 'Schedules, fees & money events', view: 'financing' },
      ],
    },
    {
      label: 'Shopping Activity',
      items: [
        { key: 'orders', label: 'Orders', icon: Package, description: 'Purchases, tracking & invoices', view: 'orders' },
        { key: 'favorites', label: 'Favorites', icon: Heart, description: 'Products saved for later', view: 'favorites' },
      ],
    },
    {
      // §12.1 / IA-002: identity + vault live in the Account domain — not Financing.
      label: 'Account',
      items: [
        { key: 'profile', label: 'Profile & Security', icon: UserCog, description: 'Name, phone, email & password', view: 'account', params: { accountTab: 'profile' } },
        { key: 'documents', label: 'Document Vault', icon: FolderLock, description: 'Upload once — reuse on every application', view: 'financing', params: { financingSection: 'documents' } },
      ],
    },
  ],
  titles: {
    account: { title: 'Account Dashboard', description: 'Your profile, security and everything you do on Vendora.' },
    profile: { title: 'Profile & Security', description: 'Your identity, contact details and sign-in security — editable, right here.' },
    rfqs: { title: 'My RFQs', description: 'Requests for quote, negotiations and recurring schedules.' },
    business: { title: 'Business Account', description: 'Your organization, team members and contract pricing.' },
    overview: { title: 'Financing & Accreditation', description: 'Apply for financing, track applications and manage your document vault.' },
    services: { title: 'Financing Services', description: 'The catalog of every active financing and accreditation offering on the marketplace.' },
    requests: { title: 'My Applications', description: 'Every application, its gate status, checklist verdicts and offers.' },
    accreditation: { title: 'Accreditation', description: 'Company accreditation programs — grants, validity and renewals.' },
    documents: { title: 'Document Vault', description: 'Upload once, reuse everywhere — verified by the platform a single time.' },
    agreements: { title: 'Agreements', description: 'Accepted offers with frozen installment schedules and money events.' },
    orders: { title: 'My Orders', description: 'Purchases, delivery tracking and invoices.' },
    favorites: { title: 'Favorites', description: 'Products you saved for later.' },
  },
}

// ── Financier console (FIN-5) ────────────────────────────────────────────────
// Guarded by org membership (OWNER/ADMIN of a BANK/MFI/EWALLET organization) —
// no global role. Sections drive local state inside financier-view.

export const FINANCIER_NAV: NavConfig = {
  consoleName: 'Financier Console',
  roleLabel: 'Institution Staff',
  groups: [
    {
      label: 'Overview',
      items: [
        { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, description: 'Inbox, offers & program health' },
      ],
    },
    {
      label: 'Offering',
      items: [
        { key: 'services', label: 'Services', icon: Banknote, description: 'Financing & accreditation services CRUD' },
        { key: 'requirements', label: 'Requirements', icon: ListChecks, description: 'Per-service requirements composer' },
      ],
    },
    {
      label: 'Pipeline',
      items: [
        { key: 'inbox', label: 'Requests Inbox', icon: Inbox, description: 'Platform-verified financing requests' },
        { key: 'offers', label: 'Offers', icon: HandCoins, description: 'Compose, send & withdraw offers' },
        { key: 'accreditations', label: 'Accreditations', icon: BadgeCheck, description: 'Grant, reject & revoke programs' },
      ],
    },
    {
      label: 'Portfolio',
      items: [
        { key: 'agreements', label: 'Agreements', icon: ScrollText, description: 'Funding status & event reporting' },
        { key: 'operations', label: 'Disbursements & Collections', icon: ArrowLeftRight, description: 'Funded disbursements, payments & reconciliation' },
        { key: 'analytics', label: 'Reporting', icon: BarChart3, description: 'Risk, portfolio & limits with CSV export' },
        { key: 'profile', label: 'Institution Profile', icon: Building2, description: 'Org facts & financier profile' },
        { key: 'team', label: 'Team', icon: Users, description: 'Institution staff & their roles' },
      ],
    },
  ],
  titles: {
    dashboard: { title: 'Financier Dashboard', description: 'Verified applications, offers and accreditation programs at a glance.' },
    services: { title: 'Services', description: 'Your financing and accreditation offerings — terms, coverage and features.' },
    requirements: { title: 'Requirements Composer', description: 'Attach conditions from the platform library or your own private templates.' },
    inbox: { title: 'Requests Inbox', description: 'Applications that passed the platform verification gate — nothing else can reach you.' },
    offers: { title: 'Offers', description: 'Compose binding offers with installment schedules, send and withdraw.' },
    accreditations: { title: 'Accreditations', description: 'Forwarded accreditation requests — grant, reject or revoke.' },
    agreements: { title: 'Agreements', description: 'Accepted offers — report funding progress and money events (track-only).' },
    operations: { title: 'Disbursements & Collections', description: 'Record and confirm disbursements, allocate incoming payments and reconcile the book.' },
    analytics: { title: 'Reporting', description: 'Authorized portfolio reporting — risk assessments, exposure and underwriting limits.' },
    team: { title: 'Institution Team', description: 'Your staff members and their roles in this institution.' },
    profile: { title: 'Institution Profile', description: 'Your organization, license and contact facts on Vendora.' },
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
