export type Role = 'BUYER' | 'SELLER' | 'ADMIN'

export interface SessionUser {
  id: string
  name: string
  /** Phase 3: optional — phone-first accounts may have no email. */
  email: string | null
  /** Phase 3: normalized E.164 (+967XXXXXXXXX) — the primary identifier. */
  phone?: string | null
  /** Phase 3: set by OTP verification (L1 evidence). */
  phoneVerifiedAt?: string | null
  /** Phase 3: 0=L0 · 1=L1 phone · 2=L2 identity · 3=L3 business. */
  kycLevel?: number
  /** Phase 3: EXCLUSIVE_AGENT | AUTHORIZED_AGENT | DISTRIBUTOR | WHOLESALER | RETAILER. */
  merchantType?: string | null
  /** Phase 3: email when present, else the phone — safe for header display. */
  displayContact: string
  role: Role
  image?: string | null
  storeName?: string | null
  storeBio?: string | null
  /** STAB-8: curated storefront cover id (see src/lib/store-covers.ts). */
  storeCover?: string | null
  createdAt?: string
  /** AUTHSEC-1: null until the user confirms their email via the emailed link. */
  emailVerifiedAt?: string | null
  // ── RBAC (mergedplan.md Phase 2) ──
  /** Effective platform permissions (legacy ADMIN implicitly holds all). */
  permissions?: string[]
  /** True when the user may enter the admin console (legacy ADMIN or platform role holder). */
  isPlatformStaff?: boolean
  /** Phase 5 — module activation state for this session. Undefined for legacy
   *  admins (bypass). `personal` = enabled keys at platform scope (storefront
   *  + buyer surfaces); `orgs` = orgId → enabled keys through the ORG >
   *  ORG_TYPE > PLATFORM chain (financier console etc.). */
  modules?: {
    personal: string[]
    orgs: Record<string, string[]>
  }
}

// ── RBAC DTOs (Roles & Access console) ──────────────────────────────────────

export interface RbacRoleDTO {
  id: string
  key: string
  name: string
  description: string | null
  scope: 'PLATFORM' | 'ORG'
  isSystem: boolean
  /** RBACSEC-1: protected roles (super-admin, org.owner) — only visible/editable by super admins. */
  isProtected: boolean
  permissions: string[]
  memberCount: number
  createdAt: string
}

export interface RbacAssignmentDTO {
  id: string
  userId: string
  userName: string
  userEmail: string | null
  userRole: string
  roleId: string
  roleKey: string
  roleName: string
  roleScope: 'PLATFORM' | 'ORG'
  organizationId: string
  organizationName: string | null
  assignedAt: string
}

export interface RbacStaffDTO {
  userId: string
  name: string
  email: string | null
  userRole: string
  isSuperAdmin: boolean
  permissions: string[]
  roles: { assignmentId: string; roleId: string; roleName: string; roleKey: string; assignedAt: string }[]
}

export interface RbacStaffUserDTO {
  id: string
  name: string
  email: string | null
  role: string
}

export interface RbacInvitationDTO {
  id: string
  email: string
  name: string | null
  roleId: string
  roleKey: string
  roleName: string
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED'
  invitedByName: string | null
  expiresAt: string
  createdAt: string
  token: string
}

export interface CategoryDTO {
  id: string
  name: string
  slug: string
  icon?: string | null
  productCount?: number
  coverImage?: string | null
}

export interface ProductVariantDTO {
  id: string
  name: string
  options: Record<string, string>
  price: number | null // null = inherit product price
  compareAtPrice: number | null
  stock: number
  sku: string | null
  position: number
  isActive: boolean
}

export interface ProductDTO {
  id: string
  title: string
  description: string
  price: number
  compareAtPrice: number | null
  images: string[]
  categoryId: string
  category: CategoryDTO
  sellerId: string
  seller: { id: string; name: string; storeName?: string | null }
  stock: number
  soldCount: number
  rating: number
  reviewCount: number
  featured: boolean
  status: string
  createdAt: string
  favorited?: boolean

