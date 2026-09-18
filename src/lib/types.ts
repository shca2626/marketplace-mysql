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
