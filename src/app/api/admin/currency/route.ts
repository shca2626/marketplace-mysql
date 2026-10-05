import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import {
  listAllCurrencyRows,
  refreshLiveRates,
  setManualRate,
  resetToLive,
  updateCurrencyMeta,
  updateCurrencySettings,
  getCurrencySettings,
  type CurrencyMetaPatch,
} from '@/server/modules/currency/service'

// ─────────────────────────────────────────────────────────────────────────────
// /api/admin/currency — dynamic exchange-rate management (Phase 8).
//   GET    — full table (incl. inactive) + settings
//   POST   — action: refresh | manual-rate | reset-live
//   PATCH  — currency meta (active/decimals/symbol/name/order) + settings
// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  const { error } = await requireAdmin('storefront.manage')
  if (error) return error
  try {
    const [rows, settings] = await Promise.all([listAllCurrencyRows(), getCurrencySettings()])
    return NextResponse.json({ currencies: rows, settings })
  } catch (err) {
    console.error('[api/admin/currency] GET failed', err)
    return NextResponse.json({ error: 'Failed to load currencies' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin('storefront.manage')
  if (error) return error
  try {
    const body = (await req.json()) as {
      action?: string
      code?: string
      rateToUsd?: number
    }
    switch (body.action) {
      case 'refresh': {
        const result = await refreshLiveRates()
        return NextResponse.json({ result })
      }
      case 'manual-rate': {
        if (!body.code || typeof body.rateToUsd !== 'number') {
          return NextResponse.json({ error: 'code and rateToUsd are required' }, { status: 400 })
        }
        const row = await setManualRate(body.code, body.rateToUsd)
        return NextResponse.json({ currency: row })
      }
      case 'reset-live': {
        if (!body.code) return NextResponse.json({ error: 'code is required' }, { status: 400 })
        const row = await resetToLive(body.code)
        return NextResponse.json({ currency: row })
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Currency action failed'
    console.error('[api/admin/currency] POST failed', err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function PATCH(req: NextRequest) {
  const { error } = await requireAdmin('storefront.manage')
  if (error) return error
  try {
    const body = (await req.json()) as {
      meta?: { code: string } & CurrencyMetaPatch
      settings?: { base?: string; autoRefreshMinutes?: number }
    }
    if (body.settings) {
      const settings = await updateCurrencySettings(body.settings)
      return NextResponse.json({ settings })
    }
    if (body.meta?.code) {
      const { code, ...patch } = body.meta
      const row = await updateCurrencyMeta(code, patch)
      return NextResponse.json({ currency: row })
    }
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Currency update failed'
    console.error('[api/admin/currency] PATCH failed', err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