  // ── Commerce details (product form: Pricing / Details / Shipping / SEO) ──
  sku?: string | null
  barcode?: string | null
  videoUrl?: string | null
  highlights?: string[]
  specs?: { label: string; value: string }[]
  materials?: string | null
  care?: string | null
  weightGrams?: number | null
  lengthCm?: number | null
  widthCm?: number | null
  heightCm?: number | null
  processingDays?: number | null
  moq?: number | null
  priceTiers?: { from: number; to: number | null; price: number }[] | null
  freeShipping?: boolean
  shippingFee?: number | null
  shippingPolicy?: string | null
  slug?: string | null
  metaTitle?: string | null
  metaDescription?: string | null
  variants?: ProductVariantDTO[]
  /** Phase 3 KYP — certifications attached to the listing (detail view). */
  certifications?: ProductCertificationDTO[]
  /** True when ≥1 VERIFIED certification — powers the "Verified specs" badge. */
  hasVerifiedSpecs?: boolean

  // ── Phase 4 — unified catalog + multi-vendor ──
  /** Platform-managed brand linkage ("what it is" layer). */
  brand?: { id: string; name: string; slug: string; isVerified: boolean } | null
  /** Normalized EAN/UPC/GTIN — dedup/merge key. */
  gtin?: string | null
  /** Manufacturer part number — dedup key. */
  mpn?: string | null
  /** Platform-curated listing (admin-created/adopted). */
  isCurated?: boolean
  /** Homepage popular-products ordering; null = unranked. */
  popularRank?: number | null
  /** ACTIVE offers from additional sellers (excludes the listing owner). */
  offerCount?: number
  /** Phase 4 review — admin's reject reason (owner/admin, detail GET only). */
  reviewNote?: string | null
  /** Phase 4 — can the current viewer attach an offer to this listing? */
  viewerCanOffer?: boolean
}

/** Phase 4 — a vendor offer on a catalog product (the "who sells it" layer). */
export interface ProductOfferDTO {
  id: string
  productId: string
  sellerId: string
  seller: { id: string; name: string; storeName: string | null }
  price: number
  compareAtPrice: number | null
  stock: number
  moq: number | null
  sku: string | null
  priceTiers?: { from: number; to: number | null; price: number }[] | null
  freeShipping: boolean
  shippingFee: number | null
  processingDays: number | null
  leadTimeNote: string | null
  status: string
  soldCount: number
  createdAt: string
  product?: { id: string; title: string; status: string; slug: string | null; category: string; image: string | null }
}

/** Phase 3 KYP — a certification/compliance artifact on a product. */
export interface ProductCertificationDTO {
  id: string
  productId: string
  productTitle?: string
  sellerId?: string
  sellerName?: string | null
  kind: string
  title: string
  mediaId: string | null
  url: string | null
  issuedBy: string | null
  issuedAt: string | null
  expiresAt: string | null
  status: string
  verifiedById: string | null
  verifiedAt: string | null
  note: string | null
  isActive: boolean
  createdAt: string
}

/** Phase 3 — admin spec-attribute dictionary entry. */
export interface SpecAttributeDTO {
  id: string
  categoryId: string | null
  categoryName?: string | null
  key: string
  label: string
  dataType: string
  unit: string | null
  options: string[]
  required: boolean
  position: number
  isActive: boolean
  createdAt: string
}

/** Phase 3 — /api/kyc/status payload (account console Verification card). */
export interface KycStatusDTO {
  kycLevel: number
  levelLabel: string
  missingForNext: string[]
  verifiedBadges: string[]
}

export interface ReviewDTO {
  id: string
  productId: string
  rating: number
  comment: string
  verified: boolean
  createdAt: string
  user: { id: string; name: string }
}

export interface OrderItemDTO {
  id: string
  productId: string
  sellerId: string
  title: string
  image?: string | null
  price: number
  quantity: number
  mine?: boolean
  variantId?: string | null
  variantName?: string | null
  /** Phase 4: set when this item purchased a vendor ProductOffer (variant is null). */
  offerId?: string | null
}

export interface OrderPaymentDTO {
  method: string
  status: string
  reference: string | null
  instructions: string | null
  dueAt: string | null
  paidAt: string | null
}

export interface OrderDTO {
  id: string
  total: number
  status: string
  fullName: string
  address: string
  city: string
  country: string
  zip: string
  phone?: string | null
  createdAt: string
  paymentTerms?: string | null
  poNumber?: string | null
  sourceType?: string | null
  payment?: OrderPaymentDTO | null
  buyer?: { id: string; name: string; email: string | null }
  items: OrderItemDTO[]
}

