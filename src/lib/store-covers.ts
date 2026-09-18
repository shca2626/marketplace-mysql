/**
 * Storefront cover images — curated picks + client-side persistence.
 *
 * The Prisma schema is frozen this phase (PLAN-1 pending), so the chosen
 * cover is persisted in localStorage per seller. Zero API / schema changes.
 */

export interface StoreCover {
  id: string
  label: string
  url: string
}

/** Curated cover options (reuses already-verified image-search assets). */
export const STORE_COVERS: StoreCover[] = [
  {
    id: 'flatlay',
    label: 'Warm flatlay',
    url: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/39fd9d00938f.png',
  },
  {
    id: 'workspace',
    label: 'Modern workspace',
    url: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/abc039ecde8a.jpg',
  },
  {
    id: 'boutique',
    label: 'Boutique shelf',
    url: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/48123c636211.jpeg',
  },
  {
    id: 'tech',
    label: 'Tech desk',
    url: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/b0147d481533.jpg',
  },
  {
    id: 'gadgets',
    label: 'Gadget neon',
    url: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/0f3cf9c91fd8.jpg',
  },
  {
    id: 'atelier',
    label: 'Fashion atelier',
    url: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/18749cd50588.jpg',
  },
  {
    id: 'cozy',
    label: 'Cozy corner',
    url: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/bedfd2ff5fff.webp',
  },
  {
    id: 'interior',
    label: 'Warm interior',
    url: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/d68c156c6ee3.jpg',
  },
  {
    id: 'outdoors',
    label: 'Great outdoors',
    url: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/25ad7d593d9f.jpg',
  },
  {
    id: 'spa',
    label: 'Spa calm',
    url: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/78280f2c3121.jpg',
  },
  {
    id: 'craft',
    label: 'Craft table',
    url: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/1310449ec1fc.jpg',
  },
  {
    id: 'textile',
    label: 'Woven textile',
    url: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/7d358772ad31.jpg',
  },
]

const coverKey = (sellerId: string) => `vendora-store-cover:${sellerId}`

/** Read this seller's chosen cover (null → use the default gradient). SSR-safe. */
export function getStoreCover(sellerId: string): StoreCover | null {
  if (typeof window === 'undefined') return null
  try {
    const id = window.localStorage.getItem(coverKey(sellerId))
    if (!id) return null
    return STORE_COVERS.find((c) => c.id === id) ?? null
  } catch {
    return null
  }
}

/** Persist the cover choice (null clears back to the default gradient). */
export function setStoreCover(sellerId: string, coverId: string | null): void {
  if (typeof window === 'undefined') return
  try {
    if (coverId === null) {
      window.localStorage.removeItem(coverKey(sellerId))
    } else {
      window.localStorage.setItem(coverKey(sellerId), coverId)
    }
  } catch {
    // storage full / disabled — cover falls back to gradient, nothing to do
  }
}
