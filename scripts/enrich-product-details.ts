/**
 * scripts/enrich-product-details.ts — one-shot demo-data enrichment.
 *
 * Fills the extended Product detail fields (brand, sku, barcode, condition,
 * tags, attributes JSON, shipping, dimensions, SEO meta…) and creates
 * ProductVariant rows for suitable products. Idempotent: re-running
 * overwrites product fields with the same deterministic values and SKIPS
 * variant creation for products that already have variants.
 *
 * Run:  bun run scripts/enrich-product-details.ts   (bun auto-loads .env)
 *
 * Values are hand-curated per product title (see PLAN below) and validated
 * against src/lib/catalog/definitions.ts at runtime — select/multiselect
 * values must match the allowed options exactly, numbers must respect
 * min/max. The script fails loudly on any mismatch instead of writing
 * invalid demo data.
 */
import { db } from '../src/lib/db'
import { attributesForCategory, slugifyTitle } from '../src/lib/catalog/definitions'

// ── types ─────────────────────────────────────────────────────────────

type AttrValue = string | number | boolean | string[]
type Attrs = Record<string, AttrValue>

interface VariantPlan {
  name: string
  options: Record<string, string>
  stock: number
  priceDelta?: number
  skuSuffix: string
}

interface ProductPlan {
  brand: string
  condition: 'NEW' | 'REFURBISHED' | 'USED_LIKE_NEW' | 'USED_GOOD'
  /** set explicitly when the plan requires a compareAtPrice (refurb items) */
  compareAtPrice?: number
  attributes: Attrs
  tags: string[]
  weightKg: number
  /** [lengthCm, widthCm, heightCm] */
  dims: [number, number, number]
  handlingDays: number
  freeShipping: boolean
  shippingNote?: string
  warrantyMonths?: number
  minOrderQty?: number
  maxPerOrder?: number
  metaTitle?: string
  metaDescription?: string
  /** round stock applied once, before variants are split (first run only) */
  stockOverride?: number
  variants?: VariantPlan[]
}

const CATEGORY_CODE: Record<string, string> = {
  electronics: 'ELC',
  fashion: 'FAS',
  'home-living': 'HOM',
  'sports-outdoors': 'SPO',
  'beauty-wellness': 'BEA',
  'handmade-crafts': 'HAN',
}

// ── the curated plan — keyed by exact product title ──────────────────
// Attribute values were cross-checked against each product's seeded
// description (battery claims, materials, sizes…) so the spec tables
// match the marketing copy.

