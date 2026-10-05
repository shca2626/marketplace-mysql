'use client'

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 7.2 — MULTI-CURRENCY DISPLAY SUBSTRATE (storefront side)
//
// Products are PRICED in USD (the transaction currency — every cart, order,
// invoice and refund settles in USD). This context adds a purely presentational
// layer: the shopper can flip the DISPLAY currency to YER or SAR and see an
// APPROXIMATE conversion next to the primary USD price, using the latest
// authoritative platform rate from GET /api/fx.
//
//   · GET /api/fx is fetched ONCE per session, behind a 10-minute
//     localStorage cache ('vendora_fx_cache') so the storefront doesn't
//     refetch on every view.
//   · The chosen display currency persists in 'vendora_display_currency'.
//   · convert() returns null for USD (callers render the normal price) and
//     null again when no rate exists — the USD price is ALWAYS primary and
//     never silently replaced.
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'

export interface FxCurrency {
  code: string
  name: string
  symbol: string
  decimals: number
  isActive: boolean
}

export interface FxRate {
  id: string
  baseCode: string
  quoteCode: string
  rate: number
  source: string
  validFrom: string
}

export type DisplayCurrency = 'USD' | 'YER' | 'SAR'

/** A successful USD → display-currency conversion. */
export interface Conversion {
  amount: number
  code: string
  symbol: string
  rate: number
  decimals: number
}

/** Compact static fallback so the switcher renders instantly (and survives
 *  an /api/fx hiccup) — the RATES still require a successful fetch/cache. */
const FALLBACK_CURRENCIES: FxCurrency[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2, isActive: true },
  { code: 'YER', name: 'Yemeni Rial', symbol: 'ر.ي', decimals: 0, isActive: true },
  { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼', decimals: 2, isActive: true },
]

/** Stable chip order — USD first (the pricing currency), then the locals. */
const CURRENCY_ORDER: DisplayCurrency[] = ['USD', 'YER', 'SAR']

const FX_CACHE_KEY = 'vendora_fx_cache'
const DISPLAY_CURRENCY_KEY = 'vendora_display_currency'
const FX_CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes

interface FxCacheEntry {
  data: { currencies: FxCurrency[]; rates: FxRate[] }
  fetchedAt: number
}

function isDisplayCurrency(v: unknown): v is DisplayCurrency {
  return v === 'USD' || v === 'YER' || v === 'SAR'
}

interface FxContextValue {
  /** Active currencies from the platform (fallback list before/without data). */
  currencies: FxCurrency[]
  /** Latest authoritative rate per pair (USD→YER, USD→SAR, and reverses). */
  rates: FxRate[]
  /** The shopper's chosen DISPLAY currency (default + pricing currency: USD). */
  display: DisplayCurrency
  setDisplay: (c: DisplayCurrency) => void
  /**
   * Convert a USD amount into the active display currency.
   * · display === 'USD' → null (render the normal price — no duplication)
   * · no USD→display rate available → null (never a guessed conversion)
   */
  convert: (amountUsd: number) => Conversion | null
}

const FxContext = createContext<FxContextValue | null>(null)

/**
 * Safe default for surfaces that mount shared marketplace components
 * (ProductCard…) OUTSIDE the storefront — e.g. the platform homepage's
 * market preview. USD-only, no rates: convert() returns null so those
 * surfaces render exactly as they did before the currency substrate.
 */
const STANDALONE_FX: FxContextValue = {
  currencies: FALLBACK_CURRENCIES,
  rates: [],
  display: 'USD',
  setDisplay: () => {
    // no provider mounted — the choice can't persist here
  },
  convert: () => null,
}

