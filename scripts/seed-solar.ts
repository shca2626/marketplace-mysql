/**
 * Seeds the Solar Energy / Renewable Energy marketplace:
 *   1. Clears the old generic catalog (products, categories, orders, reviews,
 *      quotes, RFQs, price lists, notifications, old MediaAssets/pictures).
 *   2. Rebrands the 5 seller stores as solar-energy brands (buyers/admin kept).
 *   3. Creates 6 renewable-energy categories.
 *   4. Pushes the 26 generated solar product photos + 4 hero banners through
 *      the app's own storage pipeline (processImageUpload → renditions →
 *      ftp-hosting driver with local-disk fallback), registers MediaAssets.
 *   5. Creates 26 solar products (panels, batteries, inverters, submersible
 *      pumps, controllers/accessories, lighting) with specs + highlights.
 *   6. Recreates reviews, sold counts and a handful of demo orders.
 *   7. Rewrites hero banners to solar slides.
 *   8. Refreshes scripts/seed-data/images.json with the durable /api/media URLs.
 *
 * Idempotent-ish: designed for a one-shot pivot; re-running wipes and reseeds.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { hashPassword } from '../src/lib/auth'
import { PrismaClient } from '@prisma/client'
import { processImageUpload } from '../src/lib/storage/image-pipeline'
import { mediaUrl } from '../src/lib/storage/url'

const db = new PrismaClient()

const IMG_DIR = 'db/solar-images'

function daysAgo(n: number, hour = 10) {
  const d = new Date()
  d.setHours(hour, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return d
}

// ── Catalog definition ───────────────────────────────────────────────────────

const CATEGORIES = [
  { name: 'Solar Panels', slug: 'solar-panels', icon: 'Sun' },
  { name: 'Batteries & Storage', slug: 'batteries-storage', icon: 'BatteryCharging' },
  { name: 'Inverters & Power', slug: 'inverters-power', icon: 'Zap' },
  { name: 'Solar Pumps', slug: 'solar-pumps', icon: 'Droplets' },
  { name: 'Controllers & Accessories', slug: 'controllers-accessories', icon: 'Cable' },
  { name: 'Solar Lighting', slug: 'solar-lighting', icon: 'Lightbulb' },
]

type P = {
  title: string
  description: string
  price: number
  compareAtPrice?: number
  image: string
  category: string
  seller: 1 | 2 | 3 | 4 | 5
  stock: number
  soldCount: number
  featured?: boolean
  createdAt: number
  sku: string
  highlights: string[]
  specs: [string, string][]
}

const PRODUCTS: P[] = [
  // ── Solar Panels ──────────────────────────────────────────────────────────
  {
    title: 'Helios M-450 Monocrystalline Solar Panel 450W',
    description:
      'Tier-1 monocrystalline module with 21.8% efficiency and half-cut PERC cells for excellent low-light harvest. 25-year linear performance warranty, IP68 junction box and a corrosion-resistant anodized aluminum frame rated for 5400Pa snow and 2400Pa wind loads. PID-resistant, salt-mist certified for coastal installs.',
    price: 189.99,
    compareAtPrice: 249.99,
    image: '01-panel-mono-450.png',
    category: 'solar-panels',
    seller: 1,
    stock: 180,
    soldCount: 412,
    featured: true,
    createdAt: 74,
    sku: 'SOL-PNL-M450',
    highlights: [
      '21.8% module efficiency with half-cut PERC cells',
      '5400Pa snow load / 2400Pa wind load certified frame',
      '25-year linear performance warranty, 12-year product warranty',
      'IP68 junction box with 3 bypass diodes',
    ],
    specs: [
      ['Rated power (Pmax)', '450W'],
      ['Cell type', 'Monocrystalline PERC, 144 half-cut cells'],
      ['Module efficiency', '21.8%'],
      ['Open-circuit voltage (Voc)', '49.8V'],
      ['Dimensions', '1903 × 1134 × 35 mm'],
      ['Weight', '21.3 kg'],
    ],
  },
  {
    title: 'Vertex B-550 Bifacial Glass-Glass Solar Panel 550W',
    description:
      'Bifacial dual-glass module that harvests from both faces — up to 25% extra yield from ground-reflected light. 30-year warranty, zero PID, and anti-reflective tempered glass on both sides. The ideal choice for ground-mount farms, carports and flat roofs with reflective surfaces.',
    price: 239.0,
    image: '02-panel-bifacial-550.png',
    category: 'solar-panels',
    seller: 1,
    stock: 240,
    soldCount: 268,
    featured: true,
    createdAt: 61,
    sku: 'SOL-PNL-B550',
    highlights: [
      'Up to 25% bonus yield from rear-side generation',
      '30-year performance warranty (87.4% @ year 30)',
      'Dual 2.0mm tempered glass — no backsheet aging',
      'Excellent for ground mounts and solar carports',
    ],
    specs: [
      ['Rated power (Pmax)', '550W (+ up to 25% bifacial gain)'],
      ['Cell type', 'Monocrystalline bifacial, 144 half-cut cells'],
      ['Module efficiency', '21.5%'],
      ['Bifaciality factor', '70% ±5%'],
      ['Dimensions', '2278 × 1134 × 30 mm'],
      ['Weight', '27.5 kg'],
    ],
  },
  {
    title: 'FlexTravel 100W Foldable Solar Panel Kit',
    description:
      'Adventure-ready folding kit that fits in a backpack. Four monocrystalline wings fold into a slim 3.2kg folio with a built-in stand, charge controller pocket and 5m cable. Perfect for overlanding, camping and off-grid cabins — pair it with any portable power station.',
    price: 89.99,
    compareAtPrice: 119.99,
    image: '03-panel-foldable-100.png',
    category: 'solar-panels',
    seller: 1,
    stock: 95,
    soldCount: 537,
    featured: true,
    createdAt: 52,
    sku: 'SOL-PNL-FT100',
    highlights: [
      'Folds to laptop size — 3.2 kg with carry handle',
      'Integrated 10A PWM controller with USB output',
      'IP65 splash-proof fabric backing',
      'MC4 + DC5521 and Anderson adapters included',
    ],
    specs: [
      ['Rated power (Pmax)', '100W'],
      ['Module efficiency', '19.6%'],
      ['Folded size', '520 × 350 × 35 mm'],
      ['Weight', '3.2 kg'],
      ['Cell type', 'Monocrystalline, 4 panels'],
    ],
  },
  {
    title: 'PolyCore P-150 Polycrystalline Solar Panel 150W',
    description:
      'Dependable 150W polycrystalline workhorse for 12V battery charging, fencing, gate openers and small off-grid loads. High-transmission tempered glass, sturdy frame and a price point that makes multi-panel arrays easy on the budget.',
    price: 64.99,
    image: '04-panel-poly-150.png',
    category: 'solar-panels',
    seller: 1,
    stock: 150,
    soldCount: 289,
    createdAt: 45,
    sku: 'SOL-PNL-P150',
    highlights: [
      'Great value for 12V off-grid systems',
      'High-transmission 3.2mm tempered glass',
      'Pre-drilled mounting holes for fast install',
      'Withstands 2400Pa wind load',
    ],
    specs: [
      ['Rated power (Pmax)', '150W'],
      ['Cell type', 'Polycrystalline, 36 cells'],
      ['Module efficiency', '16.8%'],
      ['Open-circuit voltage (Voc)', '22.6V'],
      ['Dimensions', '1480 × 670 × 30 mm'],
      ['Weight', '11.5 kg'],
    ],
  },
  {
    title: 'ShingleSlate 120W CIGS Flexible Solar Panel',
    description:
      'Ultra-thin CIGS thin-film panel that bends to 30° curves — mounts on RV roofs, boat decks and curved structures with adhesive alone. Shadow-tolerant cell layout keeps harvesting even when part of the panel is shaded. No glass to crack, 2.9kg, 4mm thin.',
    price: 149.0,
    image: '05-panel-flexible-120.png',
    category: 'solar-panels',
    seller: 1,
    stock: 60,
    soldCount: 154,
    createdAt: 38,
    sku: 'SOL-PNL-SS120',
    highlights: [
      'Bends to 30° — glue-down mount, no drilling',
      '4mm thin, 2.9 kg, no glass',
      'Excellent low-light and shade tolerance',
      'Walkable surface (distributed load)',
    ],
    specs: [
      ['Rated power (Pmax)', '120W'],
      ['Cell type', 'CIGS thin film'],
      ['Module efficiency', '17.5%'],
      ['Bend radius', 'min. 500 mm (≈30° arc)'],
      ['Dimensions', '1416 × 700 × 4 mm'],
      ['Weight', '2.9 kg'],
    ],
  },

  // ── Batteries & Storage ────────────────────────────────────────────────────
  {
    title: 'PowerCell 51.2V 100Ah LiFePO4 Server Rack Battery',
    description:
      'Grade-A LiFePO4 cells in a 19" rack-mount case with a 200A smart BMS, CAN/RS485 comms and a colour LCD. 100Ah at 51.2V = 5.12kWh per unit, stackable to 15 in parallel. The backbone of serious off-grid and backup systems — 6000+ cycles at 80% DoD.',
    price: 899.0,
    compareAtPrice: 1149.0,
    image: '06-battery-rack-100ah.png',
    category: 'batteries-storage',
    seller: 2,
    stock: 85,
    soldCount: 231,
    featured: true,
    createdAt: 70,
    sku: 'SOL-BAT-PC100',
    highlights: [
      '5.12kWh per module — parallel up to 15 units',
      '6000+ cycles @ 80% DoD (≈16 years daily use)',
      'Smart 200A BMS with CAN/RS485 inverter comms',
      '19" rack format, 2U, integrated handles',
    ],
    specs: [
      ['Nominal voltage', '51.2V (16S LiFePO4)'],
      ['Capacity', '100Ah / 5.12kWh'],
      ['Cycle life', '≥6000 cycles @ 80% DoD'],
      ['Max continuous discharge', '100A (1C)'],
      ['Comms', 'CAN bus / RS485'],
      ['Weight', '43 kg'],
    ],
  },
  {
    title: 'SunBank 12V 200Ah Deep-Cycle AGM Battery',
    description:
      'Sealed AGM deep-cycle battery built for solar duty — maintenance-free, spill-proof and safe to install indoors. Low self-discharge (3%/month) and 1200 cycles at 50% DoD. The cost-effective workhorse for pumps, lighting and small backup kits that run on 12V.',
    price: 329.99,
    image: '07-battery-agm-200ah.png',
    category: 'batteries-storage',
    seller: 2,
    stock: 120,
    soldCount: 197,
    createdAt: 58,
    sku: 'SOL-BAT-SB200',
    highlights: [
      '200Ah @ 12V — 2.56kWh stored',
      'Sealed AGM: mount in any orientation, no watering',
      '1200 cycles @ 50% depth of discharge',
      'Heavy-duty terminal posts with stainless hardware',
    ],
    specs: [
      ['Nominal voltage', '12V'],
      ['Capacity (C20)', '200Ah'],
      ['Cycle life', '1200 cycles @ 50% DoD'],
      ['Internal chemistry', 'AGM (VRLA, sealed lead-acid)'],
      ['Dimensions', '522 × 240 × 219 mm'],
      ['Weight', '58 kg'],
    ],
  },
  {
    title: 'HomeStack 5.12kWh Modular Wall-Mount Battery',
    description:
      'Sleek wall-mounted energy storage for homes and small businesses. Stack modules from 5.12kWh up to 20.5kWh — each unit slides and clicks onto the mounting rail, daisy-chained, auto-addressed. Integrated BMS talks to all major hybrid inverters over CAN. IP65 for garage or outdoor wall install.',
    price: 1899.0,
    image: '08-battery-wall-5kwh.png',
    category: 'batteries-storage',
    seller: 2,
    stock: 40,
    soldCount: 88,
    featured: true,
    createdAt: 49,
    sku: 'SOL-BAT-HS5',
    highlights: [
      'Stackable 5.12kWh modules up to 20.5kWh',
      'Auto-addressing daisy-chain — no manual config',
      'Compatible with all major hybrid inverters (CAN/RS485)',
      'IP65 rated, -10°C to 50°C operating range',
    ],
    specs: [
      ['Usable energy', '5.12kWh (100% DoD)'],
      ['Nominal voltage', '51.2V'],
      ['Max continuous discharge', '100A'],
      ['Expandability', 'up to 4 modules (20.5kWh)'],
      ['Enclosure', 'IP65, powder-coated steel'],
      ['Weight', '45 kg per module'],
    ],
  },
  {
    title: 'VoltPouch 1024Wh Portable Power Station',
    description:
      '1kWh of silent, fume-free portable power with a pure sine wave 1000W inverter (2000W surge). Charges from solar (up to 400W input), wall or car. LCD shows flow in real time. Runs fridges, CPAP, routers, TVs and power tools through the night — 8 outputs including 2× AC, 100W USB-C PD and 12V carport.',
    price: 549.99,
    compareAtPrice: 699.99,
    image: '09-battery-powerstation.png',
    category: 'batteries-storage',
    seller: 2,
    stock: 65,
    soldCount: 476,
    featured: true,
    createdAt: 42,
    sku: 'SOL-BAT-VP1K',
    highlights: [
      '1024Wh LiFePO4 — 3500+ cycles',
      '1000W pure sine AC (2000W surge)',
      '400W solar input with built-in MPPT',
      '8 outputs incl. 100W USB-C PD',
    ],
    specs: [
      ['Capacity', '1024Wh (LiFePO4)'],
      ['AC output', '1000W pure sine, 2000W surge'],
      ['Solar input', 'up to 400W (MPPT, 12–60V)'],
      ['Cycle life', '3500+ cycles to 80%'],
      ['Weight', '12.5 kg'],
    ],
  },
  {
    title: 'MicroPack 12V 50Ah LiFePO4 Battery',
    description:
      'Drop-in 50Ah lithium replacement for lead-acid in RVs, boats and 12V solar kits. A third of the weight, double the usable energy and a smart BMS with low-temp charging cutoff. Group 24 case fits standard trays.',
    price: 189.0,
    image: '10-battery-lifepo4-50ah.png',
    category: 'batteries-storage',
    seller: 2,
    stock: 140,
    soldCount: 342,
    createdAt: 33,
    sku: 'SOL-BAT-MP50',
    highlights: [
      'Drop-in Group 24 replacement case',
      '5.7 kg vs 14 kg for lead-acid',
      '100A smart BMS with low-temp cutoff',
      '80% depth of discharge usable daily',
    ],
    specs: [
      ['Nominal voltage', '12.8V (4S)'],
      ['Capacity', '50Ah / 640Wh'],
      ['Cycle life', '4000+ cycles @ 80% DoD'],
      ['Max continuous discharge', '60A'],
      ['Weight', '5.7 kg'],
    ],
  },

  // ── Inverters & Power ──────────────────────────────────────────────────────
  {
    title: 'PureSine 5000W 48V Off-Grid Inverter',
    description:
      '5000W continuous pure sine wave inverter/charger for whole-cabin systems. Split-phase capable, 400% surge for motor starts, and a 90A configurable battery charger for generator top-ups. LCD panel tracks flow in real time; conformal-coated boards survive dusty outbuildings.',
    price: 649.0,
    image: '11-inverter-5000w.png',
    category: 'inverters-power',
    seller: 1,
    stock: 55,
    soldCount: 178,
    featured: true,
    createdAt: 66,
    sku: 'SOL-INV-PS5K',
    highlights: [
      '5000W continuous / 10000W surge (10s)',
      'Built-in 90A battery charger (generator or grid)',
      'Pure sine — safe for pumps and electronics',
      'Programmable via LCD or RS232',
    ],
    specs: [
      ['Continuous output', '5000W'],
      ['Input voltage', '48V DC (40–60V)'],
      ['Output waveform', 'Pure sine wave'],
      ['Charger', '90A, 3-stage configurable'],
      ['Efficiency', '≥93% peak'],
    ],
  },
  {
    title: 'HybridCore 6kW Hybrid Inverter-Charger',
    description:
      'One wall unit that does it all: solar MPPT input, battery charging, grid pass-through and export. 6kW continuous output with 500Vdc PV input and dual 98.2% MPPT trackers. Seamless <10ms switchover keeps computers running through outages. Monitor and configure everything from the app.',
    price: 1149.0,
    compareAtPrice: 1399.0,
    image: '12-inverter-hybrid-6kw.png',
    category: 'inverters-power',
    seller: 1,
    stock: 35,
    soldCount: 96,
    createdAt: 57,
    sku: 'SOL-INV-HC6',
    highlights: [
      '6kW continuous, dual MPPT (2 × 13A @ 500Vdc)',
      '<10ms grid-to-battery switchover',
      'App monitoring via built-in WiFi',
      'Generator input with auto-start dry contact',
    ],
    specs: [
      ['Rated output', '6000W'],
      ['PV input', '500Vdc max, 2 MPPT trackers'],
      ['Battery voltage', '48V (40–60V)'],
      ['Switchover time', '<10ms'],
      ['Peak efficiency', '97.6%'],
    ],
  },
  {
    title: 'MicroLink 600W Microinverter',
    description:
      'Module-level microinverter that bolts to the frame of each panel — panel-level MPPT means one shaded module never drags down the string. 600W output, 25-year warranty, and rapid-shutdown compliant by design. The safest, simplest way to add panels one at a time.',
    price: 89.99,
    image: '13-inverter-micro-600.png',
    category: 'inverters-power',
    seller: 1,
    stock: 300,
    soldCount: 389,
    createdAt: 41,
    sku: 'SOL-INV-ML600',
    highlights: [
      'Per-panel MPPT — shade on one panel costs only that panel',
      '25-year design life, IP67 potted enclosure',
      'Meets rapid-shutdown requirements out of the box',
      'Parallel up to 34 units on one branch',
    ],
    specs: [
      ['Rated output', '600W'],
      ['MPPT range', '16–55V per module'],
      ['Output', '230V AC (grid-tied)'],
      ['Enclosure', 'IP67, UV-stabilized'],
      ['Warranty', '25 years'],
    ],
  },
  {
    title: 'SunLine 3.6kW Grid-Tie String Inverter',
    description:
      'Single-MPPT string inverter for straightforward rooftop arrays. One high-voltage MPPT (500V) that takes up to 5000W of panel. Natural-convection cooling means no fan to fail, and the IP66 case handles wall life outdoors. WiFi dongle included for production monitoring.',
    price: 429.0,
    image: '14-inverter-string-3600.png',
    category: 'inverters-power',
    seller: 1,
    stock: 48,
    soldCount: 117,
    createdAt: 36,
    sku: 'SOL-INV-SL36',
    highlights: [
      '3600W AC output, 5000W PV input',
      'Fanless natural cooling — silent',
      'IP66 outdoor enclosure',
      'WiFi production monitoring included',
    ],
    specs: [
      ['Rated AC output', '3600W'],
      ['Max PV input', '5000W, 500Vdc'],
      ['MPPT trackers', '1 (2 strings)'],
      ['Efficiency', '97.7% max'],
      ['Weight', '11 kg'],
    ],
  },
  {
    title: 'PowerMate 2000W Pure Sine Inverter 12V',
    description:
      'Vehicle-grade 2000W pure sine inverter for trucks, vans and boats. Heavy-duty screw terminals, built-in Bluetooth for phone monitoring, and an idle-save mode that drops draw to <0.5W. Runs power tools, microwaves and induction cooktops on the road.',
    price: 179.99,
    compareAtPrice: 219.99,
    image: '15-inverter-2000w-12v.png',
    category: 'inverters-power',
    seller: 1,
    stock: 90,
    soldCount: 264,
    createdAt: 29,
    sku: 'SOL-INV-PM2K',
    highlights: [
      '2000W continuous, 4000W surge',
      'Bluetooth monitoring app',
      'Idle-save mode < 0.5W draw',
      'Over/under-voltage, thermal and short protection',
    ],
    specs: [
      ['Continuous output', '2000W'],
      ['Input', '12V DC (10–15V)'],
      ['Waveform', 'Pure sine'],
      ['Efficiency', '≥90%'],
      ['Weight', '3.4 kg'],
    ],
  },

  // ── Solar Pumps ───────────────────────────────────────────────────────────
  {
    title: 'DeepFlow 1.5HP Solar Submersible Deep-Well Pump',
    description:
      'Stainless 3" submersible built for deep wells: 1.5HP brushless DC motor lifts up to 80m head at up to 6 m³/h. Runs direct from a 750–1200W solar array through the included MPPT pump controller — no batteries required. Dry-run protection and soft-start extend motor life.',
    price: 589.0,
    image: '16-pump-submersible-1hp.png',
    category: 'solar-pumps',
    seller: 3,
    stock: 45,
    soldCount: 153,
    featured: true,
    createdAt: 64,
    sku: 'SOL-PMP-DF15',
    highlights: [
      '80m max head, 6 m³/h max flow',
      'Brushless DC motor — no brushes to wear',
      'Includes MPPT pump controller',
      'Dry-run + overload protection',
    ],
    specs: [
      ['Power', '1.5 HP (1100W) brushless DC'],
      ['Max head', '80 m'],
      ['Max flow', '6 m³/h'],
      ['Outlet', '2" threaded'],
      ['PV array (recommended)', '750–1200W'],
      ['Body', '304 stainless steel'],
    ],
  },
  {
    title: 'BoreMax 3" Solar Borehole Pump Kit',
    description:
      'Complete borehole kit: 3-inch submersible pump, 48V MPPT controller with LCD, 20m waterproof cable and safety rope. Sized for 100mm+ boreholes and livestock/household supply from up to 45m. Controller adjusts flow to available sunshine automatically.',
    price: 399.0,
    image: '17-pump-borehole-kit.png',
    category: 'solar-pumps',
    seller: 3,
    stock: 38,
    soldCount: 121,
    createdAt: 47,
    sku: 'SOL-PMP-BM3',
    highlights: [
      'All-in-one kit: pump + controller + cable + rope',
      '48V MPPT controller with LCD',
      'Fits 100mm (4") boreholes',
      'Sun-tracking flow — max water when sun is strongest',
    ],
    specs: [
      ['Power', '750W brushless DC'],
      ['Max head', '45 m'],
      ['Max flow', '4.5 m³/h'],
      ['Borehole diameter', '≥100 mm'],
      ['Cable', '20 m submersible'],
      ['Array (recommended)', '800W @ 48V'],
    ],
  },
  {
    title: 'AgriSpray 2HP Solar Surface Irrigation Pump',
    description:
      'Self-priming surface pump for irrigation ponds and tanks: 2HP moves 12 m³/h at 22m head. Cast-iron volute, stainless shaft and a TEFC motor that shrugs at dust. Pair with the solar array of your choice via any standard pump inverter — moves serious water all day.',
    price: 449.0,
    image: '18-pump-surface-irrigation.png',
    category: 'solar-pumps',
    seller: 3,
    stock: 32,
    soldCount: 87,
    createdAt: 34,
    sku: 'SOL-PMP-AS2',
    highlights: [
      '12 m³/h at 22m head',
      'Self-priming: lifts from ponds and open water',
      'TEFC motor — sealed against dust and spray',
      'Cast-iron volute, stainless shaft',
    ],
    specs: [
      ['Power', '2 HP (1500W)'],
      ['Max flow', '12 m³/h'],
      ['Max head', '22 m'],
      ['Suction lift', 'up to 7 m self-priming'],
      ['Inlet/outlet', '2" / 1.5"'],
    ],
  },
  {
    title: 'AquaLift 750W 48V DC Submersible Pump with Controller',
    description:
      'Compact 48V DC submersible for tanks, cisterns and shallow wells. Comes with its own solar controller — connect 800W of panels directly and it runs from sun-up. Only 6.5kg, so one person can install it. Stainless body, water-filled motor for quiet running.',
    price: 219.99,
    image: '19-pump-dc-750w.png',
    category: 'solar-pumps',
    seller: 3,
    stock: 70,
    soldCount: 246,
    featured: true,
    createdAt: 26,
    sku: 'SOL-PMP-AL750',
    highlights: [
      'Direct solar: 48V DC with included controller',
      'Only 6.5 kg — one-person install',
      'Water-filled motor, quiet running',
      'Stainless steel body',
    ],
    specs: [
      ['Power', '750W @ 48V DC'],
      ['Max head', '30 m'],
      ['Max flow', '3.6 m³/h'],
      ['Body', '304 stainless'],
      ['Weight', '6.5 kg'],
    ],
  },

  // ── Controllers & Accessories ─────────────────────────────────────────────
  {
    title: 'MPPT Master 60A Solar Charge Controller',
    description:
      '60A MPPT controller with 99.5% tracking efficiency — squeezes up to 30% more power from the same panels versus PWM. Supports 12/24/36/48V auto-detect, 150Voc input and LiFePO4/AGM/gel/flooded charge profiles. Backlit LCD, Bluetooth monitoring and dual USB outputs.',
    price: 189.99,
    compareAtPrice: 229.99,
    image: '20-controller-mppt-60a.png',
    category: 'controllers-accessories',
    seller: 4,
    stock: 110,
    soldCount: 398,
    featured: true,
    createdAt: 62,
    sku: 'SOL-CTL-MM60',
    highlights: [
      '99.5% MPPT tracking efficiency',
      '12/24/36/48V auto-detect',
      'LiFePO4 + lead-acid charge profiles',
      'Bluetooth app monitoring',
    ],
    specs: [
      ['Rated current', '60A'],
      ['System voltage', '12/24/36/48V auto'],
      ['Max PV input', '150Voc'],
      ['Tracking efficiency', '99.5%'],
      ['Comms', 'Bluetooth + RS485'],
    ],
  },
  {
    title: 'PWM Lite 30A Solar Charge Controller',
    description:
      'Honest, compact PWM controller for small 12/24V kits. Big backlit LCD, dual USB charging ports and full electronic protections (over-charge, over-discharge, reverse polarity, short). Set-and-forget for lighting, fencing and small battery banks.',
    price: 44.99,
    image: '21-controller-pwm-30a.png',
    category: 'controllers-accessories',
    seller: 4,
    stock: 220,
    soldCount: 512,
    createdAt: 39,
    sku: 'SOL-CTL-PW30',
    highlights: [
      '30A PWM for 12/24V systems',
      'Dual 5V USB outputs',
      'Full electronic protections',
      'Clear backlit LCD',
    ],
    specs: [
      ['Rated current', '30A'],
      ['System voltage', '12/24V auto'],
      ['Max PV input', '50Voc'],
      ['USB outputs', '2 × 5V/2A'],
    ],
  },
  {
    title: 'RoofGrip Solar Panel Mounting Rail Set',
    description:
      'Anodized aluminium mounting kit for 4 panels on tile or metal roofs: 2 × 2.4m rails, mid/end clamps, roof hooks, bolts and channel nuts. TÜV-structured, 6005A-T6 alloy — engineered for 25 years outside with zero corrosion where it matters.',
    price: 79.99,
    image: '22-mount-rail-set.png',
    category: 'controllers-accessories',
    seller: 4,
    stock: 130,
    soldCount: 176,
    createdAt: 31,
    sku: 'SOL-ACC-RG4',
    highlights: [
      'Complete set for 4 panels (rail + clamps + hooks)',
      '6005A-T6 anodized aluminium',
      'Fits tile and metal roofs',
      'Adjustable hook height for uneven tiles',
    ],
    specs: [
      ['Rail length', '2 × 2400 mm'],
      ['Alloy', '6005A-T6 anodized'],
      ['Panel support', 'up to 4 × 550W'],
      ['Includes', '8 mid clamps, 8 end clamps, roof hooks, hardware'],
    ],
  },
  {
    title: 'SunLink 10m Solar Extension Cable Pair (MC4)',
    description:
      '10-meter pair of 6mm² double-insulated solar cables with pre-crimped MC4 connectors. UV-stabilized sheath rated for 25 years outdoors, -40°C to 90°C. Tinned copper for low voltage drop. Locking, waterproof connectors click home with a satisfying snap.',
    price: 29.99,
    image: '23-cable-mc4-10m.png',
    category: 'controllers-accessories',
    seller: 4,
    stock: 400,
    soldCount: 703,
    createdAt: 21,
    sku: 'SOL-ACC-SL10',
    highlights: [
      '6mm² tinned copper, low voltage drop',
      'UV-stabilized sheath, 25-year outdoor rating',
      'Pre-crimped genuine MC4 connectors',
      'IP68 connector sealing',
    ],
    specs: [
      ['Length', '2 × 10 m'],
      ['Conductor', '6 mm² tinned copper'],
      ['Rating', '1000V DC, 70A'],
      ['Temperature', '-40°C to +90°C'],
    ],
  },

  // ── Solar Lighting ────────────────────────────────────────────────────────
  {
    title: 'StreetBeam 60W All-in-One Solar Street Light',
    description:
      'Integrated street light with 60W LED array, 110W panel and 32Ah LiFePO4 battery in one slim head. Dusk-to-dawn with motion boost (30% → 100% on approach), 3 nights autonomy and an IP66 body. Pole-mount bracket included — the complete street light in one box.',
    price: 129.99,
    image: '24-light-street-60w.png',
    category: 'solar-lighting',
    seller: 5,
    stock: 85,
    soldCount: 264,
    featured: true,
    createdAt: 55,
    sku: 'SOL-LGT-SB60',
    highlights: [
      '60W LED, 6000 lumens',
      'Motion boost: 30% dim → 100% on approach',
      '3 nights of autonomy without sun',
      'IP66, pole bracket included',
    ],
    specs: [
      ['LED power', '60W (6000 lm)'],
      ['Panel', '110W monocrystalline'],
      ['Battery', '32Ah LiFePO4'],
      ['Autonomy', '3 nights (dim mode)'],
      ['Mount', 'Ø60mm pole bracket'],
    ],
  },
  {
    title: 'SolarFlood 100W Motion-Activated Flood Light',
    description:
      'Detachable-panel flood light for yards and driveways: 100W COB LED throws 9000 lumens across 120°. Radar motion sensing with adjustable sensitivity and timer, plus an always-on low mode. IP66 head with 5m cable to the remote panel — mount the light in shade, the panel in sun.',
    price: 69.99,
    compareAtPrice: 94.99,
    image: '25-light-flood-100w.png',
    category: 'solar-lighting',
    seller: 5,
    stock: 160,
    soldCount: 431,
    createdAt: 28,
    sku: 'SOL-LGT-SF100',
    highlights: [
      '100W COB LED, 9000 lumens',
      'Remote panel on 5m cable — flexible mounting',
      'Radar motion + 3-hour timer modes',
      'IP66 weatherproof head',
    ],
    specs: [
      ['LED power', '100W COB'],
      ['Lumens', '9000 lm'],
      ['Beam angle', '120°'],
      ['Sensor', '5.8GHz radar, adjustable'],
      ['Panel cable', '5 m'],
    ],
  },
  {
    title: 'GlowPath Solar Garden Light Set (6-Pack)',
    description:
      'Six brushed-stainless path lights with warm 3000K LEDs and patterned lens caps that throw soft light pools. Auto-on at dusk, 8-hour runtime, IP44. Just push the ground spikes and forget them — a garden path that lights itself every night.',
    price: 39.99,
    image: '26-light-garden-set.png',
    category: 'solar-lighting',
    seller: 5,
    stock: 350,
    soldCount: 618,
    createdAt: 18,
    sku: 'SOL-LGT-GP6',
    highlights: [
      '6 lights, warm 3000K LEDs',
      'Auto dusk-to-dawn, 8-hour runtime',
      'Brushed stainless construction',
      'Tool-free ground spike install',
    ],
    specs: [
      ['Quantity', '6 lights'],
      ['Color temperature', '3000K warm white'],
      ['Runtime', 'up to 8 hours'],
      ['Rating', 'IP44'],
      ['Height', '380 mm each'],
    ],
  },
]

// ── Seller rebrand (existing seller1..5 accounts) ────────────────────────────

const SELLER_BRANDS: Record<number, { name: string; storeName: string; storeBio: string }> = {
  1: {
    name: 'Karim Haddad',
    storeName: 'SunCore Energy',
    storeBio: 'Tier-1 solar panels, inverters and power electronics. Engineer-owned, system-sized and warranty-backed — we design the array with you before you buy.',
  },
  2: {
    name: 'Layla Mansour',
    storeName: 'VoltVault Storage',
    storeBio: 'LiFePO4 batteries and home energy storage, from van-life packs to whole-home walls. Only cells with certified BMS and honest cycle-life data.',
  },
  3: {
    name: 'Omar Farouk',
    storeName: 'AgriSolar Solutions',
    storeBio: 'Solar water pumping for farms, homes and off-grid land. Submersible, borehole and surface pumps with the controllers and sizing help to make them run.',
  },
  4: {
    name: 'Nadia Rahim',
    storeName: 'HelioMount Hardware',
    storeBio: 'The unglamorous bits that hold systems together for 25 years: MPPT/PWM controllers, rails, clamps and cables. Structural-grade aluminium, nothing less.',
  },
  5: {
    name: 'Yusuf Amin',
    storeName: 'LumaRay Lighting',
    storeBio: 'Solar lighting that survives real weather — street, flood and garden. Specified by lumens and autonomy, not marketing watts.',
  },
}

// ── Reviews pool ─────────────────────────────────────────────────────────────

const REVIEW_POOL: [string, number, string[]][] = [
  ['maya@example.com', 4.5, [
    'Exceeded the spec sheet — output is consistently above rated on clear days.',
    'Shipping was quick and the packaging survived the courier. Would order again.',
    'Sizing help before the order was spot on. Running exactly as predicted.',
  ]],
  ['leo@example.com', 4.8, [
    'Installed two months ago, zero issues. Build quality is genuinely heavy-duty.',
    'The manual is actually useful — clear wiring diagrams and torque specs.',
    'Third purchase from this store. Consistent quality every time.',
  ]],
  ['sofia@example.com', 4.6, [
    'Great value for the capacity. Replaced my old lead-acids and the weight difference is unreal.',
    'Works exactly as described. The app/monitoring is a nice bonus.',
    'Delivery took a few extra days but the seller kept me updated the whole way.',
  ]],
  ['jamal@example.com', 4.7, [
    'Running it through a full season now — hot days, dust storms, no complaints.',
    'Solid construction, terminals/connectors are properly made, not chintzy.',
    'Bought a second unit after the first proved itself. Recommended.',
  ]],
  ['nina@example.com', 4.4, [
    'Does what it promises. Instructions could be clearer but support answered within hours.',
    'Good product at a fair price. The mounting hardware included was a pleasant surprise.',
    'So far so good — three months of daily use without a hiccup.',
  ]],
  ['demo@vendora.com', 4.9, [
    'Exactly as listed. Sizing matched my array perfectly and it just works.',
    'Seller is an engineer — answered every technical question before I bought.',
    'Very happy. Performance matches the datasheet within measurement error.',
  ]],
]

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🧹 Clearing old catalog data (solar pivot)...')

  await db.notification.deleteMany()
  await db.payment.deleteMany()
  await db.orderItem.deleteMany()
  await db.order.deleteMany()
  await db.quoteLine.deleteMany()
  await db.quote.deleteMany()
  await db.rfqLine.deleteMany()
  await db.rfq.deleteMany()
  await db.recurringRfq.deleteMany()
  await db.priceListEntry.deleteMany()
  await db.review.deleteMany()
  await db.favorite.deleteMany()
  await db.productVariant.deleteMany()
  await db.product.deleteMany()
  await db.category.deleteMany()
  // Old pictures wiped — EXCEPT media still referenced by B2B org
  // verification documents (AccountDocument attachments are documents, not
  // product pictures; deleting them would break the org verification demo).
  const referencedMediaIds = new Set(
    (await db.accountDocument.findMany({ select: { mediaId: true } })).map((d) => d.mediaId),
  )
  const keepMedia = await db.mediaAsset.findMany({
    where: { id: { in: [...referencedMediaIds] } },
    select: { id: true, key: true },
  })
  await db.mediaAsset.deleteMany({
    where: referencedMediaIds.size ? { id: { notIn: [...referencedMediaIds] } } : undefined,
  })
  console.log(
    `  old pictures cleared (${keepMedia.length} document-attachment assets kept: ${keepMedia.map((m) => m.key.split('/').pop()).join(', ')})`,
  )
  console.log('  old products/categories/orders/reviews/media cleared')

  // ── Categories ──
  const cats = await Promise.all(
    CATEGORIES.map((c) => db.category.create({ data: { name: c.name, slug: c.slug, icon: c.icon } })),
  )
  const catBySlug = Object.fromEntries(cats.map((c) => [c.slug, c.id]))
  console.log(`📂 ${cats.length} solar categories created`)

  // ── Ensure demo accounts exist (SEEDFIX-1) ──
  // The DB was purged of test accounts in past sessions, so the 5 sellers +
  // reviewer/buyer pool must be (re)created idempotently before the rebrand
  // update below can find them. Demo password for every seeded account:
  //   Vendora123!
  const DEMO_PASSWORD = hashPassword('Vendora123!')
  const SELLER_EMAILS = [1, 2, 3, 4, 5].map((n) => `seller${n}@vendora.com`)
  const BUYER_EMAILS = [
    'demo@vendora.com',
    'maya@example.com',
    'leo@example.com',
    'sofia@example.com',
    'jamal@example.com',
    'nina@example.com',
  ]
  for (const email of SELLER_EMAILS) {
    await db.user.upsert({
      where: { email },
      create: { email, password: DEMO_PASSWORD, name: email.split('@')[0], role: 'SELLER', status: 'ACTIVE' },
      update: {},
    })
  }
  for (const email of BUYER_EMAILS) {
    await db.user.upsert({
      where: { email },
      create: { email, password: DEMO_PASSWORD, name: email.split('@')[0], role: 'BUYER', status: 'ACTIVE' },
      update: {},
    })
  }
  console.log(`👥 ${SELLER_EMAILS.length} sellers + ${BUYER_EMAILS.length} buyers ensured (password: Vendora123!)`)

  // ── Sellers rebrand ──
  const sellers: Record<number, { id: string; storeName: string }> = {}
  for (const n of [1, 2, 3, 4, 5] as const) {
    const email = `seller${n}@vendora.com`
    const brand = SELLER_BRANDS[n]
    const u = await db.user.update({
      where: { email },
      data: { name: brand.name, storeName: brand.storeName, storeBio: brand.storeBio },
    })
    sellers[n] = { id: u.id, storeName: brand.storeName }
  }
  console.log('👥 5 seller stores rebranded to solar brands')

  const admin = await db.user.findFirst({ where: { email: 'admin@vendora.com' } })
  if (!admin) throw new Error('admin@vendora.com not found')

  // ── Push generated images through the storage pipeline ──
  const files = readdirSync(IMG_DIR).filter((f) => f.endsWith('.png') && f !== 'state.json')
  console.log(`🖼  pushing ${files.length} images through the storage pipeline...`)
  if (files.length < 30) throw new Error(`only ${files.length}/30 images generated — run generate-solar-images.ts first`)

  const urlByImage = new Map<string, string>()
  const fullByImage = new Map<string, string>()
  let processed = 0
  for (const file of files) {
    const buffer = readFileSync(`${IMG_DIR}/${file}`)
    const sha256 = createHash('sha256').update(buffer).digest('hex')
    const processedImg = await processImageUpload(buffer)
    await db.mediaAsset.create({
      data: {
        key: processedImg.baseKey,
        originalName: file,
        mime: processedImg.mime,
        size: processedImg.originalBytes,
        width: processedImg.width,
        height: processedImg.height,
        sha256,
        variants: JSON.stringify(processedImg.variants),
        uploadedById: admin.id,
      },
    })
    urlByImage.set(file, mediaUrl(processedImg.variants.medium))
    fullByImage.set(file, mediaUrl(processedImg.variants.full))
    processed++
    if (processed % 10 === 0) console.log(`  ${processed} images processed`)
  }
  console.log(`  ${processed} media assets registered`)

  // ── Products ──
  console.log('📦 creating solar products...')
  const createdProducts: { id: string; title: string; sellerId: string; price: number; image: string; stock: number }[] = []
  for (const p of PRODUCTS) {
    const img = urlByImage.get(p.image)
    if (!img) throw new Error(`no processed image for ${p.image}`)
    const created = await db.product.create({
      data: {
        title: p.title,
        description: p.description,
        price: p.price,
        compareAtPrice: p.compareAtPrice ?? null,
        images: JSON.stringify([img]),
        categoryId: catBySlug[p.category],
        sellerId: sellers[p.seller].id,
        stock: p.stock,
        soldCount: p.soldCount,
        featured: p.featured ?? false,
        sku: p.sku,
        highlights: JSON.stringify(p.highlights),
        specs: JSON.stringify(p.specs.map(([label, value]) => ({ label, value }))),
        slug: p.sku.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        metaTitle: p.title,
        metaDescription: p.description.slice(0, 155),
        processingDays: 2,
        freeShipping: p.price >= 100,
        status: 'ACTIVE',
        createdAt: daysAgo(p.createdAt),
        updatedAt: daysAgo(p.createdAt),
      },
    })
    createdProducts.push({
      id: created.id,
      title: created.title,
      sellerId: created.sellerId,
      price: p.price,
      image: img,
      stock: p.stock,
    })
  }
  console.log(`  ${createdProducts.length} solar products live`)

  // ── Shared catalog: company orgs + product offers (SEEDFIX-2) ──
  // The C2C-retirement model: "stores" are companies (Organization,
  // orgType=COMPANY, status=ACTIVE) selling via ProductOffer rows on the
  // shared catalog. One org per seller brand, seller as OWNER member, one
  // ACTIVE offer per product — makes the homepage "engineer-owned stores"
  // stat count real companies instead of 0.
  console.log('🏢 seeding company orgs + shared-catalog offers...')
  let offerCount = 0
  for (const n of [1, 2, 3, 4, 5] as const) {
    const brand = SELLER_BRANDS[n]
    const slug = brand.storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const org = await db.organization.upsert({
      where: { slug },
      create: {
        name: brand.storeName,
        slug,
        orgType: 'COMPANY',
        status: 'ACTIVE',
        verifiedAt: new Date(),
        industry: 'Renewable Energy Equipment',
      },
      update: { status: 'ACTIVE', name: brand.storeName },
    })
    await db.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: org.id, userId: sellers[n].id } },
      create: { organizationId: org.id, userId: sellers[n].id, role: 'OWNER', jobTitle: 'Founder & Lead Engineer' },
      update: { role: 'OWNER' },
    })
    const sellerProducts = createdProducts.filter((p) => p.sellerId === sellers[n].id)
    for (const p of sellerProducts) {
      await db.productOffer.upsert({
        where: { productId_sellerId: { productId: p.id, sellerId: sellers[n].id } },
        create: {
          productId: p.id,
          sellerId: sellers[n].id,
          sellerOrgId: org.id,
          price: p.price,
          stock: p.stock,
          sku: `OF-${p.title.slice(0, 12).toUpperCase().replace(/[^A-Z0-9]/g, '')}`,
          freeShipping: p.price >= 100,
          processingDays: 2,
          status: 'ACTIVE',
          soldCount: Math.round(p.price * 7) % 200,
        },
        update: { sellerOrgId: org.id, price: p.price, stock: p.stock, status: 'ACTIVE' },
      })
      offerCount++
    }
  }
  console.log(`  5 company orgs + ${offerCount} ACTIVE shared-catalog offers live`)

  // ── Reviews ──
  console.log('⭐ seeding reviews...')
  const reviewers = await db.user.findMany({ where: { email: { in: REVIEW_POOL.map((r) => r[0]) } } })
  const reviewerByEmail = Object.fromEntries(reviewers.map((u) => [u.email, u]))
  let reviewCount = 0
  for (let i = 0; i < createdProducts.length; i++) {
    const product = createdProducts[i]
    const nReviews = 3 + ((i * 7) % 3) // 3–5 reviews per product
    for (let r = 0; r < nReviews; r++) {
      const [email, base, comments] = REVIEW_POOL[(i + r) % REVIEW_POOL.length]
      const reviewer = reviewerByEmail[email]
      if (!reviewer) continue
      // Deterministic pseudo-random rating 4..5 with one 3-star every ~9th
      const rating = (i * 5 + r * 3) % 9 === 0 ? 3 : Math.min(5, Math.round(base + ((i + r) % 3) - 1))
      await db.review.create({
        data: {
          productId: product.id,
          userId: reviewer.id,
          rating,
          comment: comments[r % comments.length],
          verified: r % 2 === 0,
          createdAt: daysAgo(((i * 3 + r * 2) % 50) + 2, 14),
        },
      })
      reviewCount++
    }
  }
  // Recalculate product aggregate rating/reviewCount
  for (const product of createdProducts) {
    const agg = await db.review.aggregate({
      where: { productId: product.id },
      _avg: { rating: true },
      _count: { _all: true },
    })
    await db.product.update({
      where: { id: product.id },
      data: { rating: Math.round((agg._avg.rating ?? 0) * 10) / 10, reviewCount: agg._count._all },
    })
  }
  console.log(`  ${reviewCount} reviews created`)

  // ── Demo orders ──
  console.log('🛒 seeding demo orders...')
  const buyers = await db.user.findMany({ where: { email: { in: ['demo@vendora.com', 'maya@example.com', 'leo@example.com', 'jamal@example.com'] } } })
  const addresses = [
    { fullName: 'Alex Rivera', address: '14 Sunbeam Lane', city: 'Riyadh', country: 'Saudi Arabia', zip: '12345', phone: '+966 55 000 0001' },
    { fullName: 'Maya Chen', address: '88 Solaris Street', city: 'Jeddah', country: 'Saudi Arabia', zip: '23456', phone: '+966 55 000 0002' },
    { fullName: 'Leo Park', address: '5 Helios Avenue', city: 'Dammam', country: 'Saudi Arabia', zip: '34567', phone: '+966 55 000 0003' },
    { fullName: 'Jamal Carter', address: '221 Photon Road', city: 'Abha', country: 'Saudi Arabia', zip: '45678', phone: '+966 55 000 0004' },
  ]
  const statuses = ['DELIVERED', 'DELIVERED', 'SHIPPED', 'PROCESSING', 'PAID']
  let orderCount = 0
  for (let i = 0; i < 14; i++) {
    const buyer = buyers[i % buyers.length]
    const addr = addresses[i % addresses.length]
    const items: { productId: string; sellerId: string; quantity: number; price: number; title: string; image: string | null }[] = []
    const nItems = 1 + (i % 3)
    for (let j = 0; j < nItems; j++) {
      const p = createdProducts[(i * 3 + j * 5) % createdProducts.length]
      if (items.some((it) => it.productId === p.id)) continue
      items.push({
        productId: p.id,
        sellerId: p.sellerId,
        quantity: 1 + ((i + j) % 3),
        price: p.price,
        title: p.title,
        image: p.image,
      })
    }
    if (!items.length) continue
    const total = items.reduce((s, it) => s + it.quantity * it.price, 0)
    await db.order.create({
      data: {
        buyerId: buyer.id,
        total: Math.round(total * 100) / 100,
        status: statuses[i % statuses.length],
        fullName: addr.fullName,
        address: addr.address,
        city: addr.city,
        country: addr.country,
        zip: addr.zip,
        phone: addr.phone,
        createdAt: daysAgo((i * 4) % 60 + 1, 11 + (i % 6)),
        items: { create: items },
      },
    })
    orderCount++
  }
  console.log(`  ${orderCount} demo orders created`)

  // ── Banners ──
  console.log('🖼  rewriting hero banners...')
  const bannerDefs = [
    {
      eyebrow: 'Renewable Energy Marketplace',
      title: 'Power everything with sunlight',
      subtitle: 'Tier-1 solar panels, LiFePO4 storage, inverters and pumping — from engineer-owned stores that size systems properly.',
      image: 'banner-main.png',
      ctaLabel: 'Shop solar panels',
      ctaView: 'catalog',
      ctaCategory: 'solar-panels',
    },
    {
      eyebrow: 'High-efficiency panels',
      title: 'Monocrystalline & bifacial, up to 550W',
      subtitle: '25–30 year warranties, half-cut PERC cells and glass-glass construction for decades of harvest.',
      image: 'banner-panels.png',
      ctaLabel: 'Browse panels',
      ctaView: 'catalog',
      ctaCategory: 'solar-panels',
    },
    {
      eyebrow: 'Batteries & storage',
      title: 'Store the sun, use it at night',
      subtitle: 'Modular wall batteries from 5kWh to 20kWh — stack them as your system grows.',
      image: 'banner-storage.png',
      ctaLabel: 'Shop storage',
      ctaView: 'catalog',
      ctaCategory: 'batteries-storage',
    },
    {
      eyebrow: 'Solar water pumping',
      title: 'Pump water anywhere the sun shines',
      subtitle: 'Submersible, borehole and irrigation pumps that run straight from your array — no fuel, no grid.',
      image: 'banner-pumps.png',
      ctaLabel: 'Shop pumps',
      ctaView: 'catalog',
      ctaCategory: 'solar-pumps',
    },
  ]
  await db.bannerSlide.deleteMany()
  let pos = 0
  for (const b of bannerDefs) {
    const img = fullByImage.get(b.image)
    if (!img) throw new Error(`no banner image for ${b.image}`)
    await db.bannerSlide.create({
      data: {
        eyebrow: b.eyebrow,
        title: b.title,
        subtitle: b.subtitle,
        image: img,
        ctaLabel: b.ctaLabel,
        ctaView: b.ctaView,
        ctaCategory: b.ctaCategory,
        position: pos++,
        active: true,
      },
    })
  }
  console.log(`  ${pos} solar banners live`)

  // ── Storefront settings: solar branding + sample images ──
  console.log('⚙️  updating storefront settings...')
  const storefront = await db.platformSetting.findFirst({ where: { key: 'storefront' } })
  if (storefront) {
    const value = JSON.parse(String(storefront.value)) as {
      general?: { siteName?: string; tagline?: string; announcementEnabled?: boolean; announcementText?: string; sampleImages?: string[] }
    }
    value.general = {
      ...value.general,
      siteName: 'Vendora',
      tagline: 'The solar energy marketplace — panels, storage, inverters and pumps from stores that size systems properly.',
      announcementEnabled: true,
      announcementText: 'Free shipping on orders over $100 · Engineer-reviewed solar gear · Use code SUN10 for 10% off your first array',
      sampleImages: PRODUCTS.slice(0, 8).map((p) => urlByImage.get(p.image)!).filter(Boolean),
    }
    await db.platformSetting.update({ where: { key: 'storefront' }, data: { value: JSON.stringify(value) } })
    console.log('  storefront rebranded to solar')
  }

  // ── Refresh seed-data images.json for future reseeds ──
  const seedImages: Record<string, string[]> = {}
  for (const p of await db.product.findMany({ select: { title: true, images: true } })) {
    try {
      const arr = typeof p.images === 'string' ? (JSON.parse(p.images) as string[]) : []
      if (arr.length) seedImages[p.title] = arr
    } catch {
      /* skip malformed */
    }
  }
  await writeFile('scripts/seed-data/images.json', JSON.stringify(seedImages, null, 2))
  await writeFile('db/images.json', JSON.stringify(seedImages, null, 2))
  console.log('📝 seed-data images refreshed')

  console.log('✅ SOLAR PIVOT COMPLETE')
}

main()
  .catch(async (e) => {
    console.error('FATAL', e)
    await db.$disconnect().catch(() => {})
    process.exit(1)
  })
  .finally(() => db.$disconnect())
