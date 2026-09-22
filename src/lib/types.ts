export type Role = 'BUYER' | 'SELLER' | 'ADMIN'

export interface SessionUser {
  id: string
  name: string
  email: string
  role: Role
  image?: string | null
  storeName?: string | null
  storeBio?: string | null
  createdAt?: string
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
  buyer?: { id: string; name: string; email: string }
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
}

export interface StoreDTO {
  id: string
  name: string
  storeName: string | null
  storeBio: string | null
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
    buyer: { id: string; name: string; email: string }
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
  user: { id: string; name: string; email: string }
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
  requester?: { id: string; name: string; email: string } | null
  decidedBy?: { id: string; name: string; email: string } | null
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
  requester: { id: string; name: string; email: string }
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
