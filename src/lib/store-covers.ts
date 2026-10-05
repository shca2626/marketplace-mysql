/**
 * Storefront cover images — curated picks + persistence helpers.
 *
 * STAB-8: the seller's choice is persisted server-side on the seller profile
 * (User.storeCover, an id from the curated set below). localStorage remains
 * as an instant optimistic cache on the seller's own device and as the
 * migration fallback for pre-STAB-8 choices — but buyers always read the
 * server value via /api/sellers/[id] (storeCoverUrl).
 */

export interface StoreCover {
  id: string
  label: string
  url: string
}

/** Curated cover options (durable /api/media assets — solar set, see scripts/seed-solar.ts). */
export const STORE_COVERS: StoreCover[] = [
  {
    id: 'rooftop',
    label: 'Rooftop array',
    url: '/api/media/2026/09/ec0473a8-el8asq.full.png',
  },
  {
    id: 'solarfield',
    label: 'Solar field',
    url: '/api/media/2026/09/f472540e-xsn6l6.full.png',
  },
  {
    id: 'energwall',
    label: 'Home energy wall',
    url: '/api/media/2026/09/90800a13-gf060o.full.png',
  },
  {
    id: 'pumpstation',
    label: 'Solar pumping',
    url: '/api/media/2026/09/8d1f1aa7-kt1o6m.full.png',
  },
  {
    id: 'mono450',
    label: 'Monocrystalline 450W',
    url: '/api/media/2026/09/4cbf5d20-ww7ny3.full.png',
  },
  {
    id: 'rackbattery',
    label: 'Rack LiFePO4',
    url: '/api/media/2026/09/6f8d4e59-om7azl.full.png',
  },
  {
    id: 'hybridinv',
    label: 'Hybrid inverter',
    url: '/api/media/2026/09/abc95a74-8l3ee2.full.png',
  },
  {
    id: 'submersible',
    label: 'Submersible pump',
    url: '/api/media/2026/09/6f96434e-wxu342.full.png',
  },
  {
    id: 'streetlight',
    label: 'Solar street light',
    url: '/api/media/2026/09/46a8135f-r3ifvd.full.png',
  },
]

const coverKey = (sellerId: string) => `vendora-store-cover:${sellerId}`

/** Look up a curated cover by id — SSR-safe (no localStorage involved). */
export function findStoreCover(id: string | null | undefined): StoreCover | null {
  if (!id) return null
  return STORE_COVERS.find((c) => c.id === id) ?? null
}

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
