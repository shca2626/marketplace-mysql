// Server-side settings + slides access (API routes only).
// ─────────────────────────────────────────────────────────────────────────────
// Reads go through the tagged in-memory cache (settings change rarely), writes
// invalidate it so the storefront sees admin changes instantly.

import { db } from '@/lib/db'
import { cached, invalidateTags } from '@/lib/cache'
import {
  mergeSettings,
  storefrontSettingsSchema,
  DEFAULT_STOREFRONT_SETTINGS,
  type StorefrontSettings,
  type BannerSlideDTO,
} from './schema'

const SETTINGS_KEY = 'storefront'
const settingsCacheKey = 'settings:storefront:v1'
const slidesCacheKey = 'settings:slides:v1'

// Public banner payload — re-exported from the isomorphic schema module.
export type { BannerSlideDTO } from './schema'

/** Effective storefront settings (defaults when no row / partial row). */
export async function getStorefrontSettings(): Promise<StorefrontSettings> {
  return cached(
    settingsCacheKey,
    async () => {
      const row = await db.platformSetting.findUnique({ where: { key: SETTINGS_KEY } })
      let parsed: unknown = null
      if (row) {
        try {
          parsed = JSON.parse(row.value)
        } catch {
          parsed = null // corrupted row → defaults, never a 500 on the storefront
        }
      }
      return mergeSettings(parsed)
    },
    { ttlMs: 300_000, tags: ['settings'] }
  )
}

/** Validate + persist a full settings document; returns the stored result. */
export async function saveStorefrontSettings(input: unknown): Promise<StorefrontSettings> {
  const settings = storefrontSettingsSchema.parse(input)
  await db.platformSetting.upsert({
    where: { key: SETTINGS_KEY },
    update: { value: JSON.stringify(settings) },
    create: { key: SETTINGS_KEY, value: JSON.stringify(settings) },
  })
  invalidateTags('settings')
  return settings
}

/** Active slides in display order (storefront hero). */
export async function getActiveSlides(): Promise<BannerSlideDTO[]> {
  return cached(
    slidesCacheKey,
    async () => {
      const rows = await db.bannerSlide.findMany({
        where: { active: true },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      })
      return rows.map(toSlideDTO)
    },
    { ttlMs: 300_000, tags: ['settings'] }
  )
}

/** All slides (admin management, includes inactive). */
export async function getAllSlides(): Promise<BannerSlideDTO[]> {
  const rows = await db.bannerSlide.findMany({
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  })
  return rows.map(toSlideDTO)
}

function toSlideDTO(row: {
  id: string
  eyebrow: string | null
  title: string | null
  subtitle: string | null
  image: string
  ctaLabel: string | null
  ctaView: string | null
  ctaCategory: string | null
  position: number
  active: boolean
}): BannerSlideDTO {
  return {
    id: row.id,
    eyebrow: row.eyebrow,
    title: row.title,
    subtitle: row.subtitle,
    image: row.image,
    ctaLabel: row.ctaLabel,
    ctaView: row.ctaView,
    ctaCategory: row.ctaCategory,
    position: row.position,
    active: row.active,
  }
}

export { DEFAULT_STOREFRONT_SETTINGS }
