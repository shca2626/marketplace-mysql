/**
 * Orphaned-upload cleanup for public/uploads/products.
 *
 * Deletes uploaded files that are no longer referenced by any product.
 * IMPORTANT: Product.images is a JSON *string* column (@db.Text), so it must
 * be JSON.parsed — never flatMap'd directly (a string spreads into chars and
 * every file then looks unreferenced).
 *
 * Usage:
 *   bun run scripts/cleanup-uploads.ts            # dry run (default, safe)
 *   bun run scripts/cleanup-uploads.ts --delete   # actually delete orphans
 */
import { db } from '../src/lib/db'
import { readdirSync, statSync, unlinkSync } from 'fs'
import path from 'path'
import { assertNotProd } from './lib/assert-not-prod'

async function main() {
assertNotProd() // Phase 6 (6.0b.8/B1): fail-closed — no production mode, ever
  const doDelete = process.argv.includes('--delete')
  const products = await db.product.findMany({ select: { images: true } })

  const referenced = new Set<string>()
  for (const p of products) {
    let imgs: unknown = p.images
    if (typeof imgs === 'string') {
      try {
        imgs = JSON.parse(imgs)
      } catch {
        imgs = []
      }
    }
    if (Array.isArray(imgs)) for (const u of imgs) if (typeof u === 'string') referenced.add(u)
  }

  const dir = path.join(process.cwd(), 'public', 'uploads', 'products')
  let kept = 0
  let orphans = 0
  for (const f of readdirSync(dir)) {
    if (f === '.gitkeep') continue
    const url = `/uploads/products/${f}`
    if (referenced.has(url)) {
      kept++
      continue
    }
    orphans++
    const full = path.join(dir, f)
    const kb = Math.round(statSync(full).size / 1024)
    if (doDelete) {
      unlinkSync(full)
      console.log(`deleted  ${f} (${kb} KB)`)
    } else {
      console.log(`orphan   ${f} (${kb} KB) — re-run with --delete to remove`)
    }
  }
  console.log(`\nreferenced: ${kept} · orphans: ${orphans} · mode: ${doDelete ? 'DELETE' : 'dry-run'}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
