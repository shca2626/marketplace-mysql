import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { adminUpdateInstitution } from '@/server/modules/financing/services'
import { FinancingError } from '@/server/modules/financing/shared'

// PATCH /api/admin/financing/institutions/[orgId] — edit an institution's
// profile facts: license, regulator, ticket range, contacts, about, website.
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

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ orgId: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const { user, error } = await requireAdmin()
  if (error) return error
  const rl = enforceRateLimit(req, 'admin:institution-update', { limit: 30, windowMs: 60_000 }, user.id)
  if (rl) return rl

  try {
    const { orgId } = await ctx.params
    const body = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    const institution = await adminUpdateInstitution(user.id, orgId, parsed.data)
    return NextResponse.json({ institution })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin institution update error', err)
    return NextResponse.json({ error: 'Failed to update the institution' }, { status: 500 })
  }
}
