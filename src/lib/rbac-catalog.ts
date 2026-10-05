// ─────────────────────────────────────────────────────────────────────────────
// RBAC PERMISSION CATALOG — single source of truth (client-safe, no db).
//
// Consumed by:
//   • scripts/seed-rbac.ts      — seeds Permission rows + system roles
//   • src/server/modules/rbac/  — validates custom roles & resolves grants
//   • admin Roles & Access UI   — renders the permission matrix
//
// Scope model:
//   PLATFORM permissions govern the admin console sections (platform staff).
//   ORG permissions govern organization consoles (companies, lenders) —
//   org.owner/admin/buyer/approver/viewer for companies; financier.* for
//   lender institutions.
// ─────────────────────────────────────────────────────────────────────────────

export interface PermissionDef {
  key: string
  label: string
  description: string
}

export interface PermissionDomain {
  key: string
  label: string
  scope: 'PLATFORM' | 'ORG'
  description: string
  permissions: PermissionDef[]
}

export const PERMISSION_DOMAINS: PermissionDomain[] = [
  // ── PLATFORM domains (admin console) ─────────────────────────────────────
  {
    key: 'overview',
    label: 'Platform Overview',
    scope: 'PLATFORM',
    description: 'The admin home — marketplace KPIs, charts and activity feeds.',
    permissions: [
      { key: 'platform.overview.view', label: 'View overview', description: 'See marketplace KPIs, revenue charts and activity.' },
    ],
  },
  {
    key: 'vendors',
    label: 'Vendors',
    scope: 'PLATFORM',
    description: 'Seller directory and lifecycle management.',
    permissions: [
      { key: 'vendors.view', label: 'View vendors', description: 'Browse the seller directory and their stores.' },
      { key: 'vendors.verify', label: 'Verify & suspend vendors', description: 'Grant/revoke seller verification and suspend accounts.' },
      { key: 'vendors.commission.manage', label: 'Manage commissions', description: 'Set per-vendor commission overrides.' },
    ],
  },
  {
    key: 'catalog',
    label: 'Catalog & Products',
    scope: 'PLATFORM',
    description: 'Marketplace listing moderation and curation.',
    permissions: [
      { key: 'catalog.products.view', label: 'View catalog', description: 'Browse all listings, including drafts and archived rows.' },
      { key: 'catalog.products.create', label: 'Create products', description: 'Create platform-managed listings.' },
      { key: 'catalog.products.update', label: 'Edit any product', description: 'Edit listing content and pricing (name fixes, dedup).' },
      { key: 'catalog.products.moderate', label: 'Moderate products', description: 'Feature, archive, restore and take down listings.' },
      { key: 'catalog.products.delete', label: 'Delete products', description: 'Hard-delete listings without order history.' },
    ],
  },
  {
    key: 'orders',
    label: 'Orders',
    scope: 'PLATFORM',
    description: 'Every order placed on the marketplace.',
    permissions: [
      { key: 'orders.view', label: 'View orders', description: 'Browse every order across buyers and sellers.' },
      { key: 'orders.update', label: 'Update orders', description: 'Change order status and manage fulfillment events.' },
    ],
  },
  {
    key: 'organizations',
    label: 'Organizations',
    scope: 'PLATFORM',
    description: 'Companies, banks, MFIs and e-wallets on the platform.',
    permissions: [
      { key: 'orgs.view', label: 'View organizations', description: 'Browse organizations and their members.' },
      { key: 'orgs.create', label: 'Create organizations', description: 'Create business accounts on behalf of the platform.' },
      { key: 'orgs.update', label: 'Edit organizations', description: 'Update org facts, credit terms and settings.' },
      { key: 'orgs.verify', label: 'Verify organizations', description: 'Approve, reject and re-verify business accounts.' },
      { key: 'orgs.suspend', label: 'Suspend organizations', description: 'Suspend and reactivate organizations.' },
    ],
  },
  {
    key: 'pricing',
    label: 'Pricing & Lists',
    scope: 'PLATFORM',
    description: 'Price lists, customer groups and contract pricing.',
    permissions: [
      { key: 'pricing.view', label: 'View pricing', description: 'Browse price lists and customer groups.' },
      { key: 'pricing.manage', label: 'Manage pricing', description: 'Create, edit and delete price lists and groups.' },
    ],
  },
  {
    key: 'coupons',
    label: 'Coupons',
    scope: 'PLATFORM',
    description: 'Promotional discount codes.',
    permissions: [
      { key: 'coupons.view', label: 'View coupons', description: 'Browse promotions and their usage.' },
      { key: 'coupons.manage', label: 'Manage coupons', description: 'Create, edit and delete discount codes.' },
    ],
  },
  {
    key: 'payments',
    label: 'Payments',
    scope: 'PLATFORM',
    description: 'Money settlement and the capture queue.',
    permissions: [
      { key: 'payments.view', label: 'View payments', description: 'Browse payments and bank-transfer details.' },
      { key: 'payments.capture', label: 'Capture payments', description: 'Capture, fail and configure payment methods.' },
    ],
  },
  {
    key: 'payouts',
    label: 'Payouts',
    scope: 'PLATFORM',
    description: 'Vendor settlement and commission configuration.',
    permissions: [
      { key: 'payouts.view', label: 'View payouts', description: 'Browse settlement batches and history.' },
      { key: 'payouts.manage', label: 'Manage payouts', description: 'Generate batches, mark paid, cancel and configure commissions.' },
    ],
  },
  {
    key: 'financing',
    label: 'Financing',
    scope: 'PLATFORM',
    description: 'The verification gate, institutions, fees and documents.',
    permissions: [
      { key: 'financing.gate.view', label: 'View verification gate', description: 'See the financing application gate queue.' },
      { key: 'financing.gate.review', label: 'Review applications', description: 'Approve, reject, return and forward financing applications.' },
      { key: 'financing.institutions.manage', label: 'Manage institutions', description: 'Verify and suspend financier institutions.' },
      { key: 'financing.fees.manage', label: 'Manage fees', description: 'View the fee ledger and mark fees invoiced/paid.' },
      { key: 'financing.requirements.manage', label: 'Manage requirements', description: 'Curate the shared financing requirements library.' },
      { key: 'financing.documents.verify', label: 'Verify documents', description: 'Verify and reject KYC documents in the queue.' },
    ],
  },
  {
    key: 'rfq',
    label: 'B2B / RFQ',
    scope: 'PLATFORM',
    description: 'RFQ pipeline, negotiations and scoped settings.',
    permissions: [
      { key: 'rfq.pipeline.view', label: 'View RFQ pipeline', description: 'Browse every RFQ, quote and negotiation.' },
      { key: 'rfq.quotes.review', label: 'Review & route quotes', description: 'Approve or reject seller quotes queued for platform review (Phase 6: explicit key for the quote-routing review route).' },
      { key: 'rfq.settings.manage', label: 'Manage RFQ settings', description: 'Edit scoped behavior panels and roll back changes.' },
    ],
  },
  {
    key: 'disputes',
    label: 'Disputes',
    scope: 'PLATFORM',
    description: 'Resolution queue and outcomes.',
    permissions: [
      { key: 'disputes.view', label: 'View disputes', description: 'Browse the dispute queue.' },
      { key: 'disputes.resolve', label: 'Resolve disputes', description: 'Decide outcomes and close disputes.' },
    ],
  },
  {
    key: 'storefront',
    label: 'Storefront',
    scope: 'PLATFORM',
    description: 'Public marketplace branding.',
    permissions: [
      { key: 'storefront.manage', label: 'Manage storefront', description: 'Edit site name, theme, hero slides and announcements.' },
    ],
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp Channels',
    scope: 'PLATFORM',
    description: 'The free WhatsApp sending lines (Baileys).',
    permissions: [
      { key: 'whatsapp.view', label: 'View WhatsApp channels', description: 'See sender numbers, pairing state and the outbound message ledger.' },
      { key: 'whatsapp.manage', label: 'Manage WhatsApp channels', description: 'Pair new sender numbers, set the default line, disconnect, remove and send test messages.' },
    ],
  },
  {
    key: 'audit',
    label: 'Audit & Compliance',
    scope: 'PLATFORM',
    description: 'The immutable action trail.',
    permissions: [
      { key: 'audit.view', label: 'View audit log', description: 'Read the immutable audit trail.' },
    ],
  },
  {
    key: 'staff',
    label: 'Staff & Access',
    scope: 'PLATFORM',
    description: 'Platform staff, role CRUD, assignments and invitations (this console).',
    permissions: [
      { key: 'staff.view', label: 'View staff & roles', description: 'See staff members, role assignments and the permission catalog.' },
      { key: 'staff.invite', label: 'Invite staff', description: 'Send and revoke staff invitations (only for roles within your own access).' },
      { key: 'staff.manage', label: 'Manage assignments', description: 'Grant and revoke role assignments — only for roles within your own permissions.' },
      { key: 'rbac.roles.view', label: 'View roles', description: 'Browse the role catalog with permission matrices. Protected roles (Super Admin) stay hidden unless you hold them.' },
      { key: 'rbac.roles.create', label: 'Create roles', description: 'Create custom roles — the permission set can never exceed your own access.' },
      { key: 'rbac.roles.update', label: 'Update roles', description: 'Rename and re-permission custom roles — never beyond your own access.' },
      { key: 'rbac.roles.delete', label: 'Delete roles', description: 'Delete custom roles and un-assign their members.' },
      { key: 'rbac.manage', label: 'Manage roles (full)', description: 'Umbrella: create, update and delete roles. Grant the granular keys above to delegate partial control instead.' },
      { key: 'modules.manage', label: 'Manage module activation', description: 'Switch platform modules on/off per platform, organization-type and organization scope (Phase 5).' },
    ],
  },

  // ── ORG domains (organization consoles) ──────────────────────────────────
  {
    key: 'org-profile',
    label: 'Organization Profile',
    scope: 'ORG',
    description: 'Company facts and settings.',
    permissions: [
      { key: 'org.profile.view', label: 'View organization', description: 'See the organization profile and facts.' },
      { key: 'org.profile.update', label: 'Edit organization', description: 'Update organization details and settings.' },
    ],
  },
  {
    key: 'org-members',
    label: 'Team',
    scope: 'ORG',
    description: 'Members and their team roles.',
    permissions: [
      { key: 'org.members.invite', label: 'Invite members', description: 'Invite users to the organization by email.' },
      { key: 'org.members.manage', label: 'Manage members', description: 'Change member roles and remove members.' },
    ],
  },
  {
    key: 'org-procurement',
    label: 'Procurement',
    scope: 'ORG',
    description: 'Orders, RFQs and approvals on behalf of the organization.',
    permissions: [
      { key: 'org.orders.view', label: 'View org orders', description: 'See organization orders and invoices.' },
      { key: 'org.rfq.view', label: 'View org RFQs', description: 'See organization RFQs and negotiations.' },
      { key: 'org.rfq.create', label: 'Create RFQs', description: 'Submit RFQs on behalf of the organization.' },
      { key: 'org.approvals.manage', label: 'Decide approvals', description: 'Approve or reject purchase requests above the threshold.' },
    ],
  },
  {
    key: 'org-pricing',
    label: 'Contract Pricing',
    scope: 'ORG',
    description: 'Negotiated price lists for the organization.',
    permissions: [
      { key: 'org.pricelists.view', label: 'View price lists', description: 'See contract prices available to the organization.' },
      { key: 'org.pricelists.manage', label: 'Manage price lists', description: 'Maintain the organization price list.' },
    ],
  },
  {
    key: 'org-finance',
    label: 'Financing (applicant)',
    scope: 'ORG',
    description: 'Financing applications made for the organization.',
    permissions: [
      { key: 'org.finance.view', label: 'View applications', description: 'See financing and accreditation applications.' },
      { key: 'org.finance.apply', label: 'Apply for financing', description: 'Submit financing applications on behalf of the organization.' },
    ],
  },
  {
    key: 'financier-services',
    label: 'Lender — Services',
    scope: 'ORG',
    description: 'Financier institution service catalog (BANK/MFI orgs).',
    permissions: [
      { key: 'financier.services.manage', label: 'Manage services', description: 'Create and edit financing programs and services.' },
      { key: 'financier.services.publish', label: 'Publish services', description: 'Publish and unpublish services to the public hub.' },
    ],
  },
  {
    key: 'financier-pipeline',
    label: 'Lender — Pipeline',
    scope: 'ORG',
    description: 'Applications, offers, agreements and accreditations.',
    permissions: [
      { key: 'financier.requests.view', label: 'View requests', description: 'See forwarded financing requests in the inbox.' },
      { key: 'financier.offers.manage', label: 'Manage offers', description: 'Compose, send and withdraw binding offers.' },
      { key: 'financier.agreements.manage', label: 'Manage agreements', description: 'Report funding progress and money events on agreements.' },
      { key: 'financier.accreditations.manage', label: 'Manage accreditations', description: 'Grant, reject and revoke accreditation programs.' },
    ],
  },
  {
    key: 'financier-team',
    label: 'Lender — Team',
    scope: 'ORG',
    description: 'Institution staff management.',
    permissions: [
      { key: 'financier.team.manage', label: 'Manage institution team', description: 'Invite and manage lender staff (underwriters, reviewers).' },
    ],
  },
]

