import { NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { getMyReferral } from '@/server/modules/referrals/service'

// GET /api/referrals — the user's referral code, share link, stats and the
// recent join list (Account → Referrals).
export async function GET() {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const referral = await getMyReferral(user.id)
    return NextResponse.json({ referral })
  } catch (err) {
    console.error('referrals GET error', err)
    return NextResponse.json({ error: 'Failed to load your referral program' }, { status: 500 })
  }
}
