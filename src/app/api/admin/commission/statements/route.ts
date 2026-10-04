import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import {
  adminListStatements,
  CommissionServiceError,
} from '@/server/modules/commission/service'

// GET /api/admin/commission/statements — period statements with invoices.
// Filters: status, q, page.
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error
  try {
    const { searchParams } = new URL(req.url)
    const result = await adminListStatements({
      status: searchParams.get('status') ?? undefined,
      q: searchParams.get('q') ?? undefined,
      page: Number(searchParams.get('page') ?? 1),
      limit: Number(searchParams.get('limit') ?? 20),
    })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof CommissionServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin commission statements GET error', err)
    return NextResponse.json({ error: 'Failed to load commission statements' }, { status: 500 })
  }
}
