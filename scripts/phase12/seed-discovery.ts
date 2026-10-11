/**
 * PHASE 12 (task 12-b) — DISCOVERY DEMO DATA (idempotent seed).
 *
 *   bash scripts/with-env.sh bun scripts/phase12/seed-discovery.ts
 *
 * 1. Brands: creates the Brand rows behind the real catalog's title prefixes
 *    (Helios, PolyCore, Vertex, …) and links matching ACTIVE products by
 *    exact prefix. Never overwrites an existing brandId, never touches
 *    products that belong to no brand — a no-op on re-run.
 * 2. SpecAttribute dictionary for the six solar categories so the facet
 *    label ordering (dictionary labels first) has real data behind it.
 *    Existing attributes with the same key are left untouched.
 *
 * Safe by design: upsert-by-slug/key, no deletes, no product edits beyond
 * filling NULL brandIds.
 */
import { db } from '@/lib/db'
import { assertNotProd } from '../lib/assert-not-prod'

const BRANDS: Array<{
  name: string
  description: string
  originCountry: string
  isVerified: boolean
}> = [
  { name: 'Helios', description: 'Tier-1 monocrystalline module maker — PERC half-cut cells, 30-year lineage.', originCountry: 'China', isVerified: true },
  { name: 'PolyCore', description: 'Value polycrystalline panels for off-grid cabins and hobby arrays.', originCountry: 'China', isVerified: false },
  { name: 'Vertex', description: 'Bifacial glass-glass modules for high-yield commercial rooftops.', originCountry: 'China', isVerified: true },
  { name: 'FlexTravel', description: 'Foldable, portable panel kits for vans, boats and expeditions.', originCountry: 'South Korea', isVerified: false },
  { name: 'ShingleSlate', description: 'CIGS thin-film flexible modules that bend where glass can\'t go.', originCountry: 'Germany', isVerified: false },
  { name: 'VoltPouch', description: 'Portable power stations and LiFePO4 energy on the move.', originCountry: 'China', isVerified: false },
  { name: 'MicroPack', description: 'Compact 12V LiFePO4 drop-in batteries.', originCountry: 'China', isVerified: false },
  { name: 'PowerCell', description: 'Server-rack grade 51.2V LiFePO4 storage — ≥6000 cycles.', originCountry: 'United States', isVerified: true },
  { name: 'SunBank', description: 'Sealed AGM deep-cycle banks for budget backup.', originCountry: 'India', isVerified: false },
  { name: 'HomeStack', description: 'Modular wall-mount home battery stacks that grow with the house.', originCountry: 'China', isVerified: false },
  { name: 'PowerMate', description: 'Pure sine inverters for vans and small off-grid systems.', originCountry: 'China', isVerified: false },
  { name: 'MicroLink', description: 'Module-level microinverters for balcony and RV arrays.', originCountry: 'Netherlands', isVerified: false },
  { name: 'PureSine', description: 'Heavy-duty off-grid inverter-chargers, 48V platforms.', originCountry: 'China', isVerified: true },
  { name: 'SunLine', description: 'Grid-tie string inverters with dual-MPPT tracking.', originCountry: 'China', isVerified: false },
  { name: 'HybridCore', description: 'Hybrid inverter-chargers bridging PV, battery and grid.', originCountry: 'China', isVerified: true },
  { name: 'AquaLift', description: '48V DC submersible pumps for wells and livestock.', originCountry: 'Italy', isVerified: false },
  { name: 'DeepFlow', description: 'Deep-well brushless submersible pump systems.', originCountry: 'China', isVerified: false },
  { name: 'BoreMax', description: 'Complete borehole pump kits sized for solar direct drive.', originCountry: 'China', isVerified: false },
  { name: 'AgriSpray', description: 'Surface irrigation pumps for smallholder farms.', originCountry: 'India', isVerified: false },
  { name: 'SunLink', description: 'MC4 cable assemblies, connectors and PV wiring.', originCountry: 'China', isVerified: false },
  { name: 'PWM Lite', description: 'Budget PWM charge controllers for small 12/24V banks.', originCountry: 'China', isVerified: false },
  { name: 'MPPT Master', description: 'Bluetooth MPPT charge controllers with 99.5% tracking.', originCountry: 'China', isVerified: true },
  { name: 'RoofGrip', description: 'Anodized mounting rails and roof hooks for every tile profile.', originCountry: 'Germany', isVerified: false },
  { name: 'GlowPath', description: 'Warm-white solar garden lights in multipacks.', originCountry: 'China', isVerified: false },
  { name: 'SolarFlood', description: 'Radar-sensing solar flood lights for yards and yards of yard.', originCountry: 'China', isVerified: false },
  { name: 'StreetBeam', description: 'All-in-one solar street lights for lanes and lots.', originCountry: 'China', isVerified: false },
]

