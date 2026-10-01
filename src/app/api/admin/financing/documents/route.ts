import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { adminListDocuments } from '@/server/modules/financing/documents'

// GET /api/admin/financing/documents — platform-wide vault queue (FIN-7):
// pending verifications by default, any status filter; ?userId= scopes to one
// applicant's vault (the gate review console joins checklist document
// references against this). Read-only.
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin('financing.documents.verify')
  if (error) return error
  try {
    const sp = req.nextUrl.searchParams
    const documents = await adminListDocuments({
      status: sp.get('status') ?? undefined,
      userId: sp.get('userId') ?? undefined,
      organizationId: sp.get('organizationId') ?? undefined,
      documentType: sp.get('documentType') ?? undefined,
    })
    return NextResponse.json({ documents })
  } catch (err) {
    console.error('admin documents queue error', err)
    return NextResponse.json({ error: 'Failed to load the documents queue' }, { status: 500 })
  }
}
