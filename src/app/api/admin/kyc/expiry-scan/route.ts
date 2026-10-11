import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { scanDocumentExpiry } from '@/server/modules/kyc/expiry'

// POST /api/admin/kyc/expiry-scan — manually run the document expiry sweep
// (Phase 3): every VERIFIED vault document expiring within 30 days gets its
// owner a reminder (in-app + WhatsApp twin), deduped to once per 14 days per
// document. The same logic also auto-triggers when an admin opens the
// documents queue (throttled to once/hour) — this route is the manual trigger
// for ops/cron use.
export async function POST(req: NextRequest) {
  const { error } = await requireAdmin('financing.documents.verify')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:kyc-expiry-scan', { limit: 6, windowMs: 10 * 60_000 })
  if (rl) return rl

  try {
    const result = await scanDocumentExpiry()
    return NextResponse.json(result)
  } catch (err) {
    console.error('kyc expiry scan error', err)
    return NextResponse.json({ error: 'Expiry scan failed' }, { status: 500 })
  }
}
