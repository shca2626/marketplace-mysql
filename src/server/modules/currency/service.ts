import { db } from '@/lib/db'
import type { CurrencyRate as CurrencyRateRow } from '@prisma/client'

/**
 * DYNAMIC CURRENCY SERVICE (Phase 8 — nothing hardcoded)
 * ────────────────────────────────────────────────────
 * Exchange rates are DATA in the CurrencyRate table, never code constants.
 * Live refresh pulls from open no-key feeds with a fallback chain:
 *   1. open.er-api.com (ExchangeRate-API open endpoint, ~160 currencies)
 *   2. jsDelivr currency-api (fawazahmed0, daily-updated dataset)
 * Manual admin overrides (isManual=true) are respected and never clobbered
 * by a live refresh until explicitly reset.
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

// ── Seed defaults — first-boot values only; live refresh replaces them ─────
const SEED_CURRENCIES: Array<{
  code: string
  name: string
  symbol: string
  rateToUsd: number
  displayDecimals: number
  sortOrder: number
  active: boolean
}> = [
  { code: 'USD', name: 'US Dollar', symbol: '$', rateToUsd: 1, displayDecimals: 2, sortOrder: 0, active: true },
  { code: 'YER', name: 'Yemeni Rial', symbol: 'YER', rateToUsd: 530, displayDecimals: 0, sortOrder: 1, active: true },
  { code: 'SAR', name: 'Saudi Riyal', symbol: 'SAR', rateToUsd: 3.75, displayDecimals: 2, sortOrder: 2, active: true },
  { code: 'AED', name: 'UAE Dirham', symbol: 'AED', rateToUsd: 3.6725, displayDecimals: 2, sortOrder: 3, active: true },
  { code: 'EGP', name: 'Egyptian Pound', symbol: 'EGP', rateToUsd: 48.5, displayDecimals: 2, sortOrder: 4, active: true },
  { code: 'JOD', name: 'Jordanian Dinar', symbol: 'JOD', rateToUsd: 0.709, displayDecimals: 3, sortOrder: 5, active: true },
  { code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'KWD', rateToUsd: 0.3065, displayDecimals: 3, sortOrder: 6, active: true },
  { code: 'QAR', name: 'Qatari Riyal', symbol: 'QAR', rateToUsd: 3.64, displayDecimals: 2, sortOrder: 7, active: true },
  { code: 'BHD', name: 'Bahraini Dinar', symbol: 'BHD', rateToUsd: 0.376, displayDecimals: 3, sortOrder: 8, active: true },
  { code: 'OMR', name: 'Omani Rial', symbol: 'OMR', rateToUsd: 0.3845, displayDecimals: 3, sortOrder: 9, active: true },
  { code: 'EUR', name: 'Euro', symbol: '€', rateToUsd: 0.92, displayDecimals: 2, sortOrder: 10, active: true },
  { code: 'GBP', name: 'British Pound', symbol: '£', rateToUsd: 0.79, displayDecimals: 2, sortOrder: 11, active: true },
  { code: 'TRY', name: 'Turkish Lira', symbol: 'TRY', rateToUsd: 34.5, displayDecimals: 2, sortOrder: 12, active: true },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', rateToUsd: 7.1, displayDecimals: 2, sortOrder: 13, active: false },
]

// ── Public read cache (60s) — rates change hourly at most ─────────────────
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

async function ensureSeeded(): Promise<void> {
  const n = await db.currencyRate.count()
  if (n > 0) return
  await db.currencyRate.createMany({
    data: SEED_CURRENCIES.map((c) => ({
      code: c.code,
      name: c.name,
      symbol: c.symbol,
      rateToUsd: c.rateToUsd,
      displayDecimals: c.displayDecimals,
      sortOrder: c.sortOrder,
      isActive: c.active,
      source: 'seed',
    })),
  })
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

function toPublic(row: CurrencyRateRow): PublicCurrency {
  return {
    code: row.code,
    name: row.name,
    symbol: row.symbol,
    rateToUsd: row.rateToUsd,
    displayDecimals: row.displayDecimals,
    isManual: row.isManual,
    source: row.source,
    lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
  }
}

/**
 * Public payload for the storefront: active currencies + settings.
 * Cheap in-process cache (60s). When the newest live sync is older than
 * `autoRefreshMinutes`, a background refresh is kicked off (fire-and-forget)
 * so rates keep themselves fresh while users browse — no cron needed.
 */
export async function getPublicCurrencies(): Promise<PublicCurrencyPayload> {
  await ensureSeeded()
  if (cache && Date.now() - cache.at < 60_000) return cache.payload
  const [settings, rows] = await Promise.all([
    getCurrencySettings(),
    db.currencyRate.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] }),
  ])
  const syncedRows = rows.filter((r) => r.lastSyncedAt)
  const newestSync = syncedRows.reduce<Date | null>(
    (acc, r) => (!acc || (r.lastSyncedAt && r.lastSyncedAt > acc) ? r.lastSyncedAt : acc),
    null
  )
  const payload: PublicCurrencyPayload = {
    base: settings.base,
    autoRefreshMinutes: settings.autoRefreshMinutes,
    currencies: rows.map(toPublic),
    lastRefreshedAt: newestSync ? newestSync.toISOString() : null,
  }
  cache = { at: Date.now(), payload }

  // Self-healing staleness: exchange rates change daily — refresh in the
  // background when data aged past the configured window.
  if (
    newestSync &&
    Date.now() - newestSync.getTime() > settings.autoRefreshMinutes * 60_000
  ) {
    void refreshLiveRates().catch(() => undefined)
  }
  return payload
}

