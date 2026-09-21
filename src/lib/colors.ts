/**
 * Color-name → swatch resolution for variant pickers.
 *
 * Maps human color names ("Midnight Black", "Sage", "Teal") to concrete hex
 * values, used by the storefront variant picker swatches and the seller
 * variant-editor value previews. Unknown names still resolve to a
 * deterministic hash-derived color so every value renders a visible swatch.
 *
 * Pure functions, no dependencies.
 */

/** Leading words that modify a base color without changing its family. */
const MODIFIER_WORDS = new Set([
  'midnight',
  'dark',
  'light',
  'pale',
  'deep',
  'neon',
  'vintage',
  'matte',
  'glossy',
  'metallic',
  'bright',
  'soft',
])

/**
 * Base color names → hex. Keys are lowercase with single spaces.
 * Order roughly follows the spectrum: neutrals → browns → warm → red →
 * purple → blue → green, plus a few curated multi-word compounds that get
 * their own shade before the adjective-stripping fallback kicks in.
 */
const NAMED_COLORS: Record<string, string> = {
  // dark neutrals
  black: '#131313',
  'off black': '#1f1f24',
  midnight: '#10101f',
  'midnight black': '#101014',
  charcoal: '#36454f',
  graphite: '#3f4147',
  slate: '#708090',
  silver: '#c0c7cd',
  'silver white': '#e8e8ec',
  gray: '#8a8f98',
  grey: '#8a8f98',
  stone: '#a8a29e',
  pewter: '#8d939a',
  // whites & warm neutrals
  white: '#ffffff',
  ivory: '#fdfaf0',
  cream: '#f4ecd8',
  'off-white': '#f2efe6',
  beige: '#e3dac6',
  tan: '#c8a97e',
  camel: '#c19a6b',
  khaki: '#b9a883',
  // browns
  brown: '#7a5642',
  chocolate: '#5a3a26',
  coffee: '#6f4e37',
  espresso: '#4a3226',
  walnut: '#5e4632',
  // yellows & oranges
  rust: '#b04a1e',
  copper: '#b87333',
  bronze: '#a67c3d',
  gold: '#d4af37',
  mustard: '#d19c2a',
  yellow: '#f2cc3d',
  amber: '#e5a33b',
  honey: '#d9962b',
  orange: '#f07c2e',
  tangerine: '#f2851e',
  coral: '#f07963',
  salmon: '#fa8072',
  peach: '#f9c9a4',
  apricot: '#f2b177',
  blush: '#f2c4c4',
  // pinks & reds
  pink: '#eb9ba9',
  rose: '#e2778b',
  magenta: '#c840a0',
  fuchsia: '#d64fbf',
  red: '#d32f2f',
  crimson: '#b01e3a',
  scarlet: '#c8242c',
  burgundy: '#6e1e33',
  maroon: '#6b1f2a',
  wine: '#5c1f38',
  cherry: '#a4262c',
  berry: '#8a2c56',
  // purples
  plum: '#6d3569',
  purple: '#7e4c9e',
  violet: '#8f6fd3',
  lavender: '#b9a7e0',
  lilac: '#c9a8dc',
  mauve: '#a07896',
  indigo: '#3f51b5',
  // blues
  navy: '#1f2d5c',
  blue: '#2d6cdf',
  sky: '#8fd0f2',
  'sky blue': '#5fb8ee',
  azure: '#2f9be8',
  cobalt: '#1f4fd8',
  denim: '#3f6a9e',
  // greens
  teal: '#2f9e8f',
  turquoise: '#35c4c9',
  aqua: '#4fc9d9',
  mint: '#a8ddc0',
  seafoam: '#8fcbb3',
  green: '#3c9d5e',
  sage: '#9caf88',
  olive: '#6b7a3a',
  forest: '#2c5c43',
  emerald: '#0f9d63',
  moss: '#6a7f4e',
  lime: '#b5d94f',
  chartreuse: '#b8dc4a',
  // curated multi-word compounds (tried before adjective-stripping)
  'forest green': '#2c5c43',
  'navy blue': '#1f2d5c',
  'royal blue': '#2b4fd0',
  'baby blue': '#a7cdeb',
  'hot pink': '#e8467c',
  'olive green': '#6b7a3a',
}

/** Lowercase, trim, collapse separators (spaces / hyphens / underscores). */
function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/[\s_-]+/g, ' ')
}

/** FNV-1a 32-bit string hash → unsigned integer. */
function hashString(s: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Convert HSL (h ∈ [0,360), s/l ∈ [0,1]) to a #rrggbb hex string. */
function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] = (
    h < 60 ? [c, x, 0] :
    h < 120 ? [x, c, 0] :
    h < 180 ? [0, c, x] :
    h < 240 ? [0, x, c] :
    h < 300 ? [x, 0, c] :
    [c, 0, x]
  ).map((v) => Math.round((v + m) * 255))
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/**
 * Deterministic fallback color for unknown names: the name is hashed to a
 * stable hue and rendered as hsl(hue, 45%, 55%), so every value still gets
 * a distinct, visible swatch.
 */
export function fallbackColorHex(name: string): string {
  const hue = hashString(normalizeName(name)) % 360
  return hslToHex(hue, 0.45, 0.55)
}

/**
 * Resolve a color name to a hex swatch color. NEVER returns null — unknown
 * names fall back to a deterministic hash-derived color.
 *
 * Resolution order:
 *  1. exact full-name match ("midnight black" has its own curated shade)
 *  2. modifier-stripped match ("Dark Green" → "green", "Matte Black" → "black")
 *  3. last-word match ("Forest Green" → "green", "Royal Blue" → "blue")
 *  4. hash fallback
 */
export function resolveColorHex(name: string): string {
  const normalized = normalizeName(name)
  if (!normalized) return fallbackColorHex(name)

  // 1. exact match
  const direct = NAMED_COLORS[normalized]
  if (direct) return direct

  const words = normalized.split(' ')

  // 2. strip modifier words, then match the remaining core
  const core = words.filter((w) => !MODIFIER_WORDS.has(w))
  if (core.length > 0 && core.length !== words.length) {
    const stripped = NAMED_COLORS[core.join(' ')]
    if (stripped) return stripped
  }

  // 3. fall back to the last word ("olive green" → "green")
  if (words.length > 1) {
    const lastWord = NAMED_COLORS[words[words.length - 1]]
    if (lastWord) return lastWord
  }

  // 4. deterministic hash fallback
  return fallbackColorHex(name)
}

/**
 * True when an option-group name looks like a color axis — "Color",
 * "Colour", "Shade", "Finish", "Tint" (case-insensitive substring match,
 * so "Matte Finish" and "Frame Colour" also qualify).
 */
export function isColorLike(groupName: string): boolean {
  return /colou?r|shade|finish|tint/i.test(groupName.trim())
}
