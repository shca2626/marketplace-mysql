import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { financingError } from '@/server/modules/financing/catalog'
import { listAllDocumentsAdmin } from '@/server/modules/financing/documents'

// GET /api/admin/documents — the document verification console.
// ?status=PENDING (default queue) and ?documentType= filter it.

const DOC_STATUSES = ['PENDING', 'VERIFIED', 'REJECTED'] as const
const DOC_TYPES = [
  'NATIONAL_ID', 'PASSPORT', 'RESIDENCE_PERMIT', 'COMMERCIAL_REG', 'TAX_CARD', 'BUSINESS_LICENSE',
  'BANK_STATEMENT', 'FINANCIAL_STATEMENT', 'PROOF_OF_ADDRESS', 'GUARANTEE_DOC', 'FEASIBILITY_STUDY',
  'INVOICE', 'PURCHASE_ORDER', 'PROJECT_FILE', 'OTHER',
] as const

export async function GET(req: NextRequest) {
  const { user, error } = await requireAdmin('financing.documents.verify')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:financing', { limit: 120, windowMs: 60_000 }, user!.id)
  if (rl) return rl

  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    if (status && !(DOC_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json({ error: 'status must be PENDING, VERIFIED or REJECTED' }, { status: 400 })
    }
    const documentType = searchParams.get('documentType')
    if (documentType && !(DOC_TYPES as readonly string[]).includes(documentType)) {
      return NextResponse.json({ error: 'Unknown document type' }, { status: 400 })
    }
    const documents = await listAllDocumentsAdmin({
      status: status ?? undefined,
      documentType: documentType ?? undefined,
    })
    return NextResponse.json({ documents })
  } catch (err) {
    const svc = financingError(err)
    if (svc) return NextResponse.json({ error: svc.message }, { status: svc.status })
    console.error('admin documents GET error', err)
    return NextResponse.json({ error: 'Failed to load documents' }, { status: 500 })
  }
}
