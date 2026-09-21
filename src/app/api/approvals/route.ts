import { NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { listApprovals, ApprovalServiceError } from '@/server/modules/approvals/service'

// GET /api/approvals — my organization's approval queue (approvers) or my own
// requests (buyers). Empty list when the user belongs to no organization.
export async function GET() {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const result = await listApprovals(user!.id)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof ApprovalServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('approvals GET error', err)
    return NextResponse.json({ error: 'Failed to load approvals' }, { status: 500 })
  }
}
