/**
 * FULL-SYSTEM DEMO SEED — one command restores the complete demo state
 * (B2C catalog + B2B foundation + B2B demo data) after any reset.
 *
 * Idempotent: truncates ALL tables in FK-safe order, then rebuilds.
 * Not for production environments with real data.
 *
 * Usage:
 *   bun scripts/seed-demo.ts        (DATABASE_URL from .env — SQLite file db/custom.db)
 *
 * Restores the demo state documented in worklog entries B2B-1 / 5-a / 5-b:
 *   Accounts
 *     admin@vendora.com / admin1234            (ADMIN)
 *     demo@vendora.com  / demo1234             (BUYER, owner of Acme Trading Co)
 *     seller1..5@vendora.com / seller1234       (SELLERS)
 *     casey@vendora.com / demo1234             (BUYER, Acme APPROVER)
 *     riley@vendora.com / demo1234             (BUYER, Acme BUYER member)
 *   B2B demo
 *     Acme Trading Co (ACTIVE, NET-45, $75,000 credit, $500 approval
 *     threshold) mapped to Wholesale Tier 1; group + org contract price lists
 *     with qty ladders; 5 RFQs across the state machine incl. one ACCEPTED
 *     with two competing quotes and one open QUOTED quote ($920 NET-30) the
 *     buyer can accept.
 */
import { PrismaClient, Prisma } from '@prisma/client'
import { randomBytes, scryptSync } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'

const db = new PrismaClient()

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

const SEED_DIR = join(__dirname, 'seed-data')
const images = JSON.parse(readFileSync(join(SEED_DIR, 'images.json'), 'utf-8')) as Record<
  string,
  string[]
>
const alt = JSON.parse(readFileSync(join(SEED_DIR, 'images-alt.json'), 'utf-8')) as Record<
  string,
  string
>

