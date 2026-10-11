import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { financingError } from '@/lib/financing-api'
import { expireSweep as sweepFinancingRequests } from '@/server/modules/financing/requests'
import { expireSweep as sweepAccreditation } from '@/server/modules/financing/accreditation'
import { expireOffersSweep } from '@/server/modules/financing/offers'

// POST /api/admin/financing/sweep — manual trigger for the lazy expiry sweeps
// (financing + accreditation requests, lapsed accreditation grants, stale
// offers). FIN-8 wires the recurring schedule onto the same service functions.
export async function POST(req: NextRequest) {
  const { user, error } = await requireAdmin()
  if (error) return error

  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const rl = enforceRateLimit(req, 'productWrite', RATE_LIMITS.productWrite, user.id)
  if (rl) return rl

  try {
    const [financing, accreditation, offers] = await Promise.all([
      sweepFinancingRequests(),
      sweepAccreditation(),
      expireOffersSweep(),
    ])
    return NextResponse.json({
      financingRequestsExpired: financing.expired,
      accreditationRequestsExpired: accreditation.requestsExpired,
      accreditationGrantsExpired: accreditation.accreditationsExpired,
      offersExpired: offers.expired,
    })
  } catch (err) {
    return financingError(err, 'run the expiry sweeps')
  }
}
