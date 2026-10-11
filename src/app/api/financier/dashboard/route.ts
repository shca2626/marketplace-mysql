import { NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { requireFinancierStaffOrThrow } from '@/server/modules/financing/guards'
import { financierDashboard, financingError } from '@/server/modules/financing/catalog'

// GET /api/financier/dashboard — console headline numbers: inbox counts by
// status, live accreditations, offers pending, agreements and recent activity.

export async function GET() {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const staff = await requireFinancierStaffOrThrow({ id: user!.id })
    const dashboard = await financierDashboard(staff)
    return NextResponse.json(dashboard)
  } catch (err) {
    const svc = financingError(err)
    if (svc) return NextResponse.json({ error: svc.message }, { status: svc.status })
    console.error('financier dashboard GET error', err)
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 })
  }
}
