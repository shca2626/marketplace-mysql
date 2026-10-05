import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { adminCreateCurrency, adminToggleCurrency, CurrencyServiceError } from '@/server/modules/currencies/service'
import { assertSameOrigin } from '@/lib/http'

const createSchema = z.object({
  code: z.string().trim().length(3),
  name: z.string().trim().min(2).max(60),
  symbol: z.string().trim().max(8).optional(),
  decimals: z.number().int().min(0).max(4).optional(),
})

const toggleSchema = z.object({ code: z.string().trim().length(3), isActive: z.boolean() })

// POST /api/admin/fx/currencies — create a currency (ISO-4217 code).
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const { user, error } = await requireAdmin('pricing.manage')
  if (error) return error
  try {
    const parsed = createSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid currency' }, { status: 400 })
    }
    const currency = await adminCreateCurrency(user!.id, parsed.data)
    return NextResponse.json({ currency }, { status: 201 })
  } catch (err) {
    if (err instanceof CurrencyServiceError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('admin fx currencies POST error', err)
    return NextResponse.json({ error: 'Failed to create currency' }, { status: 500 })
  }
}

// PATCH /api/admin/fx/currencies — activate/deactivate a currency by code.
export async function PATCH(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const { user, error } = await requireAdmin('pricing.manage')
  if (error) return error
  try {
    const parsed = toggleSchema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    const currency = await adminToggleCurrency(user!.id, parsed.data.code, parsed.data.isActive)
    return NextResponse.json({ currency })
  } catch (err) {
    if (err instanceof CurrencyServiceError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('admin fx currencies PATCH error', err)
    return NextResponse.json({ error: 'Failed to update currency' }, { status: 500 })
  }
}
