'use client'

// ─────────────────────────────────────────────────────────────────────────────
// STOREFRONT THEME — live CSS-variable application of the admin-configured
// theme. The Storefront Designer stores `theme.accent` (any hex), `theme.radius`
// and `theme.defaultTheme`; this component pushes them onto the document root
// the moment they change (boot + every admin save), with dark-mode-aware
// adjustments:
//   • accent  → --primary / --primary-foreground / --ring / --chart-1
//               (dark mode lightens the hex so it keeps enough contrast)
//   • radius  → --radius (sharp 0 → roomy 14px)
//   • defaultTheme — applied once for visitors who never picked a mode
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react'
import { useTheme } from 'next-themes'
import { useMarketplace } from '@/store/marketplace'
import type { StorefrontSettings } from '@/lib/settings/schema'

const RADIUS_PX: Record<StorefrontSettings['theme']['radius'], string> = {
  sharp: '0px',
  compact: '0.375rem',
  cozy: '0.625rem',
  roomy: '0.875rem',
}

/** hex '#rrggbb' → [r, g, b] */
function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('')}`
}

/** Mix toward white — used to keep accents readable on dark backgrounds. */
function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex)
  return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount)
}

/** White or near-black text on the given color (YIQ contrast rule). */
function contrastOn(hex: string): string {
  const [r, g, b] = hexToRgb(hex)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  return yiq >= 150 ? '#1c1917' : '#ffffff'
}

export function StorefrontTheme() {
  const theme = useMarketplace((s) => s.settings.theme)
  const { resolvedTheme, setTheme } = useTheme()
  // Whether the visitor ever picked a mode (next-themes persists it in
  // localStorage.theme). We only ever apply the admin default to people who
  // haven't made an explicit choice.
  const appliedDefaultRef = useRef(false)

  // Accent + radius → CSS variables (re-applied when the color scheme flips).
  useEffect(() => {
    const root = document.documentElement
    const dark = resolvedTheme === 'dark'
    const primary = dark ? lighten(theme.accent, 0.22) : theme.accent
    root.style.setProperty('--primary', primary)
    root.style.setProperty('--primary-foreground', contrastOn(primary))
    root.style.setProperty('--ring', primary)
    root.style.setProperty('--chart-1', primary)
    root.style.setProperty('--radius', RADIUS_PX[theme.radius])
  }, [theme.accent, theme.radius, resolvedTheme])

  // Admin default mode — applied only to visitors without an explicit choice.
  useEffect(() => {
    if (appliedDefaultRef.current || !resolvedTheme) return
    let choseOwn = false
    try {
      choseOwn = window.localStorage.getItem('theme') !== null
    } catch {
      /* private mode — leave next-themes defaults alone */
    }
    appliedDefaultRef.current = true
    if (!choseOwn && theme.defaultTheme !== 'system' && theme.defaultTheme !== resolvedTheme) {
      setTheme(theme.defaultTheme)
    }
  }, [theme.defaultTheme, resolvedTheme, setTheme])

  return null
}
