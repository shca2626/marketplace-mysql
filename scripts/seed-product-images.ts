/**
 * Seeds the 26 generated product images (db/product-images/*.png) through the
 * app's own storage pipeline (processImageUpload → ftp-hosting driver → the
 * user's InfinityFree hosting), registers MediaAsset rows, and rewrites every
 * product's images[] to the durable /api/media URLs — replacing the dead
 * third-party CDN seed URLs (z-cdn.chatglm.cn, partially 404ing).
 * Also refreshes scripts/seed-data/images.json so future reseeds stay durable.
 * Idempotent: re-running reuses existing MediaAssets by sha256.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { PrismaClient } from '@prisma/client'
import { processImageUpload } from '../src/lib/storage/image-pipeline'
import { mediaUrl } from '../src/lib/storage/url'

const prisma = new PrismaClient()

/** Product title (from the seed) → generated image file. Order = DB listing order. */
const TITLE_TO_FILE: [string, string][] = [
  ['Aura Wireless Noise-Cancelling Headphones', '01-headphones.png'],
  ['Pulse Smartwatch Series 5', '02-smartwatch.png'],
  ['Lumo 4K Action Camera', '03-actioncam.png'],
  ['Echo Pocket Bluetooth Speaker', '04-speaker.png'],
  ['Nimbus RGB Mechanical Keyboard', '05-keyboard.png'],
  ['Stride One Running Sneakers', '06-sneakers.png'],
  ['Vintage-Wash Denim Trucker Jacket', '07-denim.png'],
  ['Aviator Classic Sunglasses UV400', '08-sunglasses.png'],
  ['Canvas Traveler Backpack 28L', '09-backpack.png'],
  ['Merino Wool Beanie', '10-beanie.png'],
  ['Halo Adjustable Desk Lamp', '11-desklamp.png'],
  ['Terra Ceramic Vase Set of 3', '12-vases.png'],
  ['Linen Throw Pillow Covers (Set of 4)', '13-pillows.png'],
  ['Artisan Stoneware Mug Set of 6', '14-mugs.png'],
  ['Solid Oak Floating Wall Shelf', '15-shelf.png'],
  ['GripPro Yoga Mat 6mm', '16-yogamat.png'],
  ['IronCore Adjustable Dumbbell 24kg', '17-dumbbell.png'],
  ['Carbon Pro Tennis Racket', '18-racket.png'],
  ['Trailblazer Waterproof Hiking Boots', '19-boots.png'],
  ['Glow Ritual Skincare Set', '20-skincare.png'],
  ['Amber Musk Eau de Parfum 50ml', '21-perfume.png'],
  ['Botanical Bath Bombs Gift Set', '22-bathbombs.png'],
  ['Soy Wax Candle — Lavender Fields', '23-candle.png'],
  ['Handwoven Jute Storage Basket', '24-basket.png'],
  ['Macramé Wall Hanging — Boho Decor', '25-macrame.png'],
  ['Handmade Walnut Phone Dock', '26-phonewood.png'],
]

async function main() {
  const admin = await prisma.user.findFirst({ where: { email: 'admin@vendora.com' } })
  if (!admin) throw new Error('admin@vendora.com not found')

  const existing = readdirSync('db/product-images').filter((f) => f.endsWith('.png'))
  console.log(`Generated images on disk: ${existing.length}/26`)
  if (existing.length < 26) throw new Error('Not all images generated yet — wait for generate-product-images.ts to finish')

  const urlByTitle = new Map<string, string>()
  for (const [title, file] of TITLE_TO_FILE) {
    const path = `db/product-images/${file}`
    if (!existsSync(path)) throw new Error(`missing ${path}`)
    const buffer = readFileSync(path)
    const sha256 = createHash('sha256').update(buffer).digest('hex')

    // Idempotency: dedupe on content hash BEFORE generating renditions
    // (processImageUpload mints a fresh random suffix every run).
    const dup = await prisma.mediaAsset.findFirst({ where: { sha256 } })
    if (dup) {
      const variants = JSON.parse(dup.variants) as Record<string, string>
      urlByTitle.set(title, mediaUrl(variants.medium))
      console.log(`  ✓ ${title} → reused asset ${dup.key}`)
      continue
    }

    const processed = await processImageUpload(buffer)
    await prisma.mediaAsset.create({
      data: {
        key: processed.baseKey,
        originalName: file,
        mime: processed.mime,
        size: processed.originalBytes,
        width: processed.width,
        height: processed.height,
        sha256: processed.sha256,
        variants: JSON.stringify(processed.variants),
        uploadedById: admin.id,
      },
    })
    urlByTitle.set(title, mediaUrl(processed.variants.medium))
    console.log(`  ✓ ${title} → ${processed.baseKey} (asset created)`)
  }

  // Rewrite every product's images
  let updated = 0
  for (const [title, url] of urlByTitle) {
    const product = await prisma.product.findFirst({ where: { title } })
    if (!product) {
      console.log(`  ! product not found: ${title}`)
      continue
    }
    await prisma.product.update({ where: { id: product.id }, data: { images: JSON.stringify([url]) } })
    updated++
  }
  console.log(`Products updated: ${updated}/26`)

  // Refresh seed-data/images.json so future reseeds use durable URLs
  const seedImages: Record<string, string[]> = {}
  const products = await prisma.product.findMany({ select: { title: true, images: true } })
  for (const p of products) {
    try {
      const arr = typeof p.images === 'string' ? (JSON.parse(p.images) as string[]) : ((p.images as string[]) ?? [])
      if (arr.length) seedImages[p.title] = arr
    } catch {
      /* skip malformed */
    }
  }
  await writeFile('scripts/seed-data/images.json', JSON.stringify(seedImages, null, 2))
  console.log('scripts/seed-data/images.json refreshed with durable /api/media URLs')

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('FATAL', e)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
