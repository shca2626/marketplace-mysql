import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { listVendors } from '@/server/modules/vendors/service'

// GET /api/admin/vendors — the platform vendor directory with marketplace
// metrics (products, units sold, GMV, rating, verification, lifecycle status).
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error
  try {
    const sp = req.nextUrl.searchParams
    const result = await listVendors({
      q: sp.get('q') ?? undefined,
      status: (sp.get('status') as 'ACTIVE' | 'SUSPENDED' | null) ?? undefined,
      verified: (sp.get('verified') as 'yes' | 'no' | null) ?? undefined,
      page: parseInt(sp.get('page') || '1') || 1,
      limit: parseInt(sp.get('limit') || '20') || 20,
    })
    return NextResponse.json(result)
  } catch (err) {
    console.error('admin vendors GET error', err)
    return NextResponse.json({ error: 'Failed to load vendors' }, { status: 500 })
  }
}