export interface CartItem {
  productId: string
  title: string
  price: number
  image?: string | null
  stock: number
  quantity: number
  sellerId: string
  sellerName?: string | null
  variantId?: string | null
  variantLabel?: string | null
  sku?: string | null
  // ── Phase 4 multi-vendor: set when this line buys a SPECIFIC vendor offer
  // (not the listing owner). price above already equals the offer price.
  offerId?: string | null
  /** Offer price at add-to-cart time (display snapshot; price mirrors it). */
  offerPrice?: number | null
  /** The offering vendor's store name for "via <store>" sub-labels. */
  offerSellerName?: string | null
}

export interface StoreDTO {
  id: string
  name: string
  storeName: string | null
  storeBio: string | null
  /** STAB-8: curated cover id (STORE_COVERS) — null = default gradient. */
  storeCover: string | null
  /** Resolved server-side (id → url) so clients don't need the cover map. */
  storeCoverUrl: string | null
  /** Cover label for alt text (resolved alongside storeCoverUrl). */
  storeCoverLabel: string | null
  /** Phase 3 KYC: 0=L0 · 1=L1 phone · 2=L2 identity · 3=L3 business. */
  kycLevel?: number
  memberSince: string
  activeListings: number
  totalSold: number
  avgRating: number
  reviewCount: number
}

export interface StoreCategoryDTO {
  id: string
  name: string
  slug: string
  count: number
}

export interface SellerStats {
  totalProducts: number
  totalSold: number
  revenue: number
  avgRating: number
  activeListings: number
  /** Read-only payout summary (derived from order items, no ledger stored). */
  payouts: {
    grossSales: number
    platformFee: number
    netEarnings: number
    /** Net earnings from DELIVERED order items — cleared for payout. */
    availableBalance: number
    /** Net earnings from PAID/PROCESSING/SHIPPED items — clearing. */
    inTransitBalance: number
    /** ISO date of the next weekly payout run (next Friday). */
    nextPayoutDate: string
  }
  recentOrders: {
    id: string
    total: number
    status: string
    createdAt: string
    buyer: { id: string; name: string; email: string | null }
    itemCount: number
  }[]
  salesByDay: { date: string; revenue: number; orders: number }[]
  topProducts: { id: string; title: string; soldCount: number; revenue: number; image?: string | null }[]
}

export interface HomeFeed {
  featured: ProductDTO[]
  trending: ProductDTO[]
  newArrivals: ProductDTO[]
  categories: CategoryDTO[]
  stats: { productCount: number; sellerCount: number; reviewCount: number; orderCount: number }
}

// ── B2B foundation ─────────────────────────────────────────────────────────

export type OrgRole = 'OWNER' | 'ADMIN' | 'BUYER' | 'APPROVER' | 'VIEWER'
export type OrgStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED'

export interface OrganizationMemberDTO {
  id: string
  role: OrgRole
  jobTitle?: string | null
  user: { id: string; name: string; email: string | null }
  createdAt: string
}

/** B2B purchase-approval request (ORDER checkout or QUOTE_ACCEPT gated by the org threshold). */
export interface ApprovalRequestDTO {
  id: string
  organizationId: string
  type: 'ORDER' | 'QUOTE_ACCEPT'
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  amount: number
  note?: string | null
  decisionNote?: string | null
  createdAt: string
  decidedAt?: string | null
  requester?: { id: string; name: string; email: string | null } | null
  decidedBy?: { id: string; name: string; email: string | null } | null
  order?: {
    id: string
    status: string
    total: number
    poNumber?: string | null
    createdAt: string
    items: { title: string; quantity: number; price: number; variantName?: string | null; image?: string | null }[]
  } | null
  quote?: {
    id: string
    number: string
    total: number
    paymentTerms?: string | null
    validUntil?: string | null
    status: string
  } | null
  rfqId?: string | null
}

export interface CustomerGroupDTO {
  id: string
  key: string
  name: string
  description?: string | null
  priority: number
  isDefault: boolean
  createdAt: string
  _count?: { users: number; organizations: number; priceLists: number }
}

