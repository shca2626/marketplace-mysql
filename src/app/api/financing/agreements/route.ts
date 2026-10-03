import { NextResponse } from 'next/server'
import { requireModule } from '@/server/guards'
import { listMyAgreements } from '@/server/modules/financing/agreements'
import { FinancingError } from '@/server/modules/financing/shared'

// GET /api/financing/agreements — my agreements (requests created by me or
// my orgs), frozen offer + installments + events + fees by reference.
export async function GET() {
  const { user, error } = await requireModule('financing-hub')
  if (error) return error
  try {
    const agreements = await listMyAgreements(user.id)
    return NextResponse.json({ agreements })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('my agreements error', err)
    return NextResponse.json({ error: 'Failed to load your agreements' }, { status: 500 })
  }
}