const PLAN: Record<string, ProductPlan> = {
  // ══ Electronics ══════════════════════════════════════════════════
  'Aura Wireless Noise-Cancelling Headphones': {
    brand: 'Aura Audio',
    condition: 'NEW',
    attributes: {
      model: 'Aura ANC Pro',
      connectivity: ['Bluetooth 5.3', 'USB-C', 'AUX 3.5mm'],
      batteryLife: 40, // "40-hour battery life"
      waterResistance: 'IPX4',
      includedAccessories: ['Charging cable', 'Ear tips', 'Case'],
      color: 'Black',
    },
    tags: ['wireless headphones', 'noise cancelling', 'bluetooth', 'over-ear'],
    weightKg: 0.35,
    dims: [22, 18, 9],
    handlingDays: 1,
    freeShipping: true,
    warrantyMonths: 24,
    metaTitle: 'Aura ANC Pro Wireless Headphones | Vendora',
    metaDescription:
      'Hybrid noise-cancelling over-ear headphones — 40-hour battery, Bluetooth 5.3 multipoint, USB-C fast charge.',
    stockOverride: 20,
    variants: [
      { name: 'Midnight Black', options: { color: 'Midnight Black' }, stock: 12, skuSuffix: 'BLK' },
      { name: 'Silver White', options: { color: 'Silver White' }, stock: 8, skuSuffix: 'SLV' },
    ],
  },
  'Echo Pocket Bluetooth Speaker': {
    brand: 'Nexline',
    condition: 'NEW',
    attributes: {
      model: 'Nexline Echo Go',
      connectivity: ['Bluetooth 5.3', 'USB-C'],
      batteryLife: 18, // "18-hour playtime"
      waterResistance: 'IPX7', // "IPX7 waterproof"
      includedAccessories: ['Charging cable', 'Strap'],
      color: 'Teal',
    },
    tags: ['bluetooth speaker', 'portable', 'waterproof'],
    weightKg: 0.6,
    dims: [10, 10, 11],
    handlingDays: 1,
    freeShipping: false,
    warrantyMonths: 12,
    stockOverride: 60,
    variants: [
      { name: 'Teal', options: { color: 'Teal' }, stock: 36, skuSuffix: 'TEAL' },
      { name: 'Black', options: { color: 'Black' }, stock: 24, skuSuffix: 'BLK' },
    ],
  },
  'Pulse Smartwatch Series 5': {
    brand: 'VoltEdge',
    condition: 'REFURBISHED', // demo: featured refurb deal
    compareAtPrice: 199, // must be > price (149) for refurbs
    attributes: {
      model: 'VoltEdge Pulse 5',
      connectivity: ['Bluetooth 5.0', 'Wi-Fi 6', 'NFC', 'GPS'],
      batteryLife: 336, // "14-day battery" in hours
      screenSize: 1.9, // 1.9" AMOLED
      waterResistance: 'IP68', // water-resistant to 50m
      color: 'Black',
    },
    tags: ['smartwatch', 'fitness tracker', 'gps', 'wearable'],
    weightKg: 0.3,
    dims: [15, 10, 6],
    handlingDays: 2,
    freeShipping: true,
    warrantyMonths: 24,
    metaTitle: 'Pulse Smartwatch Series 5 | VoltEdge',
    metaDescription:
      '1.9" AMOLED smartwatch with GPS, NFC payments, SpO2 and sleep tracking — IP68, 14-day battery.',
    stockOverride: 40,
    variants: [
      { name: 'Midnight Black', options: { color: 'Black' }, stock: 24, skuSuffix: 'BLK' },
      { name: 'Silver', options: { color: 'Silver' }, stock: 16, skuSuffix: 'SLV' },
    ],
  },
  'Lumo 4K Action Camera': {
    brand: 'Lumo',
    condition: 'REFURBISHED', // has compareAtPrice 299 > 249.50 already
    attributes: {
      model: 'Lumo X4',
      connectivity: ['Wi-Fi 6', 'USB-C', 'HDMI', 'GPS'],
      waterResistance: 'IPX7', // waterproof to 10m without a case
      includedAccessories: ['Case', 'Strap', 'Charging cable'],
      color: 'Black',
    },
    tags: ['action camera', '4k', 'waterproof', 'vlogging'],
    weightKg: 0.45,
    dims: [13, 10, 8],
    handlingDays: 2,
    freeShipping: true,
    shippingNote: 'Refurbished unit — full mounting accessory kit included.',
    warrantyMonths: 24,
    stockOverride: 16,
    variants: [
      { name: '64 GB', options: { storageCapacity: '64 GB' }, stock: 10, skuSuffix: '64' },
      { name: '128 GB', options: { storageCapacity: '128 GB' }, stock: 6, priceDelta: 10, skuSuffix: '128' },
    ],
  },
  'Nimbus RGB Mechanical Keyboard': {
    brand: 'KeyForge',
    condition: 'REFURBISHED',
    compareAtPrice: 129, // must be > price (99) for refurbs
    attributes: {
      model: 'Nimbus TKL Pro',
      connectivity: ['USB-C', 'USB-A'], // wired + 2.4GHz dongle
      includedAccessories: ['Charging cable', 'Manual'],
      color: 'Black',
    },
    tags: ['mechanical keyboard', 'rgb', 'hot-swappable', 'gaming'],
    weightKg: 1.1,
    dims: [45, 16, 5],
    handlingDays: 1,
    freeShipping: false,
    warrantyMonths: 12,
  },

  // ══ Fashion ══════════════════════════════════════════════════════
  'Stride One Running Sneakers': {
    brand: 'NorthTrail',
    condition: 'NEW',
    attributes: {
      material: 'Engineered knit mesh, carbon-rubber outsole',
      fit: 'Regular',
      closure: 'Laces',
      season: ['Spring', 'Summer', 'Fall'],
      color: 'White',
    },
    tags: ['running shoes', 'sneakers', 'lightweight'],
    weightKg: 0.75,
    dims: [32, 13, 11],
    handlingDays: 1,
    freeShipping: true,
    stockOverride: 32,
    variants: [
      { name: 'US 8', options: { size: 'US 8' }, stock: 8, skuSuffix: 'US8' },
      { name: 'US 9', options: { size: 'US 9' }, stock: 10, skuSuffix: 'US9' },
      { name: 'US 10', options: { size: 'US 10' }, stock: 9, skuSuffix: 'US10' },
      { name: 'US 11', options: { size: 'US 11' }, stock: 5, priceDelta: 5, skuSuffix: 'US11' },
    ],
  },
  'Vintage-Wash Denim Trucker Jacket': {
    brand: 'UrbanThread',
    condition: 'USED_LIKE_NEW', // demo: pre-loved vintage piece
    attributes: {
      material: '12oz selvedge denim',
      fit: 'Relaxed',
      closure: 'Buttons',
      pockets: true,
      season: ['Fall', 'Winter', 'Spring'],
      color: 'Blue',
    },
    tags: ['denim jacket', 'trucker jacket', 'selvedge', 'vintage'],
    weightKg: 0.95,
    dims: [35, 28, 6],
    handlingDays: 2,
    freeShipping: false,
    stockOverride: 20,
    variants: [
      { name: 'Small', options: { size: 'S' }, stock: 4, skuSuffix: 'S' },
      { name: 'Medium', options: { size: 'M' }, stock: 7, skuSuffix: 'M' },
      { name: 'Large', options: { size: 'L' }, stock: 6, skuSuffix: 'L' },
      { name: 'Extra Large', options: { size: 'XL' }, stock: 3, priceDelta: 5, skuSuffix: 'XL' },
    ],
  },
  'Aviator Classic Sunglasses UV400': {
    brand: 'Atlas & Oak',
    condition: 'NEW',
    attributes: {
      material: 'Metal frame, polarized polycarbonate lenses',
      season: ['Spring', 'Summer', 'Fall'],
      pattern: 'Solid',
      color: 'Gold',
    },
    tags: ['sunglasses', 'aviator', 'polarized', 'uv400'],
    weightKg: 0.2,
    dims: [17, 8, 6],
    handlingDays: 1,
    freeShipping: false,
  },
  'Canvas Traveler Backpack 28L': {
    brand: 'Atlas & Oak',
    condition: 'NEW',
    attributes: {
      material: 'Waxed canvas, water-resistant YKK zippers',
      closure: 'Zipper',
      pockets: true,
      waterRepellent: true,
      color: 'Tan',
    },
    tags: ['backpack', 'canvas', 'travel', 'laptop bag'],
    weightKg: 0.9,
    dims: [45, 30, 14],
    handlingDays: 1,
    freeShipping: false,
    stockOverride: 24,
    variants: [
      { name: 'Black', options: { color: 'Black' }, stock: 14, skuSuffix: 'BLK' },
      { name: 'Tan', options: { color: 'Tan' }, stock: 10, skuSuffix: 'TAN' },
    ],
  },
  'Merino Wool Beanie': {
    brand: 'NorthTrail',
    condition: 'NEW',
    attributes: {
      material: '100% merino wool',
      season: ['Fall', 'Winter'],
      pattern: 'Solid',
      color: 'Gray',
    },
    tags: ['beanie', 'merino wool', 'winter accessory'],
    weightKg: 0.12,
    dims: [22, 20, 5],
    handlingDays: 1,
    freeShipping: false,
    maxPerOrder: 10,
  },

  // ══ Home & Living ═════════════════════════════════════════════════
  'Halo Adjustable Desk Lamp': {
    brand: 'Nordform',
    condition: 'NEW',
    attributes: {
      material: 'Aluminum, steel, opal glass diffuser',
      style: 'Modern',
      careInstructions: 'Wipe clean with a soft dry cloth',
      room: ['Office', 'Bedroom'],
      assemblyRequired: true,
      color: 'White',
    },
    tags: ['desk lamp', 'task lighting', 'office'],
    weightKg: 1.8,
    dims: [30, 18, 45],
    handlingDays: 2,
    freeShipping: true,
  },
  'Terra Ceramic Vase Set of 3': {
    brand: 'Casa Verde Home',
    condition: 'NEW',
    attributes: {
      material: 'Hand-thrown glazed stoneware',
      style: 'Rustic',
      careInstructions: 'Wipe clean with a damp cloth',
      room: ['Living room', 'Bedroom'],
      color: 'Brown',
    },
    tags: ['ceramic vases', 'terracotta', 'home decor'],
    weightKg: 2.2,
    dims: [30, 24, 16],
    handlingDays: 2,
    freeShipping: false,
  },
  'Linen Throw Pillow Covers (Set of 4)': {
    brand: 'Nordform',
    condition: 'NEW',
    attributes: {
      material: '100% stone-washed European flax linen',
      style: 'Boho',
      careInstructions: 'Machine wash cold, tumble dry low',
      room: ['Living room', 'Bedroom'],
      color: 'Cream',
    },
    tags: ['linen', 'pillow covers', 'home textiles'],
    weightKg: 0.7,
    dims: [34, 28, 7],
    handlingDays: 2,
    freeShipping: false,
  },
  'Artisan Stoneware Mug Set of 6': {
    brand: 'Wildbloom Home',
    condition: 'NEW',
    attributes: {
      material: 'Speckled stoneware, reactive glaze',
      style: 'Rustic',
      capacityL: 0.35, // 12oz per mug
      dishwasherSafe: true,
      microwaveSafe: true,
      color: 'Sage',
    },
    tags: ['stoneware mugs', 'kitchen', 'reactive glaze'],
    weightKg: 1.9,
    dims: [30, 24, 15],
    handlingDays: 2,
    freeShipping: true,
    shippingNote: 'Ships in a foam-protected double-wall box.',
    maxPerOrder: 5,
  },
  'Solid Oak Floating Wall Shelf': {
    brand: 'Casa Verde Home',
    condition: 'NEW',
    attributes: {
      material: 'Kiln-dried white oak, natural oil finish',
      style: 'Minimalist',
      assemblyRequired: true,
      room: ['Living room', 'Bedroom', 'Office'],
      color: 'Beige',
    },
    tags: ['wall shelf', 'floating shelf', 'oak', 'storage'],
    weightKg: 2.5,
    dims: [61, 15, 5], // 24" × 6" × 1.75"
    handlingDays: 2,
    freeShipping: true,
    shippingNote: 'Mounting hardware included.',
  },
  'Leather Desk Pad XL': {
    brand: 'Rivera Goods',
    condition: 'USED_GOOD', // demo: pre-owned demo unit
    attributes: {
      material: 'Full-grain leather, hand-burnished edges',
      style: 'Modern',
      room: ['Office'],
      careInstructions: 'Wipe with a dry cloth; condition twice a year',
      color: 'Brown',
    },
    tags: ['leather', 'desk pad', 'office'],
    weightKg: 0.8,
    dims: [90, 45, 1],
    handlingDays: 2,
    freeShipping: false,
  },

  // ══ Sports & Outdoors ═════════════════════════════════════════════
  'GripPro Yoga Mat 6mm': {
    brand: 'PeakForm',
    condition: 'NEW',
    attributes: {
      intendedUse: ['Yoga', 'Home workout'],
      skillLevel: 'All levels',
      color: 'Sage',
    },
    tags: ['yoga mat', 'non-slip', 'tpe'],
    weightKg: 1.2,
    dims: [61, 16, 16], // rolled
    handlingDays: 2,
    freeShipping: false,
    warrantyMonths: 6,
    metaTitle: 'GripPro Yoga Mat 6mm — Non-Slip Support',
    metaDescription:
      '6mm cushioned non-slip yoga mat with alignment grid and carry strap — for studio and home practice.',
    stockOverride: 36,
    variants: [
      { name: 'Sage', options: { color: 'Sage' }, stock: 14, skuSuffix: 'SAGE' },
      { name: 'Gray', options: { color: 'Gray' }, stock: 12, skuSuffix: 'GRAY' },
      { name: 'Teal', options: { color: 'Teal' }, stock: 10, skuSuffix: 'TEAL' },
    ],
  },
  'IronCore Adjustable Dumbbell 24kg': {
    brand: 'PeakForm',
    condition: 'NEW',
    attributes: {
      intendedUse: ['Gym', 'Home workout'],
      skillLevel: 'All levels',
      resistanceLevel: 'Adjustable',
      maxLoadKg: 24,
      color: 'Black',
    },
    tags: ['dumbbell', 'adjustable', 'strength training'],
    weightKg: 13.5,
    dims: [45, 22, 18],
    handlingDays: 2,
    freeShipping: false,
    warrantyMonths: 6,
  },
  'Carbon Pro Tennis Racket': {
    brand: 'RidgeLine',
    condition: 'NEW',
    attributes: {
      intendedUse: ['Team sports'], // closest catalog value (doubles)
      skillLevel: 'Advanced',
      color: 'Black',
    },
    tags: ['tennis racket', 'graphite', 'carbon'],
    weightKg: 0.32,
    dims: [69, 28, 5],
    handlingDays: 2,
    freeShipping: true,
    warrantyMonths: 6,
  },
  'Trailblazer Waterproof Hiking Boots': {
    brand: 'RidgeLine',
    condition: 'NEW',
    attributes: {
      intendedUse: ['Hiking', 'Camping'],
      skillLevel: 'Intermediate',
      weatherproof: true,
      color: 'Brown',
    },
    tags: ['hiking boots', 'waterproof', 'trail'],
    weightKg: 1.45,
    dims: [33, 14, 12],
    handlingDays: 2,
    freeShipping: true,
    warrantyMonths: 6,
  },

  // ══ Beauty & Wellness ═════════════════════════════════════════════
  'Glow Ritual Skincare Set': {
    brand: 'PureGlow Lab',
    condition: 'NEW',
    attributes: {
      skinType: ['All'],
      skinConcern: ['Hydration', 'Brightening', 'Soothing'],
      crueltyFree: true,
      shelfLifeMonths: 12,
    },
    tags: ['skincare set', 'vitamin c', 'hydration'],
    weightKg: 1.1,
    dims: [25, 20, 9],
    handlingDays: 2,
    freeShipping: true,
    metaTitle: 'Glow Ritual Skincare Set — 4-Step Routine',
    metaDescription:
      'Complete glow ritual set: cleanser, vitamin-C serum, hyaluronic essence and ceramide moisturizer.',
  },
  'Amber Musk Eau de Parfum 50ml': {
    brand: 'Blossom Bay',
    condition: 'NEW',
    attributes: {
      scentNotes: 'Amber, musk, vanilla, cedarwood',
      volumeMl: 50,
      shelfLifeMonths: 36,
      crueltyFree: true,
      color: 'Gold',
    },
    tags: ['perfume', 'eau de parfum', 'amber'],
    weightKg: 0.3,
    dims: [10, 7, 5],
    handlingDays: 2,
    freeShipping: true,
  },
  'Botanical Bath Bombs Gift Set': {
    brand: 'Blossom Bay',
    condition: 'NEW',
    attributes: {
      scentNotes: 'Lavender, rose, citrus',
      skinType: ['Dry', 'Sensitive'],
      skinConcern: ['Hydration', 'Soothing'],
      crueltyFree: true,
      vegan: true,
      shelfLifeMonths: 12,
    },
    tags: ['bath bombs', 'spa', 'gift set'],
    weightKg: 0.9,
    dims: [26, 20, 9],
    handlingDays: 2,
    freeShipping: false,
    shippingNote: 'Ships in eco-friendly, plastic-free packaging.',
    minOrderQty: 2,
  },

  // ══ Handmade & Crafts (brand = seller's own studio) ═══════════════
  'Soy Wax Candle — Lavender Fields': {
    brand: 'Wildbloom Studio', // seller's store name
    condition: 'NEW',
    attributes: {
      material: 'Soy wax + cotton wick',
      technique: 'Hand-poured',
      timeToMake: '≈ 2 hours',
      careInstructions: 'Trim wick to 5 mm before each burn',
      oneOfAKind: false,
      color: 'Cream',
    },
    tags: ['soy candle', 'lavender', 'hand-poured'],
    weightKg: 0.55,
    dims: [9, 9, 10],
    handlingDays: 2,
    freeShipping: false,
    shippingNote: 'Hand-poured to order — ships in eco-friendly packaging.',
    minOrderQty: 2,
  },
  'Handwoven Jute Storage Basket': {
    brand: 'Wildbloom Studio',
    condition: 'NEW',
    attributes: {
      material: 'Natural jute rope',
      technique: 'Hand-coiled',
      timeToMake: '≈ 6 hours',
      careInstructions: 'Spot clean with a damp cloth',
      oneOfAKind: false,
      color: 'Beige',
    },
    tags: ['jute basket', 'handwoven', 'storage'],
    weightKg: 1.1,
    dims: [36, 36, 28], // 14" basket
    handlingDays: 3,
    freeShipping: false,
  },
  'Macramé Wall Hanging — Boho Decor': {
    brand: 'Wildbloom Studio',
    condition: 'NEW',
    attributes: {
      material: '100% cotton cord, foraged driftwood',
      technique: 'Hand-knotted macramé',
      timeToMake: '≈ 16 hours', // two days of knotting
      oneOfAKind: true, // every driftwood branch is unique
      careInstructions: 'Shake out dust; spot clean only',
      color: 'Cream',
    },
    tags: ['macrame', 'wall hanging', 'boho'],
    weightKg: 0.8,
    dims: [62, 48, 6],
    handlingDays: 3,
    freeShipping: false,
  },
  'Handmade Walnut Phone Dock': {
    brand: 'Wildbloom Studio',
    condition: 'NEW',
    attributes: {
      material: 'Solid black walnut, hardwax oil finish',
      technique: 'Hand-sanded, hand-oiled',
      timeToMake: '≈ 3 hours',
      personalizable: true, // laser engraving on request
      careInstructions: 'Wipe with a dry cloth',
      color: 'Brown',
    },
    tags: ['walnut', 'phone dock', 'handmade'],
    weightKg: 0.4,
    dims: [14, 10, 6],
    handlingDays: 2,
    freeShipping: false,
  },
}

