import { db } from '@/lib/db'
import { recordAudit } from '@/server/modules/audit/service'

/**
 * DYNAMIC CURRENCY SERVICE (Phase 8 — live rates on the Phase 7.2 substrate)
 * ────────────────────────────────────────────────────────────────────────────
 * Everything dynamic, nothing hardcoded: exchange rates change every day
 * (1 USD → YER 535.5 today, something else next week) so the operative rate is
 * DATA in the Currency / ExchangeRate tables:
 *
 *   · Currency        — the admin-managed catalog (code, symbol, decimals…)
 *   · ExchangeRate    — append-only history; latest row per pair = operative
 *
 * This engine adds the LIVE dimension on top: no-key open exchange feeds
 * (open.er-api.com → jsDelivr currency-api fallback) write fresh ExchangeRate
 * rows on demand; manual admin pins (source ADMIN) are respected until reset;
 * the public GET self-heals stale data in the background.
 */

const SETTING_KEY = 'currency'

export interface CurrencySettings {
  base: string
  /** public GET triggers a background live refresh when data is older than this */
  autoRefreshMinutes: number
}

const DEFAULT_SETTINGS: CurrencySettings = {
  base: 'USD',
  autoRefreshMinutes: 180,
}

/** First-boot catalog (rates are placeholders — live refresh replaces them). */
const SEED_CURRENCIES: Array<{ code: string; name: string; symbol: string | null; decimals: number }> = [
  { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2 },
  { code: 'YER', name: 'Yemeni Rial', symbol: 'ر.ي', decimals: 0 },
  { code: 'SAR', name: 'Saudi Riyal', symbol: 'ر.س', decimals: 2 },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', decimals: 2 },
  { code: 'EGP', name: 'Egyptian Pound', symbol: 'ج.م', decimals: 2 },
  { code: 'JOD', name: 'Jordanian Dinar', symbol: 'د.ا', decimals: 3 },
  { code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'د.ك', decimals: 3 },
  { code: 'QAR', name: 'Qatari Riyal', symbol: 'ر.ق', decimals: 2 },
  { code: 'BHD', name: 'Bahraini Dinar', symbol: 'د.ب', decimals: 3 },
  { code: 'OMR', name: 'Omani Rial', symbol: 'ر.ع', decimals: 3 },
  { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2 },
  { code: 'GBP', name: 'British Pound', symbol: '£', decimals: 2 },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺', decimals: 2 },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', decimals: 2 },
]

// ── Public payload (shape consumed by the storefront store + switcher) ──────
let cache: { at: number; payload: PublicCurrencyPayload } | null = null

export interface PublicCurrency {
  code: string
  name: string
  symbol: string
  rateToUsd: number
  displayDecimals: number
  isManual: boolean
  source: string
  lastSyncedAt: string | null
}

export interface PublicCurrencyPayload {
  base: string
  autoRefreshMinutes: number
  currencies: PublicCurrency[]
  lastRefreshedAt: string | null
}

export function invalidateCurrencyCache(): void {
  cache = null
}

let seedPromise: Promise<void> | null = null

async function ensureSeeded(): Promise<void> {
  // PERF-3 (10k-concurrent criterion): this used to run ~10 blind upserts on
  // EVERY call — ≈20 remote round-trips (5-7s against remote Aiven) paid
  // before even the 60s cache check. Now: once per process (memoized), and
  // a single COUNT first so the common case is ONE round-trip.
  if (!seedPromise) {
    seedPromise = (async () => {
      const existing = await db.currency.count()
      if (existing > 0) return // catalog already populated — nothing to top up
      for (const c of SEED_CURRENCIES) {
        await db.currency.upsert({
          where: { code: c.code },
          update: {},
          create: { code: c.code, name: c.name, symbol: c.symbol, decimals: c.decimals, isActive: true },
        })
      }
    })().catch((err) => {
      seedPromise = null // allow retry on transient failure
      throw err
    })
  }
  return seedPromise
}

