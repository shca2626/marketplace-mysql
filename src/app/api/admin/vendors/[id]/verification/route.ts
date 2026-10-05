import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import {
  setSellerVerification,
  SELLER_VERIFICATION_STATES,
  VendorServiceError,
} from '@/server/modules/vendors/service'
import { assertSameOrigin } from '@/lib/http'

const schema = z.object({
  state: z.enum(SELLER_VERIFICATION_STATES),
  note: z.string().max(1000).optional(),
})

// PATCH /api/admin/vendors/[id]/verification — Phase 7.0: the seller-org
// verification state (UNVERIFIED | PENDING | VERIFIED | REJECTED) on
// SellerProfile. Verification ≠ suspension: Organization.status stays the
// operational lifecycle; suspension is enforced at every publishing path
// independently of this state.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const { user, error } = await requireAdmin('vendors.verify')
  if (error) return error
  try {
    const { id } = await ctx.params
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid state' }, { status: 400 })
    }
    const result = await setSellerVerification(user!.id, id, parsed.data)
    return NextResponse.json({ verification: result })
  } catch (err) {
    if (err instanceof VendorServiceError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('admin vendor verification PATCH error', err)
    return NextResponse.json({ error: 'Failed to set verification state' }, { status: 500 })
  }
}