// ── attribute validation (mirrors src/lib/catalog/validation rules) ───

function assertValidAttributes(categorySlug: string, title: string, attrs: Attrs): void {
  const defs = attributesForCategory(categorySlug)
  const problems: string[] = []
  for (const [key, value] of Object.entries(attrs)) {
    const def = defs.find((d) => d.key === key)
    if (!def) {
      problems.push(`unknown attribute key "${key}" for ${categorySlug}`)
      continue
    }
    if (def.type === 'select' || def.type === 'multiselect') {
      const allowed = (def.options ?? []).map((o) => o.value)
      const values = Array.isArray(value) ? value : [value]
      for (const v of values) {
        if (allowed.length > 0 && !allowed.includes(String(v))) {
          problems.push(`${key}: "${v}" not in [${allowed.join(' | ')}]`)
        }
      }
    }
    if (def.type === 'number') {
      const n = typeof value === 'number' ? value : NaN
      if (!Number.isFinite(n)) problems.push(`${key}: not a number (${JSON.stringify(value)})`)
      else if (def.min !== undefined && n < def.min) problems.push(`${key}: ${n} < min ${def.min}`)
      else if (def.max !== undefined && n > def.max) problems.push(`${key}: ${n} > max ${def.max}`)
    }
    if (def.type === 'boolean' && typeof value !== 'boolean') {
      problems.push(`${key}: not a boolean (${JSON.stringify(value)})`)
    }
    if ((def.type === 'text' || def.type === 'textarea') && typeof value !== 'string') {
      problems.push(`${key}: not a string (${JSON.stringify(value)})`)
    }
  }
  if (problems.length > 0) {
    throw new Error(`Invalid attributes for "${title}" (${categorySlug}):\n  - ${problems.join('\n  - ')}`)
  }
}

