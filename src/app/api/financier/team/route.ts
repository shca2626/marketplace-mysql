import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { FinancingError } from '@/server/modules/financing/shared'
import {
  inviteInstitutionStaff,
  listInstitutionTeam,
  removeMember,
  revokeInstitutionInvitation,
  setMemberRole,
} from '@/server/modules/financing/team'

// GET /api/financier/team — institution staff + invitations + assignable roles.
export async function GET() {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const team = await listInstitutionTeam(user!.id)
    return NextResponse.json(team)
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier team GET error', err)
    return NextResponse.json({ error: 'Failed to load the institution team' }, { status: 500 })
  }
}

const inviteSchema = z.object({
  email: z.string().trim().email('Enter a valid email address').max(200),
  name: z.string().trim().max(60).nullable().optional(),
  roleKey: z.enum(['financier.admin', 'financier.underwriter', 'financier.reviewer', 'financier.branch-officer']),
})

// POST /api/financier/team — invite institution staff by email.
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const { user, error } = await requireUser()
  if (error) return error
  const rl = enforceRateLimit(req, 'financier-team:invite', RATE_LIMITS.productWrite, user!.id)
  if (rl) return rl
  try {
    const parsed = inviteSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const invitation = await inviteInstitutionStaff(user!.id, user!.name, parsed.data)
    return NextResponse.json({ invitation }, { status: 201 })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier team POST error', err)
    return NextResponse.json({ error: 'Failed to send the invitation' }, { status: 500 })
  }
}

const patchSchema = z.object({
  memberUserId: z.string().trim().min(1),
  roleKey: z
    .enum(['financier.admin', 'financier.underwriter', 'financier.reviewer', 'financier.branch-officer'])
    .nullable(),
})

// PATCH /api/financier/team — swap a member's granular role (null = none).
export async function PATCH(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const parsed = patchSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    await setMemberRole(user!.id, parsed.data)
    const team = await listInstitutionTeam(user!.id)
    return NextResponse.json(team)
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier team PATCH error', err)
    return NextResponse.json({ error: 'Failed to update the member role' }, { status: 500 })
  }
}

// DELETE /api/financier/team?memberId=… | ?invitationId=…
export async function DELETE(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const memberId = req.nextUrl.searchParams.get('memberId')
    const invitationId = req.nextUrl.searchParams.get('invitationId')
    if (memberId) {
      await removeMember(user!.id, memberId)
      return NextResponse.json({ ok: true })
    }
    if (invitationId) {
      await revokeInstitutionInvitation(user!.id, invitationId)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'memberId or invitationId is required' }, { status: 400 })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier team DELETE error', err)
    return NextResponse.json({ error: 'Failed to remove from the team' }, { status: 500 })
  }
}
