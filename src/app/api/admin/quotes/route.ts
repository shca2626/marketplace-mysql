import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { adminListQuotes, RfqServiceError } from '@/server/modules/rfq/service'

// GET /api/admin/quotes?status= — quote routing-review queue (ADMIN only).

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error
  try {
    const { searchParams } = new URL(req.url)
    const quotes = await adminListQuotes(searchParams.get('status') ?? undefined)
    return NextResponse.json({ quotes })
  } catch (err) {
    if (err instanceof RfqServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin quotes GET error', err)
    return NextResponse.json({ error: 'Failed to load quotes' }, { status: 500 })
  }
}
