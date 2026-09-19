import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { adminCreateGroup, adminListGroups, GroupServiceError } from '@/server/modules/customer-groups/service'

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional().nullable(),
  priority: z.number().int().min(0).max(1000).optional(),
  key: z.string().trim().max(60).optional(),
})

// GET /api/admin/customer-groups
export async function GET() {
  const { error } = await requireAdmin()
  if (error) return error
  try {
    const groups = await adminListGroups()
    return NextResponse.json({ groups })
  } catch (err) {
    console.error('admin groups GET error', err)
    return NextResponse.json({ error: 'Failed to load customer groups' }, { status: 500 })
  }
}

// POST /api/admin/customer-groups
export async function POST(req: NextRequest) {
  const { user, error } = await requireAdmin()
  if (error) return error
  try {
    const body = await req.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    const group = await adminCreateGroup(user!.id, parsed.data)
    return NextResponse.json({ group }, { status: 201 })
  } catch (err) {
    if (err instanceof GroupServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin groups POST error', err)
    return NextResponse.json({ error: 'Failed to create group' }, { status: 500 })
  }
}
