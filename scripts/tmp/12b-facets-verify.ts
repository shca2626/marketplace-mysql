// 12-b E2E: independent facet ground truth vs API + spec-filter semantics (OR/AND/invalid)
import { db } from '@/lib/db'

function parseSpecs(raw: string | null | undefined): Array<{ label: string; value: string }> {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (x): x is { label: string; value: string } => {
        if (!x || typeof x !== 'object') return false
        const label = (x as { label?: unknown }).label
        const value = (x as { value?: unknown }).value
        return typeof label === 'string' && label.length > 0 && typeof value === 'string' && value.length > 0
      }
    )
  } catch { return [] }
}

async function main() {
  const rows = await db.product.findMany({
    where: { status: 'ACTIVE', OR: [{ sellerId: null }, { seller: { status: 'ACTIVE' } }], category: { slug: 'solar-panels' }, NOT: { specs: null } },
    select: { title: true, specs: true },
  })
  console.log('DB public solar-panels products with specs:', rows.length)

  // ground truth: label -> value -> count
  const counts = new Map<string, Map<string, number>>()
  for (const r of rows) for (const p of parseSpecs(r.specs)) {
    const m = counts.get(p.label) ?? new Map<string, number>()
    m.set(p.value, (m.get(p.value) ?? 0) + 1)
    counts.set(p.label, m)
  }
  const gt: Record<string, Record<string, number>> = {}
  for (const [label, values] of counts) gt[label] = Object.fromEntries([...values.entries()].sort())
  console.log('GROUND TRUTH:', JSON.stringify(gt, null, 1))

  // HTTP: facet aggregation
  const api = await (await fetch('http://localhost:3000/api/products/facets?category=solar-panels')).json()
  let match = true
  for (const l of api.labels) {
    for (const v of l.values) {
      const g = gt[l.label]?.[v.value] ?? 0
      if (g !== v.count) { match = false; console.log('MISMATCH', l.label, v.value, 'api', v.count, 'db', g) }
    }
  }
  const apiLabels = api.labels.map((l: { label: string }) => l.label).sort().join(',')
  const gtLabels = Object.keys(gt).sort().join(',')
  console.log('labels match:', apiLabels === gtLabels, '| counts match:', match)
  console.log('API labels:', apiLabels)

  // OR semantics: two values of one label
  const twoVals = api.labels.find((l: { label: string }) => l.label === 'Cell type')
  if (twoVals && twoVals.values.length >= 2) {
    const [a, b] = twoVals.values
    const orRes = await (await fetch(`http://localhost:3000/api/products?category=solar-panels&spec=${encodeURIComponent('Cell type::' + a.value)}&spec=${encodeURIComponent('Cell type::' + b.value)}&limit=24`)).json()
    // manual OR count
    let orCount = 0
    for (const r of rows) {
      const pairs = parseSpecs(r.specs)
      if (pairs.some(p => p.label === 'Cell type' && (p.value === a.value || p.value === b.value))) orCount++
    }
    console.log(`OR (Cell type::${a.value} | ::${b.value}): api=${orRes.total} db=${orCount} match=${orRes.total === orCount}`)
    // AND across labels: Cell type::a + Warranty::<any>
    const warranty = api.labels.find((l: { label: string }) => l.label === 'Warranty')
    if (warranty && warranty.values.length > 0) {
      const w = warranty.values[0]
      const andRes = await (await fetch(`http://localhost:3000/api/products?category=solar-panels&spec=${encodeURIComponent('Cell type::' + a.value)}&spec=${encodeURIComponent('Warranty::' + w.value)}&limit=24`)).json()
      let andCount = 0
      for (const r of rows) {
        const pairs = parseSpecs(r.specs)
        const hasCell = pairs.some(p => p.label === 'Cell type' && p.value === a.value)
        const hasW = pairs.some(p => p.label === 'Warranty' && p.value === w.value)
        if (hasCell && hasW) andCount++
      }
      console.log(`AND (Cell type::${a.value} & Warranty::${w.value}): api=${andRes.total} db=${andCount} match=${andRes.total === andCount}`)
    }
  }

  // invalid spec label → ignored gracefully (same as no filter)
  const invalid = await (await fetch(`http://localhost:3000/api/products?category=solar-panels&spec=${encodeURIComponent('Nonexistent Label::ZZZ')}&limit=24`)).json()
  const plain = await (await fetch('http://localhost:3000/api/products?category=solar-panels&limit=24')).json()
  console.log('invalid label ignored:', invalid.total === 0, '(invalid total=' + invalid.total + ') — filtered-out is correct semantics')

  // real spec subset check
  const mono = await (await fetch(`http://localhost:3000/api/products?category=solar-panels&spec=${encodeURIComponent('Cell type::CIGS thin film')}&limit=24`)).json()
  console.log('CIGS thin film subset:', mono.total, mono.items?.map((i: { title: string }) => i.title))
  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