export async function getCurrencySettings(): Promise<CurrencySettings> {
  try {
    const row = await db.platformSetting.findUnique({ where: { key: SETTING_KEY } })
    if (!row) return DEFAULT_SETTINGS
    const parsed = JSON.parse(row.value) as Partial<CurrencySettings>
    return {
      base: parsed.base ?? DEFAULT_SETTINGS.base,
      autoRefreshMinutes: parsed.autoRefreshMinutes ?? DEFAULT_SETTINGS.autoRefreshMinutes,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

async function saveCurrencySettings(next: CurrencySettings): Promise<void> {
  await db.platformSetting.upsert({
    where: { key: SETTING_KEY },
    update: { value: JSON.stringify(next) },
    create: { key: SETTING_KEY, value: JSON.stringify(next) },
  })
}

export async function updateCurrencySettings(patch: Partial<CurrencySettings>): Promise<CurrencySettings> {
  const current = await getCurrencySettings()
  const next: CurrencySettings = {
    base: patch.base ?? current.base,
    autoRefreshMinutes: patch.autoRefreshMinutes ?? current.autoRefreshMinutes,
  }
  await saveCurrencySettings(next)
  invalidateCurrencyCache()
  return next
}

/** Latest ExchangeRate for a pair (the operative rate) — null when none. */
async function latestRate(code: string): Promise<{ rate: number; source: string; validFrom: Date } | null> {
  if (code === 'USD') return { rate: 1, source: 'base', validFrom: new Date() }
  const row = await db.exchangeRate.findFirst({
    where: { baseCode: 'USD', quoteCode: code },
    orderBy: { validFrom: 'desc' },
  })
  if (!row) return null
  return { rate: Number(row.rate), source: row.source, validFrom: row.validFrom }
}

/**
 * PERF-3: batched latest-rate-per-code lookup (ONE round-trip instead of the
 * sequential per-currency latestRate() N+1 — each hop was a full remote-DB
 * latency against Aiven). Used by multi-currency read paths.
 */
async function latestRatesForCodes(codes: string[]): Promise<Map<string, { rate: number; source: string; validFrom: Date }>> {
  const out = new Map<string, { rate: number; source: string; validFrom: Date }>()
  const targets = codes.filter((c) => c !== 'USD')
  if (targets.length === 0) return out
  const rows = await db.exchangeRate.findMany({
    where: { baseCode: 'USD', quoteCode: { in: targets } },
    orderBy: [{ validFrom: 'desc' }],
    distinct: ['quoteCode'],
  })
  for (const row of rows) {
    out.set(row.quoteCode, { rate: Number(row.rate), source: row.source, validFrom: row.validFrom })
  }
  return out
}

/**
 * Public payload for the storefront: active currencies + their operative
 * rates (latest history row per pair). Cheap 60s cache; self-heals stale
 * data in the background (fire-and-forget live refresh past the window).
 */
export async function getPublicCurrencies(): Promise<PublicCurrencyPayload> {
  // PERF-3: cache check FIRST — a warm payload must not pay even the (now
  // cheap) seed guard or any DB round-trip.
  if (cache && Date.now() - cache.at < 60_000) return cache.payload
  await ensureSeeded()
  const [settings, rows] = await Promise.all([
    getCurrencySettings(),
    db.currency.findMany({ orderBy: [{ code: 'asc' }] }),
  ])
  const active = rows.filter((r) => r.isActive)
  const currencies: PublicCurrency[] = []
  let newestSync: Date | null = null
  // PERF-3: ONE batched round-trip for all operative rates (was a
  // sequential latestRate() per currency — an N+1 over remote Aiven).
  const rates = await latestRatesForCodes(active.map((r) => r.code))
  for (const r of active) {
    const latest = rates.get(r.code) ?? null
    if (latest && (!newestSync || latest.validFrom > newestSync)) newestSync = latest.validFrom
    currencies.push({
      code: r.code,
      name: r.name,
      symbol: r.symbol ?? r.code,
      rateToUsd: r.code === 'USD' ? 1 : (latest?.rate ?? 0),
      displayDecimals: r.decimals,
      isManual: latest?.source === 'ADMIN',
      source: r.code === 'USD' ? 'base' : (latest?.source ?? 'none'),
      lastSyncedAt: latest?.validFrom.toISOString() ?? null,
    })
  }
  // USD first, then alphabetical — stable switcher order
  currencies.sort((a, b) => (a.code === 'USD' ? -1 : b.code === 'USD' ? 1 : a.code.localeCompare(b.code)))
  const payload: PublicCurrencyPayload = {
    base: settings.base,
    autoRefreshMinutes: settings.autoRefreshMinutes,
    currencies,
    lastRefreshedAt: newestSync ? newestSync.toISOString() : null,
  }
  cache = { at: Date.now(), payload }
  if (newestSync && Date.now() - newestSync.getTime() > settings.autoRefreshMinutes * 60_000) {
    void refreshLiveRates().catch(() => undefined)
  }
  return payload
}

export async function listAllCurrencyRows() {
  await ensureSeeded()
  const rows = await db.currency.findMany({ orderBy: [{ code: 'asc' }] })
  const out: (PublicCurrency & { id: string; isActive: boolean })[] = []
  for (const r of rows) {
    const latest = await latestRate(r.code)
    out.push({
      id: r.id,
      code: r.code,
      name: r.name,
      symbol: r.symbol ?? r.code,
      rateToUsd: r.code === 'USD' ? 1 : (latest?.rate ?? 0),
      displayDecimals: r.decimals,
      source: r.code === 'USD' ? 'base' : (latest?.source ?? 'none'),
      isManual: latest?.source === 'ADMIN',
      isActive: r.isActive,
      lastSyncedAt: latest?.validFrom.toISOString() ?? null,
    })
  }
  return out.sort((a: { code: string }, b: { code: string }) => (a.code === 'USD' ? -1 : b.code === 'USD' ? 1 : a.code.localeCompare(b.code)))
}

// ── Live refresh ─────────────────────────────────────────────────────────────

interface LiveFeed {
  source: string
  rates: Record<string, number> // CODE → units per 1 USD
}

async function fetchErApi(): Promise<LiveFeed | null> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      signal: AbortSignal.timeout(12_000),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const json = (await res.json()) as { result?: string; rates?: Record<string, number> }
    if (json.result !== 'success' || !json.rates) return null
    return { source: 'LIVE:er-api', rates: json.rates }
  } catch {
    return null
  }
}

async function fetchJsDelivr(): Promise<LiveFeed | null> {
  try {
    const res = await fetch(
      'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
      { signal: AbortSignal.timeout(12_000), cache: 'no-store' }
    )
    if (!res.ok) return null
    const json = (await res.json()) as { usd?: Record<string, number> }
    if (!json.usd) return null
    const rates: Record<string, number> = {}
    for (const [k, v] of Object.entries(json.usd)) rates[k.toUpperCase()] = v
    return { source: 'LIVE:jsdelivr', rates }
  } catch {
    return null
  }
}

export interface RefreshResult {
  updated: string[]
  skippedManual: string[]
  source: string | null
  failed: boolean
  message: string
}

/**
 * Fetch fresh rates and append them to the ExchangeRate history (the newest
 * row per pair becomes operative). Currencies whose latest rate is an ADMIN
 * pin are respected and skipped until an admin resets them.
 */
export async function refreshLiveRates(): Promise<RefreshResult> {
  await ensureSeeded()
  const feed = (await fetchErApi()) ?? (await fetchJsDelivr())
  const rows = await db.currency.findMany()
  if (!feed) {
    return {
      updated: [],
      skippedManual: [],
      source: null,
      failed: true,
      message: 'All live exchange feeds are unreachable right now — existing DB rates stay in effect.',
    }
  }
  const updated: string[] = []
  const skippedManual: string[] = []
  for (const row of rows) {
    if (row.code === 'USD') continue
    const latest = await latestRate(row.code)
    if (latest?.source === 'ADMIN') {
      skippedManual.push(row.code)
      continue
    }
    const live = feed.rates[row.code]
    if (typeof live !== 'number' || !Number.isFinite(live) || live <= 0) continue
    await db.exchangeRate.create({
      data: {
        baseCode: 'USD',
        quoteCode: row.code,
        rate: live,
        source: feed.source,
        validFrom: new Date(),
      },
    })
    updated.push(row.code)
  }
  invalidateCurrencyCache()
  return {
    updated,
    skippedManual,
    source: feed.source,
    failed: false,
    message: `Live rates fetched from ${feed.source} — ${updated.length} currencies updated${
      skippedManual.length ? `, ${skippedManual.length} manual pin(s) kept` : ''
    }.`,
  }
}

export async function setManualRate(code: string, rateToUsd: number, adminId?: string): Promise<void> {
  const row = await db.currency.findUnique({ where: { code } })
  if (!row) throw new Error(`Unknown currency ${code}`)
  if (row.code === 'USD') throw new Error('The base currency is always 1 — pick another currency')
  if (!(rateToUsd > 0)) throw new Error('Rate must be a positive number')
  await db.exchangeRate.create({
    data: { baseCode: 'USD', quoteCode: code, rate: rateToUsd, source: 'ADMIN', validFrom: new Date(), createdBy: adminId },
  })
  try {
    await recordAudit({
      actorType: 'ADMIN',
      action: 'CURRENCY.RATE_PIN',
      entityType: 'Currency',
      entityId: code,
      summary: `Pinned 1 USD = ${rateToUsd} ${code}`,
      metadata: { rateToUsd, baseCode: 'USD' },
    })
  } catch {
    // audit is best-effort here — the rate row itself already committed
  }
  invalidateCurrencyCache()
}

export async function resetToLive(code: string): Promise<void> {
  const row = await db.currency.findUnique({ where: { code } })
  if (!row) throw new Error(`Unknown currency ${code}`)
  if (row.code === 'USD') throw new Error('The base currency is fixed at 1')
  const feed = (await fetchErApi()) ?? (await fetchJsDelivr())
  const live = feed?.rates[code]
  await db.exchangeRate.create({
    data: {
      baseCode: 'USD',
      quoteCode: code,
      rate: typeof live === 'number' && live > 0 ? live : 1,
      source: typeof live === 'number' && live > 0 ? feed!.source : 'SEED',
      validFrom: new Date(),
    },
  })
  invalidateCurrencyCache()
}

export interface CurrencyMetaPatch {
  isActive?: boolean
  displayDecimals?: number
  symbol?: string
  name?: string
}

export async function updateCurrencyMeta(code: string, patch: CurrencyMetaPatch) {
  const row = await db.currency.findUnique({ where: { code } })
  if (!row) throw new Error(`Unknown currency ${code}`)
  const updated = await db.currency.update({
    where: { code },
    data: {
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      ...(patch.displayDecimals !== undefined ? { decimals: Math.max(0, Math.min(4, Math.round(patch.displayDecimals))) } : {}),
      ...(patch.symbol !== undefined ? { symbol: patch.symbol.slice(0, 8) } : {}),
      ...(patch.name !== undefined ? { name: patch.name.slice(0, 64) } : {}),
    },
  })
  invalidateCurrencyCache()
  return updated
}

/** Cross-rate for server-side conversion needs (a = amount in `from`). */
export async function serverConvert(amount: number, from: string, to: string): Promise<number> {
  const [f, t] = await Promise.all([latestRate(from), latestRate(to)])
  if (!f || !t) throw new Error(`Unknown currency pair ${from}→${to}`)
  return (amount / f.rate) * t.rate
}
