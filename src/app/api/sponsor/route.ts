import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import {
  listOrgSponsorships,
  purchaseSponsorship,
  SponsorshipError,
  quoteSponsorship,
  resolveSponsorshipPricing,
  SPONSORSHIP_PACKAGES,
} from '@/server/modules/sponsorships/service'

// GET /api/sponsor — the Selling → Sponsorships panel data.
//   ?organizationId=  the caller's org (server-verified membership)
//   &pricing=1       also return the resolved per-day pricing + packages
export async function GET(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const sp = req.nextUrl.searchParams
    const organizationId = sp.get('organizationId') || ''
    const withPricing = sp.get('pricing') === '1'
    if (!organizationId) return NextResponse.json({ error: 'organizationId is required' }, { status: 400 })

    // Server-side membership check — navigation visibility is not a control.
    const member = await db.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId: user.id } },
      select: { role: true },
    })
    if (!member) return NextResponse.json({ error: 'Not a member of that organization' }, { status: 403 })

    const [placements, pricing] = await Promise.all([
      listOrgSponsorships(organizationId),
      withPricing ? resolveSponsorshipPricing(organizationId) : Promise.resolve(null),
    ])
    return NextResponse.json({
      placements,
      ...(pricing ? { pricing, packages: SPONSORSHIP_PACKAGES } : {}),
    })
  } catch (err) {
    if (err instanceof SponsorshipError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    console.error('sponsor GET error', err)
    return NextResponse.json({ error: 'Failed to load sponsorships' }, { status: 500 })
  }
}

// POST /api/sponsor — quote or purchase.
//   { productId, days, mode: 'quote' | 'buy', paymentMethod? }
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const rl = enforceRateLimit(req, 'productWrite', RATE_LIMITS.productWrite, user.id)
    if (rl) return rl

    const body = (await req.json()) as { productId?: string; days?: number; mode?: string; paymentMethod?: 'CARD' | 'WALLET' }
    const productId = (body.productId || '').trim()
    const days = Number(body.days)
    if (!productId) return NextResponse.json({ error: 'productId is required' }, { status: 400 })
    if (!Number.isInteger(days)) return NextResponse.json({ error: 'days must be an integer' }, { status: 400 })

    if (body.mode === 'quote') {
      const quote = await quoteSponsorship(user.id, productId, days)
      return NextResponse.json({ quote })
    }

    const placement = await purchaseSponsorship({
      userId: user.id,
      productId,
      days,
      paymentMethod: body.paymentMethod === 'WALLET' ? 'WALLET' : 'CARD',
    })
    return NextResponse.json({ placement }, { status: 201 })
  } catch (err) {
    if (err instanceof SponsorshipError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    console.error('sponsor POST error', err)
    return NextResponse.json({ error: 'Failed to process sponsorship' }, { status: 500 })
  }
}
