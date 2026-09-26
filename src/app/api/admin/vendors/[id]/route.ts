import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { applyVendorAction, VendorServiceError } from '@/server/modules/vendors/service'
import { assertSameOrigin } from '@/lib/http'

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('verify') }),
  z.object({ action: z.literal('unverify') }),
  z.object({ action: z.literal('suspend'), reason: z.string().max(300).optional() }),
  z.object({ action: z.literal('reactivate'), note: z.string().max(300).optional() }),
  z.object({ action: z.literal('set-commission'), rate: z.number().nullable() }),
])

// PATCH /api/admin/vendors/[id] — vendor lifecycle actions.
// verify/unverify grant or remove the KYC-lite stamp; suspend/reactivate
// control marketplace visibility + sign-in; set-commission overrides the
// payout commission rate for this vendor (null = platform default).
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdmin()
  if (error) return error
  try {
    const { id } = await ctx.params
    const body = await req.json()
    const parsed = actionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid action' },
        { status: 400 }
      )
    }
    const result = await applyVendorAction(user!.id, id, parsed.data)
    return NextResponse.json({ vendor: result })
  } catch (err) {
    if (err instanceof VendorServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin vendor PATCH error', err)
    return NextResponse.json({ error: 'Failed to update vendor' }, { status: 500 })
  }
}
