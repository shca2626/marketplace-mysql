/**
 * Migrates the remaining static UI images (hero, collage, sample picks,
 * store covers) from the dead/flaky z-cdn.chatglm.cn CDN to the durable
 * ftp-hosting storage — completing the "all images on user's hosting" goal.
 *
 * 1. Pushes every file in db/static-images/ through processImageUpload
 *    (→ hosting) and registers a MediaAsset (sha256-dedupe).
 * 2. Writes db/static-images/urls.json — semanticName → { full, medium } URL
 *    map used to rewrite src/lib/constants.ts, src/lib/store-covers.ts and
 *    src/lib/settings/schema.ts.
 * 3. Rewrites any z-cdn URLs inside the persisted PlatformSetting
 *    'storefront' row (admin-saved settings keep working).
 *
 * Idempotent: re-running reuses existing MediaAssets by sha256.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { processImageUpload } from '../src/lib/storage/image-pipeline'
import { mediaUrl } from '../src/lib/storage/url'
import { assertNotProd } from './lib/assert-not-prod'

const prisma = new PrismaClient()

/** semantic name → which CDN file(s) it replaces (for the settings row rewrite) */
const FILE_TO_CDN: Record<string, string[]> = {
  'hero-shopping.jpg': ['abc039ecde8a.jpg'],
  'collage-tech.jpg': ['b0147d481533.jpg'],
  'collage-atelier.jpg': ['18749cd50588.jpg'],
  'collage-outdoors.jpg': ['25ad7d593d9f.jpg'],
  'collage-cozy.webp': ['bedfd2ff5fff.webp'],
  'sample-01.jpg': ['141cbde21ff2.jpg'],
  'sample-02.jpg': ['2c18fec764b9.jpg'],
  'sample-03.jpg': ['822ecdcb7a03.jpg'],
  'sample-04.png': ['4787f77a9d9d.jpg'], // dead on CDN — AI-generated replacement
  'sample-05.jpg': ['a51a76cf3ded.jpg'],
  'sample-06.jpg': ['89b5894bf2b2.jpg'],
  'sample-07.jpg': ['48b8bf7c381c.jpg'],
  'sample-08.jpg': ['1310449ec1fc.jpg'],
  'cover-flatlay.png': ['39fd9d00938f.png'],
  'cover-boutique.jpeg': ['48123c636211.jpeg'],
  'cover-gadgets.jpg': ['0f3cf9c91fd8.jpg'],
  'cover-interior.jpg': ['d68c156c6ee3.jpg'],
  'cover-spa.jpg': ['78280f2c3121.jpg'],
  'cover-textile.jpg': ['7d358772ad31.jpg'],
}

async function main() {
assertNotProd() // Phase 6 (6.0b.8/B1): fail-closed — no production mode, ever
  const admin = await prisma.user.findFirst({ where: { email: 'admin@vendora.com' } })
  if (!admin) throw new Error('admin@vendora.com not found')

  const files = readdirSync('db/static-images').filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
  console.log(`Static images on disk: ${files.length}/${Object.keys(FILE_TO_CDN).length}`)

  const urls: Record<string, Record<string, string>> = {}
  for (const file of files) {
    const buffer = readFileSync(`db/static-images/${file}`)
    const sha256 = createHash('sha256').update(buffer).digest('hex')

    let asset = await prisma.mediaAsset.findFirst({ where: { sha256 } })
    if (!asset) {
      const processed = await processImageUpload(buffer)
      asset = await prisma.mediaAsset.create({
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
      console.log(`  ✓ ${file} → ${asset.key} (asset created)`)
    } else {
      console.log(`  ✓ ${file} → reused asset ${asset.key}`)
    }

    const variants = JSON.parse(asset.variants) as Record<string, string>
    urls[file] = {
      full: mediaUrl(variants.full),
      medium: mediaUrl(variants.medium),
      thumb: mediaUrl(variants.thumb),
      key: asset.key,
    }
  }

  writeFileSync('db/static-images/urls.json', JSON.stringify(urls, null, 2))
  console.log('db/static-images/urls.json written')

  // ── Rewrite persisted storefront settings row if it holds CDN URLs ────────
  const row = await prisma.platformSetting.findUnique({ where: { key: 'storefront' } })
  if (row) {
    let value = row.value
    let changed = 0
    for (const [file, cdns] of Object.entries(FILE_TO_CDN)) {
      const replacement = urls[file]?.medium
      if (!replacement) continue
      for (const cdn of cdns) {
        const needle = `https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/${cdn}`
        if (value.includes(needle)) {
          value = value.split(needle).join(replacement)
          changed++
        }
      }
    }
    if (changed > 0) {
      await prisma.platformSetting.update({ where: { key: 'storefront' }, data: { value } })
      console.log(`PlatformSetting 'storefront' row: ${changed} CDN URL(s) rewritten`)
    } else {
      console.log("PlatformSetting 'storefront' row: no CDN URLs (clean)")
    }
  } else {
    console.log("PlatformSetting 'storefront' row: absent (defaults used — schema.ts rewrite covers it)")
  }

  // Any other z-cdn remnants in the DB? (text columns, informational scan)
  const tables = ['platformSetting', 'bannerSlide'] as const
  for (const t of tables) {
    // @ts-expect-error dynamic table iteration is fine for this one-off scan
    const rows = await prisma[t].findMany()
    const dirty = rows.filter((r: unknown) => JSON.stringify(r).includes('z-cdn.chatglm.cn'))
    console.log(`scan ${t}: ${dirty.length} row(s) still reference z-cdn`)
  }

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('FATAL', e)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
