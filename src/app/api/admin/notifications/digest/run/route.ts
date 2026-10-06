import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { runDigestBatch } from '@/lib/notifications/digest'
import { userHasPlatformPermission } from '@/server/modules/rbac/service'

// /api/admin/notifications/digest/run — cron entry point (platform staff
// holding the overview capability — RBAC, no legacy User.role bypass).
// Runs one digest batch across every active user with a DAILY/WEEKLY
// preference and reports { processed, generated, skipped }.

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // TENANT-AUDIT F-01: legacy User.role === 'ADMIN' check replaced by the
  // explicit RBAC ops capability.
  if (!(await userHasPlatformPermission(user.id, 'platform.overview.view')))
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

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
