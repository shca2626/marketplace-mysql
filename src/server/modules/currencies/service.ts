import { db } from '@/lib/db'
import { recordAudit, recordAuditTx } from '@/server/modules/audit/service'

/**
 * Currencies (Phase 7.2 — multi-currency substrate).
 *
 * Admin-managed Currency list + ExchangeRate history (one authoritative rate
 * per (base, quote, validFrom) instant). Money rows carry explicit currency
 * codes; conversions snapshot the rate ON THE RECORD (FX rate/timestamp/
 * source) so history never changes under later rate edits.
 *
 * Currency concepts kept distinct: transaction · display · settlement ·
 * accounting/base. This service answers "what is the latest authoritative
 * rate" — the SNAPSHOT on the money row is the fact (H1 discipline).
 */

export class CurrencyServiceError extends Error {
  constructor(message: string, public status = 400) {
    super(message)
  }
}

export interface CurrencyDTO {
  code: string
  name: string
  symbol: string | null
  decimals: number
  isActive: boolean
}

export interface ExchangeRateDTO {
  id: string
  baseCode: string
  quoteCode: string
  rate: number
  source: string
  validFrom: string
}

// ── Public read surface ─────────────────────────────────────────────────────

export async function listActiveCurrencies(): Promise<CurrencyDTO[]> {
  const rows = await db.currency.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } })
  return rows.map((c) => ({ code: c.code, name: c.name, symbol: c.symbol, decimals: c.decimals, isActive: c.isActive }))
}

/** Latest authoritative rate: highest validFrom ≤ now for the pair. */
export async function getLatestRate(baseCode: string, quoteCode: string): Promise<ExchangeRateDTO | null> {
  const row = await db.exchangeRate.findFirst({
    where: { baseCode, quoteCode, validFrom: { lte: new Date() }, base: { isActive: true }, quote: { isActive: true } },
    orderBy: { validFrom: 'desc' },
  })
  if (!row) return null
  return { id: row.id, baseCode: row.baseCode, quoteCode: row.quoteCode, rate: Number(row.rate), source: row.source, validFrom: row.validFrom.toISOString() }
}

export interface ConversionResult {
  amount: number
  from: string
  to: string
  rate: number
  rateAt: string
  rateSource: string
}

/** Convert an amount between active currencies using the latest rate.
 * Returns the FX snapshot alongside the converted amount so callers can
 * persist it on the money row (7.2: snapshot, never a live reconstruction). */
export async function convert(amount: number, from: string, to: string): Promise<ConversionResult> {
  if (from === to) {
    return { amount, from, to, rate: 1, rateAt: new Date().toISOString(), rateSource: 'IDENTITY' }
  }
  const rate = await getLatestRate(from, to)
  if (!rate)
    throw new CurrencyServiceError(`No exchange rate configured for ${from} → ${to}`, 404)
  const converted = Math.round(amount * rate.rate * 100) / 100
  return { amount: converted, from, to, rate: rate.rate, rateAt: rate.validFrom, rateSource: rate.source }
}

/** Public display quote: multiple amounts in one call (price badges). */
export async function quoteRate(base: string, quote: string) {
  const [currencies, rate] = await Promise.all([listActiveCurrencies(), getLatestRate(base, quote)])
  return { currencies, rate }
}

// ── Admin management ────────────────────────────────────────────────────────

export async function adminListRates(filters: { base?: string; quote?: string; limit?: number }) {
  const limit = Math.min(200, Math.max(1, filters.limit ?? 60))
  const where: Record<string, unknown> = {}
  if (filters.base) where.baseCode = filters.base
  if (filters.quote) where.quoteCode = filters.quote
  const [rows, latest] = await Promise.all([
    db.exchangeRate.findMany({ where, orderBy: { validFrom: 'desc' }, take: limit }),
    db.exchangeRate.findMany({ orderBy: { validFrom: 'desc' }, take: 500 }),
  ])
  // dedupe latest per pair for the "current rates" surface
  const seen = new Set<string>()
  const current: ExchangeRateDTO[] = []
  for (const r of latest) {
    const key = `${r.baseCode}->${r.quoteCode}`
    if (seen.has(key)) continue
    seen.add(key)
    current.push({ id: r.id, baseCode: r.baseCode, quoteCode: r.quoteCode, rate: Number(r.rate), source: r.source, validFrom: r.validFrom.toISOString() })
  }
  return {
    current: current.sort((a, b) => a.baseCode.localeCompare(b.baseCode) || a.quoteCode.localeCompare(b.quoteCode)),
    history: rows.map((r) => ({ id: r.id, baseCode: r.baseCode, quoteCode: r.quoteCode, rate: Number(r.rate), source: r.source, validFrom: r.validFrom.toISOString() })),
  }
}

