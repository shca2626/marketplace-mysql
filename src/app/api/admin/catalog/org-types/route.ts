import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { listOrgTypes } from '@/server/modules/catalog/service'

// GET /api/admin/catalog/org-types — the organization-type dictionary
// (seeded from the enum keys on first call; display metadata is admin-managed).
export async function GET() {
  const { error } = await requireAdmin('catalog.products.moderate')
  if (error) return error
  try {
    const orgTypes = await listOrgTypes()
    return NextResponse.json({ orgTypes })
  } catch (err) {
    console.error('admin org-types GET error', err)
    return NextResponse.json({ error: 'Failed to load organization types' }, { status: 500 })
  }
}
