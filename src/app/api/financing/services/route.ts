import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { listPublicServices } from '@/server/modules/financing/services'
import { nudgeFinancingSweeps } from '@/server/modules/financing/requests'

// GET /api/financing/services — public directory of ACTIVE financing +
// accreditation services (facet-filtered, paginated). Suspended institutions
// never appear (their offers are not accepting apps).
//
// Phase 12-c facets (invalid values → 400, never a silent 500):
//   kind        FINANCING | ACCREDITATION
//   category    one of the service categories
//   city        coverage region OR financier branch city (case-insensitive)
//   q / search  contains search over name/summary/description/org
//   amountMin/amountMax  requested bracket — a service matches when its own
//                        amount range INTERSECTS it (null bounds are open)
//   rateMax     services with a stated rate cap ≤ this
//   sort        popular | newest | rate_asc | amount_desc
function parseNonNegativeNumber(
  sp: URLSearchParams,
  name: string
): { value?: number; error?: string } {
  const raw = sp.get(name)
  if (raw === null || raw.trim() === '') return {}
  const v = Number(raw)
  if (!Number.isFinite(v) || v < 0) {
    return { error: `Invalid ${name} — expected a non-negative number` }
  }
  return { value: v }
}

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (user && user.status === 'SUSPENDED') {
      return NextResponse.json({ error: 'Your account is suspended' }, { status: 403 })
    }
    void nudgeFinancingSweeps()
    const sp = req.nextUrl.searchParams

    const amountMin = parseNonNegativeNumber(sp, 'amountMin')
    if (amountMin.error) return NextResponse.json({ error: amountMin.error }, { status: 400 })
    const amountMax = parseNonNegativeNumber(sp, 'amountMax')
    if (amountMax.error) return NextResponse.json({ error: amountMax.error }, { status: 400 })
    const rateMax = parseNonNegativeNumber(sp, 'rateMax')
    if (rateMax.error) return NextResponse.json({ error: rateMax.error }, { status: 400 })
    if (
      amountMin.value != null &&
      amountMax.value != null &&
      amountMin.value > amountMax.value
    ) {
      return NextResponse.json(
        { error: 'Invalid amount range — amountMin must not exceed amountMax' },
        { status: 400 }
      )
    }

    const sort = sp.get('sort')
    if (sort && !['popular', 'newest', 'rate_asc', 'amount_desc'].includes(sort)) {
      return NextResponse.json(
        { error: 'Invalid sort — expected popular | newest | rate_asc | amount_desc' },
        { status: 400 }
      )
    }

    const result = await listPublicServices({
      kind: sp.get('kind') ?? undefined,
      category: sp.get('category') ?? undefined,
      city: sp.get('city') ?? undefined,
      search: sp.get('q') ?? sp.get('search') ?? undefined,
      amountMin: amountMin.value,
      amountMax: amountMax.value,
      rateMax: rateMax.value,
      sort: sort ?? undefined,
      page: Number(sp.get('page')) || 1,
      limit: Number(sp.get('limit')) || 20,
    })
    return NextResponse.json(result)
  } catch (err) {
    console.error('financing services GET error', err)
    return NextResponse.json({ error: 'Failed to load services' }, { status: 500 })
  }
}
