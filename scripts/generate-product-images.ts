/**
 * Generates one professional product photo per seeded product (26 total)
 * via z-ai image generation, saved to db/product-images/<n>.png.
 * Follow-up script (seed-product-images.ts) pushes them through the app's
 * own storage pipeline onto the user's hosting + rewrites Product.images.
 */
import ZAI from 'z-ai-web-dev-sdk'
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs'

const OUT_DIR = 'db/product-images'
const STATE_FILE = 'db/product-images/state.json'

type Item = { file: string; prompt: string }

const ITEMS: Item[] = [
  { file: '01-headphones.png', prompt: 'Professional e-commerce product photography of premium over-ear wireless noise-cancelling headphones in matte black, clean light gray studio background, soft diffused lighting, high quality, detailed' },
  { file: '02-smartwatch.png', prompt: 'Professional e-commerce product photography of a modern smartwatch with dark sport band and bright fitness dashboard on screen, clean white studio background, soft lighting, high quality, detailed' },
  { file: '03-actioncam.png', prompt: 'Professional e-commerce product photography of a compact 4K action camera in a rugged case with lens, clean white studio background, soft lighting, high quality, detailed' },
  { file: '04-speaker.png', prompt: 'Professional e-commerce product photography of a cylindrical portable bluetooth speaker in charcoal fabric finish, clean white studio background, soft lighting, high quality, detailed' },
  { file: '05-keyboard.png', prompt: 'Professional e-commerce product photography of a mechanical gaming keyboard with soft RGB backlight glow and gray keycaps, clean dark studio background, high quality, detailed' },
  { file: '06-sneakers.png', prompt: 'Professional e-commerce product photography of a modern running sneaker in white and coral orange accents, side profile on clean light background, soft studio lighting, high quality, detailed' },
  { file: '07-denim.png', prompt: 'Professional e-commerce product photography of a vintage-wash blue denim trucker jacket neatly displayed, clean white studio background, soft lighting, high quality, detailed' },
  { file: '08-sunglasses.png', prompt: 'Professional e-commerce product photography of classic aviator sunglasses with gold frame and dark gradient lenses, clean white studio background, soft lighting, high quality, detailed' },
  { file: '09-backpack.png', prompt: 'Professional e-commerce product photography of a canvas traveler backpack 28L in olive color, three-quarter view, clean white studio background, soft lighting, high quality, detailed' },
  { file: '10-beanie.png', prompt: 'Professional e-commerce product photography of a folded merino wool beanie in warm taupe, clean white studio background, soft lighting, high quality, detailed' },
  { file: '11-desklamp.png', prompt: 'Professional e-commerce product photography of a modern minimalist adjustable desk lamp in matte white, glowing warm light, clean background, high quality, detailed' },
  { file: '12-vases.png', prompt: 'Professional e-commerce product photography of a set of three terracotta ceramic vases of varied sizes, clean beige studio background, soft lighting, high quality, detailed' },
  { file: '13-pillows.png', prompt: 'Professional e-commerce product photography of a neat stack of linen throw pillow covers in natural earthy tones, clean white studio background, soft lighting, high quality, detailed' },
  { file: '14-mugs.png', prompt: 'Professional e-commerce product photography of artisan stoneware mugs set of six in speckled glaze, arranged in a group, clean white studio background, high quality, detailed' },
  { file: '15-shelf.png', prompt: 'Professional e-commerce product photography of a solid oak floating wall shelf mounted with a small plant on it, warm wood tones, clean wall background, high quality, detailed' },
  { file: '16-yogamat.png', prompt: 'Professional e-commerce product photography of a rolled yoga mat in teal with strap, clean white studio background, soft lighting, high quality, detailed' },
  { file: '17-dumbbell.png', prompt: 'Professional e-commerce product photography of an adjustable dumbbell 24kg in black and metal, clean gray studio background, dramatic soft lighting, high quality, detailed' },
  { file: '18-racket.png', prompt: 'Professional e-commerce product photography of a carbon fiber tennis racket with strings visible, diagonal composition, clean white background, high quality, detailed' },
  { file: '19-boots.png', prompt: 'Professional e-commerce product photography of waterproof brown hiking boots, rugged sole visible, clean light studio background, soft lighting, high quality, detailed' },
  { file: '20-skincare.png', prompt: 'Professional e-commerce product photography of an elegant skincare set with glass dropper bottles and cream jar in soft blush tones, clean white background, high quality, detailed' },
  { file: '21-perfume.png', prompt: 'Professional e-commerce product photography of an amber glass perfume bottle with wooden cap, warm backlight glow, clean beige background, high quality, detailed' },
  { file: '22-bathbombs.png', prompt: 'Professional e-commerce product photography of colorful botanical bath bombs gift set with dried flowers, clean white studio background, high quality, detailed' },
  { file: '23-candle.png', prompt: 'Professional e-commerce product photography of a soy wax candle in a glass jar with lavender sprigs beside it, warm cozy glow, clean background, high quality, detailed' },
  { file: '24-basket.png', prompt: 'Professional e-commerce product photography of a handwoven jute storage basket with rope handles, clean white studio background, soft lighting, high quality, detailed' },
  { file: '25-macrame.png', prompt: 'Professional e-commerce product photography of a boho macrame wall hanging in natural cotton on a wooden dowel, clean warm wall background, high quality, detailed' },
  { file: '26-phonewood.png', prompt: 'Professional e-commerce product photography of a handmade walnut wood smartphone docking stand, oiled wood grain, clean white background, soft lighting, high quality, detailed' },
]

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  let state: Record<string, string> = {}
  if (existsSync(STATE_FILE)) state = JSON.parse(readFileSync(STATE_FILE, 'utf8'))

  const zai = await ZAI.create()
  let generated = 0
  for (const item of ITEMS) {
    const out = `${OUT_DIR}/${item.file}`
    if (existsSync(out) && state[item.file] === 'ok') {
      console.log(`• ${item.file} already done`)
      continue
    }
    let done = false
    for (let attempt = 1; attempt <= 3 && !done; attempt++) {
      try {
        const res = await zai.images.generations.create({ prompt: item.prompt, size: '1024x1024' })
        const b64 = res.data?.[0]?.base64
        if (!b64) throw new Error('no base64 in response')
        writeFileSync(out, Buffer.from(b64, 'base64'))
        state[item.file] = 'ok'
        writeFileSync(STATE_FILE, JSON.stringify(state, null, 1))
        generated++
        console.log(`✓ ${item.file} (${generated} new)`)
        done = true
      } catch (e) {
        console.log(`✗ attempt ${attempt} for ${item.file}: ${(e as Error).message}`)
        await new Promise((r) => setTimeout(r, 1500 * attempt))
      }
    }
  }
  const ok = Object.values(state).filter((v) => v === 'ok').length
  console.log(`DONE: ${ok}/${ITEMS.length} images ready in ${OUT_DIR}`)
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
