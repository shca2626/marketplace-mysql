import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { adminUpsertRate, CurrencyServiceError } from '@/server/modules/currencies/service'
import { assertSameOrigin } from '@/lib/http'

const rateSchema = z.object({
  baseCode: z.string().trim().length(3),
  quoteCode: z.string().trim().length(3),
  rate: z.number().positive().max(1_000_000),
})

// POST /api/admin/fx/rates — append an authoritative rate for a pair
// (Phase 7.2): admin-managed history, one rate per (base, quote, validFrom)
// instant. Existing money rows keep their own FX snapshot — history never
// changes under later rate edits (H1 discipline).
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const { user, error } = await requireAdmin('pricing.manage')
  if (error) return error
  try {
    const parsed = rateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid rate' }, { status: 400 })
    }
    const rate = await adminUpsertRate(user!.id, parsed.data)
    return NextResponse.json({ rate }, { status: 201 })
  } catch (err) {
    if (err instanceof CurrencyServiceError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('admin fx rates POST error', err)
    return NextResponse.json({ error: 'Failed to save rate' }, { status: 500 })
  }
}
