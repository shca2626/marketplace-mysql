import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { adminListCertifications } from '@/server/modules/kyc/certifications'

// GET /api/admin/certifications?status=PENDING — the KYP review queue
// (product certifications awaiting platform verification). Same staff
// permission as the vault documents queue (verification duty).
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin('financing.documents.verify')
  if (error) return error
  try {
    const status = req.nextUrl.searchParams.get('status') ?? undefined
    const certifications = await adminListCertifications({ status })
    return NextResponse.json({ certifications })
  } catch (err) {
    console.error('admin certifications GET error', err)
    return NextResponse.json({ error: 'Failed to load the certification queue' }, { status: 500 })
  }
}
