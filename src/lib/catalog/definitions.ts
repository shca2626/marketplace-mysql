/**
 * Vendora catalog — per-category product attribute definitions.
 *
 * This module is the SINGLE SOURCE OF TRUTH for category-specific product
 * details. It drives, from one data definition:
 *   • seller form rendering (src/components/marketplace/product-form/*)
 *   • API validation (src/app/api/products/* via lib/catalog/validation)
 *   • storefront spec tables (product-view)
 *   • CSV import column mapping (`attr.<key>` columns)
 *   • export columns
 *
 * Adding a new attribute = add one entry here; form, API, import, export
 * and the storefront table pick it up automatically. No schema change needed
 * (values persist in Product.attributes JSON).
 */

export type AttributeType = 'text' | 'textarea' | 'number' | 'select' | 'multiselect' | 'boolean'

/** A single validated attribute value (as stored in Product.attributes JSON). */
export type AttributeValue = string | number | boolean | string[]

export interface AttributeOption {
  value: string
  label: string
}

export interface AttributeDef {
  key: string
  label: string
  type: AttributeType
  /** unit suffix shown in form + details table (e.g. kg, ml, hours) */
  unit?: string
  /** options for select / multiselect */
  options?: AttributeOption[]
  placeholder?: string
  help?: string
  /** number constraints */
  min?: number
  max?: number
  step?: number
}

export interface CategoryCatalogDef {
  slug: string
  name: string
  attributes: AttributeDef[]
}

// ── shared option lists ──────────────────────────────────────────────

const CONDITION_OPTIONS = [
  { value: 'NEW', label: 'New' },
  { value: 'REFURBISHED', label: 'Refurbished' },
  { value: 'USED_LIKE_NEW', label: 'Used — like new' },
  { value: 'USED_GOOD', label: 'Used — good' },
  { value: 'USED_FAIR', label: 'Used — fair' },
]

const COLOR_OPTIONS = [
  'Black', 'White', 'Cream', 'Gray', 'Beige', 'Brown', 'Tan', 'Red', 'Orange',
  'Yellow', 'Green', 'Sage', 'Teal', 'Blue', 'Navy', 'Purple', 'Pink', 'Gold',
  'Silver', 'Multicolor',
].map((c) => ({ value: c, label: c }))

// ── common attributes (offered for every category) ───────────────────

const COMMON_ATTRIBUTES: AttributeDef[] = [
  {
    key: 'color',
    label: 'Color',
    type: 'select',
    options: COLOR_OPTIONS,
    help: 'Primary color of the product.',
  },
]

// ── per-category definitions ────────────────────────────────────────

