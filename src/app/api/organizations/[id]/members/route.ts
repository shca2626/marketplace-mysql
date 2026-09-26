import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { addOrganizationMember, OrgServiceError } from '@/server/modules/organizations/service'
import { assertSameOrigin } from '@/lib/http'

const addMemberSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  role: z.enum(['ADMIN', 'BUYER', 'APPROVER', 'VIEWER']),
  jobTitle: z.string().trim().max(80).optional().nullable(),
})

// POST /api/organizations/[id]/members — OWNER/ADMIN adds an existing user
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    const body = await req.json()
    const parsed = addMemberSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    const member = await addOrganizationMember(id, user!.id, parsed.data)
    return NextResponse.json({ member }, { status: 201 })
  } catch (err) {
    if (err instanceof OrgServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('org members POST error', err)
    return NextResponse.json({ error: 'Failed to add member' }, { status: 500 })
  }
}
