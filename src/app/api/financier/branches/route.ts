import { NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { db } from '@/lib/db'
import { requireFinancierContext, FinancingError } from '@/server/modules/financing/shared'

// GET /api/financier/branches — the institution's ACTIVE branches. Powers the
// inbox branch filter (10.7) and the limit-matrix branch picker. The full
// branch directory (incl. inactive) stays on the public institution profile.
export async function GET() {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const ctx = await requireFinancierContext(user.id)
    const branches = await db.financierBranch.findMany({
      where: { financierProfileId: ctx.financierProfileId, isActive: true },
      select: {
        id: true,
        name: true,
        kind: true,
        city: true,
        district: true,
        position: true,
      },
      orderBy: { position: 'asc' },
    })
    return NextResponse.json({
      branches: branches.map((b) => ({
        id: b.id,
        name: b.name,
        kind: b.kind,
        city: b.city,
        district: b.district,
        position: b.position,
      })),
    })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier branches GET error', err)
    return NextResponse.json({ error: 'Failed to load the branches' }, { status: 500 })
  }
}