export interface OrganizationDTO {
  id: string
  name: string
  slug: string
  orgType?: string | null
  legalName?: string | null
  taxId?: string | null
  registrationNumber?: string | null
  industry?: string | null
  website?: string | null
  status: OrgStatus
  verifiedAt?: string | null
  creditTermsDays: number
  creditLimit: number
  /** Orders/quote-accepts at or above this total placed by BUYER members need approval (null = off). */
  approvalThreshold?: number | null
  notes?: string | null
  createdAt: string
  memberCount?: number
  myRole?: OrgRole
  members?: OrganizationMemberDTO[]
  groups?: CustomerGroupDTO[]
}

export interface PriceListEntryDTO {
  id: string
  productId: string
  productTitle?: string
  minQuantity: number
  unitPrice: number
}

export interface PriceListDTO {
  id: string
  name: string
  description?: string | null
  scope: 'ORG' | 'GROUP' | 'CHANNEL'
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
  priority: number
  currency: string
  startsAt?: string | null
  endsAt?: string | null
  organizationId?: string | null
  organizationName?: string | null
  customerGroupId?: string | null
  customerGroupName?: string | null
  entryCount?: number
  createdAt: string
  entries?: PriceListEntryDTO[]
}

export interface RfqLineDTO {
  id: string
  productId?: string | null
  productName: string
  sku?: string | null
  variantId?: string | null
  variantName?: string | null
  quantity: number
  targetPrice?: number | null
  notes?: string | null
  /** Store the catalog line's product belongs to (open items have none). */
  sellerName?: string | null
  product?: {
    id: string
    title: string
    price: number
    image?: string | null
    moq?: number | null
    stock?: number
    priceTiers?: { from: number; to: number | null; price: number }[] | null
  } | null
}

export interface QuoteLineDTO {
  id: string
  productId: string
  variantId?: string | null
  variantName?: string | null
  productTitle?: string
  image?: string | null
  quantity: number
  unitPrice: number
  lineTotal: number
}

export interface QuoteSellerMeta {
  name: string
  storeName?: string | null
  verified?: boolean
  rating?: number | null
  reviewCount?: number
  memberSince?: string | null
  disputeCount?: number // open disputes against this seller (sellerRating.showDisputeCount)
}

export interface QuoteDTO {
  id: string
  number: string
  rfqId: string
  status: string
  currency: string
  subtotal: number
  discountTotal: number
  shippingTotal: number
  taxTotal: number
  total: number
  paymentTerms?: string | null
  validUntil?: string | null
  notes?: string | null
  sentAt?: string | null
  acceptedAt?: string | null
  declinedAt?: string | null
  createdAt: string
  createdBy: { id: string; name: string }
  sellerId?: string | null
  sellerMeta?: QuoteSellerMeta | null
  lines: QuoteLineDTO[]
}

export interface RfqDTO {
  id: string
  number: string
  status: string
  title?: string | null
  description?: string | null
  organizationId?: string | null
  organizationName?: string | null
  requester: { id: string; name: string; email: string | null }
  submittedAt?: string | null
  respondedAt?: string | null
  closedAt?: string | null
  expiresAt?: string | null
  extendedCount?: number
  sourceRecurringId?: string | null // set when spawned by a recurring schedule
  createdAt: string
  lines: RfqLineDTO[]
  quotes?: QuoteDTO[]
  quoteCount?: number
  lineCount?: number
  totalQuantity?: number
  // Seller-inbox extras (only set in /api/rfqs/inbox responses)
  myQuoteCount?: number
  myLineCount?: number
}

export interface RfqMessageDTO {
  id: string
  rfqId: string
  author: { id: string; name: string; role: string }
  body: string
  createdAt: string
}

// ── Open Requests directory (seller console, STAB-6) ────────────────────────

/** One free-form ("open item") line of an RFQ — productId is null. */
export interface OpenRfqLineDTO {
  id: string
  productName: string
  sku?: string | null
  quantity: number
  targetPrice?: number | null
  notes?: string | null
}

/**
 * Open Requests directory entry — a live, quotable RFQ that carries at least
 * one free-form line (productId = null), surfaced to sellers by keyword match
 * against their ACTIVE catalog. Buyer identity is limited to name + org
 * (no contact details — negotiation stays on the RFQ thread).
 */
