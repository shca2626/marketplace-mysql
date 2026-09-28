import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { runDigestBatch } from '@/lib/notifications/digest'

// /api/admin/notifications/digest/run — cron entry point (ADMIN only).
// Runs one digest batch across every active user with a DAILY/WEEKLY
// preference and reports { processed, generated, skipped }.

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const rl = enforceRateLimit(req, 'admin:digest-run', { limit: 10, windowMs: 60_000 })
  if (rl) return rl

  try {
    const result = await runDigestBatch()
    return NextResponse.json(result)
  } catch (err) {
    console.error('[api/admin/notifications/digest/run POST] failed', err)
    return NextResponse.json({ error: 'Digest batch failed' }, { status: 500 })
  }
}