export async function adminUpsertRate(
  adminId: string,
  input: { baseCode: string; quoteCode: string; rate: number; source?: string }
) {
  const base = (input.baseCode ?? '').trim().toUpperCase()
  const quote = (input.quoteCode ?? '').trim().toUpperCase()
  const rate = Number(input.rate)
  if (!base || !quote) throw new CurrencyServiceError('Base and quote currency codes are required', 400)
  if (base === quote) throw new CurrencyServiceError('Base and quote must differ', 400)
  if (!Number.isFinite(rate) || rate <= 0) throw new CurrencyServiceError('Rate must be a positive number', 400)

  const [baseRow, quoteRow] = await Promise.all([
    db.currency.findUnique({ where: { code: base } }),
    db.currency.findUnique({ where: { code: quote } }),
  ])
  if (!baseRow || !quoteRow)
    throw new CurrencyServiceError('Both currencies must exist (create them first)', 404)

  const created = await db.exchangeRate.create({
    data: {
      baseCode: base,
      quoteCode: quote,
      rate,
      source: (input.source ?? 'ADMIN').slice(0, 24),
      createdBy: adminId,
      validFrom: new Date(),
    },
  })
  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'FX_RATE_UPDATED',
    entityType: 'ExchangeRate',
    entityId: created.id,
    summary: `Rate ${base} → ${quote} set to ${rate} (${(input.source ?? 'ADMIN').slice(0, 24)})`,
    metadata: { baseCode: base, quoteCode: quote, rate },
  })
  return { id: created.id, baseCode: created.baseCode, quoteCode: created.quoteCode, rate: Number(created.rate), source: created.source, validFrom: created.validFrom.toISOString() }
}

export async function adminCreateCurrency(
  adminId: string,
  input: { code: string; name: string; symbol?: string; decimals?: number }
) {
  const code = (input.code ?? '').trim().toUpperCase()
  const name = (input.name ?? '').trim()
  if (!/^[A-Z]{3}$/.test(code)) throw new CurrencyServiceError('Currency code must be 3 uppercase letters (ISO-4217)', 400)
  if (name.length < 2) throw new CurrencyServiceError('Currency name is required', 400)
  const decimals = Math.min(4, Math.max(0, Math.round(input.decimals ?? 2)))

  const existing = await db.currency.findUnique({ where: { code } })
  if (existing) throw new CurrencyServiceError(`Currency ${code} already exists`, 409)

  const created = await db.currency.create({
    data: { code, name, symbol: input.symbol?.trim() || null, decimals, isActive: true },
  })
  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'FX_CURRENCY_CREATED',
    entityType: 'Currency',
    entityId: created.id,
    summary: `Currency ${code} (${name}) created`,
    metadata: { code, name },
  })
  return { code: created.code, name: created.name, symbol: created.symbol, decimals: created.decimals, isActive: created.isActive }
}

export async function adminToggleCurrency(adminId: string, code: string, isActive: boolean) {
  const row = await db.currency.findUnique({ where: { code } })
  if (!row) throw new CurrencyServiceError('Currency not found', 404)
  const updated = await db.currency.update({ where: { code }, data: { isActive } })
  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'FX_CURRENCY_TOGGLED',
    entityType: 'Currency',
    entityId: updated.id,
    summary: `Currency ${code} ${isActive ? 'activated' : 'deactivated'}`,
  })
  return { code: updated.code, name: updated.name, symbol: updated.symbol, decimals: updated.decimals, isActive: updated.isActive }
}
