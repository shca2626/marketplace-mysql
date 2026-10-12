/**
 * scripts/merge-schema-models.ts — one-shot schema reconciliation.
 *
 * The shared Aiven DB is a superset of the checked-out branch's schema: it was
 * extended (subscription/KYC/WhatsApp/financing/brand models) while this branch's
 * prisma/schema.prisma lagged behind. The runtime code already references those
 * models (db.sellerSubscription, db.kycCase, …) — they only miss declarations.
 *
 * This script merges the missing model blocks (and their relation fields on
 * shared models) from the reference schema file into prisma/schema.prisma.
 * Reference definitions were verified against a live `prisma db pull` — the DB
 * already contains every table, so NO migration is required.
 *
 * Usage: bun scripts/merge-schema-models.ts <reference-schema.prisma>
 */
import { readFileSync, writeFileSync } from 'fs'

const target = 'prisma/schema.prisma'
const refPath = process.argv[2]
if (!refPath) {
  console.error('usage: bun scripts/merge-schema-models.ts <reference-schema.prisma>')
  process.exit(1)
}

interface ModelBlock {
  name: string
  lines: string[] // full block including header/footer braces
}

function parseModels(src: string): Map<string, ModelBlock> {
  const lines = src.split('\n')
  const out = new Map<string, ModelBlock>()
  let i = 0
  while (i < lines.length) {
    const m = /^model (\w+) \{/.exec(lines[i])
    if (m) {
      const start = i
      let depth = 1
      let j = i + 1
      while (j < lines.length && depth > 0) {
        if (/^\}/.test(lines[j])) depth--
        if (depth === 0) break
        j++
      }
      out.set(m[1], { name: m[1], lines: lines.slice(start, j + 1) })
      i = j + 1
    } else {
      i++
    }
  }
  return out
}

const localSrc = readFileSync(target, 'utf8')
const refSrc = readFileSync(refPath, 'utf8')
const local = parseModels(localSrc)
const ref = parseModels(refSrc)

const missing = [...ref.keys()].filter((k) => !local.has(k)).sort()
console.log(`local models: ${local.size}, reference models: ${ref.size}`)
console.log(`missing from local (to merge): ${missing.length}`)
console.log(missing.join(', '))

if (missing.length === 0) {
  console.log('nothing to merge — done')
  process.exit(0)
}

const missingSet = new Set(missing)

// ── 1. append the missing model blocks ─────────────────────────────────────
let out = localSrc.replace(/\s*$/, '') + '\n'

// ── 2. relation fields on shared models that reference missing models ─────
// For every local model, find fields in the reference version of the SAME
// model whose type is one of the missing models — append them (with their
// attributes) into the local block.
let addedFields = 0
const newLocal = new Map<string, ModelBlock>()
for (const [name, block] of local) {
  const refBlock = ref.get(name)
  if (!refBlock) {
    newLocal.set(name, block)
    continue
  }
  // gather reference field lines referencing missing models
  const additions: string[] = []
  for (let k = 1; k < refBlock.lines.length - 1; k++) {
    const line = refBlock.lines[k]
    const fm = /^\s+(\w+)\s+(\w+)(\?|\[\])?/.exec(line)
    if (!fm) continue
    const [, , type] = fm
    if (missingSet.has(type)) additions.push(line)
  }
  if (additions.length === 0) {
    newLocal.set(name, block)
    continue
  }
  // strip any local fields with the SAME name (avoid duplicates)
  const addNames = new Set(additions.map((l) => /^\s+(\w+)/.exec(l)![1]))
  const body = block.lines.slice(1, -1).filter((l) => {
    const fm = /^\s+(\w+)\s+\w+/.exec(l)
    return !(fm && addNames.has(fm[1]))
  })
  // insert additions before @@-attribute lines at the end of the body
  let insertAt = body.length
  while (insertAt > 0 && /^(\s*@|\s*$)/.test(body[insertAt - 1])) insertAt--
  const mergedBody = [...body.slice(0, insertAt), ...additions, ...body.slice(insertAt)]
  newLocal.set(name, {
    name,
    lines: [block.lines[0], ...mergedBody, block.lines[block.lines.length - 1]],
  })
  addedFields += additions.length
  console.log(`  + ${name}: ${additions.length} relation field(s) referencing merged models`)
}

// rebuild the whole file from the merged local blocks, then append missing models
let rebuilt = ''
for (const block of newLocal.values()) rebuilt += block.lines.join('\n') + '\n\n'
out = rebuilt.trimEnd() + '\n'

// append missing model blocks grouped with a banner
out += '\n// ─────────────────────────────────────────────────────────────────────────────\n'
out += '// Models merged from the shared database (subscription/KYC/WhatsApp/financing/\n'
out += '// brand/ops surfaces). The tables already exist — declarations only.\n'
out += '// ─────────────────────────────────────────────────────────────────────────────\n'
for (const name of missing) {
  out += '\n' + ref.get(name)!.lines.join('\n') + '\n'
}

writeFileSync(target, out)
console.log(`\n✓ merged ${missing.length} model blocks + ${addedFields} relation fields into ${target}`)
console.log('Run: npx prisma format && npx prisma generate')
