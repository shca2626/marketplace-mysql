import { db } from '@/lib/db'

// ─────────────────────────────────────────────────────────────────────────────
// TYPO-TOLERANT SEARCH (lastplan v5 §12, task 12-b) — normalized comparison.
//
// The catalog query itself stays pure SQL (multi-term `contains`); this module
// only runs when that query returns ZERO results for a term. It builds a
// normalized lowercase vocabulary from product titles + category names (in the
// active category-or-global scope), then finds close words by edit distance:
//
//   distance ≤ 1 for words shorter than 6 chars  (fewer legal typos)
//   distance ≤ 2 otherwise
//
// `levenshtein` is the classic DP variant with pragmatic bounds (strings
// capped at 64 chars; length diff > 3 short-circuits to ∞) so a hostile or
// absurd query can never spin the O(n·m) table into a hot loop.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_WORD_LEN = 64
const MAX_LEN_DIFF = 3

/** Classic DP edit distance; bounded — returns Infinity when out of scope. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length > MAX_WORD_LEN || b.length > MAX_WORD_LEN) return Infinity
  const diff = Math.abs(a.length - b.length)
  if (diff > MAX_LEN_DIFF) return Infinity // early exit — can never be ≤ 2

  let prev = new Array<number>(b.length + 1)
  let curr = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    const swap = prev
    prev = curr
    curr = swap
  }
  return prev[b.length]
}

/** Max tolerated edit distance for a candidate word of this length. */
function toleranceFor(word: string): number {
  return word.length < 6 ? 1 : 2
}

/** Split a phrase into normalized lowercase words (a–z0–9 runs only). */
function wordsOf(phrase: string): string[] {
  return phrase
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && w.length <= MAX_WORD_LEN)
}

/**
 * Vocabulary for the search scope: words from ACTIVE product titles (bounded
 * `take: 400`, public storefront visibility — curated rows included, rows of
 * non-ACTIVE sellers excluded) + all category names (global scope) or just the
 * active category's name (category scope). Bounded so a huge catalog can never
 * blow the response time.
 */
export async function searchVocabulary(categorySlug: string): Promise<string[]> {
  const titles = await db.product.findMany({
    where: {
      status: 'ACTIVE',
      seller: { status: 'ACTIVE' }, // sellerId is non-nullable — platform rows always have a seller
      ...(categorySlug ? { category: { slug: categorySlug } } : {}),
    },
    select: { title: true },
    take: 400,
  })
  const vocab = new Set<string>()
  for (const t of titles) for (const w of wordsOf(t.title)) vocab.add(w)

  const categories = await db.category.findMany({
    where: categorySlug ? { slug: categorySlug } : {},
    select: { name: true },
    take: 100,
  })
  for (const c of categories) for (const w of wordsOf(c.name)) vocab.add(w)

  return [...vocab]
}

export interface TermSuggestion {
  /** The corrected word (best candidate found). */
  corrected: string
  /** Runner-ups for "did you mean" chips (best first, no duplicates). */
  alternates: string[]
  /** Levenshtein distance of the best candidate. */
  distance: number
}

/**
 * Find the closest vocabulary words to a (single) query word.
 * Terms longer than the vocabulary tolerance ceiling still get a chance via
 * the ≤2 band. Returns null when nothing is close enough.
 */
export function suggestWord(word: string, vocabulary: string[]): TermSuggestion | null {
  const w = word.toLowerCase()
  if (w.length < 2) return null

  let best: string | null = null
  let bestDist = Infinity
  const close: Array<{ word: string; dist: number }> = []

  for (const cand of vocabulary) {
    if (cand === w) continue // exact word — the SQL search should have matched
    const dist = levenshtein(w, cand)
    if (dist === Infinity) continue
    const tol = toleranceFor(w)
    if (dist <= tol || dist <= 2) {
      close.push({ word: cand, dist })
      if (dist < bestDist || (dist === bestDist && cand.length < (best?.length ?? Infinity))) {
        best = cand
        bestDist = dist
      }
    }
  }

  if (!best || bestDist > 2) return null
  const alternates = close
    .filter((c) => c.word !== best)
    .sort((a, b) => a.dist - b.dist || b.word.length - a.word.length)
    .slice(0, 3)
    .map((c) => c.word)
  return { corrected: best, alternates, distance: bestDist }
}

/**
 * Suggest corrections for a whole query phrase: suggest per term (the term
 * list mirrors the products route's own multi-term split), return the best
 * per-term replacement plus the full corrected phrase when EVERY term with a
 * suggestion is covered. Terms that already look fine pass through unchanged.
 */
export async function suggestTerm(
  q: string,
  categorySlug: string
): Promise<{ correctedQuery: string | null; best: TermSuggestion | null }> {
  const terms = q.split(/\s+/).map((t) => t.trim()).filter(Boolean).slice(0, 8)
  if (terms.length === 0) return { correctedQuery: null, best: null }

  const vocabulary = await searchVocabulary(categorySlug)
  let replacedAny = false
  let best: TermSuggestion | null = null
  const fixedTerms = terms.map((term) => {
    // Already-exact vocabulary words need no correction.
    const lower = term.toLowerCase()
    if (vocabulary.includes(lower)) return term
    const s = suggestWord(lower, vocabulary)
    if (!s) return term
    replacedAny = true
    if (!best || s.distance < best.distance) best = s
    return s.corrected
  })

  return {
    correctedQuery: replacedAny ? fixedTerms.join(' ') : null,
    best,
  }
}