export interface OpenRfqDTO {
  id: string
  number: string
  title?: string | null
  description?: string | null
  createdAt: string
  expiresAt?: string | null
  buyer: { id?: string; name: string; orgName?: string | null }
  openLines: OpenRfqLineDTO[]
  /** Catalog keywords this request matched (top ~6, most frequent first). */
  matchedKeywords: string[]
  /** Always 0 by construction (the query excludes RFQs I already quoted). */
  myQuoteCount: number
}

// ── Media library (uploads) ──
export interface MediaAssetDTO {
  id: string
  originalName: string
  mime: string
  size: number
  width?: number | null
  height?: number | null
  url: string
  urls: { thumb: string; medium: string; large: string; full: string }
  /** 6.6 — 'public-media' assets carry ready public URLs; 'private-vault'
   *  assets have EMPTY url fields (no public path exists) and are fetched
   *  through the authenticated proxy via POST /api/documents/:id/access. */
  namespace?: 'public-media' | 'private-vault'
  createdAt: string
}

// ── Disputes (settings: Dispute Resolution panel) ──
export interface DisputeDTO {
  id: string
  number: string
  orderId: string
  orderNumber: string // poNumber or short id fallback
  rfqId?: string | null
  reason: string
  description: string
  amount?: number | null
  status: string // OPEN | SELLER_RESPONDED | ESCALATED | RESOLVED | CLOSED | CANCELLED
  sellerResponse?: string | null
  sellerRespondedAt?: string | null
  escalateAt?: string | null
  outcome?: string | null
  resolutionNote?: string | null
  resolvedAt?: string | null
  closedAt?: string | null
  createdAt: string
  buyer: { id: string; name: string }
  seller: { id: string; name: string; storeName: string | null }
  resolvedBy?: { id: string; name: string } | null
  orderTotal: number
  itemCount: number
}

// ── Recurring RFQ schedules (settings: Recurring RFQs panel) ──
export interface RecurringScheduleDTO {
  id: string
  title?: string | null
  description?: string | null
  frequency: string // WEEKLY | BIWEEKLY | MONTHLY | QUARTERLY | CUSTOM
  intervalDays: number
  active: boolean
  pausedUntil?: string | null
  nextRunAt: string
  lastRunAt?: string | null
  emptyCycles: number
  runCount: number
  lastRfqId?: string | null
  lastRfqNumber?: string | null
  lineCount: number
  totalQuantity: number
  recipientCount: number
  createdAt: string
}

export interface NotificationDTO {
  id: string
  type: string
  title: string
  body: string | null
  linkView: string
  linkId: string | null
  readAt: string | null
  createdAt: string
}

export interface AuditLogDTO {
  id: string
  actorId?: string | null
  actorType: string
  action: string
  entityType: string
  entityId?: string | null
  summary?: string | null
  metadata?: unknown
  createdAt: string
}

export interface ResolvedPriceDTO {
  productId: string
  quantity: number
  unitPrice: number
  listPrice: number
  source: 'CONTRACT' | 'GROUP' | 'RETAIL'
  priceListId?: string
  priceListName?: string
  savingsAmount: number
  savingsPercent: number
}

export interface CouponDTO {
  id: string
  code: string
  description: string
  percentOff: number
  minSubtotal: number
  firstOrderOnly: boolean
  active: boolean
  createdAt: string
}

// ── Admin analytics (read-only platform overview) ──
export interface AdminStats {
  totals: {
    users: number
    buyers: number
    sellers: number
    products: number
    activeListings: number
    orders: number
    revenue: number
    aov: number
    reviews: number
    newUsers7d: number
  }
  ordersByStatus: { status: string; count: number; revenue: number }[]
  revenueByDay: { date: string; revenue: number; orders: number }[]
  topSellers: {
    id: string
    name: string
    storeName: string | null
    revenue: number
    unitsSold: number
    products: number
    rating: number
  }[]
  topCategories: { id: string; name: string; slug: string; unitsSold: number; revenue: number; products: number }[]
  recentOrders: {
    id: string
    total: number
    status: string
    createdAt: string
    buyer: { id: string; name: string }
    itemCount: number
    firstItemTitle: string | null
    firstItemImage: string | null
  }[]
}