export async function listAllCurrencyRows(): Promise<CurrencyRateRow[]> {
  await ensureSeeded()
  return db.currencyRate.findMany({ orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] })
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
    return { source: 'live:er-api', rates: json.rates }
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
    return { source: 'live:jsdelivr', rates }
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
 * Fetch fresh rates and write them into the table for every known currency.
 * Manual overrides are respected (skipped) until an admin resets them.
 */
export async function refreshLiveRates(): Promise<RefreshResult> {
  await ensureSeeded()
  const feed = (await fetchErApi()) ?? (await fetchJsDelivr())
  const rows = await db.currencyRate.findMany()
  if (!feed) {
    return {
      updated: [],
      skippedManual: rows.filter((r) => r.isManual).map((r) => r.code),
      source: null,
      failed: true,
      message: 'All live exchange feeds are unreachable right now — existing DB rates stay in effect.',
    }
  }
  const updated: string[] = []
  const skippedManual: string[] = []
  for (const row of rows) {
    if (row.isManual) {
      skippedManual.push(row.code)
      continue
    }
    const live = feed.rates[row.code]
    if (typeof live !== 'number' || !Number.isFinite(live) || live <= 0) continue
    // Keep the base pinned at exactly 1 — it defines the system.
    const rate = row.code === 'USD' ? 1 : live
    await db.currencyRate.update({
      where: { code: row.code },
      data: { rateToUsd: rate, source: row.code === 'USD' ? 'base' : feed.source, lastSyncedAt: new Date() },
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
      skippedManual.length ? `, ${skippedManual.length} manual override(s) kept` : ''
    }.`,
  }
}

export async function setManualRate(code: string, rateToUsd: number): Promise<CurrencyRateRow> {
  const row = await db.currencyRate.findUnique({ where: { code } })
  if (!row) throw new Error(`Unknown currency ${code}`)
  if (row.code === 'USD') throw new Error('The base currency is always 1 — pick another currency')
  if (!(rateToUsd > 0)) throw new Error('Rate must be a positive number')
  const updated = await db.currencyRate.update({
    where: { code },
    data: { rateToUsd, isManual: true, source: 'manual', lastSyncedAt: new Date() },
  })
  invalidateCurrencyCache()
  return updated
}

export async function resetToLive(code: string): Promise<CurrencyRateRow> {
  const row = await db.currencyRate.findUnique({ where: { code } })
  if (!row) throw new Error(`Unknown currency ${code}`)
  const updated = await db.currencyRate.update({
    where: { code },
    data: { isManual: false, source: 'seed' },
  })
  invalidateCurrencyCache()
  // Pull just this code from the live feed if possible
  const feed = (await fetchErApi()) ?? (await fetchJsDelivr())
  const live = feed?.rates[code]
  if (typeof live === 'number' && live > 0) {
    return db.currencyRate.update({
      where: { code },
      data: { rateToUsd: live, source: feed!.source, lastSyncedAt: new Date() },
    })
  }
  return updated
}

export interface CurrencyMetaPatch {
  isActive?: boolean
  displayDecimals?: number
  symbol?: string
  name?: string
  sortOrder?: number
}

export async function updateCurrencyMeta(code: string, patch: CurrencyMetaPatch): Promise<CurrencyRateRow> {
  const row = await db.currencyRate.findUnique({ where: { code } })
  if (!row) throw new Error(`Unknown currency ${code}`)
  const updated = await db.currencyRate.update({
    where: { code },
    data: {
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      ...(patch.displayDecimals !== undefined ? { displayDecimals: Math.max(0, Math.min(4, Math.round(patch.displayDecimals))) } : {}),
      ...(patch.symbol !== undefined ? { symbol: patch.symbol.slice(0, 8) } : {}),
      ...(patch.name !== undefined ? { name: patch.name.slice(0, 64) } : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: Math.max(0, Math.round(patch.sortOrder)) } : {}),
    },
  })
  invalidateCurrencyCache()
  return updated
}

/** Cross-rate for server-side conversion needs (a=amount in `from`). */
export async function serverConvert(amount: number, from: string, to: string): Promise<number> {
  const rows = await db.currencyRate.findMany({ where: { code: { in: [from, to] } } })
  const f = rows.find((r) => r.code === from)
  const t = rows.find((r) => r.code === to)
  if (!f || !t) throw new Error(`Unknown currency pair ${from}→${to}`)
  return (amount / f.rateToUsd) * t.rateToUsd
}
