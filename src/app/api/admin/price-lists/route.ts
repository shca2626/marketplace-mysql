import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import {
  adminCreatePriceList,
  adminListPriceLists,
  PriceListServiceError,
} from '@/server/modules/price-lists/service'

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional().nullable(),
  scope: z.enum(['ORG', 'GROUP', 'CHANNEL']),
  status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']).optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  currency: z.string().trim().min(3).max(3).optional(),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  organizationId: z.string().optional().nullable(),
  customerGroupId: z.string().optional().nullable(),
})

// GET /api/admin/price-lists
export async function GET() {
  const { error } = await requireAdmin()
  if (error) return error
  try {
    const priceLists = await adminListPriceLists()
    return NextResponse.json({ priceLists })
  } catch (err) {
    console.error('admin price-lists GET error', err)
    return NextResponse.json({ error: 'Failed to load price lists' }, { status: 500 })
  }
}

// POST /api/admin/price-lists
export async function POST(req: NextRequest) {
  const { user, error } = await requireAdmin()
  if (error) return error
  try {
    const body = await req.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    const priceList = await adminCreatePriceList(user!.id, parsed.data)
    return NextResponse.json({ priceList }, { status: 201 })
  } catch (err) {
    if (err instanceof PriceListServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin price-lists POST error', err)
    return NextResponse.json({ error: 'Failed to create price list' }, { status: 500 })
  }
}
