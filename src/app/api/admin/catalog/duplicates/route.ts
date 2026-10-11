import { NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { findDuplicates } from '@/server/modules/catalog/service'

// GET /api/admin/catalog/duplicates — duplicate governance scan.
// Strong pairs: same GTIN or same MPN (same category). Candidates: ≥0.75 title
// token similarity within the same category. Each pair suggests a merge.
export async function GET() {
  const { error } = await requireAdmin('catalog.products.moderate')
  if (error) return error
  try {
    const { strong, candidates } = await findDuplicates()
    return NextResponse.json({ strong, candidates })
  } catch (err) {
    console.error('admin duplicates GET error', err)
    return NextResponse.json({ error: 'Failed to scan for duplicates' }, { status: 500 })
  }
}
