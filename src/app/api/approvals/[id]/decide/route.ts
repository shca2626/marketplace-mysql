import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { decideApproval, ApprovalServiceError } from '@/server/modules/approvals/service'
import { assertSameOrigin } from '@/lib/http'

const decideSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  note: z.string().trim().max(500).optional(),
})

// POST /api/approvals/[id]/decide — approve or reject a pending request.
// OWNER/ADMIN/APPROVER members only; requesters can never decide their own.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const parsed = decideSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    const approval = await decideApproval(id, { id: user!.id, name: user!.name }, parsed.data.action, parsed.data.note)
    return NextResponse.json({ approval })
  } catch (err) {
    if (err instanceof ApprovalServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('approval decide error', err)
    return NextResponse.json({ error: 'Failed to decide approval' }, { status: 500 })
  }
}
