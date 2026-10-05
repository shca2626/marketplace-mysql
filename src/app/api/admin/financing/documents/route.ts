import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { adminListDocuments } from '@/server/modules/financing/documents'
import { triggerExpiryScanThrottled } from '@/server/modules/kyc/expiry'

// GET /api/admin/financing/documents — platform-wide vault queue (FIN-7):
// pending verifications by default, any status filter; ?userId= scopes to one
// applicant's vault (the gate review console joins checklist document
// references against this). Read-only.
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin('financing.documents.verify')
  if (error) return error
  try {
    // Opportunistic KYC freshness: opening the documents queue kicks off the
    // expiry-reminder sweep in the background (throttled to once/hour per
    // server process — no cron needed). Never awaited; failures are logged
    // inside the sweep, never surfaced to this response.
    triggerExpiryScanThrottled()

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
