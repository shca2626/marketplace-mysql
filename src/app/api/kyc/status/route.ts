import { NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { getKycStatus } from '@/server/modules/kyc/service'

// GET /api/kyc/status — the signed-in user's verification level + hints.
// Powers the account console "Verification" card, the publish gate guidance
// and any UI that needs trust signals. Read-only; levels are DERIVED (never
// set through this route).
export async function GET() {
  const { user, error } = await requireUser()
  if (error) return error

  try {
    const status = await getKycStatus(user.id)
    return NextResponse.json(status)
  } catch (err) {
    console.error('kyc status error', err)
    return NextResponse.json({ error: 'Failed to load verification status' }, { status: 500 })
  }
}
