/**
 * Generates the Solar Energy marketplace imagery (26 product photos + 4 hero
 * banners) via z-ai image generation → db/solar-images/*.png.
 * Follow-up script (seed-solar.ts) pushes them through the app's storage
 * pipeline (renditions → FTP hosting / local fallback) + rewrites the catalog.
 *
 * Resumable: state file skips images already generated.
 */
import ZAI from 'z-ai-web-dev-sdk'
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs'
import { assertNotProd } from './lib/assert-not-prod'

const OUT_DIR = 'db/solar-images'
const STATE_FILE = 'db/solar-images/state.json'

type Item = { file: string; prompt: string; size: string }

const PRODUCT_STYLE =
  'Professional e-commerce product photography, clean light gray studio background, soft diffused lighting, crisp focus, high quality, detailed'

const ITEMS: Item[] = [
  // ── Solar Panels (5) ──────────────────────────────────────────────────────
  { file: '01-panel-mono-450.png', size: '1024x1024', prompt: `Monocrystalline solar panel module 450W with dark blue-black silicon cells in a silver aluminum frame, slight three-quarter angle showing cell grid and junction box, ${PRODUCT_STYLE}` },
  { file: '02-panel-bifacial-550.png', size: '1024x1024', prompt: `Bifacial glass-glass solar panel 550W with dual glass layers and black frame, edge view showing translucent cells, ${PRODUCT_STYLE}` },
  { file: '03-panel-foldable-100.png', size: '1024x1024', prompt: `Portable foldable solar panel kit 100W opened like a briefcase with kickstand legs, carrying handle and charge controller pocket, ${PRODUCT_STYLE}` },
  { file: '04-panel-poly-150.png', size: '1024x1024', prompt: `Polycrystalline solar panel 150W with classic blue multi-crystal cells and silver frame, front view, ${PRODUCT_STYLE}` },
  { file: '05-panel-flexible-120.png', size: '1024x1024', prompt: `Flexible lightweight CIGS thin-film solar panel 120W gently curved, matte black surface with cable, ${PRODUCT_STYLE}` },

  // ── Batteries & Storage (5) ───────────────────────────────────────────────
  { file: '06-battery-rack-100ah.png', size: '1024x1024', prompt: `Server rack mounted LiFePO4 lithium battery 51.2V 100Ah, dark navy metal case with LCD display and terminals, 19-inch rack format, ${PRODUCT_STYLE}` },
  { file: '07-battery-agm-200ah.png', size: '1024x1024', prompt: `Deep-cycle AGM lead-acid battery 12V 200Ah, black case with brushed metal terminals and carrying handles, ${PRODUCT_STYLE}` },
  { file: '08-battery-wall-5kwh.png', size: '1024x1024', prompt: `Modern wall-mounted modular home energy battery 5kWh, minimalist white and light gray stack of modules with slim LED status strip, ${PRODUCT_STYLE}` },
  { file: '09-battery-powerstation.png', size: '1024x1024', prompt: `Portable solar power station 1024Wh with orange-accented dark case, LCD display, AC outlets, USB ports and carport socket, ${PRODUCT_STYLE}` },
  { file: '10-battery-lifepo4-50ah.png', size: '1024x1024', prompt: `Compact 12V 50Ah LiFePO4 lithium battery, slim dark gray case with metal terminals and low-voltage BMS port, ${PRODUCT_STYLE}` },

  // ── Inverters & Power (5) ─────────────────────────────────────────────────
  { file: '11-inverter-5000w.png', size: '1024x1024', prompt: `5000W pure sine wave off-grid inverter 48V, dark metal industrial case with LCD screen, heatsink fins and connection terminals, ${PRODUCT_STYLE}` },
  { file: '12-inverter-hybrid-6kw.png', size: '1024x1024', prompt: `Hybrid solar inverter 6kW wall-mount unit in light gray modern housing with touchscreen display and wiring compartment, ${PRODUCT_STYLE}` },
  { file: '13-inverter-micro-600.png', size: '1024x1024', prompt: `Microinverter 600W compact weatherproof unit, light gray case with MC4 cable pigtails and mounting bracket, ${PRODUCT_STYLE}` },
  { file: '14-inverter-string-3600.png', size: '1024x1024', prompt: `String grid-tie solar inverter 3.6kW, white outdoor housing with display and heat sink ribs, ${PRODUCT_STYLE}` },
  { file: '15-inverter-2000w-12v.png', size: '1024x1024', prompt: `Vehicle power inverter 2000W 12V with red and black battery clamps and dual AC sockets, dark case with cooling fan grille, ${PRODUCT_STYLE}` },

  // ── Solar Pumps (4) ───────────────────────────────────────────────────────
  { file: '16-pump-submersible-1hp.png', size: '1024x1024', prompt: `Stainless steel deep-well submersible solar pump 1.5HP, slim cylindrical body with cable guard and outlet flange, ${PRODUCT_STYLE}` },
  { file: '17-pump-borehole-kit.png', size: '1024x1024', prompt: `Three-inch solar borehole pump kit with submersible pump, controller box with LCD and solar input cables arranged together, ${PRODUCT_STYLE}` },
  { file: '18-pump-surface-irrigation.png', size: '1024x1024', prompt: `Solar surface centrifugal irrigation pump 2HP with cast iron housing, inlet and outlet pipes and mounting feet, ${PRODUCT_STYLE}` },
  { file: '19-pump-dc-750w.png', size: '1024x1024', prompt: `48V DC submersible solar water pump 750W with controller, compact stainless body and cable, small control box beside it, ${PRODUCT_STYLE}` },

  // ── Controllers & Accessories (4) ─────────────────────────────────────────
  { file: '20-controller-mppt-60a.png', size: '1024x1024', prompt: `MPPT solar charge controller 60A with blue backlit LCD display and heatsink, dark gray case with terminal covers, ${PRODUCT_STYLE}` },
  { file: '21-controller-pwm-30a.png', size: '1024x1024', prompt: `Compact PWM solar charge controller 30A with small digital display and USB port, black case, ${PRODUCT_STYLE}` },
  { file: '22-mount-rail-set.png', size: '1024x1024', prompt: `Aluminum solar panel mounting rail set with mid-clamps and end-clamps neatly arranged, silver anodized finish, ${PRODUCT_STYLE}` },
  { file: '23-cable-mc4-10m.png', size: '1024x1024', prompt: `Pair of coiled solar extension cables 10m with MC4 connectors in red and black, neatly wound, ${PRODUCT_STYLE}` },

  // ── Solar Lighting (3) ────────────────────────────────────────────────────
  { file: '24-light-street-60w.png', size: '1024x1024', prompt: `All-in-one solar street light 60W with integrated photovoltaic panel top, LED module and mounting arm bracket, slim gray housing, ${PRODUCT_STYLE}` },
  { file: '25-light-flood-100w.png', size: '1024x1024', prompt: `Solar flood light 100W with small solar panel, adjustable LED flood head and motion sensor, black die-cast housing, ${PRODUCT_STYLE}` },
  { file: '26-light-garden-set.png', size: '1024x1024', prompt: `Set of six modern solar garden path lights, brushed stainless steel posts with warm LED caps, arranged in a row, ${PRODUCT_STYLE}` },

  // ── Hero banners (4) ───────────────────────────────────────────────────────
  { file: 'banner-main.png', size: '1344x768', prompt: 'Wide cinematic photo of a modern suburban house rooftop fully covered with dark monocrystalline solar panels at golden hour, warm sunlight flare, clear sky, professional architectural photography, high quality, detailed' },
  { file: 'banner-panels.png', size: '1344x768', prompt: 'Wide cinematic photo of a large solar panel array field stretching to the horizon at sunrise, blue sky, professional photography, high quality, detailed' },
  { file: 'banner-storage.png', size: '1344x768', prompt: 'Wide photo of a sleek wall-mounted home battery storage system with stacked white modules in a bright modern utility room, professional interior photography, high quality, detailed' },
  { file: 'banner-pumps.png', size: '1344x768', prompt: 'Wide cinematic photo of solar panels powering a water pump station on a green farm with irrigation pipes and water tank, late afternoon light, professional photography, high quality, detailed' },
]

async function main() {
assertNotProd() // Phase 6 (6.0b.8/B1): fail-closed — no production mode, ever
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
    for (let attempt = 1; attempt <= 4 && !done; attempt++) {
      try {
        const res = await zai.images.generations.create({ prompt: item.prompt, size: item.size as never })
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
        await new Promise((r) => setTimeout(r, 2000 * attempt))
      }
    }
    if (!done) console.log(`!! FAILED: ${item.file}`)
  }
  const ok = Object.values(state).filter((v) => v === 'ok').length
  console.log(`DONE: ${ok}/${ITEMS.length} images ready in ${OUT_DIR}`)
  if (ok < ITEMS.length) process.exitCode = 2
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
