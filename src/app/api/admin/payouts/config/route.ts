import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireStepUpMfa } from '@/server/guards'
import { getPayoutsConfig, updatePayoutsConfig, PayoutServiceError } from '@/server/modules/payouts/service'
import { assertSameOrigin } from '@/lib/http'

// GET /api/admin/payouts/config — platform default commission percent.
export async function GET() {
  const { error } = await requireAdmin('payouts.manage')
  if (error) return error
  return NextResponse.json({ config: await getPayoutsConfig() })
}

// PUT /api/admin/payouts/config — set the platform default commission percent
// (0-90). Vendors without a per-vendor override settle at this rate.
export async function PUT(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { error } = await requireAdmin('payouts.manage')
  if (error) return error
  // Phase 6 (6.7.5): sensitive action — requires a fresh MFA confirmation.
  const su = await requireStepUpMfa()
  if (su.error) return su.error
  try {
    const body = await req.json()
    const config = await updatePayoutsConfig({ defaultCommissionPercent: Number(body?.defaultCommissionPercent) })
    return NextResponse.json({ config })
  } catch (err) {
    if (err instanceof PayoutServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('payouts config PUT error', err)
    return NextResponse.json({ error: 'Failed to update payout config' }, { status: 500 })
  }
}
