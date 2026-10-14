import { db } from '@/lib/db'
import { cached, CACHE_TAGS } from '@/lib/cache'

// ─────────────────────────────────────────────────────────────────────────────
// SPEC-ATTRIBUTE FACETS (lastplan v5 §12, task 12-b) — the "Refine" rail.
//
// Product.specs is a JSON Text column ([{label, value}]) generated from the
// structured SpecAttribute dictionary. Querying a JSON array of objects with
// pure SQL means JSON_TABLE — heavy and awkward through Prisma. PRAGMATIC
// approach (documented deliberately): for a category's ACTIVE products
// (bounded set), parse the specs JSON in JS and aggregate. The aggregation is
// cached 60s in-memory (tag: products — product writes invalidate it).
//
// Filtering the product LIST by spec values (products route) reuses the same
// parsing: the SQL query keeps every non-spec filter, the spec predicates run
// in JS, pagination happens in memory — ONLY when spec filters are present;
// the no-facet path keeps the existing pure-SQL flow untouched.
// ─────────────────────────────────────────────────────────────────────────────

export interface SpecPair {
  label: string
  value: string
}

/** A requested Label::Value facet pair (same shape as a spec pair). */
export type SpecFilter = SpecPair

const SPEC_PAIR_MAX = 12
const FACET_VALUES_MAX = 8

/** Parse a raw specs JSON column into pairs (bad JSON / shapes → []). */
export function parseSpecs(raw: string | null | undefined): SpecPair[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is SpecPair => {
      if (typeof x !== 'object' || x === null) return false
      const label = (x as { label?: unknown }).label
      const value = (x as { value?: unknown }).value
      return typeof label === 'string' && label.length > 0 && typeof value === 'string' && value.length > 0
    })
  } catch {
    return []
  }
}

/**
 * Parse the repeatable `spec=<label>::<value>` params. Splits on the FIRST
 * `::` (labels can't contain it; values could, in theory). Malformed entries
 * are ignored gracefully; duplicates collapse; capped at 12 pairs.
 */
export function parseSpecFilters(values: string[]): SpecFilter[] {
  const seen = new Set<string>()
  const out: SpecFilter[] = []
  for (const raw of values) {
    const s = raw.trim()
    const sep = s.indexOf('::')
    if (sep <= 0) continue // no separator or empty label — ignore
    const label = s.slice(0, sep).trim()
    const value = s.slice(sep + 2).trim()
    if (!label || !value) continue
    const key = `${label}\u0000${value}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ label, value })
    if (out.length >= SPEC_PAIR_MAX) break
  }
  return out
}

/** True when the product's parsed specs satisfy the filters: OR within one label, AND across labels. */
export function matchesSpecFilters(pairs: SpecPair[], filters: SpecFilter[]): boolean {
  const byLabel = new Map<string, Set<string>>()
  for (const p of pairs) {
    let set = byLabel.get(p.label)
    if (!set) byLabel.set(p.label, (set = new Set()))
    set.add(p.value)
  }
  // group the requested values per label first (spec=A::x&spec=A::y = OR)
  const wantedPerLabel = new Map<string, Set<string>>()
  for (const f of filters) {
    let set = wantedPerLabel.get(f.label)
    if (!set) wantedPerLabel.set(f.label, (set = new Set()))
    set.add(f.value)
  }
  // every filtered label must contribute at least one matching value (AND)
  for (const [label, wanted] of wantedPerLabel) {
    const present = byLabel.get(label)
    if (!present) return false
    let hit = false
    for (const v of wanted) if (present.has(v)) { hit = true; break }
    if (!hit) return false
  }
  return true
}

// ── Facet aggregation ───────────────────────────────────────────────────────

export interface FacetValue {
  value: string
  count: number
}
export interface FacetLabel {
  label: string
  /** From the structured SpecAttribute dictionary (key/unit when known). */
  key: string | null
  unit: string | null
  values: FacetValue[]
}
export interface CategoryFacets {
  category: { slug: string; name: string } | null
  labels: FacetLabel[]
}

/**
 * Aggregate facet labels/values for a category's public (ACTIVE, live-seller)
 * products. Label order: the category's SpecAttribute definitions first
 * (category rows then globals, position order), then any extra labels found in
 * specs (alphabetical). Values: distinct with counts, count-desc, top 8.
 *
 * Cached 60s per category — the parsed aggregate is shared by every request
 * for that category's refine rail.
 */
export async function categoryFacets(categorySlug: string): Promise<CategoryFacets> {
  const category = await db.category.findUnique({
    where: { slug: categorySlug },
    select: { id: true, slug: true, name: true },
  })
  if (!category) return { category: null, labels: [] }

  // Structured dictionary drives the primary label order (category rows,
  // then globals — same ordering listActiveSpecAttributes uses).
  const loader = async (): Promise<CategoryFacets> => {
    const [categoryAttrs, globalAttrs, rows] = await Promise.all([
      db.specAttribute.findMany({
        where: { categoryId: category.id, isActive: true },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        select: { key: true, label: true, unit: true },
        take: 60,
      }),
      db.specAttribute.findMany({
        where: { categoryId: null, isActive: true },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        select: { key: true, label: true, unit: true },
        take: 60,
      }),
      db.product.findMany({
        where: {
          status: 'ACTIVE',
          seller: { status: 'ACTIVE' }, // sellerId is non-nullable — platform rows always have a seller
          categoryId: category.id,
          NOT: { specs: null },
        },
        select: { specs: true },
        take: 2000,
      }),
    ])

    const counts = new Map<string, Map<string, number>>()
    for (const r of rows) {
      for (const p of parseSpecs(r.specs)) {
        let values = counts.get(p.label)
        if (!values) counts.set(p.label, (values = new Map()))
        values.set(p.value, (values.get(p.value) ?? 0) + 1)
      }
    }

    const dict = new Map<string, { key: string; unit: string | null }>()
    for (const a of [...categoryAttrs, ...globalAttrs]) {
      if (!dict.has(a.label)) dict.set(a.label, { key: a.key, unit: a.unit })
    }

    const orderedLabels = [
      ...[...dict.keys()].filter((l) => counts.has(l)), // dictionary labels that actually have data
      ...[...counts.keys()].filter((l) => !dict.has(l)).sort(), // extra labels found in specs
    ]

    const labels: FacetLabel[] = orderedLabels.map((label) => {
      const def = dict.get(label) ?? null
      const values = [...(counts.get(label)?.entries() ?? [])]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
        .slice(0, FACET_VALUES_MAX)
      return { label, key: def?.key ?? null, unit: def?.unit ?? null, values }
    })

    return { category: { slug: category.slug, name: category.name }, labels }
  }

  return cached(`facets:${category.slug}:v1`, loader, { ttlMs: 60_000, tags: [CACHE_TAGS.products] })
}