// ── Financier module DTOs (FIN-5/6/7 — mirror the server serializers in
//    src/server/modules/financing/*; kept as pure client-side types) ──

export interface ServiceAttributeDTO {
  id: string
  kind: string
  position: number
  text: string
}

export interface ServiceCoverageDTO {
  id: string
  regionName: string
}

export interface FinancierServiceDTO {
  id: string
  financierProfileId: string
  financierOrgId: string
  financierOrgName: string
  financierOrgStatus: string
  serviceKind: string
  category: string
  name: string
  summary: string | null
  description: string | null
  targetSegment: string | null
  status: string
  currency: string
  amountMin: number | null
  amountMax: number | null
  rateType: string | null
  rateMax: number | null
  feeFlat: number | null
  tenorMinMonths: number | null
  tenorMaxMonths: number | null
  repaymentFrequency: string | null
  gracePeriodDays: number | null
  shariaCompliant: boolean
  processingDays: number | null
  accreditationValidMonths: number | null
  accreditationFeeAmount: number | null
  viewCount: number
  createdAt: string
  updatedAt: string
  attributes: ServiceAttributeDTO[]
  coverage: ServiceCoverageDTO[]
  requirementCount?: number
}

export interface PublicServiceDetailDTO extends FinancierServiceDTO {
  requirementsPreview: {
    id: string
    isRequired: boolean
    title: string
    conditionType: string
    instructions: string | null
  }[]
  /**
   * FULL composed requirements (typed: options, bounds, documentType) —
   * signed-in viewers only (FIN-6 wizard renders its checklist from this).
   */
  requirements?: ServiceRequirementDTO[]
}

/** User applicant-profile scalars (FINANCIER_SCHEMA §3.1, DP-14) — additive sibling
 *  of `user` on GET /api/auth/me; read-only reference for the wizard's step 1. */
export interface ApplicantProfileDTO {
  phone: string | null
  whatsappNumber: string | null
  dateOfBirth: string | null
  gender: string | null
  maritalStatus: string | null
  nationality: string | null
  identityType: string | null
  identityNumber: string | null
  residenceStreet: string | null
  residenceCity: string | null
  residenceDistrict: string | null
  residenceType: string | null
}

export interface ConditionOptionDTO {
  id: string
  value: string
  position: number
}

export interface ConditionTemplateDTO {
  id: string
  scope: string // GENERAL | FINANCIER
  organizationId: string | null
  organizationName: string | null
  conditionType: string // DOCUMENT | PROFILE_FIELD | DECLARATION | TEXT | NUMBER | DATE | SELECT | MULTI_SELECT
  code: string | null
  title: string
  description: string | null
  profileFieldKey: string | null
  documentType: string | null
  validationMin: number | null
  validationMax: number | null
  validityMonths: number | null
  isRepeatable: boolean
  isActive: boolean
  attachmentCount: number
  options: ConditionOptionDTO[]
  createdAt: string
}

export interface ServiceRequirementDTO {
  id: string
  serviceId: string
  conditionTemplateId: string
  isRequired: boolean
  displayOrder: number
  instructions: string | null
  autoPassAccredited: boolean
  isActive: boolean
  template: ConditionTemplateDTO
}

export interface RequirementSubmissionDTO {
  id: string
  serviceRequirementId: string
  financingRequestId: string | null
  accreditationRequestId: string | null
  status: string // PENDING | SUBMITTED | VERIFIED | REJECTED | WAIVED
  valueText: string | null
  valueNumber: number | null
  valueDate: string | null
  accountDocumentId: string | null
  submittedAt: string | null
  verifiedAt: string | null
  verifiedById: string | null
  decisionNote: string | null
  requirement: {
    id: string
    isRequired: boolean
    displayOrder: number
    instructions: string | null
    autoPassAccredited: boolean
    template: {
      id: string
      scope: string
      conditionType: string
      code: string | null
      title: string
      description: string | null
      documentType: string | null
      validationMin: number | null
      validationMax: number | null
      options: { id: string; value: string }[]
    }
  }
  createdAt: string
}

