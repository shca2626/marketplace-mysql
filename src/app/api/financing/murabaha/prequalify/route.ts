import { NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { preQualifyBuyer } from '@/server/modules/financing/murabaha'
import { FinancingError } from '@/server/modules/financing/shared'

// GET /api/financing/murabaha/prequalify — the buyer-side Finance-it
// pre-qualification check (10.9): KYC L2+ gate + eligible services. The
// checkout uses this to show/hide the Murabaha option with a clean fallback.
export async function GET() {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const result = await preQualifyBuyer(user.id)
    return NextResponse.json({ prequalified: result })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('murabaha prequalify error', err)
    return NextResponse.json({ error: 'Pre-qualification check failed' }, { status: 500 })
  }
}
