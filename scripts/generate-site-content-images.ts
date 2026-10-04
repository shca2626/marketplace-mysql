/**
 * Generates cover art for Phase 3–4 site content (funding success stories +
 * insight posts) via z-ai image generation → db/site-content-images/*.png.
 * Follow-up script (seed-site-content.ts) pushes them through the app's
 * storage pipeline (renditions → hosting / local fallback) + creates rows.
 *
 * Resumable: skips files that already exist on disk.
 */
import ZAI from 'z-ai-web-dev-sdk'
import { mkdirSync, existsSync } from 'node:fs'
import { assertNotProd } from './lib/assert-not-prod'

const OUT_DIR = 'db/site-content-images'

const PHOTO_STYLE =
  'warm golden natural light, authentic documentary photography style, Yemeni landscape context, arid mountains horizon, professional composition, rich warm amber tones, high quality, detailed, no text'

type Item = { file: string; prompt: string }

const ITEMS: Item[] = [
  // ── Funding success stories (4) ──────────────────────────────────────────
  {
    file: 'story-farm.png',
    prompt: `Solar-powered water pump irrigating green terraced farm fields at golden hour, farmer in traditional clothing checking water pipes flowing from a solar panel array next to a water storage tank, ${PHOTO_STYLE}`,
  },
  {
    file: 'story-coldstorage.png',
    prompt: `Small business cold storage room stacked with fresh produce crates, owner proudly standing by the open door, solar panels visible on the flat roof through doorway light, ${PHOTO_STYLE}`,
  },
  {
    file: 'story-clinic.png',
    prompt: `Rural health clinic interior with medical refrigerator running on solar power, nurse checking vaccine cooler, solar panel and battery cabinet visible outside the window, ${PHOTO_STYLE}`,
  },
  {
    file: 'story-workshop.png',
    prompt: `Bright tailoring workshop with row of sewing machines powered by solar energy, tailor working at machine, solar inverter and battery on the wall, cables neatly run to ceiling LED lights, ${PHOTO_STYLE}`,
  },
  // ── Insight covers (4) ───────────────────────────────────────────────────
  {
    file: 'insight-sizing.png',
    prompt: `Technician with clipboard and tablet performing solar site survey on a residential rooftop with measuring tape next to installed solar panels, ladder visible, ${PHOTO_STYLE}`,
  },
  {
    file: 'insight-murabaha.png',
    prompt: `Elegant Islamic finance concept: golden geometric arabesque pattern merging with solar panel grid lines, warm amber and deep emerald tones, symbolic handshake silhouette, premium editorial illustration style, no text`,
  },
  {
    file: 'insight-battery.png',
    prompt: `Close-up of wall-mounted lithium home battery modules with status LEDs glowing warm, in a clean utility room, depth of field, ${PHOTO_STYLE}`,
  },
  {
    file: 'insight-rfq.png',
    prompt: `Warehouse logistics scene: worker with tablet scanning stacked solar equipment boxes ready for bulk shipment, pallets with panels wrapped, ${PHOTO_STYLE}`,
  },
]

async function main() {
assertNotProd() // Phase 6 (6.0b.8/B1): fail-closed — no production mode, ever
  mkdirSync(OUT_DIR, { recursive: true })
  const zai = await ZAI.create()
  let generated = 0
  for (const item of ITEMS) {
    const out = `${OUT_DIR}/${item.file}`
    if (existsSync(out)) {
      console.log(`• ${item.file} already exists`)
      continue
    }
    let done = false
    for (let attempt = 1; attempt <= 4 && !done; attempt++) {
      try {
        console.log(`→ generating ${item.file} (attempt ${attempt})...`)
        const res = await zai.images.generations.create({ prompt: item.prompt, size: '1344x768' })
        if (!res?.data?.[0]?.base64) throw new Error('empty response')
        const { writeFileSync } = await import('node:fs')
        writeFileSync(out, Buffer.from(res.data[0].base64, 'base64'))
        console.log(`  ✓ ${item.file}`)
        done = true
        generated++
      } catch (err) {
        console.error(`  attempt ${attempt} failed: ${(err as Error).message}`)
        if (attempt < 4) await new Promise((r) => setTimeout(r, 1500 * attempt))
      }
    }
    if (!done) throw new Error(`failed to generate ${item.file}`)
  }
  console.log(`\ndone — ${generated} new, ${ITEMS.length} total available in ${OUT_DIR}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