export interface GateStatusDTO {
  totalRequired: number
  verified: number
  waived: number
  missing: { submissionId: string; title: string; status: string }[]
  canForward: boolean
}

export interface FinancingRequestSummaryDTO {
  id: string
  number: string
  status: string
  organizationId: string | null
  organizationName: string | null
  applicant: { id: string; name: string; email: string | null }
  serviceId: string
  serviceName: string
  serviceKind: string
  financierOrgId: string
  financierOrgName: string
  targetType: string
  multiGroupId: string | null
  amountRequested: number
  currency: string
  /** The tenor the applicant asked for (FIN-9 prefill source) */
  tenorRequestedMonths: number | null
  activityName: string | null
  activityCity: string | null
  purpose: string | null
  consentAt: string | null
  submittedAt: string | null
  forwardedAt: string | null
  returnedAt: string | null
  returnedReason: string | null
  expiresAt: string | null
  closedAt: string | null
  createdAt: string
  submissionStats?: { total: number; verified: number; missing: number }
  offerCount?: number
  /** Phase 5 — the latest SENT offer with full comparison facts (the
   *  multi-financier side-by-side view renders from this). */
  bestOffer?: {
    id: string
    amount: number
    status: string
    rateType?: string | null
    ratePercent?: number | null
    feeFlat?: number | null
    tenorMonths?: number | null
    validUntil?: string | null
    notes?: string | null
    installmentCount?: number
    installmentTotal?: number
  } | null
}

export interface FinancingRequestDetailDTO extends FinancingRequestSummaryDTO {
  platformReviewedById: string | null
  platformReviewedAt: string | null
  platformNote: string | null
  submissions: RequirementSubmissionDTO[]
  gate: GateStatusDTO
  offers?: FinancingOfferDTO[]
}

export interface OfferInstallmentDTO {
  id: string
  installmentNo: number
  dueDate: string
  amount: number
}

export interface FinancingOfferDTO {
  id: string
  requestId: string
  requestNumber: string
  amount: number
  currency: string
  rateType: string | null
  ratePercent: number | null
  feeFlat: number | null
  tenorMonths: number
  collateralRequired: string | null
  notes: string | null
  validUntil: string | null
  status: string
  sentAt: string | null
  acceptedAt: string | null
  declinedAt: string | null
  withdrawnAt: string | null
  createdAt: string
  createdBy: { id: string; name: string }
  installments: OfferInstallmentDTO[]
}

export interface FinancingEventDTO {
  id: string
  agreementId: string
  type: string // DISBURSEMENT | REPAYMENT | EARLY_SETTLEMENT | LATE_FEE | NOTE
  eventDate: string
  amount: number | null
  note: string | null
  reportedById: string | null
  createdAt: string
}

export interface FinancingFeeDTO {
  id: string
  agreementId: string
  type: string
  baseAmount: number
  percentApplied: number
  amount: number
  status: string // ACCRUED | INVOICED | PAID | WAIVED
  invoicedAt: string | null
  paidAt: string | null
  createdAt: string
  /** Admin fee console context (additive — FIN-7). */
  agreement?: {
    number: string
    requestNumber: string
    applicantName: string
    financierOrgName: string
  }
}

export interface FinancingAgreementDTO {
  id: string
  number: string
  offerId: string
  fundingStatus: string
  status: string
  acceptedAt: string
  fundedReportedAt: string | null
  settledReportedAt: string | null
  createdAt: string
  request: {
    id: string
    number: string
    serviceName: string
    applicantName: string
    applicantEmail: string
    organizationName: string | null
    financierOrgId: string
    financierOrgName: string
  }
  offer: FinancingOfferDTO
  events: FinancingEventDTO[]
  fees: FinancingFeeDTO[]
}

export interface AccreditationRequestSummaryDTO {
  id: string
  number: string
  status: string
  organizationId: string
  organizationName: string
  submittedBy: { id: string; name: string; email: string | null }
  serviceId: string
  serviceName: string
  financierOrgId: string
  financierOrgName: string
  multiGroupId: string | null
  scopeNotes: string | null
  consentAt: string | null
  submittedAt: string | null
  forwardedAt: string | null
  returnedAt: string | null
  returnedReason: string | null
  decidedAt: string | null
  decisionNote: string | null
  accreditedAt: string | null
  validUntil: string | null
  revokedAt: string | null
  revocationReason: string | null
  expiresAt: string | null
  createdAt: string
  isLive: boolean
  /** Queue-only progress column (additive — FIN-7). */
  submissionStats?: { total: number; verified: number; missing: number }
}

