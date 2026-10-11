/**
 * DYNAMIC CURRENCY CORE (Phase 8 — nothing hardcoded)
 * ────────────────────────────────────────────────────
 * All catalog prices are stored in the BASE currency (USD). Every amount the
 * user sees is converted through the ACTIVE display currency whose rate is
 * DATA from the CurrencyRate table — live-fetched from open exchange feeds
 * (they change daily: 1 USD → YER 535.5 today, something else next week) or
 * manually overridden by an admin.
 *
 * This module is CLIENT-SAFE (pure, no server imports). The active display
 * currency lives in module state that the marketplace store keeps in sync:
 *   store.initCurrency() → fetch /api/settings/currency → setActiveCurrency(...)
 * Server components keep the base currency (USD) — first paint matches SSR,
 * then the client converts after hydration without mismatch.
 */

export interface DisplayCurrency {
  code: string
  name: string
  symbol: string
  /** 1 USD = rateToUsd CODE (USD itself is 1) */
  rateToUsd: number
  displayDecimals: number
  isManual?: boolean
  source?: string
  lastSyncedAt?: string | null
}

export const BASE_CURRENCY_CODE = 'USD'

export const DEFAULT_DISPLAY_CURRENCY: DisplayCurrency = {
  code: 'USD',
  name: 'US Dollar',
  symbol: '$',
  rateToUsd: 1,
  displayDecimals: 2,
}

// ── Active display currency (module state) ─────────────────────────────────
let active: DisplayCurrency = DEFAULT_DISPLAY_CURRENCY

export function setActiveCurrency(c: DisplayCurrency | null | undefined): void {
  if (c && Number.isFinite(c.rateToUsd) && c.rateToUsd > 0) active = c
}

export function getActiveCurrency(): DisplayCurrency {
  return active
}

export function isBaseCurrencyActive(): boolean {
  return active.code === BASE_CURRENCY_CODE
}

// ── Conversion (always through the base) ────────────────────────────────────

/** USD amount → active display currency amount (unformatted number). */
export function convertFromUsd(amountUsd: number, c: DisplayCurrency = active): number {
  return amountUsd * c.rateToUsd
}

/** Active currency amount → USD amount. */
export function convertToUsd(amount: number, c: DisplayCurrency = active): number {
  return amount / c.rateToUsd
}

/** Cross-currency conversion through the base — a = from-amount. */
export function convert(amount: number, from: DisplayCurrency, to: DisplayCurrency): number {
  return (amount / from.rateToUsd) * to.rateToUsd
}

// ── Formatting ───────────────────────────────────────────────────────────────

/**
 * Format a USD amount in the ACTIVE display currency.
 * "101,740 YER" / "$189.99" / "712.50 SAR" — Intl picks the right symbol vs
 * code per ISO-4217 rules, decimals come from CurrencyRate.displayDecimals
 * (YER shows whole rials, dinars show 3 fils digits, USD 2 cents).
 */
export function formatMoney(amountUsd: number, c: DisplayCurrency = active): string {
  if (!Number.isFinite(amountUsd)) return '—'
  const value = amountUsd * c.rateToUsd
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: c.code,
      minimumFractionDigits: c.displayDecimals,
      maximumFractionDigits: c.displayDecimals,
    }).format(value)
  } catch {
    // Unknown ISO code in the table → safe numeric fallback
    const num = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: c.displayDecimals,
      maximumFractionDigits: c.displayDecimals,
    }).format(value)
    return `${num} ${c.code}`
  }
}

/** Exact-rate label for admin UI: "1 USD = 535.5 YER". */
export function rateLabel(c: DisplayCurrency): string {
  if (c.code === BASE_CURRENCY_CODE) return 'base currency'
  return `1 ${BASE_CURRENCY_CODE} = ${c.rateToUsd.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${c.code}`
}

/** Freshness wording for admin UI. */
export function syncAgeLabel(iso: string | null | undefined): string {
  if (!iso) return 'never synced'
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'synced just now'
  if (s < 3600) return `synced ${Math.floor(s / 60)}m ago`
  if (s < 86400) return `synced ${Math.floor(s / 3600)}h ago`
  return `synced ${Math.floor(s / 86400)}d ago`
}
