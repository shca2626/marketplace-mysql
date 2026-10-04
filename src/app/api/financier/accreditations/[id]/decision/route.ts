import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { requireFinancierStaffOrThrow } from '@/server/modules/financing/guards'
import { financingError } from '@/server/modules/financing/catalog'
import {
  grantAccreditation,
  rejectAccreditation,
  revokeAccreditation,
} from '@/server/modules/financing/accreditation'

// POST /api/financier/accreditations/[id]/decision — the financier decides.
//   { decision: 'grant' | 'reject' | 'revoke', note, validMonths? }
// grant → ACCREDITED with validUntil (the program's accreditationValidMonths,
//         falling back to the platform default — validMonths is accepted for
//         forward-compat but the grant duration stays program-configured in v1).
// reject → REJECTED (note required). revoke → ends a LIVE grant (note required).

const decisionSchema = z
  .object({
    decision: z.enum(['grant', 'reject', 'revoke']),
    note: z.string().trim().max(500).optional().nullable(),
    validMonths: z.number().int().min(1).max(120).optional(),
  })
  .superRefine((d, ctx) => {
    if ((d.decision === 'reject' || d.decision === 'revoke') && !d.note?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['note'],
        message: `A ${d.decision} note is required`,
      })
    }
  })

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:accreditations', { limit: 30, windowMs: 60_000 }, user!.id)
  if (rl) return rl

  try {
    const staff = await requireFinancierStaffOrThrow({ id: user!.id })
    const { id } = await ctx.params
    const parsed = decisionSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid decision payload' },
        { status: 400 }
      )
    }
    const { decision, note } = parsed.data

    if (decision === 'grant') {
      const result = await grantAccreditation({ staff, requestId: id, note: note ?? null })
      return NextResponse.json(result)
    }
    if (decision === 'reject') {
      const result = await rejectAccreditation({ staff, requestId: id, note: note! })
      return NextResponse.json(result)
    }
    const result = await revokeAccreditation({
      actor: { id: user!.id, role: user!.role },
      requestId: id,
      reason: note!,
    })
    return NextResponse.json(result)
  } catch (err) {
    const svc = financingError(err)
    if (svc) return NextResponse.json({ error: svc.message }, { status: svc.status })
    console.error('financier accreditation decision error', err)
    return NextResponse.json({ error: 'Failed to decide accreditation' }, { status: 500 })
  }
}
