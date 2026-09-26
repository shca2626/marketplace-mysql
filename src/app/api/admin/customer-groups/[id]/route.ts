import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { adminDeleteGroup, adminUpdateGroup, GroupServiceError } from '@/server/modules/customer-groups/service'
import { assertSameOrigin } from '@/lib/http'

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  isDefault: z.boolean().optional(),
})

// PATCH /api/admin/customer-groups/[id]
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdmin()
  if (error) return error
  try {
    const { id } = await ctx.params
    const body = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    const group = await adminUpdateGroup(id, user!.id, parsed.data)
    return NextResponse.json({ group })
  } catch (err) {
    if (err instanceof GroupServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin group PATCH error', err)
    return NextResponse.json({ error: 'Failed to update group' }, { status: 500 })
  }
}

// DELETE /api/admin/customer-groups/[id]
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin()
  if (error) return error
  try {
    const { id } = await ctx.params
    await adminDeleteGroup(id, user!.id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof GroupServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin group DELETE error', err)
    return NextResponse.json({ error: 'Failed to delete group' }, { status: 500 })
  }
}
