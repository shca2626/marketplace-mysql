// One-shot, idempotent seed for platform settings + hero banner slides.
// Run: bun run scripts/seed-settings.ts
//
// - Banners are pushed through the SAME media pipeline as user uploads
//   (sharp → webp renditions, sha256-deduped, MediaAsset-tracked), so slides
//   reference real /api/media/… URLs — nothing hardcoded in the app.
// - Settings row is only created when missing (admin edits always win).
// - Slides are only created when the table is empty (re-run = no duplicates).

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { db } from '../src/lib/db'
import { processImageUpload } from '../src/lib/storage/image-pipeline'
import { mediaUrl } from '../src/lib/storage/url'
import { assertNotProd } from './lib/assert-not-prod'
import {
  DEFAULT_STOREFRONT_SETTINGS,
  type StorefrontSettings,
} from '../src/lib/settings/schema'

const ASSET_DIR = join(process.cwd(), '.seed-assets')

interface SlideSpec {
  file: string
  eyebrow: string
  title: string
  subtitle: string
  ctaLabel: string
  ctaView: 'catalog' | 'seller'
  ctaCategory?: string
}

const SLIDES: SlideSpec[] = [
  {
    file: 'banner-main.png',
    eyebrow: 'Marketplace of independent makers',
    title: 'Shop unique finds from real people',
    subtitle: 'Well-made things, curated by sellers who actually care about their craft — not algorithms.',
    ctaLabel: 'Browse all products',
    ctaView: 'catalog',
  },
  {
    file: 'banner-tech.png',
    eyebrow: 'Audio & tech picks',
    title: 'Sound that stays with you',
    subtitle: 'Premium audio gear and smart tech from trusted independent sellers.',
    ctaLabel: 'Shop electronics',
    ctaView: 'catalog',
    ctaCategory: 'electronics',
  },
  {
    file: 'banner-home.png',
    eyebrow: 'Home & living',
    title: 'Make every corner feel like home',
    subtitle: 'Handmade ceramics, soft textiles and slow-burn candles for slower living.',
    ctaLabel: 'Shop home & living',
    ctaView: 'catalog',
    ctaCategory: 'home-living',
  },
  {
    file: 'banner-sell.png',
    eyebrow: 'Turn your craft into a business',
    title: 'Sell on Vendora in minutes',
    subtitle: 'Open a free storefront, list your products and reach thousands of shoppers. 5% flat fee — no listing fees, ever.',
    ctaLabel: 'Start selling',
    ctaView: 'seller',
  },
]

async function main() {
assertNotProd() // Phase 6 (6.0b.8/B1): fail-closed — no production mode, ever
  // 1) Settings row — create only when missing.
  const existingSettings = await db.platformSetting.findUnique({ where: { key: 'storefront' } })
  if (existingSettings) {
    console.log('• settings row exists — keeping admin values untouched')
  } else {
    await db.platformSetting.create({
      data: { key: 'storefront', value: JSON.stringify(DEFAULT_STOREFRONT_SETTINGS satisfies StorefrontSettings) },
    })
    console.log('✓ default storefront settings seeded')
  }

  // 2) Slides — only when the table is empty.
  const slideCount = await db.bannerSlide.count()
  if (slideCount > 0) {
    console.log(`• ${slideCount} slides already exist — skipping slide seed`)
    return
  }

  const admin = await db.user.findFirst({ where: { role: 'ADMIN' } })
  if (!admin) throw new Error('No ADMIN user found — create one first')

  for (const [i, spec] of SLIDES.entries()) {
    const buf = await readFile(join(ASSET_DIR, spec.file))
    const processed = await processImageUpload(buf)

    // dedupe by content hash (same as the uploads route)
    let asset = await db.mediaAsset.findUnique({ where: { sha256: processed.sha256 } })
    if (!asset) {
      asset = await db.mediaAsset.create({
        data: {
          key: processed.baseKey,
          originalName: spec.file,
          mime: processed.mime,
          size: processed.originalBytes,
          width: processed.width,
          height: processed.height,
          sha256: processed.sha256,
          variants: JSON.stringify(processed.variants),
          uploadedById: admin.id,
        },
      })
    }

    await db.bannerSlide.create({
      data: {
        eyebrow: spec.eyebrow,
        title: spec.title,
        subtitle: spec.subtitle,
        // hero banners want the largest stored rendition
        image: mediaUrl(processed.variants.full),
        ctaLabel: spec.ctaLabel,
        ctaView: spec.ctaView,
        ctaCategory: spec.ctaCategory ?? null,
        active: true,
        position: i,
      },
    })
    console.log(`✓ slide ${i + 1}/${SLIDES.length}: ${spec.title} → ${mediaUrl(processed.variants.full)}`)
  }
}

main()
  .catch((err) => {
    console.error('seed-settings failed:', err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
