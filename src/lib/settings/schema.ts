// Platform settings — the single source of truth for storefront configuration.
// ─────────────────────────────────────────────────────────────────────────────
// Everything an admin can customize about the storefront lives in one typed
// document ("storefront" scope): general branding, theme, layout, hero slider.
// The DB row is JSON (PlatformSetting); this module defines the shape, the
// zod validation, and safe defaults so a missing/partial row never breaks the
// UI — per-section merge over defaults.
//
// Adding a new setting = one entry here → admin settings form, /api/settings
// payload, and storefront consumers all pick it up.

import { z } from 'zod'

// ── Schema ────────────────────────────────────────────────────────────────

export const generalSettingsSchema = z.object({
  siteName: z.string().trim().min(1).max(60),
  tagline: z.string().trim().max(120),
  announcementEnabled: z.boolean(),
  announcementText: z.string().trim().min(1).max(200),
  /** quick-pick image URLs offered in the seller product form (one per line in admin UI) */
  sampleImages: z.array(z.string().trim().min(1).max(1000)).max(24),
})

export const themeSettingsSchema = z.object({
  defaultTheme: z.enum(['light', 'dark', 'system']),
  /** accent preset — drives [data-accent] CSS variable overrides */
  accent: z.enum(['orange', 'emerald', 'rose', 'amber']),
  /** corner radius scale — drives [data-radius] CSS variable overrides */
  radius: z.enum(['sharp', 'compact', 'cozy', 'roomy']),
})

export const layoutSettingsSchema = z.object({
  /** page content width — drives [data-container] max-width */
  container: z.enum(['standard', 'wide', 'full']),
  /** desktop product columns in storefront grids — drives [data-cols] */
  productColumns: z.enum(['4', '5', '6']),
})

export const sliderSettingsSchema = z.object({
  enabled: z.boolean(),
  /** slide motion axis — the admin-controlled orientation switch */
  orientation: z.enum(['horizontal', 'vertical']),
  autoplay: z.boolean(),
  intervalSec: z.number().int().min(3).max(20),
  /** banner height preset — drives [data-hero-height] */
  height: z.enum(['short', 'medium', 'tall']),
  showArrows: z.boolean(),
  showDots: z.boolean(),
})

export const storefrontSettingsSchema = z.object({
  general: generalSettingsSchema,
  theme: themeSettingsSchema,
  layout: layoutSettingsSchema,
  slider: sliderSettingsSchema,
})

export type StorefrontSettings = z.infer<typeof storefrontSettingsSchema>

/** Public banner payload — exactly what the storefront hero consumes. */
export interface BannerSlideDTO {
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
}

// ── Defaults (also the seed) ──────────────────────────────────────────────

export const DEFAULT_STOREFRONT_SETTINGS: StorefrontSettings = {
  general: {
    siteName: 'Vendora',
    tagline: 'The marketplace where independent sellers and thoughtful buyers meet.',
    announcementEnabled: true,
    announcementText: 'Free shipping on orders over $75 · Use code WELCOME10 for 10% off your first order',
    sampleImages: [
      'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/141cbde21ff2.jpg',
      'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/2c18fec764b9.jpg',
      'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/822ecdcb7a03.jpg',
      'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/4787f77a9d9d.jpg',
      'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/a51a76cf3ded.jpg',
      'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/89b5894bf2b2.jpg',
      'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/48b8bf7c381c.jpg',
      'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/1310449ec1fc.jpg',
    ],
  },
  theme: {
    defaultTheme: 'light',
    accent: 'orange',
    radius: 'cozy',
  },
  layout: {
    container: 'wide',
    productColumns: '5',
  },
  slider: {
    enabled: true,
    orientation: 'horizontal',
    autoplay: true,
    intervalSec: 6,
    height: 'medium',
    showArrows: true,
    showDots: true,
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Merge a stored (possibly partial / legacy) document over the defaults.
 * Falls back to defaults entirely when `stored` is null/unparseable, and
 * per-section when a section fails validation — a malformed row can never
 * take the storefront down.
 */
export function mergeSettings(stored: unknown): StorefrontSettings {
  if (!stored || typeof stored !== 'object') return structuredClone(DEFAULT_STOREFRONT_SETTINGS)
  const source = stored as Record<string, unknown>
  const merged: Record<string, unknown> = {}
  for (const section of Object.keys(DEFAULT_STOREFRONT_SETTINGS) as (keyof StorefrontSettings)[]) {
    const sectionResult = (storefrontSettingsSchema.shape as Record<string, z.ZodTypeAny>)[section].safeParse(
      source[section] ?? (DEFAULT_STOREFRONT_SETTINGS[section] as unknown)
    )
    merged[section] = sectionResult.success ? sectionResult.data : DEFAULT_STOREFRONT_SETTINGS[section]
  }
  return merged as StorefrontSettings
}
