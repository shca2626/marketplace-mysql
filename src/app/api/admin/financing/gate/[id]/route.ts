import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { db } from '@/lib/db'
import {
  adminGetFinancingRequest,
} from '@/server/modules/financing/requests'
import { adminGetAccreditation } from '@/server/modules/financing/accreditation'
import { FinancingError } from '@/server/modules/financing/shared'

// GET /api/admin/financing/gate/[id] — full gate dossier for either request
// type (cuid ids are globally unique; auto-detected): profile + checklist
// with verdicts + gate status. The admin console renders the applicant
// profile + vault documents alongside (documents?userId= on /api/documents
// is admin-visible via the dossier payload).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin('financing.gate.review')
  if (error) return error
  try {
    const { id } = await ctx.params
    const fin = await db.financingRequest.findUnique({ where: { id }, select: { id: true } })
    if (fin) {
      const request = await adminGetFinancingRequest(id)
      return NextResponse.json({ requestType: 'FINANCING', request })
    }
    const acc = await db.accreditationRequest.findUnique({ where: { id }, select: { id: true } })
    if (acc) {
      const request = await adminGetAccreditation(id)
      return NextResponse.json({ requestType: 'ACCREDITATION', request })
    }
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin gate dossier error', err)
    return NextResponse.json({ error: 'Failed to load the dossier' }, { status: 500 })
  }
}
