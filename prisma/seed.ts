import { PrismaClient } from '@prisma/client'
import { randomBytes, scryptSync } from 'crypto'
import { readFileSync } from 'fs'

const db = new PrismaClient()

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

const images = JSON.parse(readFileSync('/home/z/my-project/db/images.json', 'utf-8')) as Record<string, string[]>
const alt = JSON.parse(readFileSync('/home/z/my-project/db/images-alt.json', 'utf-8')) as Record<string, string>

function daysAgo(n: number, hour = 10) {
  const d = new Date()
  d.setHours(hour, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return d
}

async function main() {
  console.log('🧹 Clearing existing data...')
  await db.review.deleteMany()
  await db.favorite.deleteMany()
  await db.orderItem.deleteMany()
  await db.order.deleteMany()
  await db.product.deleteMany()
  await db.category.deleteMany()
  await db.user.deleteMany()

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

  console.log('👥 Creating users...')
  const [techNest, urbanThread, casaVerde, peakForm, wildbloom] = await Promise.all([
    db.user.create({
      data: {
        name: 'Daniel Reyes',
        email: 'seller1@vendora.com',
        password: hashPassword('seller1234'),
        role: 'SELLER',
        storeName: 'TechNest',
        storeBio: 'Curated audio, wearables and everyday tech. Tested by nerds, loved by everyone. Free 2-year warranty on all gear.',
      },
    }),
    db.user.create({
      data: {
        name: 'Ava Thompson',
        email: 'seller2@vendora.com',
        password: hashPassword('seller1234'),
        role: 'SELLER',
        storeName: 'UrbanThread Co.',
        storeBio: 'Street-ready staples and timeless classics. Small-batch fashion with a conscience — organic fabrics, fair factories.',
      },
    }),
    db.user.create({
      data: {
        name: 'Marco Silva',
        email: 'seller3@vendora.com',
        password: hashPassword('seller1234'),
        role: 'SELLER',
        storeName: 'Casa Verde Home',
        storeBio: 'Warm, minimal homeware for slow living. Sustainably sourced materials, designed to last decades not seasons.',
      },
    }),
    db.user.create({
      data: {
        name: 'Jade Miller',
        email: 'seller4@vendora.com',
        password: hashPassword('seller1234'),
        role: 'SELLER',
        storeName: 'PeakForm Gear',
        storeBio: 'Equipment for people who move. From gym floors to mountain trails — gear that keeps up with you.',
      },
    }),
    db.user.create({
      data: {
        name: 'Luna Okafor',
        email: 'seller5@vendora.com',
        password: hashPassword('seller1234'),
        role: 'SELLER',
        storeName: 'Wildbloom Studio',
        storeBio: 'Hand-poured candles, botanical skincare and one-of-a-kind crafts, made in small batches from our sunlit studio.',
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

  const reviewerPool = await Promise.all(
    [
      { name: 'Maya Chen', email: 'maya@example.com' },
      { name: 'Leo Park', email: 'leo@example.com' },
      { name: 'Sofia Bennett', email: 'sofia@example.com' },
      { name: 'Jamal Carter', email: 'jamal@example.com' },
      { name: 'Nina Kovacs', email: 'nina@example.com' },
    ].map((u) =>
      db.user.create({ data: { ...u, password: hashPassword('demo1234'), role: 'BUYER' } })
    )
  )
  const allReviewers = [buyer, ...reviewerPool]

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

  const createdProducts = []
  for (const p of products) {
    const { category, seller, ...rest } = p
    createdProducts.push(
      await db.product.create({
        data: {
          ...rest,
          compareAtPrice: rest.compareAtPrice ?? null,
          images: JSON.stringify(rest.images),
          categoryId: category,
          sellerId: seller,
        },
      })
    )
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
    // Recompute aggregates
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

  // Demo buyer's orders — statuses progress with time
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

  // Orders from other buyers (populate seller dashboards)
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

  const counts = {
    users: await db.user.count(),
    categories: await db.category.count(),
    products: await db.product.count(),
    reviews: await db.review.count(),
    orders: await db.order.count(),
    favorites: await db.favorite.count(),
  }
  console.log('✅ Seed complete:', counts)
  console.log('   Demo buyer:  demo@vendora.com / demo1234')
  console.log('   Sellers:     seller1..5@vendora.com / seller1234')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
