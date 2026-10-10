import { NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { listPendingProposals } from '@/server/modules/catalog/service'

export const dynamic = 'force-dynamic'

// GET /api/admin/product-approvals — platform queue of pending proposals
export async function GET() {
  const { error } = await requireAdmin('catalog.products.moderate')
  if (error) return error
  try {
    const proposals = await listPendingProposals()
    return NextResponse.json({ proposals })
  } catch (err) {
    console.error('product approvals GET error', err)
    return NextResponse.json({ error: 'Failed to load approval queue' }, { status: 500 })
  }
}
