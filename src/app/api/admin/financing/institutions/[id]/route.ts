import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { financingError } from '@/server/modules/financing/catalog'
import { adminUpdateInstitution } from '@/server/modules/financing/services'
import { FinancingError } from '@/server/modules/financing/shared'
import { adminUpdateOrganization } from '@/server/modules/organizations/service'

// PATCH /api/admin/financing/institutions/[id] — two shapes, one handler
// (the [id] and [orgId] route trees were merged to fix the conflicting-slug
// build error; both consumers keep their exact request contract):
//
//   { action: 'verify' | 'suspend' | 'reactivate' }
//        → organization status transition (reused from the organizations
//          service — audit + verifiedAt included). Used by the admin console
//          tests and API consumers.
//
//   { licenseNumber?, regulator?, minTicket?, maxTicket?, ... }
//        → institution profile facts update (license, regulator, ticket
//          range, contacts, about, website). Used by the institutions UI.

const actionSchema = z.object({
  action: z.enum(['verify', 'suspend', 'reactivate']),
})

const updateSchema = z.object({
  licenseNumber: z.string().trim().max(80).nullish(),
  regulator: z.string().trim().max(120).nullish(),
  minTicket: z.number().min(0).nullish(),
  maxTicket: z.number().min(0).nullish(),
  contactEmail: z.string().trim().email('Enter a valid contact email').max(160).nullish(),
  contactPhone: z.string().trim().max(40).nullish(),
  about: z.string().trim().max(2000).nullish(),
  website: z
    .string()
    .trim()
    .url('Enter a valid website URL')
    .max(255)
    .nullish()
    .or(z.literal('')),
})

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin('financing.institutions.manage')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:financing', { limit: 60, windowMs: 60_000 }, user!.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({}))

    // status-transition shape
    const action = actionSchema.safeParse(body)
    if (action.success) {
      const status = action.data.action === 'suspend' ? 'SUSPENDED' : 'ACTIVE'
      const organization = await adminUpdateOrganization(id, user!.id, { status })
      return NextResponse.json({ organization })
    }

    // profile-facts shape
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Unknown action' }, { status: 400 })
    }
    const institution = await adminUpdateInstitution(user!.id, id, parsed.data)
    return NextResponse.json({ institution })
  } catch (err) {
    const svc = financingError(err)
    if (svc) return NextResponse.json({ error: svc.message }, { status: svc.status })
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin institution PATCH error', err)
    return NextResponse.json({ error: 'Failed to update institution' }, { status: 500 })
  }
}
