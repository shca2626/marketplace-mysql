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

/** Legacy accent presets — kept so old stored documents keep resolving. */
export const ACCENT_PRESET_HEX: Record<string, string> = {
  orange: '#ea580c',
  emerald: '#059669',
  rose: '#e11d48',
  amber: '#d97706',
}

/** Curated swatches offered in the admin picker (any hex is also accepted). */
export const ACCENT_SWATCHES: { value: string; label: string }[] = [
  { value: '#ea580c', label: 'Sunset' },
  { value: '#d97706', label: 'Amber' },
  { value: '#e11d48', label: 'Rose' },
  { value: '#dc2626', label: 'Crimson' },
  { value: '#059669', label: 'Emerald' },
  { value: '#0d9488', label: 'Teal' },
  { value: '#7c3aed', label: 'Violet' },
  { value: '#c026d3', label: 'Fuchsia' },
]

export const DEFAULT_ACCENT_HEX = '#ea580c'

/**
 * Normalize any stored accent value (legacy preset name, 3- or 6-digit hex,
 * junk) into a 6-digit lowercase hex. Pure — safe for zod transforms.
 */
export function normalizeAccentHex(input: unknown, fallback: string = DEFAULT_ACCENT_HEX): string {
  if (typeof input !== 'string') return fallback
  const v = input.trim().toLowerCase()
  if (ACCENT_PRESET_HEX[v]) return ACCENT_PRESET_HEX[v]
  if (/^#[0-9a-f]{6}$/.test(v)) return v
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${v.slice(1).split('').map((c) => c + c).join('')}`
  if (/^[0-9a-f]{6}$/.test(v)) return `#${v}`
  return fallback
}

export const themeSettingsSchema = z.object({
  defaultTheme: z.enum(['light', 'dark', 'system']),
  /** brand accent — any hex color, applied live to --primary across the app */
  accent: z.string().transform((v) => normalizeAccentHex(v)),
  /** corner radius scale — applied live to --radius */
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
      '/api/media/2026/09/9b1b7ba8-c4etb8.medium.png',
      '/api/media/2026/09/10a8e28c-ldjc99.medium.png',
      '/api/media/2026/09/9e26fdd0-4rm6mm.medium.png',
      '/api/media/2026/09/8ae4d53c-fwvjoh.medium.png',
      '/api/media/2026/09/a861f698-insobm.medium.png',
      '/api/media/2026/09/faa32b6f-uxyt4z.medium.png',
      '/api/media/2026/09/9e2e864a-0d5uoe.medium.png',
      '/api/media/2026/09/90d1008b-vfb3r4.medium.png',
    ],
  },
  theme: {
    defaultTheme: 'light',
    accent: '#ea580c',
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
