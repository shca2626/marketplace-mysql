import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { getStoreSettings, setStoreSettings } from '@/server/modules/catalog/service'
import { assertSameOrigin } from '@/lib/http'

export const dynamic = 'force-dynamic'

const settingsSchema = z.object({
  multiStoreEnabled: z.boolean(),
  maxStoresPerCompany: z.number().int().min(1).max(20),
})

// GET /api/admin/store-settings — multi-store platform settings
export async function GET() {
  const { error } = await requireAdmin('storefront.manage')
  if (error) return error
  return NextResponse.json({ settings: await getStoreSettings() })
}

// PUT /api/admin/store-settings — toggle multi-store + set the per-company max
export async function PUT(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const { user, error } = await requireAdmin('storefront.manage')
  if (error) return error
  try {
    const parsed = settingsSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }
    const settings = await setStoreSettings(user!.id, parsed.data)
    return NextResponse.json({ settings })
  } catch (err) {
    console.error('store settings PUT error', err)
    return NextResponse.json({ error: 'Failed to update store settings' }, { status: 500 })
  }
}