function daysAgo(n: number, hour = 10): Date {
  const d = new Date()
  d.setHours(hour, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return d
}

function daysFromNow(n: number, hour = 18): Date {
  const d = new Date()
  d.setHours(hour, 0, 0, 0)
  d.setDate(d.getDate() + n)
  return d
}

async function main() {
  console.log('🧹 Clearing existing data (FK-safe order)...')
  await db.auditLog.deleteMany()
  await db.approvalRequest.deleteMany()
  await db.quoteLine.deleteMany()
  await db.quote.deleteMany()
  await db.rfqLine.deleteMany()
  await db.rfq.deleteMany()
  await db.orderItem.deleteMany()
  await db.order.deleteMany()
  await db.priceListEntry.deleteMany()
  await db.priceList.deleteMany()
  await db.organizationMember.deleteMany()
  await db.organization.deleteMany()
  await db.review.deleteMany()
  await db.favorite.deleteMany()
  await db.product.deleteMany()
  await db.category.deleteMany()
  await db.coupon.deleteMany()
  await db.sequence.deleteMany()
  await db.customerGroup.deleteMany()
  await db.user.deleteMany()

  // ─────────────────────────────────────────────────────────────────
  // 1. B2C foundation — users, categories, products, reviews, orders
  // ─────────────────────────────────────────────────────────────────
  console.log('👥 Creating users...')
  const admin = await db.user.create({
    data: {
      name: 'Vendora Admin',
      email: 'admin@vendora.com',
      password: hashPassword('admin1234'),
      role: 'ADMIN',
    },
  })
  const [techNest, urbanThread, casaVerde, peakForm, wildbloom] = await Promise.all([
    db.user.create({
      data: {
        name: 'Daniel Reyes',
        email: 'seller1@vendora.com',
        password: hashPassword('seller1234'),
        role: 'SELLER',
        storeName: 'TechNest',
        storeBio:
          'Curated audio, wearables and everyday tech. Tested by nerds, loved by everyone. Free 2-year warranty on all gear.',
      },
    }),
    db.user.create({
      data: {
        name: 'Ava Thompson',
        email: 'seller2@vendora.com',
        password: hashPassword('seller1234'),
        role: 'SELLER',
        storeName: 'UrbanThread Co.',
        storeBio:
          'Street-ready staples and timeless classics. Small-batch fashion with a conscience — organic fabrics, fair factories.',
      },
    }),
    db.user.create({
      data: {
        name: 'Marco Silva',
        email: 'seller3@vendora.com',
        password: hashPassword('seller1234'),
        role: 'SELLER',
        storeName: 'Casa Verde Home',
        storeBio:
          'Warm, minimal homeware for slow living. Sustainably sourced materials, designed to last decades not seasons.',
      },
    }),
    db.user.create({
      data: {
        name: 'Jade Miller',
        email: 'seller4@vendora.com',
        password: hashPassword('seller1234'),
        role: 'SELLER',
        storeName: 'PeakForm Gear',
        storeBio:
          'Equipment for people who move. From gym floors to mountain trails — gear that keeps up with you.',
      },
    }),
    db.user.create({
      data: {
        name: 'Luna Okafor',
        email: 'seller5@vendora.com',
        password: hashPassword('seller1234'),
        role: 'SELLER',
        storeName: 'Wildbloom Studio',
        storeBio:
          'Hand-poured candles, botanical skincare and one-of-a-kind crafts, made in small batches from our sunlit studio.',
      },
    }),
  ])
  const buyer = await db.user.create({
    data: {
      name: 'Alex Rivera',
      email: 'demo@vendora.com',
      password: hashPassword('demo1234'),
      role: 'BUYER',
    },
  })
  const casey = await db.user.create({
    data: {
      name: 'Casey Tester',
      email: 'casey@vendora.com',
      password: hashPassword('demo1234'),
      role: 'BUYER',
    },
  })
  // Riley Chen — Acme BUYER member (demo of the purchase-approval workflow:
  // her orders ≥ approvalThreshold route to Casey/owner for approval)
  const riley = await db.user.create({
    data: {
      name: 'Riley Chen',
      email: 'riley@vendora.com',
      password: hashPassword('demo1234'),
      role: 'BUYER',
    },
  })
  const reviewerPool = await Promise.all(
    [
      { name: 'Maya Chen', email: 'maya@example.com' },
      { name: 'Leo Park', email: 'leo@example.com' },
      { name: 'Sofia Bennett', email: 'sofia@example.com' },
      { name: 'Jamal Carter', email: 'jamal@example.com' },
      { name: 'Nina Kovacs', email: 'nina@example.com' },
    ].map((u) => db.user.create({ data: { ...u, password: hashPassword('demo1234'), role: 'BUYER' } }))
  )
  const allReviewers = [buyer, ...reviewerPool]

  console.log('📂 Creating categories...')
  const categories = await Promise.all(
    [
      { name: 'Electronics', slug: 'electronics', icon: 'Cpu' },
      { name: 'Fashion', slug: 'fashion', icon: 'Shirt' },
      { name: 'Home & Living', slug: 'home-living', icon: 'Lamp' },
      { name: 'Sports & Outdoors', slug: 'sports-outdoors', icon: 'Dumbbell' },
      { name: 'Beauty & Wellness', slug: 'beauty-wellness', icon: 'Sparkles' },
      { name: 'Handmade & Crafts', slug: 'handmade-crafts', icon: 'Palette' },
    ].map((c) => db.category.create({ data: c }))
  )
  const cat = Object.fromEntries(categories.map((c) => [c.slug, c.id]))

  console.log('📦 Creating products...')
  type P = {
    title: string
    description: string
    price: number
    compareAtPrice?: number
    images: string[]
    category: string
    seller: string
    stock: number
    soldCount: number
    featured?: boolean
    createdAt: Date
  }
  const products: P[] = [
    // Electronics — TechNest
    {
      title: 'Aura Wireless Noise-Cancelling Headphones',
      description:
        'Immersive over-ear headphones with hybrid active noise cancellation, 40-hour battery life and plush memory-foam cushions. Multipoint Bluetooth 5.3 lets you switch between devices seamlessly. USB-C fast charge gives you 5 hours of playback in just 10 minutes.',
      price: 189.99,
      compareAtPrice: 249.99,
      images: [images.electronics[0], alt.headphones],
      category: cat['electronics'],
      seller: techNest.id,
      stock: 24,
      soldCount: 312,
      featured: true,
      createdAt: daysAgo(60),
    },
    {
      title: 'Pulse Smartwatch Series 5',
      description:
        'Track heart rate, SpO2, sleep stages and 120+ workout modes on a bright 1.9" AMOLED display. Water-resistant to 50m with a 14-day battery. Includes GPS, wireless charging and interchangeable straps.',
      price: 149.0,
      images: [images.electronics[1], alt.smartwatch],
      category: cat['electronics'],
      seller: techNest.id,
      stock: 40,
      soldCount: 208,
      featured: true,
      createdAt: daysAgo(45),
    },
    {
      title: 'Lumo 4K Action Camera',
      description:
        'Rock-steady 4K60 video with horizon leveling, built for adventures. Waterproof to 10m without a case, with dual touchscreens and electronic image stabilization. Ships with a full mounting accessory kit.',
      price: 249.5,
      compareAtPrice: 299.0,
      images: [images.electronics[2]],
      category: cat['electronics'],
      seller: techNest.id,
      stock: 15,
      soldCount: 96,
      createdAt: daysAgo(38),
    },
    {
      title: 'Echo Pocket Bluetooth Speaker',
      description:
        'Room-filling 360° sound from a speaker that fits in your palm. IPX7 waterproof, 18-hour playtime and stereo pairing. The rugged fabric shell survives drops, splashes and beach days.',
      price: 59.99,
      compareAtPrice: 79.99,
      images: [images.electronics[3]],
      category: cat['electronics'],
      seller: techNest.id,
      stock: 60,
      soldCount: 421,
      featured: true,
      createdAt: daysAgo(52),
    },
    {
      title: 'Nimbus RGB Mechanical Keyboard',
      description:
        'Hot-swappable tactile brown switches, per-key RGB and an aircraft-grade aluminum frame. Gasket-mounted for a softer typing feel with sound-dampening foam. Wired and 2.4GHz wireless modes included.',
      price: 99.0,
      images: [images.electronics[4], alt.mech_keyboard],
      category: cat['electronics'],
      seller: techNest.id,
      stock: 30,
      soldCount: 154,
      createdAt: daysAgo(30),
    },
    // Fashion — UrbanThread
    {
      title: 'Stride One Running Sneakers',
      description:
        'Featherlight knit uppers with responsive foam midsoles that return energy with every step. Engineered mesh keeps feet cool, and the carbon-rubber outsole grips wet pavement. Weighs just 235g.',
      price: 129.0,
      compareAtPrice: 159.0,
      images: [images.fashion[0], alt.sneakers],
      category: cat['fashion'],
      seller: urbanThread.id,
      stock: 35,
      soldCount: 267,
      featured: true,
      createdAt: daysAgo(42),
    },
    {
      title: 'Vintage-Wash Denim Trucker Jacket',
      description:
        'A timeless classic in 12oz selvedge denim with a lived-in vintage wash. Reinforced seams, brass hardware and a comfortable relaxed fit that layers over everything. Ages beautifully with wear.',
      price: 89.5,
      images: [images.fashion[1]],
      category: cat['fashion'],
      seller: urbanThread.id,
      stock: 18,
      soldCount: 143,
      createdAt: daysAgo(35),
    },
    {
      title: 'Aviator Classic Sunglasses UV400',
      description:
        'Iconic teardrop silhouette with polarized UV400 lenses that cut glare without dulling color. Lightweight metal frame with adjustable silicone nose pads. Includes a leather hard case and microfiber cloth.',
      price: 45.0,
      compareAtPrice: 65.0,
      images: [images.fashion[2]],
      category: cat['fashion'],
      seller: urbanThread.id,
      stock: 50,
      soldCount: 389,
      featured: true,
      createdAt: daysAgo(48),
    },
    {
      title: 'Canvas Traveler Backpack 28L',
      description:
        'Waxed canvas exterior with a padded 16" laptop sleeve and water-resistant YKK zippers. Twelve organized pockets, a hidden anti-theft compartment and a luggage pass-through strap for travel days.',
      price: 65.0,
      images: [images.fashion[3]],
      category: cat['fashion'],
      seller: urbanThread.id,
      stock: 28,
      soldCount: 198,
      createdAt: daysAgo(26),
    },
    {
      title: 'Merino Wool Beanie',
      description:
        'Buttery-soft 100% merino wool that regulates temperature and never itches. Ribbed double-layer cuff keeps ears warm without the bulk. Machine washable and available in six earthy tones.',
      price: 25.0,
      images: [images.fashion[4]],
      category: cat['fashion'],
      seller: urbanThread.id,
      stock: 70,
      soldCount: 452,
      createdAt: daysAgo(20),
    },
    // Home & Living — Casa Verde
    {
      title: 'Halo Adjustable Desk Lamp',
      description:
        'Sculptural task lighting with stepless dimming from warm 2700K to crisp 5000K. The counterbalanced arm glides to any position and stays there. Built-in USB-C port charges your phone while you work.',
      price: 79.0,
      compareAtPrice: 95.0,
      images: [images.home[0], alt.desk_lamp],
      category: cat['home-living'],
      seller: casaVerde.id,
      stock: 22,
      soldCount: 178,
      featured: true,
      createdAt: daysAgo(33),
    },
    {
      title: 'Terra Ceramic Vase Set of 3',
      description:
        'Hand-thrown stoneware vases in graduated sizes with a matte terracotta finish. Each piece is food-safe glazed inside and varies subtly — no two sets are identical. Perfect for dried botanicals or fresh stems.',
      price: 42.0,
      images: [images.home[1]],
      category: cat['home-living'],
      seller: casaVerde.id,
      stock: 16,
      soldCount: 87,
      createdAt: daysAgo(28),
    },
    {
      title: 'Linen Throw Pillow Covers (Set of 4)',
      description:
        'Stone-washed European flax linen with hidden zippers and a relaxed, lived-in texture. Covers only — fits 18x18" inserts. Gets softer with every wash.',
      price: 34.99,
      images: [images.home[2]],
      category: cat['home-living'],
      seller: casaVerde.id,
      stock: 45,
      soldCount: 231,
      createdAt: daysAgo(22),
    },
    {
      title: 'Artisan Stoneware Mug Set of 6',
      description:
        'Chunky 12oz mugs with a reactive glaze that pools differently on every piece. Dishwasher and microwave safe, stackable, and comfortable to hold with a generous handle. Speckled clay body fired at 1240°C.',
      price: 38.5,
      images: [images.home[3]],
      category: cat['home-living'],
      seller: casaVerde.id,
      stock: 33,
      soldCount: 164,
      createdAt: daysAgo(25),
    },
    {
      title: 'Solid Oak Floating Wall Shelf',
      description:
        'Kiln-dried white oak with a natural oil finish and concealed steel brackets that make it float. Holds up to 30lb when mounted into studs. 24" length, 6" depth, 1.75" thick.',
      price: 54.0,
      images: [images.home[4]],
      category: cat['home-living'],
      seller: casaVerde.id,
      stock: 25,
      soldCount: 112,
      createdAt: daysAgo(18),
    },
    // Sports — PeakForm
    {
      title: 'GripPro Yoga Mat 6mm',
      description:
        'Closed-cell TPE mat with an alignment grid and dual-texture grip that sticks even in hot yoga. 6mm cushioning protects knees without wobbling in balance poses. Comes with a carry strap.',
      price: 49.0,
      compareAtPrice: 59.0,
      images: [images.sports[0], alt.yoga_mat],
      category: cat['sports-outdoors'],
      seller: peakForm.id,
      stock: 42,
      soldCount: 298,
      featured: true,
      createdAt: daysAgo(40),
    },
    {
      title: 'IronCore Adjustable Dumbbell 24kg',
      description:
        'Replace fifteen dumbbells with one. Dial-adjust from 2.5kg to 24kg in 2.5kg increments with a satisfying click-lock system. Knurled steel handle and space-saving cradle included.',
      price: 159.0,
      images: [images.sports[1]],
      category: cat['sports-outdoors'],
      seller: peakForm.id,
      stock: 12,
      soldCount: 76,
      createdAt: daysAgo(31),
    },
    {
      title: 'Carbon Pro Tennis Racket',
      description:
        'Full graphite frame at 300g with a 100 sq.in head — the sweet spot between power and control. Pre-strung with synthetic gut and a tacky replacement grip. Includes a full-length cover.',
      price: 119.0,
      images: [images.sports[2]],
      category: cat['sports-outdoors'],
      seller: peakForm.id,
      stock: 9,
      soldCount: 54,
      createdAt: daysAgo(24),
    },
    {
      title: 'Trailblazer Waterproof Hiking Boots',
      description:
        'Gusseted tongue, sealed seams and a lugged Vibram-style outsole that bites into mud and scree. Moisture-wicking lining and a rock plate underfoot for all-day trail comfort. Breaks in within a week.',
      price: 139.99,
      compareAtPrice: 169.99,
      images: [images.sports[3]],
      category: cat['sports-outdoors'],
      seller: peakForm.id,
      stock: 20,
      soldCount: 187,
      createdAt: daysAgo(29),
    },
    // Beauty — Wildbloom
    {
      title: 'Glow Ritual Skincare Set',
      description:
        'A four-step routine: gentle gel cleanser, vitamin-C serum, hyaluronic essence and ceramide moisturizer. Clean formulations without parabens or synthetic fragrance, suitable for all skin types. Dermatologist tested.',
      price: 68.0,
      images: [images.beauty[0], alt.skincare_set],
      category: cat['beauty-wellness'],
      seller: wildbloom.id,
      stock: 26,
      soldCount: 243,
      featured: true,
      createdAt: daysAgo(36),
    },
    {
      title: 'Amber Musk Eau de Parfum 50ml',
      description:
        'Warm amber, soft musk and a whisper of vanilla over a cedar base. A skin scent that lingers close — office-safe, evening-ready. Hand-blended in small batches with 18% fragrance concentration.',
      price: 85.0,
      images: [images.beauty[1]],
      category: cat['beauty-wellness'],
      seller: wildbloom.id,
      stock: 14,
      soldCount: 121,
      createdAt: daysAgo(27),
    },
    {
      title: 'Botanical Bath Bombs Gift Set',
      description:
        'Six hand-pressed bath bombs with real flower petals, cocoa butter and pure essential oils. Each one fizzes for a full five minutes and leaves skin silky. Beautifully boxed — ready to gift.',
      price: 29.0,
      images: [images.beauty[2]],
      category: cat['beauty-wellness'],
      seller: wildbloom.id,
      stock: 55,
      soldCount: 376,
      createdAt: daysAgo(19),
    },
    // Handmade — Wildbloom
    {
      title: 'Soy Wax Candle — Lavender Fields',
      description:
        'Hand-poured 100% soy wax with French lavender and a crackling wood wick. 45-hour burn time in a reusable amber glass jar with a brass lid. Phthalate-free fragrance, cotton wick, clean burn.',
      price: 22.0,
      images: [images.handmade[0], alt.soy_candle],
      category: cat['handmade-crafts'],
      seller: wildbloom.id,
      stock: 60,
      soldCount: 534,
      createdAt: daysAgo(44),
    },
    {
      title: 'Handwoven Jute Storage Basket',
      description:
        'Chunky jute rope coiled by hand into a sturdy 14" basket with integrated handles. Perfect for throws, toys or plant covers. Neutral tone that fits any room, reinforced base holds its shape.',
      price: 36.0,
      images: [images.handmade[1]],
      category: cat['handmade-crafts'],
      seller: wildbloom.id,
      stock: 18,
      soldCount: 92,
      createdAt: daysAgo(21),
    },
    {
      title: 'Macramé Wall Hanging — Boho Decor',
      description:
        'Two days of knotting in every piece — 100% cotton cord on a foraged driftwood branch. Approximately 24" wide by 36" long. Lightweight and ready to hang with an attached dowel loop.',
      price: 48.0,
      images: [images.handmade[2]],
      category: cat['handmade-crafts'],
      seller: wildbloom.id,
      stock: 11,
      soldCount: 68,
      createdAt: daysAgo(16),
    },
    {
      title: 'Handmade Walnut Phone Dock',
      description:
        'Solid black walnut dock with an integrated cable channel and felt-lined cradle that cradles your phone without scratches. Finished with food-safe hardwax oil. Fits all phones with or without thin cases.',
      price: 32.0,
      images: [images.handmade[3]],
      category: cat['handmade-crafts'],
      seller: wildbloom.id,
      stock: 27,
      soldCount: 149,
      createdAt: daysAgo(13),
    },
  ]

  const createdProducts: { id: string; title: string; price: number; sellerId: string; images: string }[] = []
  for (const p of products) {
    const { category, seller, ...rest } = p
    const created = await db.product.create({
      data: {
        ...rest,
        compareAtPrice: rest.compareAtPrice ?? null,
        images: JSON.stringify(rest.images),
        categoryId: category,
        sellerId: seller,
      },
    })
    createdProducts.push({
      id: created.id,
      title: created.title,
      price: created.price,
      sellerId: created.sellerId,
      images: created.images,
    })
  }

  // ── Product-form demo data: variants + commerce details (RESTORE-2) ──
  // Demonstrates the restored 7-tab product form end-to-end in the storefront.
  interface VariantSeed {
    name: string
    options: Record<string, string>
    price: number | null
    compareAtPrice: number | null
    stock: number
    sku: string | null
  }
  const formDemo: {
    match: string
    fields: Record<string, unknown>
    variants?: VariantSeed[]
  }[] = [
    {
      match: 'Aura Wireless Noise-Cancelling Headphones',
      fields: {
        sku: 'AURA-NC-BASE',
        highlights: [
          'Hybrid active noise cancellation with transparency mode',
          '40-hour battery life, 5 hours from a 10-minute fast charge',
          'Multipoint Bluetooth 5.3 — connect two devices at once',
          'Plush memory-foam cushions for all-day comfort',
        ],
        specs: [
          { label: 'Driver', value: '40 mm dynamic' },
          { label: 'Battery', value: '40 h (ANC on)' },
          { label: 'Charging', value: 'USB-C, 10 min = 5 h' },
          { label: 'Bluetooth', value: '5.3 multipoint' },
          { label: 'Folded size', value: '18 × 16 × 8 cm' },
        ],
        materials: 'Recycled aluminium frame, protein leather cushions',
        care: 'Wipe cushions with a dry cloth; store in the included case',
        weightGrams: 252,
        lengthCm: 18,
        widthCm: 16,
        heightCm: 8,
        processingDays: 1,
        freeShipping: true,
        shippingPolicy: 'Ships same business day for orders before 2pm. Free 30-day returns.',
        slug: 'aura-wireless-noise-cancelling-headphones',
        metaTitle: 'Aura Wireless Noise-Cancelling Headphones — 40h Battery',
        metaDescription:
          'Hybrid ANC over-ear headphones with 40-hour battery, multipoint Bluetooth 5.3 and USB-C fast charging. Free shipping.',
      },
      variants: [
        { name: 'Black / Standard', options: { Color: 'Black', Bundle: 'Standard' }, price: 189.99, compareAtPrice: null, stock: 9, sku: 'AURA-BLK-STD' },
        { name: 'Black / Travel case', options: { Color: 'Black', Bundle: 'Travel case' }, price: 209.99, compareAtPrice: 249.99, stock: 6, sku: 'AURA-BLK-TRV' },
        { name: 'Silver / Standard', options: { Color: 'Silver', Bundle: 'Standard' }, price: 189.99, compareAtPrice: null, stock: 7, sku: 'AURA-SLV-STD' },
        { name: 'Silver / Travel case', options: { Color: 'Silver', Bundle: 'Travel case' }, price: 209.99, compareAtPrice: null, stock: 4, sku: 'AURA-SLV-TRV' },
      ],
    },
    {
      match: 'Stride One Running Sneakers',
      fields: {
        sku: 'STRD-ONE-BASE',
        highlights: [
          'Featherlight knit upper — just 235g per shoe',
          'Responsive foam midsole returns energy with every stride',
          'Carbon-rubber outsole grips wet pavement',
          'Engineered mesh keeps feet cool on long runs',
        ],
        specs: [
          { label: 'Weight', value: '235 g (EU 42)' },
          { label: 'Drop', value: '8 mm' },
          { label: 'Upper', value: 'Engineered knit' },
          { label: 'Outsole', value: 'Carbon rubber' },
        ],
        materials: 'Engineered knit upper, recycled foam midsole',
        care: 'Machine wash cold in a laundry bag, air dry away from sun',
        weightGrams: 470,
        lengthCm: 32,
        widthCm: 22,
        heightCm: 12,
        processingDays: 2,
        freeShipping: false,
        shippingFee: 4.99,
        shippingPolicy: 'Ships within 2 business days. Free returns within 30 days on unworn pairs.',
        slug: 'stride-one-running-sneakers',
        metaTitle: 'Stride One Running Sneakers — 235g Featherlight Knit',
        metaDescription:
          'Featherlight running sneakers with responsive foam midsoles and carbon-rubber grip. Sizes 8–11, two colors.',
      },
      variants: [
        { name: '8 / Black', options: { Size: '8', Color: 'Black' }, price: null, compareAtPrice: null, stock: 5, sku: 'STRD-8-BLK' },
        { name: '9 / Black', options: { Size: '9', Color: 'Black' }, price: null, compareAtPrice: null, stock: 7, sku: 'STRD-9-BLK' },
        { name: '10 / Black', options: { Size: '10', Color: 'Black' }, price: null, compareAtPrice: null, stock: 8, sku: 'STRD-10-BLK' },
        { name: '11 / Black', options: { Size: '11', Color: 'Black' }, price: null, compareAtPrice: null, stock: 4, sku: 'STRD-11-BLK' },
        { name: '8 / White', options: { Size: '8', Color: 'White' }, price: 134.99, compareAtPrice: 159.0, stock: 3, sku: 'STRD-8-WHT' },
        { name: '9 / White', options: { Size: '9', Color: 'White' }, price: 134.99, compareAtPrice: null, stock: 5, sku: 'STRD-9-WHT' },
        { name: '10 / White', options: { Size: '10', Color: 'White' }, price: 134.99, compareAtPrice: null, stock: 6, sku: 'STRD-10-WHT' },
        { name: '11 / White', options: { Size: '11', Color: 'White' }, price: 134.99, compareAtPrice: null, stock: 2, sku: 'STRD-11-WHT' },
      ],
    },
    {
      match: 'Soy Wax Candle — Lavender Fields',
      fields: {
        highlights: [
          '100% natural soy wax with a cotton wick',
          'Lavender and bergamot essential oils',
          '45–50 hour burn time',
          'Hand-poured in small batches',
        ],
        specs: [
          { label: 'Burn time', value: '45–50 hours' },
          { label: 'Wax', value: 'Natural soy' },
          { label: 'Wick', value: 'Cotton' },
          { label: 'Vessel', value: 'Amber glass, 220 g' },
        ],
        processingDays: 3,
        shippingPolicy: 'Ships within 3 business days. For volume orders, request a quote for NET terms.',
        slug: 'soy-wax-candle-lavender-fields',
      },
    },
  ]

  for (const demo of formDemo) {
    const created = createdProducts.find((p) => p.title === demo.match)
    if (!created) continue
    const variantStock = (demo.variants ?? []).reduce((s, v) => s + v.stock, 0)
    // highlights/specs are JSON-string columns in MySQL — stringify arrays
    const fields: Record<string, unknown> = { ...demo.fields }
    if (Array.isArray(fields.highlights)) fields.highlights = JSON.stringify(fields.highlights)
    if (Array.isArray(fields.specs)) fields.specs = JSON.stringify(fields.specs)
    await db.product.update({
      where: { id: created.id },
      data: {
        ...fields,
        ...(demo.variants && demo.variants.length > 0 ? { stock: variantStock } : {}),
      },
    })
    if (demo.variants && demo.variants.length > 0) {
      await db.productVariant.createMany({
        data: demo.variants.map((v, i) => ({
          productId: created.id,
          name: v.name,
          options: JSON.stringify(v.options),
          price: v.price,
          compareAtPrice: v.compareAtPrice,
          stock: v.stock,
          sku: v.sku,
          position: i,
          isActive: true,
        })),
      })
    }
  }

  console.log('⭐ Seeding reviews...')
  const reviewTexts = [
    'Absolutely love it — exceeded my expectations in every way. Would buy again!',
    'Great quality for the price. Shipping was quick and packaging was thoughtful.',
    'Really solid. Does exactly what it promises, and looks good doing it.',
    'Good but not perfect. Works well, though I wish it came in more colors.',
    'Obsessed. I have already recommended this to three friends.',
    'Decent value. Took a week to arrive but the product itself is great.',
    'Premium feel, honest materials. This is my second purchase from this shop.',
    'It is fine overall — does the job, nothing spectacular but no complaints.',
    'Fantastic craftsmanship. You can tell someone actually cares about details.',
    'Bought this as a gift and it was a huge hit. Beautiful presentation.',
    'Better than described. The photos do not do it justice.',
    'Solid purchase. Customer service was also wonderful when I had questions.',
  ]
  let reviewIdx = 0
  for (const [pi, product] of createdProducts.entries()) {
    const numReviews = 2 + (pi % 3) // 2-4 reviews
    for (let r = 0; r < numReviews; r++) {
      const reviewer = allReviewers[(pi + r) % allReviewers.length]
      const rating = [5, 4, 5, 4, 3, 5, 4, 5][reviewIdx % 8]
      await db.review.create({
        data: {
          productId: product.id,
          userId: reviewer.id,
          rating,
          comment: reviewTexts[reviewIdx % reviewTexts.length],
          verified: r === 0,
          createdAt: daysAgo(2 + (reviewIdx % 30)),
        },
      })
      reviewIdx++
    }
    const agg = await db.review.aggregate({
      where: { productId: product.id },
      _avg: { rating: true },
      _count: { rating: true },
    })
    await db.product.update({
      where: { id: product.id },
      data: {
        rating: Math.round((agg._avg.rating ?? 0) * 10) / 10,
        reviewCount: agg._count.rating,
      },
    })
  }

  console.log('🛒 Seeding orders...')
  const addresses = [
    {
      fullName: 'Alex Rivera',
      address: '2847 Maple Grove Lane',
      city: 'Portland',
      country: 'United States',
      zip: '97201',
      phone: '+1 (503) 555-0182',
    },
  ]
  const orderPlans: { days: number; status: string; items: { idx: number; qty: number }[] }[] = [
    { days: 12, status: 'DELIVERED', items: [{ idx: 0, qty: 1 }, { idx: 5, qty: 1 }] },
    { days: 9, status: 'DELIVERED', items: [{ idx: 15, qty: 2 }] },
    { days: 7, status: 'DELIVERED', items: [{ idx: 20, qty: 1 }, { idx: 22, qty: 2 }] },
    { days: 4, status: 'SHIPPED', items: [{ idx: 10, qty: 1 }] },
    { days: 2, status: 'PROCESSING', items: [{ idx: 3, qty: 1 }, { idx: 4, qty: 1 }] },
    { days: 1, status: 'PAID', items: [{ idx: 7, qty: 1 }] },
  ]
  for (const plan of orderPlans) {
    const items = plan.items.map((i) => createdProducts[i.idx])
    const total = items.reduce((sum, p, n) => sum + p.price * plan.items[n].qty, 0)
    await db.order.create({
      data: {
        buyerId: buyer.id,
        total: Math.round(total * 100) / 100,
        status: plan.status,
        ...addresses[0],
        createdAt: daysAgo(plan.days, 14),
        items: {
          create: plan.items.map((i, n) => ({
            productId: items[n].id,
            sellerId: items[n].sellerId,
            quantity: i.qty,
            price: items[n].price,
            title: items[n].title,
            image: JSON.parse(items[n].images)[0],
          })),
        },
      },
    })
  }
  const otherOrders: { buyerIdx: number; days: number; status: string; items: { idx: number; qty: number }[] }[] = [
    { buyerIdx: 0, days: 11, status: 'DELIVERED', items: [{ idx: 3, qty: 3 }, { idx: 4, qty: 1 }] },
    { buyerIdx: 1, days: 8, status: 'DELIVERED', items: [{ idx: 0, qty: 1 }] },
    { buyerIdx: 2, days: 6, status: 'SHIPPED', items: [{ idx: 5, qty: 2 }, { idx: 8, qty: 1 }] },
    { buyerIdx: 3, days: 5, status: 'SHIPPED', items: [{ idx: 15, qty: 1 }] },
    { buyerIdx: 4, days: 3, status: 'PROCESSING', items: [{ idx: 10, qty: 1 }, { idx: 12, qty: 2 }] },
    { buyerIdx: 0, days: 2, status: 'PAID', items: [{ idx: 19, qty: 1 }] },
    { buyerIdx: 1, days: 1, status: 'PAID', items: [{ idx: 22, qty: 2 }, { idx: 24, qty: 1 }] },
    { buyerIdx: 2, days: 0, status: 'PAID', items: [{ idx: 17, qty: 1 }] },
  ]
  const otherAddrs = [
    { fullName: 'Maya Chen', address: '512 Birch Street', city: 'Seattle', country: 'United States', zip: '98101', phone: '+1 (206) 555-0147' },
    { fullName: 'Leo Park', address: '88 Harbor View Ave', city: 'San Diego', country: 'United States', zip: '92101', phone: '+1 (619) 555-0119' },
    { fullName: 'Sofia Bennett', address: '19 Chestnut Row', city: 'Austin', country: 'United States', zip: '78701', phone: '+1 (512) 555-0176' },
    { fullName: 'Jamal Carter', address: '730 Lakeshore Drive', city: 'Chicago', country: 'United States', zip: '60601', phone: '+1 (312) 555-0134' },
    { fullName: 'Nina Kovacs', address: '45 Mulberry Court', city: 'Brooklyn', country: 'United States', zip: '11211', phone: '+1 (718) 555-0198' },
  ]
  for (const plan of otherOrders) {
    const items = plan.items.map((i) => createdProducts[i.idx])
    const total = items.reduce((sum, p, n) => sum + p.price * plan.items[n].qty, 0)
    await db.order.create({
      data: {
        buyerId: reviewerPool[plan.buyerIdx].id,
        total: Math.round(total * 100) / 100,
        status: plan.status,
        ...otherAddrs[plan.buyerIdx],
        createdAt: daysAgo(plan.days, 16),
        items: {
          create: plan.items.map((i, n) => ({
            productId: items[n].id,
            sellerId: items[n].sellerId,
            quantity: i.qty,
            price: items[n].price,
            title: items[n].title,
            image: JSON.parse(items[n].images)[0],
          })),
        },
      },
    })
  }

  console.log('❤️ Seeding favorites...')
  for (const idx of [0, 5, 10, 20, 22]) {
    await db.favorite.create({
      data: { userId: buyer.id, productId: createdProducts[idx].id },
    })
  }

  // ─────────────────────────────────────────────────────────────────
  // 2. B2B foundation — groups, sequences, coupons
  // ─────────────────────────────────────────────────────────────────
  console.log('🏢 Seeding B2B foundation...')
  await db.customerGroup.create({
    data: { key: 'retail', name: 'Retail (default)', priority: 0, isDefault: true },
  })
  const wholesale = await db.customerGroup.create({
    data: {
      key: 'wholesale-tier-1',
      name: 'Wholesale Tier 1',
      description: 'Verified wholesale buyers — tier 1 contract pricing',
      priority: 10,
    },
  })
  await db.coupon.create({
    data: {
      code: 'WELCOME10',
      description: '10% off your first order',
      percentOff: 10,
      minSubtotal: 0,
      firstOrderOnly: true,
      active: true,
    },
  })
  await db.coupon.create({
    data: {
      code: 'BULK15',
      description: '15% off orders over $200',
      percentOff: 15,
      minSubtotal: 200,
      firstOrderOnly: false,
      active: true,
    },
  })

  // ─────────────────────────────────────────────────────────────────
  // 3. B2B demo — Acme Trading Co, pricing, RFQs, quotes, audit
  // ─────────────────────────────────────────────────────────────────
  console.log('🏭 Seeding Acme Trading Co (ACTIVE org)...')
  const acme = await db.organization.create({
    data: {
      name: 'Acme Trading Co',
      slug: 'acme-trading-co',
      legalName: 'Acme Trading Company LLC',
      taxId: 'US-98765-43210',
      registrationNumber: 'OR-2019-114852',
      industry: 'Industrial Supplies',
      website: 'https://acme.example.com',
      // JSON-in-text (SQLite): billingAddress is stored as a serialized JSON string.
      billingAddress: JSON.stringify({
        line1: '500 Commerce Blvd',
        city: 'Portland',
        state: 'OR',
        country: 'United States',
        zip: '97205',
      }),
      status: 'ACTIVE',
      verifiedAt: daysAgo(10),
      creditTermsDays: 45,
      creditLimit: 75000,
      approvalThreshold: 500, // orders/quote-accepts ≥ $500 by BUYER members need approval
      notes: 'Verified trading company — boutique hotel supply chain.',
      groups: { connect: [{ id: wholesale.id }] },
    },
  })
  await db.organizationMember.create({
    data: { organizationId: acme.id, userId: buyer.id, role: 'OWNER', jobTitle: 'Founder & CEO' },
  })
  await db.organizationMember.create({
    data: { organizationId: acme.id, userId: casey.id, role: 'APPROVER', jobTitle: 'Procurement Lead' },
  })
  await db.organizationMember.create({
    data: { organizationId: acme.id, userId: riley.id, role: 'BUYER', jobTitle: 'Purchasing Associate' },
  })

  // Group price list — Wholesale Tier 1 (applies to all orgs mapped to the group)
  console.log('💵 Seeding price lists...')
  const groupList = await db.priceList.create({
    data: {
      name: 'Wholesale Tier 1 — Contract Pricing',
      description: 'Tier 1 wholesale ladder pricing for verified wholesale accounts',
      scope: 'GROUP',
      status: 'ACTIVE',
      priority: 10,
      customerGroupId: wholesale.id,
      createdAt: daysAgo(9),
    },
  })
  const candle = createdProducts[22]
  const basket = createdProducts[23]
  const bathBombs = createdProducts[21]
  const skincare = createdProducts[19]
  const groupEntries: { productId: string; minQuantity: number; unitPrice: number }[] = [
    { productId: candle.id, minQuantity: 1, unitPrice: 18.7 },
    { productId: candle.id, minQuantity: 10, unitPrice: 16.5 },
    { productId: candle.id, minQuantity: 50, unitPrice: 15.4 },
    { productId: basket.id, minQuantity: 5, unitPrice: 29.9 },
    { productId: bathBombs.id, minQuantity: 20, unitPrice: 22.5 },
    { productId: skincare.id, minQuantity: 10, unitPrice: 56.0 },
  ]
  for (const e of groupEntries) {
    await db.priceListEntry.create({ data: { priceListId: groupList.id, ...e } })
  }

  // Org contract list — Acme Direct Contract (ORG scope beats GROUP)
  const orgList = await db.priceList.create({
    data: {
      name: 'Acme Direct Contract',
      description: 'Negotiated annual contract — Acme Trading Co',
      scope: 'ORG',
      status: 'ACTIVE',
      priority: 5,
      organizationId: acme.id,
      createdAt: daysAgo(8),
    },
  })
  const orgEntries: { productId: string; minQuantity: number; unitPrice: number }[] = [
    { productId: candle.id, minQuantity: 1, unitPrice: 11.0 },
    { productId: candle.id, minQuantity: 50, unitPrice: 10.5 },
    { productId: candle.id, minQuantity: 100, unitPrice: 9.8 },
    { productId: basket.id, minQuantity: 1, unitPrice: 27.0 },
    { productId: bathBombs.id, minQuantity: 1, unitPrice: 21.75 },
  ]
  for (const e of orgEntries) {
    await db.priceListEntry.create({ data: { priceListId: orgList.id, ...e } })
  }

  // RFQs + quotes — five documents across the state machine
  console.log('📄 Seeding RFQs and quotes...')
  const mkRfq = (data: Prisma.RfqCreateInput) => db.rfq.create({ data })

  const rfq1 = await mkRfq({
    number: 'RFQ-2026-000001',
    title: 'Soy wax candles for boutique hotel amenities',
    description:
      'We are opening two boutique properties in Q4 and need bulk candles for rooms and the spa. Recurring monthly volume expected if the first batch lands well.',
    status: 'ACCEPTED',
    user: { connect: { id: buyer.id } },
    organization: { connect: { id: acme.id } },
    submittedAt: daysAgo(9),
    respondedAt: daysAgo(7),
    closedAt: daysAgo(2),
    createdAt: daysAgo(9, 9),
  })
  const r1line1 = await db.rfqLine.create({
    data: {
      rfqId: rfq1.id,
      productId: candle.id,
      productName: candle.title,
      quantity: 120,
      targetPrice: 12.5,
      notes: 'Lavender Fields scent preferred; unlabeled amber jars acceptable.',
    },
  })
  const r1line2 = await db.rfqLine.create({
    data: {
      rfqId: rfq1.id,
      productId: basket.id,
      productName: basket.title,
      quantity: 20,
      notes: 'For spa amenity storage.',
    },
  })

  const rfq2 = await mkRfq({
    number: 'RFQ-2026-000002',
    title: 'Custom branded packaging — holiday edition',
    description: 'Kraft gift boxes with one-color logo print for our holiday bundles.',
    status: 'CANCELLED',
    user: { connect: { id: buyer.id } },
    organization: { connect: { id: acme.id } },
    submittedAt: daysAgo(6),
    closedAt: daysAgo(3),
    createdAt: daysAgo(6, 11),
  })
  await db.rfqLine.create({
    data: {
      rfqId: rfq2.id,
      productName: 'Custom kraft gift boxes with one-color logo print',
      quantity: 500,
      targetPrice: 1.75,
      notes: 'Two sizes: 8x8x4in and 12x9x4in. FSC-certified board preferred.',
    },
  })

  const rfq3 = await mkRfq({
    number: 'RFQ-2026-000003',
    title: 'Skincare gift sets for corporate gifting',
    description: 'Employee appreciation gifts for 200 staff — need sets shipped before the holidays.',
    status: 'UNDER_REVIEW',
    user: { connect: { id: buyer.id } },
    organization: { connect: { id: acme.id } },
    submittedAt: daysAgo(2),
    createdAt: daysAgo(2, 9),
  })
  await db.rfqLine.create({
    data: { rfqId: rfq3.id, productId: skincare.id, productName: skincare.title, quantity: 25, targetPrice: 58 },
  })
  await db.rfqLine.create({
    data: { rfqId: rfq3.id, productId: bathBombs.id, productName: bathBombs.title, quantity: 40 },
  })

  const rfq4 = await mkRfq({
    number: 'RFQ-2026-000004',
    title: 'Candles + packaging for Q4 storefront launch',
    description:
      'Launching our first branded storefront — need candles and custom kraft boxes. Two lines: catalog candles and open-notation packaging.',
    status: 'QUOTED',
    user: { connect: { id: buyer.id } },
    organization: { connect: { id: acme.id } },
    submittedAt: daysAgo(1),
    respondedAt: daysAgo(1, 15),
    createdAt: daysAgo(1, 9),
  })
  const r4line1 = await db.rfqLine.create({
    data: {
      rfqId: rfq4.id,
      productId: candle.id,
      productName: candle.title,
      quantity: 80,
      targetPrice: 12,
    },
  })
  await db.rfqLine.create({
    data: {
      rfqId: rfq4.id,
      productName: 'Custom kraft boxes (open item)',
      quantity: 300,
      notes: '8x8x4in, one-color print, uncoated.',
    },
  })

  const rfq5 = await mkRfq({
    number: 'RFQ-2026-000005',
    title: 'Wellness kits for employee onboarding',
    description: 'Quarterly onboarding kits for new hires — 25 kits per quarter.',
    status: 'ACCEPTED',
    user: { connect: { id: buyer.id } },
    organization: { connect: { id: acme.id } },
    submittedAt: daysAgo(5),
    respondedAt: daysAgo(4),
    closedAt: daysAgo(1),
    createdAt: daysAgo(5, 9),
  })
  const r5line1 = await db.rfqLine.create({
    data: { rfqId: rfq5.id, productId: skincare.id, productName: skincare.title, quantity: 25, targetPrice: 58 },
  })

  // Quotes
  const quote1 = await db.quote.create({
    data: {
      number: 'QTE-2026-000001',
      rfq: { connect: { id: rfq1.id } },
      createdBy: { connect: { id: admin.id } },
      sellerId: wildbloom.id,
      status: 'ACCEPTED',
      subtotal: 1560.0, // 120 candles @ 11.50 + 20 baskets @ 9.00
      discountTotal: 78.0,
      shippingTotal: 45.0,
      taxTotal: 0,
      total: 1527.0,
      paymentTerms: 'NET-30',
      validUntil: daysFromNow(21),
      notes: 'Volume pricing per contract discussion. Baskets at sample cost.',
      sentAt: daysAgo(7),
      acceptedAt: daysAgo(2),
      createdAt: daysAgo(7, 14),
      lines: {
        create: [
          { rfqLineId: r1line1.id, productId: candle.id, quantity: 120, unitPrice: 11.5 },
          { rfqLineId: r1line2.id, productId: basket.id, quantity: 20, unitPrice: 9.0 },
        ],
      },
    },
  })
  await db.quote.create({
    data: {
      number: 'QTE-2026-000002',
      rfq: { connect: { id: rfq1.id } },
      createdBy: { connect: { id: admin.id } },
      sellerId: wildbloom.id,
      status: 'DECLINED',
      subtotal: 1584.0, // 120 candles @ 13.20
      discountTotal: 0,
      shippingTotal: 40.0,
      taxTotal: 0,
      total: 1624.0,
      paymentTerms: 'NET-45',
      validUntil: daysAgo(1),
      notes: 'Alternative quote — auto-declined when the winning quote was accepted.',
      sentAt: daysAgo(7, 16),
      declinedAt: daysAgo(2),
      createdAt: daysAgo(7, 16),
      lines: {
        create: [{ rfqLineId: r1line1.id, productId: candle.id, quantity: 120, unitPrice: 13.2 }],
      },
    },
  })
  const quote3 = await db.quote.create({
    data: {
      number: 'QTE-2026-000003',
      rfq: { connect: { id: rfq4.id } },
      createdBy: { connect: { id: admin.id } },
      sellerId: wildbloom.id,
      status: 'SENT',
      subtotal: 920.0, // 80 candles @ 11.50
      discountTotal: 0,
      shippingTotal: 0,
      taxTotal: 0,
      total: 920.0,
      paymentTerms: 'NET-30',
      validUntil: daysFromNow(30),
      notes: 'Catalog candle line quoted at contract rate. Open packaging item quoted separately once specs are confirmed.',
      sentAt: daysAgo(1, 15),
      createdAt: daysAgo(1, 15),
      lines: {
        create: [{ rfqLineId: r4line1.id, productId: candle.id, quantity: 80, unitPrice: 11.5 }],
      },
    },
  })
  const quote4 = await db.quote.create({
    data: {
      number: 'QTE-2026-000004',
      rfq: { connect: { id: rfq5.id } },
      createdBy: { connect: { id: admin.id } },
      sellerId: wildbloom.id,
      status: 'ACCEPTED',
      subtotal: 1450.0, // 25 skincare sets @ 58
      discountTotal: 50.0,
      shippingTotal: 0,
      taxTotal: 0,
      total: 1400.0,
      paymentTerms: 'NET-45',
      validUntil: daysFromNow(14),
      notes: 'Onboarding kits — split shipping to two offices.',
      sentAt: daysAgo(4),
      acceptedAt: daysAgo(1),
      createdAt: daysAgo(4, 13),
      lines: {
        create: [{ rfqLineId: r5line1.id, productId: skincare.id, quantity: 25, unitPrice: 58.0 }],
      },
    },
  })

  // Sequences — next RFQ = 6, next QTE = 5
  await db.sequence.create({ data: { key: 'RFQ', value: 5 } })
  await db.sequence.create({ data: { key: 'QTE', value: 4 } })

  // Audit trail — the story of the demo data
  console.log('🧾 Seeding audit trail...')
  const audit = (
    actorId: string | null,
    actorType: 'USER' | 'ADMIN' | 'SELLER' | 'SYSTEM',
    action: string,
    entityType: string,
    entityId: string | null,
    summary: string,
    createdAt: Date,
    metadata?: Record<string, unknown>
  ) =>
    db.auditLog.create({
      data: {
        actorId,
        actorType,
        action,
        entityType,
        entityId,
        summary,
        createdAt,
        metadata: metadata === undefined ? undefined : JSON.stringify(metadata),
      },
    })
  await audit(buyer.id, 'USER', 'ORG_CREATED', 'Organization', acme.id, 'Acme Trading Co registered as a business account', daysAgo(10, 9))
  await audit(admin.id, 'ADMIN', 'ORG_VERIFIED', 'Organization', acme.id, 'Acme Trading Co verified — NET-45 terms, $75,000 credit limit, mapped to Wholesale Tier 1', daysAgo(10, 11), { creditTermsDays: 45, creditLimit: 75000 })
  await audit(admin.id, 'ADMIN', 'PRICELIST_CREATED', 'PriceList', groupList.id, 'Price list "Wholesale Tier 1 — Contract Pricing" created (GROUP)', daysAgo(9, 12))
  await audit(admin.id, 'ADMIN', 'PRICELIST_ENTRIES_REPLACED', 'PriceList', groupList.id, `${groupEntries.length} ladder entries saved`, daysAgo(9, 12))
  await audit(admin.id, 'ADMIN', 'PRICELIST_CREATED', 'PriceList', orgList.id, 'Price list "Acme Direct Contract" created (ORG)', daysAgo(8, 10))
  await audit(admin.id, 'ADMIN', 'PRICELIST_ENTRIES_REPLACED', 'PriceList', orgList.id, `${orgEntries.length} ladder entries saved`, daysAgo(8, 10))
  await audit(buyer.id, 'USER', 'RFQ_CREATED', 'Rfq', rfq1.id, 'RFQ-2026-000001 drafted (hotel amenities)', daysAgo(9, 9))
  await audit(buyer.id, 'USER', 'RFQ_SUBMIT', 'Rfq', rfq1.id, 'RFQ-2026-000001 submitted for quoting', daysAgo(9, 10))
  await audit(admin.id, 'ADMIN', 'QUOTE_SENT', 'Quote', quote1.id, 'QTE-2026-000001 issued for RFQ-2026-000001 ($1,527.00 NET-30)', daysAgo(7, 14))
  await audit(buyer.id, 'USER', 'RFQ_SUBMIT', 'Rfq', rfq2.id, 'RFQ-2026-000002 submitted (custom packaging)', daysAgo(6, 11))
  await audit(buyer.id, 'USER', 'RFQ_SUBMIT', 'Rfq', rfq5.id, 'RFQ-2026-000005 submitted (onboarding kits)', daysAgo(5, 9))
  await audit(buyer.id, 'USER', 'RFQ_CANCELLED', 'Rfq', rfq2.id, 'RFQ-2026-000002 cancelled by requester', daysAgo(3, 10))
  await audit(buyer.id, 'USER', 'RFQ_SUBMIT', 'Rfq', rfq3.id, 'RFQ-2026-000003 submitted (corporate gifting)', daysAgo(2, 9))
  await audit(buyer.id, 'USER', 'QUOTE_ACCEPTED', 'Quote', quote1.id, 'QTE-2026-000001 accepted — sibling quotes auto-declined', daysAgo(2, 11))
  await audit(buyer.id, 'USER', 'QUOTE_ACCEPTED', 'Quote', quote4.id, 'QTE-2026-000004 accepted ($1,400.00 NET-45)', daysAgo(1, 10))
  await audit(buyer.id, 'USER', 'RFQ_SUBMIT', 'Rfq', rfq4.id, 'RFQ-2026-000004 submitted (Q4 storefront launch)', daysAgo(1, 9))
  await audit(admin.id, 'ADMIN', 'RFQ_REVIEW', 'Rfq', rfq3.id, 'RFQ-2026-000003 moved to Under Review', daysAgo(1, 12))
  await audit(admin.id, 'ADMIN', 'QUOTE_SENT', 'Quote', quote3.id, 'QTE-2026-000003 issued for RFQ-2026-000004 ($920.00 NET-30)', daysAgo(1, 15))
  await audit(null, 'SYSTEM', 'COUPON_MIGRATED', 'Coupon', null, 'Legacy hardcoded coupon WELCOME10 migrated to database', daysAgo(9, 8))

  const counts = {
    users: await db.user.count(),
    categories: await db.category.count(),
    products: await db.product.count(),
    reviews: await db.review.count(),
    orders: await db.order.count(),
    favorites: await db.favorite.count(),
    organizations: await db.organization.count(),
    priceLists: await db.priceList.count(),
    priceListEntries: await db.priceListEntry.count(),
    rfqs: await db.rfq.count(),
    quotes: await db.quote.count(),
    coupons: await db.coupon.count(),
    auditLogs: await db.auditLog.count(),
  }
  console.log('✅ Full-system demo seed complete:', counts)
  console.log('   Admin:       admin@vendora.com / admin1234')
  console.log('   B2B buyer:   demo@vendora.com / demo1234 (owner of Acme Trading Co)')
  console.log('   Approver:    casey@vendora.com / demo1234')
  console.log('   Org buyer:   riley@vendora.com / demo1234 (BUYER member — orders ≥ $500 need approval)')
  console.log('   Sellers:     seller1..5@vendora.com / seller1234')
  console.log('   Open quote:  QTE-2026-000003 ($920.00 NET-30) on RFQ-2026-000004 — ready to accept in the buyer UI')
}

main()
  .catch((e) => {
    console.error('[seed-demo] FAILED', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
