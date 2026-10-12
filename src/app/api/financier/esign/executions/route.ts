import { NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { requireFinancierContext, FinancingError } from '@/server/modules/financing/shared'
import { listExecutions } from '@/server/modules/financing/esign'

// GET /api/financier/esign/executions — the org's e-signature execution
// ledger (agreement, applicant, template version, acceptedAt, IP; evidence
// parsed for the detail dialog).
export async function GET() {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const ctx = await requireFinancierContext(user.id, 'financier.agreements.manage')
    const executions = await listExecutions(ctx.organizationId)
    return NextResponse.json({ executions })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('esign executions GET error', err)
    return NextResponse.json({ error: 'Failed to load the executions' }, { status: 500 })
  }
}