const CATEGORY_DEFINITIONS: CategoryCatalogDef[] = [
  {
    slug: 'electronics',
    name: 'Electronics',
    attributes: [
      { key: 'model', label: 'Model / series', type: 'text', placeholder: 'e.g. Aura Pro 2' },
      {
        key: 'connectivity',
        label: 'Connectivity',
        type: 'multiselect',
        options: [
          { value: 'Bluetooth 5.3', label: 'Bluetooth 5.3' },
          { value: 'Bluetooth 5.0', label: 'Bluetooth 5.0' },
          { value: 'Wi-Fi 6', label: 'Wi-Fi 6' },
          { value: 'Wi-Fi 6E', label: 'Wi-Fi 6E' },
          { value: 'USB-C', label: 'USB-C' },
          { value: 'USB-A', label: 'USB-A' },
          { value: 'AUX 3.5mm', label: 'AUX 3.5 mm' },
          { value: 'HDMI', label: 'HDMI' },
          { value: 'NFC', label: 'NFC' },
          { value: 'GPS', label: 'GPS' },
        ],
      },
      { key: 'batteryLife', label: 'Battery life', type: 'number', unit: 'hours', min: 0, max: 500 },
      {
        key: 'storageCapacity',
        label: 'Storage capacity',
        type: 'select',
        options: ['32 GB', '64 GB', '128 GB', '256 GB', '512 GB', '1 TB', '2 TB'].map((v) => ({ value: v, label: v })),
      },
      { key: 'screenSize', label: 'Screen size', type: 'number', unit: 'inches', min: 0, max: 120, step: 0.1 },
      {
        key: 'waterResistance',
        label: 'Water resistance',
        type: 'select',
        options: [
          { value: 'Not rated', label: 'Not rated' },
          { value: 'IPX4', label: 'IPX4 — splash proof' },
          { value: 'IPX7', label: 'IPX7 — immersion' },
          { value: 'IP68', label: 'IP68 — dust + water' },
        ],
      },
      { key: 'powerOutput', label: 'Power output', type: 'number', unit: 'W', min: 0, max: 10000 },
      {
        key: 'includedAccessories',
        label: 'In the box',
        type: 'multiselect',
        options: [
          { value: 'Charging cable', label: 'Charging cable' },
          { value: 'Wall adapter', label: 'Wall adapter' },
          { value: 'Case', label: 'Case' },
          { value: 'Ear tips', label: 'Ear tips' },
          { value: 'Strap', label: 'Strap' },
          { value: 'Manual', label: 'Manual' },
          { value: 'Extra battery', label: 'Extra battery' },
        ],
      },
    ],
  },
  {
    slug: 'fashion',
    name: 'Fashion',
    attributes: [
      { key: 'material', label: 'Material', type: 'text', placeholder: 'e.g. 100% organic cotton' },
      {
        key: 'fit',
        label: 'Fit',
        type: 'select',
        options: ['Slim', 'Regular', 'Relaxed', 'Oversized', 'Tailored'].map((v) => ({ value: v, label: v })),
      },
      { key: 'careInstructions', label: 'Care instructions', type: 'textarea', placeholder: 'Machine wash cold, hang dry…' },
      {
        key: 'season',
        label: 'Season',
        type: 'multiselect',
        options: ['Spring', 'Summer', 'Fall', 'Winter', 'All-season'].map((v) => ({ value: v, label: v })),
      },
      {
        key: 'pattern',
        label: 'Pattern',
        type: 'select',
        options: ['Solid', 'Striped', 'Plaid', 'Floral', 'Camo', 'Geometric', 'Polka dot'].map((v) => ({ value: v, label: v })),
      },
      {
        key: 'closure',
        label: 'Closure',
        type: 'select',
        options: ['Zipper', 'Buttons', 'Pull-on', 'Laces', 'Hook and loop', 'Buckle'].map((v) => ({ value: v, label: v })),
      },
      { key: 'pockets', label: 'Pockets', type: 'boolean' },
      { key: 'waterRepellent', label: 'Water repellent', type: 'boolean' },
    ],
  },
  {
    slug: 'home-living',
    name: 'Home & Living',
    attributes: [
      { key: 'material', label: 'Material', type: 'text', placeholder: 'e.g. Solid oak, stoneware' },
      {
        key: 'style',
        label: 'Style',
        type: 'select',
        options: ['Modern', 'Rustic', 'Minimalist', 'Scandinavian', 'Industrial', 'Boho', 'Traditional'].map((v) => ({ value: v, label: v })),
      },
      { key: 'careInstructions', label: 'Care instructions', type: 'textarea', placeholder: 'Wipe clean with damp cloth…' },
      { key: 'capacityL', label: 'Capacity', type: 'number', unit: 'L', min: 0, max: 10000, step: 0.1 },
      { key: 'dishwasherSafe', label: 'Dishwasher safe', type: 'boolean' },
      { key: 'microwaveSafe', label: 'Microwave safe', type: 'boolean' },
      { key: 'assemblyRequired', label: 'Assembly required', type: 'boolean' },
      {
        key: 'room',
        label: 'Suitable rooms',
        type: 'multiselect',
        options: ['Living room', 'Bedroom', 'Kitchen', 'Bathroom', 'Office', 'Outdoor'].map((v) => ({ value: v, label: v })),
      },
    ],
  },
  {
    slug: 'sports-outdoors',
    name: 'Sports & Outdoors',
    attributes: [
      {
        key: 'intendedUse',
        label: 'Intended use',
        type: 'multiselect',
        options: ['Gym', 'Running', 'Hiking', 'Cycling', 'Yoga', 'Camping', 'Swimming', 'Team sports', 'Home workout', 'Climbing'].map((v) => ({ value: v, label: v })),
      },
      {
        key: 'skillLevel',
        label: 'Skill level',
        type: 'select',
        options: ['Beginner', 'Intermediate', 'Advanced', 'All levels'].map((v) => ({ value: v, label: v })),
      },
      { key: 'weatherproof', label: 'Weatherproof', type: 'boolean' },
      {
        key: 'resistanceLevel',
        label: 'Resistance',
        type: 'select',
        options: ['Light', 'Medium', 'Heavy', 'Adjustable'].map((v) => ({ value: v, label: v })),
      },
      { key: 'maxLoadKg', label: 'Max load', type: 'number', unit: 'kg', min: 0, max: 1000 },
    ],
  },
  {
    slug: 'beauty-wellness',
    name: 'Beauty & Wellness',
    attributes: [
      {
        key: 'skinType',
        label: 'Skin type',
        type: 'multiselect',
        options: ['All', 'Normal', 'Dry', 'Oily', 'Combination', 'Sensitive', 'Mature'].map((v) => ({ value: v, label: v })),
      },
      { key: 'scentNotes', label: 'Scent notes', type: 'text', placeholder: 'e.g. Lavender, vanilla, cedarwood' },
      { key: 'volumeMl', label: 'Volume', type: 'number', unit: 'ml', min: 0, max: 100000 },
      { key: 'ingredients', label: 'Ingredients', type: 'textarea', placeholder: 'Full ingredient list (INCI)…' },
      { key: 'crueltyFree', label: 'Cruelty free', type: 'boolean' },
      { key: 'vegan', label: 'Vegan', type: 'boolean' },
      { key: 'shelfLifeMonths', label: 'Shelf life', type: 'number', unit: 'months', min: 0, max: 120 },
      {
        key: 'skinConcern',
        label: 'Targets',
        type: 'multiselect',
        options: ['Hydration', 'Brightening', 'Acne', 'Anti-aging', 'Soothing', 'Firmness'].map((v) => ({ value: v, label: v })),
      },
    ],
  },
  {
    slug: 'handmade-crafts',
    name: 'Handmade & Crafts',
    attributes: [
      { key: 'material', label: 'Material', type: 'text', placeholder: 'e.g. Soy wax, stoneware clay' },
      { key: 'technique', label: 'Technique', type: 'text', placeholder: 'e.g. Wheel-thrown, handwoven' },
      { key: 'timeToMake', label: 'Time to make', type: 'text', placeholder: 'e.g. ≈ 6 hours' },
      { key: 'oneOfAKind', label: 'One of a kind', type: 'boolean' },
      { key: 'personalizable', label: 'Personalizable', type: 'boolean' },
      { key: 'careInstructions', label: 'Care instructions', type: 'textarea', placeholder: 'Hand wash only…' },
    ],
  },
]

// ── registry helpers ─────────────────────────────────────────────────

export function getCategoryDef(slug: string): CategoryCatalogDef | undefined {
  return CATEGORY_DEFINITIONS.find((c) => c.slug === slug)
}

/** All attributes a category offers: category-specific + common (common last). */
export function attributesForCategory(slug: string): AttributeDef[] {
  const def = getCategoryDef(slug)
  return def ? [...def.attributes, ...COMMON_ATTRIBUTES] : [...COMMON_ATTRIBUTES]
}

export function attributeDefForKey(slug: string, key: string): AttributeDef | undefined {
  return attributesForCategory(slug).find((a) => a.key === key)
}

export const CATEGORY_CATALOG = CATEGORY_DEFINITIONS
export const CONDITIONS = CONDITION_OPTIONS

/** Turn "Aura Wireless Headphones" → "aura-wireless-headphones" */
export function slugifyTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120) || 'product'
  )
}
