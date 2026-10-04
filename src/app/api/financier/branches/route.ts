import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { requireFinancierStaffOrThrow } from '@/server/modules/financing/guards'
import { createBranch, financingError, listBranches } from '@/server/modules/financing/catalog'
import { branchCreateSchema } from '@/server/modules/financing/types'

// /api/financier/branches — branches & agents of the financier's own profile.

export async function GET() {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const staff = await requireFinancierStaffOrThrow({ id: user!.id })
    const branches = await listBranches(staff)
    return NextResponse.json({ branches })
  } catch (err) {
    const svc = financingError(err)
    if (svc) return NextResponse.json({ error: svc.message }, { status: svc.status })
    console.error('financier branches GET error', err)
    return NextResponse.json({ error: 'Failed to load branches' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:branches', { limit: 30, windowMs: 60_000 }, user!.id)
  if (rl) return rl

  try {
    const staff = await requireFinancierStaffOrThrow({ id: user!.id })
    const parsed = branchCreateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid branch payload' },
        { status: 400 }
      )
    }
    const branch = await createBranch(staff, parsed.data)
    return NextResponse.json({ branch }, { status: 201 })
  } catch (err) {
    const svc = financingError(err)
    if (svc) return NextResponse.json({ error: svc.message }, { status: svc.status })
    console.error('financier branches POST error', err)
    return NextResponse.json({ error: 'Failed to create branch' }, { status: 500 })
  }
}
