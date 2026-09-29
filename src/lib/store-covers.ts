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

/** Curated cover options (durable /api/media assets — see scripts/migrate-static-images.ts). */
export const STORE_COVERS: StoreCover[] = [
  {
    id: 'flatlay',
    label: 'Warm flatlay',
    url: '/api/media/2026/09/1080b05c-1fz5mq.full.png',
  },
  {
    id: 'workspace',
    label: 'Modern workspace',
    url: '/api/media/2026/09/cf12dd3a-8mfbjh.full.png',
  },
  {
    id: 'boutique',
    label: 'Boutique shelf',
    url: '/api/media/2026/09/c9ade8fa-eq4h77.full.png',
  },
  {
    id: 'tech',
    label: 'Tech desk',
    url: '/api/media/2026/09/1b93328e-dqvpwb.full.png',
  },
  {
    id: 'gadgets',
    label: 'Gadget neon',
    url: '/api/media/2026/09/701be799-jo6ck8.full.png',
  },
  {
    id: 'atelier',
    label: 'Fashion atelier',
    url: '/api/media/2026/09/0050d793-lvgu1i.full.png',
  },
  {
    id: 'cozy',
    label: 'Cozy corner',
    url: '/api/media/2026/09/a1545eff-gsbg7g.full.png',
  },
  {
    id: 'interior',
    label: 'Warm interior',
    url: '/api/media/2026/09/7d3a407d-2b2ip7.full.png',
  },
  {
    id: 'outdoors',
    label: 'Great outdoors',
    url: '/api/media/2026/09/19078ca5-82xwj0.full.png',
  },
  {
    id: 'spa',
    label: 'Spa calm',
    url: '/api/media/2026/09/940dccd7-mzm6qc.full.png',
  },
  {
    id: 'craft',
    label: 'Craft table',
    url: '/api/media/2026/09/90d1008b-vfb3r4.full.png',
  },
  {
    id: 'textile',
    label: 'Woven textile',
    url: '/api/media/2026/09/3affad6f-xcelhm.full.png',
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
