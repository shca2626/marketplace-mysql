import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { financierGetAccreditation } from '@/server/modules/financing/accreditation'
import { FinancingError } from '@/server/modules/financing/shared'

// GET /api/financier/accreditations/[id] — one accreditation dossier for the
// financier console (R-4: assertFinancierAccreditationAccess inside the
// service refuses anything the gate has not forwarded). Latent FIN-5 gap
// surfaced by FIN-7 QA once a forwarded accreditation became reachable.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    const request = await financierGetAccreditation(user.id, id)
    return NextResponse.json({ request })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier accreditation detail error', err)
    return NextResponse.json({ error: 'Failed to load the accreditation' }, { status: 500 })
  }
}