const SPECS: Array<{
  category: string
  key: string
  label: string
  dataType: string
  unit?: string
  options?: string[]
}> = [
  // solar-panels — mirrors the labels the live products actually carry
  { category: 'solar-panels', key: 'rated-power', label: 'Rated power (Pmax)', dataType: 'TEXT', unit: 'W' },
  { category: 'solar-panels', key: 'cell-type', label: 'Cell type', dataType: 'SELECT', options: ['Monocrystalline', 'Polycrystalline', 'CIGS thin film'] },
  { category: 'solar-panels', key: 'module-efficiency', label: 'Module efficiency', dataType: 'TEXT', unit: '%' },
  { category: 'solar-panels', key: 'open-circuit-voltage', label: 'Open-circuit voltage (Voc)', dataType: 'TEXT', unit: 'V' },
  { category: 'solar-panels', key: 'warranty', label: 'Warranty', dataType: 'TEXT' },
  // batteries-storage
  { category: 'batteries-storage', key: 'nominal-voltage', label: 'Nominal voltage', dataType: 'TEXT', unit: 'V' },
  { category: 'batteries-storage', key: 'capacity', label: 'Capacity', dataType: 'TEXT' },
  { category: 'batteries-storage', key: 'cell-type', label: 'Cell type', dataType: 'SELECT', options: ['Monocrystalline', 'LiFePO4', 'AGM'] },
  { category: 'batteries-storage', key: 'cycle-life', label: 'Cycle life', dataType: 'TEXT' },
  { category: 'batteries-storage', key: 'warranty', label: 'Warranty', dataType: 'TEXT' },
  // inverters-power
  { category: 'inverters-power', key: 'rated-output', label: 'Rated output', dataType: 'TEXT', unit: 'W' },
  { category: 'inverters-power', key: 'input-voltage', label: 'Input voltage', dataType: 'TEXT', unit: 'V' },
  { category: 'inverters-power', key: 'efficiency', label: 'Efficiency', dataType: 'TEXT', unit: '%' },
  { category: 'inverters-power', key: 'warranty', label: 'Warranty', dataType: 'TEXT' },
  // controllers-accessories
  { category: 'controllers-accessories', key: 'rated-current', label: 'Rated current', dataType: 'TEXT', unit: 'A' },
  { category: 'controllers-accessories', key: 'system-voltage', label: 'System voltage', dataType: 'TEXT' },
  { category: 'controllers-accessories', key: 'max-pv-input', label: 'Max PV input', dataType: 'TEXT' },
  // solar-pumps
  { category: 'solar-pumps', key: 'power', label: 'Power', dataType: 'TEXT' },
  { category: 'solar-pumps', key: 'max-head', label: 'Max head', dataType: 'TEXT', unit: 'm' },
  { category: 'solar-pumps', key: 'max-flow', label: 'Max flow', dataType: 'TEXT' },
  // solar-lighting
  { category: 'solar-lighting', key: 'led-power', label: 'LED power', dataType: 'TEXT', unit: 'W' },
  { category: 'solar-lighting', key: 'rating', label: 'Rating', dataType: 'TEXT' },
  { category: 'solar-lighting', key: 'runtime', label: 'Runtime', dataType: 'TEXT' },
]

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

async function main() {
  await assertNotProd()
  const admin =
    (await db.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } })) ??
    (() => {
      throw new Error('No ADMIN user found — run scripts/seed-demo.ts first')
    })()

  // ── 1. Brands ────────────────────────────────────────────────────────────
  let brandsCreated = 0
  for (const b of BRANDS) {
    const slug = slugify(b.name)
    const existing = await db.brand.findUnique({ where: { slug }, select: { id: true } })
    if (existing) continue
    await db.brand.create({ data: { name: b.name, slug, description: b.description, originCountry: b.originCountry, isVerified: b.isVerified } })
    brandsCreated++
  }

  // Link products by exact title prefix ("Helios M-450 …" → Helios)
  const brands = await db.brand.findMany({ select: { id: true, name: true } })
  let linked = 0
  for (const brand of brands) {
    const prefix = `${brand.name} `
    const targets = await db.product.findMany({
      where: { title: { startsWith: prefix }, brandId: null, status: 'ACTIVE' },
      select: { id: true },
    })
    if (targets.length === 0) continue
    await db.product.updateMany({ where: { id: { in: targets.map((t) => t.id) } }, data: { brandId: brand.id } })
    linked += targets.length
  }

  // ── 2. SpecAttribute dictionary ──────────────────────────────────────────
  let attrsCreated = 0
  let position = 0
  for (const s of SPECS) {
    const category = await db.category.findUnique({ where: { slug: s.category }, select: { id: true } })
    if (!category) continue
    const clash = await db.specAttribute.findFirst({
      where: { categoryId: category.id, key: s.key },
      select: { id: true },
    })
    if (clash) continue
    await db.specAttribute.create({
      data: {
        categoryId: category.id,
        key: s.key,
        label: s.label,
        dataType: s.dataType,
        unit: s.unit ?? null,
        options: s.options ? JSON.stringify(s.options) : null,
        required: false,
        position: position++,
        isActive: true,
      },
    })
    attrsCreated++
  }

  const counts = await Promise.all([
    db.brand.count(),
    db.product.count({ where: { brandId: { not: null } } }),
    db.specAttribute.count(),
  ])
  console.log(
    `[phase12 seed-discovery] brands created: ${brandsCreated} (total ${counts[0]}), ` +
      `products linked: ${linked} (total ${counts[1]}), spec attrs created: ${attrsCreated} (total ${counts[2]}) ` +
      `— admin actor: ${admin.id}`
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
