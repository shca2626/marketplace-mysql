import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin } from '@/lib/http'
import { adminResolveComplaint, ComplaintError } from '@/server/modules/complaints/service'

// PATCH /api/admin/complaints/[id] — triage + close (complaints.manage).
//   { outcome: 'RESOLVED' | 'DISMISSED', resolutionNote, severity? }
// A severity-only payload on an already-closed complaint re-triages the flag.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const { user, error } = await requireAdmin('complaints.manage')
  if (error) return error
  try {
    const { id } = await ctx.params
    const body = (await req.json()) as {
      outcome?: 'RESOLVED' | 'DISMISSED'
      resolutionNote?: string
      severity?: string
    }
    if (!body.outcome) return NextResponse.json({ error: 'outcome is required' }, { status: 400 })

    const complaint = await adminResolveComplaint(
      user!.id,
      id,
      body.outcome,
      body.resolutionNote ?? '',
      body.severity
    )
    return NextResponse.json({ complaint })
  } catch (err) {
    if (err instanceof ComplaintError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    console.error('admin complaints PATCH error', err)
    return NextResponse.json({ error: 'Failed to update complaint' }, { status: 500 })
  }
}