export interface AccreditationRequestDetailDTO extends AccreditationRequestSummaryDTO {
  platformReviewedById: string | null
  platformReviewedAt: string | null
  platformNote: string | null
  submissions: RequirementSubmissionDTO[]
  gate: GateStatusDTO
}

/** GET /api/admin/financing/gate envelope (FIN-7) — both request kinds. */
export interface AdminGateQueueResponseDTO {
  financing: { requests: FinancingRequestSummaryDTO[]; total: number; page: number; limit: number }
  accreditation: { requests: AccreditationRequestSummaryDTO[]; total: number; page: number; limit: number }
}

/** GET /api/admin/financing/gate/[id] envelope (FIN-7). */
export interface AdminGateDossierResponseDTO {
  requestType: 'FINANCING' | 'ACCREDITATION'
  request: FinancingRequestDetailDTO | AccreditationRequestDetailDTO
}

export interface AccountDocumentDTO {
  id: string
  userId: string
  userName: string
  organizationId: string | null
  organizationName: string | null
  documentType: string
  title: string | null
  issuedAt: string | null
  expiresAt: string | null
  status: string // PENDING | VERIFIED | REJECTED
  reviewedById: string | null
  reviewedAt: string | null
  note: string | null
  isActive: boolean
  /** 6.8 sensitivity class — derived server-side from documentType by the ONE matrix. */
  sensitivity?: 'PUBLIC' | 'ORG_INTERNAL' | 'SENSITIVE_IDENTITY' | 'SENSITIVE_FINANCIAL'
  media: MediaAssetDTO | null
  createdAt: string
}

export interface FinancierInstitutionDTO {
  organizationId: string
  name: string
  slug: string
  orgType: string
  status: string
  verifiedAt: string | null
  website: string | null
  /** null = BANK/MFI/EWALLET org without a profile yet (activate to enable its console). */
  profile: {
    id: string
    licenseNumber: string | null
    regulator: string | null
    contactEmail: string | null
    contactPhone: string | null
    minTicket: number | null
    maxTicket: number | null
    about: string | null
    branchCount: number
  } | null
  stats: {
    services: number
    activeServices: number
    requestsForwarded: number
    liveAccreditations: number
    feesAccrued: number
    feesPaid: number
  }
  createdAt: string
}

export interface FinancierProfileFactsDTO {
  about: string | null
  licenseNumber: string | null
  regulator: string | null
  contactEmail: string | null
  contactPhone: string | null
  minTicket: number | null
  maxTicket: number | null
  viewCount: number
}

// ── Notification email digest (DIGEST-13) ──────────────────────────────────

export type DigestFrequency = 'OFF' | 'DAILY' | 'WEEKLY'

export interface DigestRowDTO {
  id: string
  kind: string // DAILY | WEEKLY
  periodStart: string
  periodEnd: string
  itemCount: number
  subject: string
  status: string // LOGGED | SENT | FAILED
  createdAt: string
}

export interface DigestPreviewDTO {
  kind: string
  periodStart: string
  periodEnd: string
  itemCount: number
  subject: string
  html: string
}

// Delivery state of one sent digest, polled from the Resend REST API.
export interface DigestDeliveryStatusDTO {
  delivery: string // delivered | sent | bounced | complained | delivery_delayed | unknown
  lastEvent: string | null
  checkedAt: string
}

// Mailer diagnostics for the digest dialog — makes Resend "test mode" visible.
export interface EmailConfigDTO {
  testMode: boolean | 'unknown' // true when no Resend domain is verified
  domains: { name: string; status: string }[] // status: verified | not_started | failed | pending
  fromAddress: string // resolved sender actually used for sends (may be the fallback)
  brandedFrom: string // raw SMTP_FROM target — the branded sender once its domain is verified
  fromFallback: boolean // true when fromAddress is the onboarding@resend.dev fallback (BRIDGE-1)
  mailerMode: string // resend-api | smtp | none
}