export function FxProvider({ children }: { children: React.ReactNode }) {
  const [currencies, setCurrencies] = useState<FxCurrency[]>(FALLBACK_CURRENCIES)
  const [rates, setRates] = useState<FxRate[]>([])
  const [display, setDisplayState] = useState<DisplayCurrency>('USD')

  const persistDisplay = useCallback((c: DisplayCurrency) => {
    setDisplayState(c)
    try {
      window.localStorage.setItem(DISPLAY_CURRENCY_KEY, c)
    } catch {
      // private mode / disabled storage — in-memory choice still works
    }
  }, [])

  // Restore the persisted display currency + the FX data — both are external
  // (localStorage / API), read asynchronously after mount so the first
  // client render always matches the deterministic USD-default SSR output.
  useEffect(() => {
    let cancelled = false

    const load = async () => {
      // 1) persisted display currency (private mode — session state only)
      try {
        const saved = window.localStorage.getItem(DISPLAY_CURRENCY_KEY)
        if (!cancelled && isDisplayCurrency(saved) && saved !== 'USD') setDisplayState(saved)
      } catch {
        // ignore
      }

      // 2) FX data — fresh 10-minute cache short-circuits the fetch
      try {
        const cached = window.localStorage.getItem(FX_CACHE_KEY)
        if (cached) {
          const entry = JSON.parse(cached) as Partial<FxCacheEntry>
          const fetchedAt = typeof entry.fetchedAt === 'number' ? entry.fetchedAt : 0
          const data = entry.data
          if (
            Date.now() - fetchedAt < FX_CACHE_TTL_MS &&
            Array.isArray(data?.currencies) &&
            Array.isArray(data?.rates)
          ) {
            if (!cancelled) {
              setCurrencies(sortCurrencies(data.currencies))
              setRates(data.rates)
            }
            return // cache still fresh — no refetch this view
          }
        }
      } catch {
        // corrupt cache — fall through to a live fetch
      }

      try {
        const res = await fetch('/api/fx', { cache: 'no-store' })
        if (!res.ok) return
        const json = (await res.json()) as { currencies?: FxCurrency[]; rates?: FxRate[] }
        if (cancelled || !Array.isArray(json.currencies) || !Array.isArray(json.rates)) return
        const active = json.currencies.filter((c) => c.isActive)
        const next = { currencies: active, rates: json.rates }
        setCurrencies(sortCurrencies(active))
        setRates(json.rates)
        try {
          window.localStorage.setItem(
            FX_CACHE_KEY,
            JSON.stringify({ data: next, fetchedAt: Date.now() } satisfies FxCacheEntry)
          )
        } catch {
          // storage unavailable — in-memory data still serves this session
        }
      } catch {
        // network error — keep fallback currencies; convert() returns null
        // until rates exist, so prices stay USD-only. Nothing breaks.
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const convert = useCallback(
    (amountUsd: number): Conversion | null => {
      if (display === 'USD') return null
      const rate = rates.find((r) => r.baseCode === 'USD' && r.quoteCode === display)
      const currency = currencies.find((c) => c.code === display)
      if (!rate || !currency) return null
      const decimals = currency.decimals
      const amount = Number((amountUsd * rate.rate).toFixed(decimals))
      return { amount, code: currency.code, symbol: currency.symbol, rate: rate.rate, decimals }
    },
    [display, rates, currencies]
  )

  const value = useMemo<FxContextValue>(
    () => ({ currencies, rates, display, setDisplay: persistDisplay, convert }),
    [currencies, rates, display, persistDisplay, convert]
  )

  return <FxContext.Provider value={value}>{children}</FxContext.Provider>
}

/** USD first, then YER / SAR — anything unknown keeps API order at the end. */
function sortCurrencies(list: FxCurrency[]): FxCurrency[] {
  return [...list].sort((a, b) => {
    const ia = CURRENCY_ORDER.indexOf(a.code as DisplayCurrency)
    const ib = CURRENCY_ORDER.indexOf(b.code as DisplayCurrency)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })
}

export function useFx(): FxContextValue {
  // Standalone surfaces (homepage preview, embedded cards) get the safe USD
  // default instead of a crash — the storefront always mounts <FxProvider>.
  return useContext(FxContext) ?? STANDALONE_FX
}

// ─────────────────────────────────────────────────────────────────────────────
// Converted price — the small muted "≈ 32,450 ر.ي" line shown next to / below
// the primary USD price. Renders NOTHING in USD display mode and NOTHING when
// no rate exists — the USD price is always the single source of truth.
// ─────────────────────────────────────────────────────────────────────────────

export function ConvertedPrice({
  amountUsd,
  className,
}: {
  amountUsd: number
  className?: string
}) {
  const { convert } = useFx()
  const conv = convert(amountUsd)
  if (!conv) return null
  const formatted = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: conv.decimals,
  }).format(conv.amount)
  return (
    <span
      className={cn('text-xs text-muted-foreground', className)}
      title="Approximate — converted from USD at the platform rate"
    >
      ≈ {formatted} {conv.symbol}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Currency switcher — three compact stone-style toggle chips (USD / YER / SAR)
// by symbol, full names in the title tooltip. Stone tabs look, never blue.
// ─────────────────────────────────────────────────────────────────────────────

export function CurrencySwitcher({ className }: { className?: string }) {
  const { currencies, display, setDisplay } = useFx()
  return (
    <div
      className={cn(
        'flex items-center gap-0.5 rounded-full border border-border bg-muted/60 p-0.5',
        className
      )}
      role="group"
      aria-label="Display currency"
    >
      {currencies.map((c) => {
        const active = display === c.code
        return (
          <button
            key={c.code}
            type="button"
            onClick={() => setDisplay(c.code as DisplayCurrency)}
            aria-pressed={active}
            title={`${c.name}${c.code === 'USD' ? ' — pricing currency' : ' — approximate display conversion'}`}
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px] font-semibold leading-5 transition-colors',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {c.symbol}
          </button>
        )
      })}
    </div>
  )
}
