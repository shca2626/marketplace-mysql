import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import {
  FinancingError,
  FINANCIER_ORG_COOKIE,
  getFinancierContext,
  listFinancierContextOrgs,
} from '@/server/modules/financing/shared'

// GET /api/financier/context — the active institution (auto-provisioned
// profile included) + every financier org the user could switch to. Powers
// the console's topbar switcher (FIN-013) and the header menu entry.
export async function GET() {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const [{ organizations, activeOrganizationId }, context] = await Promise.all([
      listFinancierContextOrgs(user.id),
      getFinancierContext(user.id),
    ])
    return NextResponse.json({ context, organizations, activeOrganizationId })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier context GET error', err)
    return NextResponse.json({ error: 'Failed to load the financier context' }, { status: 500 })
  }
}

// POST /api/financier/context — switch the active institution for multi-org
// staff. Sets the fin_org cookie every /api/financier/* call resolves through.
const switchSchema = z.object({
  organizationId: z.string().trim().min(1),
})

export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const { user, error } = await requireUser()
  if (error) return error
  const rl = enforceRateLimit(req, 'financier:context', { limit: 30, windowMs: 60_000 }, user.id)
  if (rl) return rl

  try {
    const body = await req.json()
    const parsed = switchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    const { organizations } = await listFinancierContextOrgs(user.id)
    const target = organizations.find((o) => o.id === parsed.data.organizationId)
    if (!target) {
      throw new FinancingError('You are not staff of that institution', 403)
    }
    // Route handlers get a mutable cookie store — writing it here both updates
    // the outgoing response AND every same-request read of the active org.
    const store = await cookies()
    store.set(FINANCIER_ORG_COOKIE, target.id, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })
    const context = await getFinancierContext(user.id)
    return NextResponse.json({ context, organizations, activeOrganizationId: target.id })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier context POST error', err)
    return NextResponse.json({ error: 'Failed to switch the institution' }, { status: 500 })
  }
}