export const PLATFORM_DOMAINS = PERMISSION_DOMAINS.filter((d) => d.scope === 'PLATFORM')
export const ORG_DOMAINS = PERMISSION_DOMAINS.filter((d) => d.scope === 'ORG')

export const ALL_PLATFORM_PERMISSIONS: string[] = PLATFORM_DOMAINS.flatMap((d) =>
  d.permissions.map((p) => p.key)
)
export const ALL_ORG_PERMISSIONS: string[] = ORG_DOMAINS.flatMap((d) => d.permissions.map((p) => p.key))
export const ALL_PERMISSION_KEYS: string[] = [...ALL_PLATFORM_PERMISSIONS, ...ALL_ORG_PERMISSIONS]

export function permissionLabel(key: string): string {
  for (const d of PERMISSION_DOMAINS) {
    const p = d.permissions.find((p) => p.key === key)
    if (p) return p.label
  }
  return key
}

// ── System role templates (seeded, undeletable) ─────────────────────────────

export interface RoleTemplate {
  key: string
  name: string
  description: string
  scope: 'PLATFORM' | 'ORG'
  permissions: string[]
}

export const SYSTEM_ROLES: RoleTemplate[] = [
  {
    key: 'platform.super-admin',
    name: 'Super Administrator',
    description: 'Full, unrestricted access to every platform console section. The only locked role — assigned to platform owners.',
    scope: 'PLATFORM',
    permissions: [...ALL_PLATFORM_PERMISSIONS],
  },
  {
    key: 'platform.kyc-reviewer',
    name: 'KYC / Financing Reviewer',
    description: 'Reviews the financing verification gate and verifies applicant KYC documents. No commerce or catalog access.',
    scope: 'PLATFORM',
    permissions: [
      'platform.overview.view',
      'financing.gate.view',
      'financing.gate.review',
      'financing.documents.verify',
      'financing.institutions.manage',
      'financing.requirements.manage',
      'audit.view',
    ],
  },
  {
    key: 'platform.catalog-moderator',
    name: 'Catalog Moderator',
    description: 'Curates the marketplace catalog — creates, edits, moderates and removes listings.',
    scope: 'PLATFORM',
    permissions: [
      'platform.overview.view',
      'catalog.products.view',
      'catalog.products.create',
      'catalog.products.update',
      'catalog.products.moderate',
      'catalog.products.delete',
      'audit.view',
    ],
  },
  {
    key: 'platform.finance-ops',
    name: 'Finance Operations',
    description: 'Operates payments, payouts and the financier fee ledger.',
    scope: 'PLATFORM',
    permissions: [
      'platform.overview.view',
      'payments.view',
      'payments.capture',
      'payouts.view',
      'payouts.manage',
      'financing.fees.manage',
      'audit.view',
    ],
  },
  {
    key: 'platform.support',
    name: 'Support (read-only)',
    description: 'Read-only access for support staff — orders, organizations, vendors, RFQs, disputes and the audit trail.',
    scope: 'PLATFORM',
    permissions: [
      'platform.overview.view',
      'orders.view',
      'orgs.view',
      'vendors.view',
      'rfq.pipeline.view',
      'disputes.view',
      'audit.view',
    ],
  },
  {
    key: 'org.owner',
    name: 'Organization Owner',
    description: 'Full control of the organization — settings, team, procurement, pricing and financing.',
    scope: 'ORG',
    permissions: [...ALL_ORG_PERMISSIONS.filter((k) => !k.startsWith('financier.'))],
  },
  {
    key: 'org.admin',
    name: 'Organization Admin',
    description: 'Administers the organization day-to-day — team, approvals, RFQs and settings (assigned by the owner).',
    scope: 'ORG',
    permissions: [...ALL_ORG_PERMISSIONS.filter((k) => !k.startsWith('financier.'))],
  },
  {
    key: 'org.buyer',
    name: 'Organization Buyer',
    description: 'Shops and requests quotes on behalf of the organization.',
    scope: 'ORG',
    permissions: [
      'org.profile.view',
      'org.orders.view',
      'org.rfq.view',
      'org.rfq.create',
      'org.pricelists.view',
      'org.finance.view',
      'org.finance.apply',
    ],
  },
  {
    key: 'org.approver',
    name: 'Organization Approver',
    description: 'Approves or rejects purchases above the organization threshold.',
    scope: 'ORG',
    permissions: ['org.profile.view', 'org.approvals.manage', 'org.orders.view', 'org.rfq.view'],
  },
  {
    key: 'org.viewer',
    name: 'Organization Viewer',
    description: 'Read-only visibility into organization orders and RFQs.',
    scope: 'ORG',
    permissions: ['org.profile.view', 'org.orders.view', 'org.rfq.view'],
  },
  {
    key: 'financier.admin',
    name: 'Institution Admin',
    description: 'Runs the lender console — services, pipeline and institution staff.',
    scope: 'ORG',
    permissions: [
      'org.profile.view',
      'org.profile.update',
      'org.members.invite',
      'org.members.manage',
      'financier.services.manage',
      'financier.services.publish',
      'financier.requests.view',
      'financier.offers.manage',
      'financier.agreements.manage',
      'financier.accreditations.manage',
      'financier.team.manage',
    ],
  },
  {
    key: 'financier.underwriter',
    name: 'Underwriter',
    description: 'Reviews financing requests and issues binding offers.',
    scope: 'ORG',
    permissions: ['org.profile.view', 'financier.requests.view', 'financier.offers.manage', 'financier.agreements.manage'],
  },
  {
    key: 'financier.reviewer',
    name: 'Request Reviewer',
    description: 'Screens forwarded financing requests in the inbox.',
    scope: 'ORG',
    permissions: ['org.profile.view', 'financier.requests.view'],
  },
  {
    key: 'financier.branch-officer',
    name: 'Branch Officer',
    description: 'Front-desk institution staff — screens requests and manages accreditation programs for their branch.',
    scope: 'ORG',
    permissions: ['org.profile.view', 'financier.requests.view', 'financier.accreditations.manage'],
  },
]

/** Legacy OrganizationMember.role → system org role key (seed migration map). */
export const ORG_ROLE_BY_LEGACY: Record<string, string> = {
  OWNER: 'org.owner',
  ADMIN: 'org.admin',
  BUYER: 'org.buyer',
  APPROVER: 'org.approver',
  VIEWER: 'org.viewer',
}

// ── Protected roles (RBACSEC-1) ────────────────────────────────────────────
//
// Protected roles are INVISIBLE to everyone except super administrators:
//   • hidden from the roles list, staff cards, assignments and invitations
//   • cannot be read, updated, deleted, assigned or revoked by non-super-admins
//     (the API answers 404 so their very existence is not revealed)
//   • holders (and legacy User.role === 'ADMIN' accounts) are hidden from the
//     staff list and user search of non-super-admin staff
// Super administrators = legacy ADMIN bypass or platform.super-admin holders.

export const PROTECTED_ROLE_KEYS: string[] = ['platform.super-admin', 'org.owner']

export function isProtectedRoleKey(key: string): boolean {
  return PROTECTED_ROLE_KEYS.includes(key)
}
