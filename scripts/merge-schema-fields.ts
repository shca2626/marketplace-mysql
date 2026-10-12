/**
 * scripts/merge-schema-fields.ts — pass 2: merge missing COLUMNS on shared
 * models from the reference schema, but ONLY columns that verifiably exist in
 * the live DB (checked against the db-pull introspection file). This keeps the
 * schema truthful to the database (no speculative fields) while catching the
 * drift the runtime code depends on.
 *
 * Usage: bun scripts/merge-schema-fields.ts <reference-schema.prisma> <db-introspect.prisma>
 */
import { readFileSync, writeFileSync } from 'fs'

const target = 'prisma/schema.prisma'
const [refPath, dbPath] = process.argv.slice(2)
if (!refPath || !dbPath) {
  console.error('usage: bun scripts/merge-schema-fields.ts <reference> <db-introspect>')
  process.exit(1)
}

interface Block {
  name: string
  lines: string[]
}

function parseModels(src: string): Map<string, Block> {
  const lines = src.split('\n')
  const out = new Map<string, Block>()
  let i = 0
  while (i < lines.length) {
    const m = /^model (\w+) \{/.exec(lines[i])
    if (m) {
      const start = i
      let depth = 1
      let j = i + 1
      while (j < lines.length && depth > 0) {
        if (/^\}/.test(lines[j])) break
        j++
      }
      out.set(m[1], { name: m[1], lines: lines.slice(start, j + 1) })
      i = j + 1
    } else i++
  }
  return out
}

/** field name -> definition line, for scalar fields only (not relations/attrs) */
function scalarFields(block: Block): Map<string, { line: string; index: number }> {
  const out = new Map<string, { line: string; index: number }>()
  for (let k = 1; k < block.lines.length - 1; k++) {
    const raw = block.lines[k]
    const fm = /^  (\w+)\s+(\w+)(\?|[^(\s]*)?/.exec(raw)
    if (!fm) continue
    const [, name, type] = fm
    if (/@relation\(/.test(raw)) continue // relation field
    out.set(name, { line: raw, index: k })
  }
  return out
}

const local = parseModels(readFileSync(target, 'utf8'))
const ref = parseModels(readFileSync(refPath, 'utf8'))
const dbi = parseModels(readFileSync(dbPath, 'utf8'))

let totalAdded = 0
const merged = new Map<string, Block>()
for (const [name, block] of local) {
  const refBlock = ref.get(name)
  const dbBlock = dbi.get(name)
  if (!refBlock || !dbBlock) {
    merged.set(name, block)
    continue
  }
  const mine = scalarFields(block)
  const theirs = scalarFields(refBlock)
  const dbFields = scalarFields(dbBlock)
  const additions: string[] = []
  for (const [fname, def] of theirs) {
    if (mine.has(fname)) continue
    // ONLY add when the live DB actually carries the column
    if (!dbFields.has(fname)) {
      console.log(`  ! skip ${name}.${fname}: not in live DB`)
      continue
    }
    additions.push(def.line)
    totalAdded++
  }
  if (additions.length === 0) {
    merged.set(name, block)
    continue
  }
  console.log(`  + ${name}: ${additions.length} column(s): ${additions.map((a) => /^  (\w+)/.exec(a)![1]).join(', ')}`)
  const body = block.lines.slice(1, -1)
  let insertAt = body.length
  while (insertAt > 0 && /^(\s*@|\s*$)/.test(body[insertAt - 1])) insertAt--
  merged.set(name, {
    name,
    lines: [block.lines[0], ...body.slice(0, insertAt), ...additions, ...body.slice(insertAt), block.lines[block.lines.length - 1]],
  })
}

let out = ''
for (const block of merged.values()) out += block.lines.join('\n') + '\n\n'
writeFileSync(target, out.trimEnd() + '\n')
console.log(`\n✓ added ${totalAdded} verified columns across shared models`)