// ── main ─────────────────────────────────────────────────────────────

async function main() {
  const products = await db.product.findMany({
    orderBy: { title: 'asc' }, // deterministic: drives sku + barcode assignment
    select: {
      id: true,
      title: true,
      stock: true,
      category: { select: { slug: true, name: true } },
      seller: { select: { storeName: true, name: true } },
    },
  })
  console.log(`Found ${products.length} products.\n`)

  // per-category running index for SKU numbering (title-asc order)
  const categoryCounter: Record<string, number> = {}
  // which products already have variants (idempotency guard)
  const existingVariants = await db.productVariant.groupBy({
    by: ['productId'],
    _count: { _all: true },
  })
  const hasVariants = new Set(existingVariants.map((v) => v.productId))

  const summary: Record<
    string,
    { name: string; enriched: number; skippedPlan: number; variantsCreated: number; variantProducts: number }
  > = {}

  const variantRows: Array<{
    productId: string
    name: string
    options: string
    priceDelta: number
    sku: string | null
    stock: number
    image: null
  }> = []

  let globalSeq = 0

  for (const p of products) {
    globalSeq += 1
    const cat = p.category.slug
    const code = CATEGORY_CODE[cat] ?? 'GEN'
    categoryCounter[cat] = (categoryCounter[cat] ?? 0) + 1
    const sku = `VN-${code}-${String(categoryCounter[cat]).padStart(3, '0')}`

    // barcode for ~half the catalog (skip handmade — artisan batches are
    // not GS1-labelled); deterministic: every other product in title order
    const barcode =
      cat !== 'handmade-crafts' && globalSeq % 2 === 1 ? `590123${String(globalSeq).padStart(7, '0')}` : null

    const plan = PLAN[p.title]
    if (!summary[cat]) summary[cat] = { name: p.category.name, enriched: 0, skippedPlan: 0, variantsCreated: 0, variantProducts: 0 }
    if (!plan) {
      console.warn(`⚠ no plan for "${p.title}" — writing slug/sku/defaults only`)
      summary[cat].skippedPlan += 1
      await db.product.update({
        where: { id: p.id },
        data: { slug: slugifyTitle(p.title), sku, handlingDays: 2 },
      })
      continue
    }

    // fail loudly on any invalid attribute value before touching the DB
    assertValidAttributes(cat, p.title, plan.attributes)

    // handmade items carry the artisan's own studio as brand (authentic)
    const brand =
      cat === 'handmade-crafts' ? (p.seller.storeName ?? p.seller.name) : plan.brand

    await db.product.update({
      where: { id: p.id },
      data: {
        slug: slugifyTitle(p.title),
        brand,
        sku,
        barcode,
        condition: plan.condition,
        ...(plan.compareAtPrice !== undefined ? { compareAtPrice: plan.compareAtPrice } : {}),
        attributes: JSON.stringify(plan.attributes),
        tags: JSON.stringify(plan.tags),
        weightKg: plan.weightKg,
        lengthCm: plan.dims[0],
        widthCm: plan.dims[1],
        heightCm: plan.dims[2],
        handlingDays: plan.handlingDays,
        freeShipping: plan.freeShipping,
        shippingNote: plan.shippingNote ?? null,
        warrantyMonths: plan.warrantyMonths ?? null,
        minOrderQty: plan.minOrderQty ?? 1,
        maxPerOrder: plan.maxPerOrder ?? null,
        metaTitle: plan.metaTitle ?? null,
        metaDescription: plan.metaDescription ?? null,
      },
    })
    summary[cat].enriched += 1

    // ── variants (only for products that don't have any yet) ──
    if (plan.variants?.length && !hasVariants.has(p.id)) {
      const total = plan.variants.reduce((s, v) => s + v.stock, 0)
      const targetStock = plan.stockOverride ?? total
      if (total !== targetStock) {
        throw new Error(
          `Variant stock for "${p.title}" sums to ${total} but product stock is ${targetStock}`
        )
      }
      if (plan.stockOverride !== undefined) {
        await db.product.update({ where: { id: p.id }, data: { stock: plan.stockOverride } })
      }
      for (const v of plan.variants) {
        variantRows.push({
          productId: p.id,
          name: v.name,
          options: JSON.stringify(v.options),
          priceDelta: v.priceDelta ?? 0,
          sku: `${sku}-${v.skuSuffix}`,
          stock: v.stock,
          image: null,
        })
      }
      summary[cat].variantsCreated += plan.variants.length
      summary[cat].variantProducts += 1
    }
  }

  if (variantRows.length > 0) {
    await db.productVariant.createMany({ data: variantRows })
  }

  // ── summary ──
  console.log('\n═══ Enrichment summary (per category) ═══')
  let totalEnriched = 0
  let totalVariants = 0
  let totalVariantProducts = 0
  for (const [slug, s] of Object.entries(summary)) {
    console.log(
      `${slug.padEnd(16)} products enriched: ${String(s.enriched).padStart(2)}  variant products: ${s.variantProducts}  variants created: ${s.variantsCreated}${s.skippedPlan ? `  (⚠ ${s.skippedPlan} unplanned)` : ''}`
    )
    totalEnriched += s.enriched
    totalVariants += s.variantsCreated
    totalVariantProducts += s.variantProducts
  }
  const conditions = await db.product.groupBy({ by: ['condition'], _count: { _all: true } })
  console.log(`\nTotals: ${totalEnriched} products enriched · ${totalVariantProducts} products got ${totalVariants} variants`)
  console.log('Conditions:', conditions.map((c) => `${c.condition}=${c._count._all}`).join('  '))
  const variantCount = await db.productVariant.count()
  console.log(`ProductVariant rows in DB after run: ${variantCount}`)

  await db.$disconnect()
}

main().catch(async (err) => {
  console.error('Enrichment failed:', err)
  await db.$disconnect()
  process.exit(1)
})
