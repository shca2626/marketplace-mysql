import { NextResponse } from 'next/server'
import { recordAudit } from '@/server/modules/audit/service'
import { getSessionUser } from '@/lib/auth'

// POST /api/auth/become-seller — RETIRED (B2C + B2B2C model, no C2C).
//
// Individuals are customers only and can never open a personal storefront.
// Selling on Vendora happens through COMPANY organizations offering on the
// shared catalog (company workspace → Selling). This endpoint now answers 403
// for every caller so the old C2C flow is dead at the API level, not just
// hidden in the UI.
export async function POST() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Please sign in first' }, { status: 401 })

  await recordAudit({
    actorId: user.id,
    actorType: 'USER',
    action: 'BECOME_SELLER_BLOCKED',
    entityType: 'User',
    entityId: user.id,
    summary: 'Personal seller signup blocked — selling moved to company organizations',
  })

  return NextResponse.json(
    {
      error:
        'Personal storefronts are retired. Selling on Vendora happens through a company organization — open your Company workspace to manage offers on the shared catalog.',
      code: 'SELLING_NOT_ALLOWED',
    },
    { status: 403, headers: { 'X-Authz-Deny': 'SELLING_NOT_ALLOWED' } }
  )
}
