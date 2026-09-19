import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { adminUpdateOrganization, OrgServiceError } from '@/server/modules/organizations/service'

const updateSchema = z.object({
  status: z.enum(['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'REJECTED']).optional(),
  creditTermsDays: z.number().int().min(0).max(180).optional(),
  creditLimit: z.number().min(0).max(10_000_000).optional(),
  notes: z.string().max(5000).nullable().optional(),
  groupIds: z.array(z.string()).optional(),
})

// PATCH /api/admin/organizations/[id] — verification, credit config, group mapping
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin()
  if (error) return error
  try {
    const { id } = await ctx.params
    const body = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    const organization = await adminUpdateOrganization(id, user!.id, parsed.data)
    return NextResponse.json({ organization })
  } catch (err) {
    if (err instanceof OrgServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin org PATCH error', err)
    return NextResponse.json({ error: 'Failed to update organization' }, { status: 500 })
  }
}
