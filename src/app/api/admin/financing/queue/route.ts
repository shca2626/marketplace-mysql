import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { financingError } from '@/server/modules/financing/catalog'
import { listAdminGateQueue } from '@/server/modules/financing/requests'
import { listGateBlockers } from '@/server/modules/financing/submissions'
import { maybeSweep } from '@/server/modules/financing/sweep'

// GET /api/admin/financing/queue — THE GATE console queue (ADMIN only).
// Both request types, pre-forward states; ?type=FINANCING|ACCREDITATION and
// ?status=SUBMITTED|UNDER_PLATFORM_REVIEW|RETURNED_FOR_COMPLETION filter it.
// The lazy expiry sweep runs first so the queue never shows stale rows.

const GATE_STATUSES = ['SUBMITTED', 'UNDER_PLATFORM_REVIEW', 'RETURNED_FOR_COMPLETION'] as const

async function withBlockingCount(
  rows: Awaited<ReturnType<typeof listAdminGateQueue>>['financing'],
  parentType: 'FINANCING_REQUEST' | 'ACCREDITATION_REQUEST'
) {
  const enriched = await Promise.all(
    rows.map(async (r) => ({
      ...r,
      blockingCount: (await listGateBlockers(db, parentType, r.id)).length,
    }))
  )
  return enriched
}

export async function GET(req: NextRequest) {
  const { user, error } = await requireAdmin('financing.gate.view')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:financing', { limit: 120, windowMs: 60_000 }, user!.id)
  if (rl) return rl

  try {
    await maybeSweep()

    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type')
    if (type && !['FINANCING', 'ACCREDITATION'].includes(type)) {
      return NextResponse.json({ error: 'type must be FINANCING or ACCREDITATION' }, { status: 400 })
    }
    const status = searchParams.get('status')
    if (status && !(GATE_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json(
        { error: 'status must be one of ' + GATE_STATUSES.join(', ') },
        { status: 400 }
      )
    }

    const queue = await listAdminGateQueue({
      status: status ?? undefined,
      serviceKind: type === 'FINANCING' || type === 'ACCREDITATION' ? type : undefined,
    })

    const requesterIds = [...new Set([...queue.financing, ...queue.accreditation].map((r) => r.createdById))]
    const requesters = requesterIds.length
      ? await db.user.findMany({ where: { id: { in: requesterIds } }, select: { id: true, name: true, email: true } })
      : []
    const requesterById = new Map(requesters.map((u) => [u.id, u]))

    const financing = (await withBlockingCount(queue.financing, 'FINANCING_REQUEST')).map((r) => ({
      ...r,
      requester: requesterById.get(r.createdById) ?? null,
    }))
    const accreditation = (await withBlockingCount(queue.accreditation, 'ACCREDITATION_REQUEST')).map((r) => ({
      ...r,
      requester: requesterById.get(r.createdById) ?? null,
    }))

    return NextResponse.json({
      financing: type === 'ACCREDITATION' ? [] : financing,
      accreditation: type === 'FINANCING' ? [] : accreditation,
    })
  } catch (err) {
    const svc = financingError(err)
    if (svc) return NextResponse.json({ error: svc.message }, { status: svc.status })
    console.error('admin financing queue GET error', err)
    return NextResponse.json({ error: 'Failed to load gate queue' }, { status: 500 })
  }
}
