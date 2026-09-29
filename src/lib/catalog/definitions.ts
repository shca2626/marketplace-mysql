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
  'Black', 'White', 'Silver', 'Gray', 'Dark Blue', 'Navy', 'Beige', 'Brown',
  'Red', 'Orange', 'Yellow', 'Green', 'Teal', 'Blue', 'Multicolor',
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

// ── per-category definitions (Solar Energy / Renewable Energy) ─────

const CATEGORY_DEFINITIONS: CategoryCatalogDef[] = [
  {
    slug: 'solar-panels',
    name: 'Solar Panels',
    attributes: [
      { key: 'ratedPower', label: 'Rated power', type: 'number', unit: 'W', min: 0, max: 10000 },
      {
        key: 'cellType',
        label: 'Cell type',
        type: 'select',
        options: [
          { value: 'Monocrystalline PERC', label: 'Monocrystalline PERC' },
          { value: 'Monocrystalline half-cut', label: 'Monocrystalline half-cut' },
          { value: 'Polycrystalline', label: 'Polycrystalline' },
          { value: 'Bifacial glass-glass', label: 'Bifacial glass-glass' },
          { value: 'CIGS thin film', label: 'CIGS thin film' },
        ],
      },
      { key: 'efficiency', label: 'Module efficiency', type: 'number', unit: '%', min: 0, max: 30, step: 0.1 },
      { key: 'openCircuitVoltage', label: 'Open-circuit voltage', type: 'number', unit: 'V', min: 0, max: 2000, step: 0.1 },
      { key: 'panelCount', label: 'Cells', type: 'number', unit: 'cells', min: 0, max: 400 },
      {
        key: 'warrantyYears',
        label: 'Performance warranty',
        type: 'select',
        options: ['10 years', '12 years', '25 years', '30 years'].map((v) => ({ value: v, label: v })),
      },
      {
        key: 'frameMaterial',
        label: 'Frame',
        type: 'select',
        options: [
          { value: 'Anodized aluminum', label: 'Anodized aluminum' },
          { value: 'Frameless glass-glass', label: 'Frameless glass-glass' },
          { value: 'Flexible polymer', label: 'Flexible polymer' },
        ],
      },
      {
        key: 'intendedUse',
        label: 'Intended use',
        type: 'multiselect',
        options: ['Rooftop', 'Ground mount', 'Carport', 'RV / van', 'Boat', 'Portable / camping', 'Off-grid cabin', 'Solar farm'].map((v) => ({ value: v, label: v })),
      },
      { key: 'bifacialGain', label: 'Bifacial gain', type: 'number', unit: '%', min: 0, max: 50, step: 1, help: 'Extra rear-side yield on reflective ground' },
    ],
  },
  {
    slug: 'batteries-storage',
    name: 'Batteries & Storage',
    attributes: [
      {
        key: 'chemistry',
        label: 'Chemistry',
        type: 'select',
        options: [
          { value: 'LiFePO4', label: 'LiFePO4 (lithium iron phosphate)' },
          { value: 'AGM', label: 'AGM (sealed lead-acid)' },
          { value: 'Gel', label: 'Gel lead-acid' },
          { value: 'NMC', label: 'NMC lithium' },
        ],
      },
      { key: 'nominalVoltage', label: 'Nominal voltage', type: 'number', unit: 'V', min: 0, max: 1000, step: 0.1 },
      { key: 'capacityAh', label: 'Capacity', type: 'number', unit: 'Ah', min: 0, max: 10000, step: 0.1 },
      { key: 'capacityKwh', label: 'Energy', type: 'number', unit: 'kWh', min: 0, max: 500, step: 0.01 },
      { key: 'cycleLife', label: 'Cycle life', type: 'number', unit: 'cycles', min: 0, max: 50000 },
      { key: 'depthOfDischarge', label: 'Depth of discharge', type: 'number', unit: '%', min: 0, max: 100 },
      { key: 'maxDischargeA', label: 'Max continuous discharge', type: 'number', unit: 'A', min: 0, max: 5000 },
      { key: 'bms', label: 'Smart BMS', type: 'boolean' },
      {
        key: 'mounting',
        label: 'Mounting',
        type: 'select',
        options: ['19" server rack', 'Wall-mount', 'Floor stand', 'Portable case', 'Vehicle / RV', 'Drop-in lead-acid footprint'].map((v) => ({ value: v, label: v })),
      },
      {
        key: 'comms',
        label: 'Inverter comms',
        type: 'multiselect',
        options: ['CAN bus', 'RS485', 'Bluetooth', 'WiFi', 'None'].map((v) => ({ value: v, label: v })),
      },
    ],
  },
  {
    slug: 'inverters-power',
    name: 'Inverters & Power',
    attributes: [
      {
        key: 'inverterType',
        label: 'Type',
        type: 'select',
        options: [
          { value: 'Off-grid', label: 'Off-grid' },
          { value: 'Hybrid', label: 'Hybrid (grid + battery)' },
          { value: 'Grid-tie string', label: 'Grid-tie string' },
          { value: 'Microinverter', label: 'Microinverter' },
          { value: 'Vehicle / RV', label: 'Vehicle / RV' },
        ],
      },
      { key: 'ratedOutput', label: 'Rated output', type: 'number', unit: 'W', min: 0, max: 100000 },
      { key: 'surgeOutput', label: 'Surge output', type: 'number', unit: 'W', min: 0, max: 200000 },
      { key: 'inputVoltage', label: 'Input voltage', type: 'number', unit: 'V', min: 0, max: 1000, step: 0.1 },
      { key: 'maxPvVoltage', label: 'Max PV input', type: 'number', unit: 'Vdc', min: 0, max: 1500 },
      {
        key: 'waveform',
        label: 'Waveform',
        type: 'select',
        options: [
          { value: 'Pure sine', label: 'Pure sine' },
          { value: 'Modified sine', label: 'Modified sine' },
        ],
      },
      { key: 'mpptTrackers', label: 'MPPT trackers', type: 'number', min: 0, max: 12 },
      { key: 'chargerCurrent', label: 'Built-in charger', type: 'number', unit: 'A', min: 0, max: 500 },
      { key: 'switchoverMs', label: 'Switchover time', type: 'number', unit: 'ms', min: 0, max: 1000 },
      {
        key: 'monitoring',
        label: 'Monitoring',
        type: 'multiselect',
        options: ['LCD display', 'Bluetooth app', 'WiFi app', 'RS232', 'USB', 'Dry contacts'].map((v) => ({ value: v, label: v })),
      },
    ],
  },
  {
    slug: 'solar-pumps',
    name: 'Solar Pumps',
    attributes: [
      {
        key: 'pumpType',
        label: 'Type',
        type: 'select',
        options: [
          { value: 'Submersible deep-well', label: 'Submersible deep-well' },
          { value: 'Borehole', label: 'Borehole' },
          { value: 'Surface / irrigation', label: 'Surface / irrigation' },
          { value: 'Floating / fountain', label: 'Floating / fountain' },
          { value: 'Transfer / boost', label: 'Transfer / boost' },
        ],
      },
      { key: 'power', label: 'Power', type: 'number', unit: 'W', min: 0, max: 20000 },
      { key: 'motorType', label: 'Motor', type: 'select', options: ['Brushless DC', 'AC 3-phase', 'AC single-phase'].map((v) => ({ value: v, label: v })) },
      { key: 'maxHead', label: 'Max head / lift', type: 'number', unit: 'm', min: 0, max: 500 },
      { key: 'maxFlow', label: 'Max flow', type: 'number', unit: 'm³/h', min: 0, max: 2000, step: 0.1 },
      { key: 'suctionLift', label: 'Suction lift', type: 'number', unit: 'm', min: 0, max: 30, step: 0.1 },
      { key: 'arrayWattage', label: 'Recommended array', type: 'number', unit: 'W', min: 0, max: 20000 },
      { key: 'outletSize', label: 'Outlet size', type: 'text', placeholder: 'e.g. 2" threaded' },
      { key: 'includesController', label: 'Controller included', type: 'boolean' },
      { key: 'dryRunProtection', label: 'Dry-run protection', type: 'boolean' },
      {
        key: 'applications',
        label: 'Applications',
        type: 'multiselect',
        options: ['Livestock watering', 'Household supply', 'Irrigation', 'Pond transfer', 'Fountain / aeration', 'Tank filling', 'Drip systems'].map((v) => ({ value: v, label: v })),
      },
    ],
  },
  {
    slug: 'controllers-accessories',
    name: 'Controllers & Accessories',
    attributes: [
      {
        key: 'accessoryType',
        label: 'Type',
        type: 'select',
        options: [
          { value: 'MPPT controller', label: 'MPPT charge controller' },
          { value: 'PWM controller', label: 'PWM charge controller' },
          { value: 'Mounting rails', label: 'Mounting rails / frames' },
          { value: 'Cables & connectors', label: 'Cables & connectors' },
          { value: 'Combiner box', label: 'Combiner box / fusing' },
          { value: 'Monitoring', label: 'Monitoring' },
        ],
      },
      { key: 'ratedCurrent', label: 'Rated current', type: 'number', unit: 'A', min: 0, max: 2000 },
      {
        key: 'systemVoltage',
        label: 'System voltage',
        type: 'multiselect',
        options: ['12V', '24V', '36V', '48V', 'Auto 12/24V', 'Auto 12/24/48V', 'High voltage'].map((v) => ({ value: v, label: v })),
      },
      { key: 'maxPvVoltage', label: 'Max PV input', type: 'number', unit: 'Vdc', min: 0, max: 1500 },
      { key: 'trackingEfficiency', label: 'Tracking efficiency', type: 'number', unit: '%', min: 0, max: 100, step: 0.1 },
      {
        key: 'batteryProfiles',
        label: 'Battery profiles',
        type: 'multiselect',
        options: ['LiFePO4', 'AGM', 'Gel', 'Flooded', 'Lithium NMC', 'Custom'].map((v) => ({ value: v, label: v })),
      },
      { key: 'conductorCrossSection', label: 'Conductor cross-section', type: 'number', unit: 'mm²', min: 0, max: 100, step: 0.1 },
      { key: 'lengthM', label: 'Length', type: 'number', unit: 'm', min: 0, max: 100, step: 0.1 },
      {
        key: 'roofType',
        label: 'Roof type',
        type: 'multiselect',
        options: ['Tile', 'Metal / corrugated', 'Flat / membrane', 'Trapezoid', 'Ground mount', 'Asphalt shingle'].map((v) => ({ value: v, label: v })),
      },
    ],
  },
  {
    slug: 'solar-lighting',
    name: 'Solar Lighting',
    attributes: [
      { key: 'ledPower', label: 'LED power', type: 'number', unit: 'W', min: 0, max: 2000 },
      { key: 'lumens', label: 'Luminous flux', type: 'number', unit: 'lm', min: 0, max: 200000 },
      {
        key: 'colorTemperature',
        label: 'Color temperature',
        type: 'select',
        options: ['2700K warm', '3000K warm white', '4000K neutral', '5000K cool white', '6000K daylight', 'RGB'].map((v) => ({ value: v, label: v })),
      },
      { key: 'autonomyNights', label: 'Autonomy', type: 'number', unit: 'nights', min: 0, max: 14 },
      {
        key: 'sensor',
        label: 'Sensor',
        type: 'multiselect',
        options: ['Photocell (dusk-to-dawn)', 'Radar motion', 'PIR motion', 'Timer', 'Remote control', 'None'].map((v) => ({ value: v, label: v })),
      },
      { key: 'beamAngle', label: 'Beam angle', type: 'number', unit: '°', min: 0, max: 360 },
      {
        key: 'mounting',
        label: 'Mounting',
        type: 'multiselect',
        options: ['Pole / post', 'Wall', 'Ground spike', 'Ceiling', 'Portable', 'Rooftop'].map((v) => ({ value: v, label: v })),
      },
      {
        key: 'applications',
        label: 'Applications',
        type: 'multiselect',
        options: ['Street / road', 'Yard / driveway', 'Garden path', 'Parking lot', 'Perimeter security', 'Farming / livestock', 'Camping'].map((v) => ({ value: v, label: v })),
      },
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
