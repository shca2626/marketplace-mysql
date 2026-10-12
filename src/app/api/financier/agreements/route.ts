import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { requireFinancierContext } from '@/server/modules/financing/shared'
import { listFinancierAgreements } from '@/server/modules/financing/agreements'
import { FinancingError } from '@/server/modules/financing/shared'

// GET /api/financier/agreements — the org's financing agreements (frozen
// offer + installment schedule + reported events + platform fees).
export async function GET() {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const ctx = await requireFinancierContext(user.id, 'financier.agreements.manage')
    const agreements = await listFinancierAgreements(ctx.organizationId)
    return NextResponse.json({ agreements })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier agreements GET error', err)
    return NextResponse.json({ error: 'Failed to load the agreements' }, { status: 500 })
  }
}
