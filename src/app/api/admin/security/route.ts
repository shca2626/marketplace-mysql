import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin, requireStepUpMfa } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { recordAudit, recordAuditTx } from '@/server/modules/audit/service'
import {
  MfaServiceError,
  getMfaPlatformPolicy,
  mfaRequiredForUser,
  setMfaPlatformPolicy,
} from '@/server/modules/mfa/service'

/**
 * Phase 6 (6.7.10) — admin security console.
 *   GET  /api/admin/security           → platform MFA policy + staff MFA overview
 *   PUT  /api/admin/security           → { requireForStaff } (audited; step-up required)
 *   POST /api/admin/security            → { userId, required } per-account toggle (step-up required)
 */

const policySchema = z.object({
  requireForStaff: z.boolean(),
})

const staffToggleSchema = z.object({
  userId: z.string().min(1),
  required: z.boolean(),
})

export async function GET() {
  const { user, error } = await requireAdmin('staff.manage')
  if (error) return error

  const policy = await getMfaPlatformPolicy()

  // Staff MFA overview: platform-scope assignments grouped by user.
  const assignments = await db.userRole.findMany({
    where: { organizationId: '' },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, mfaRequired: true, isBreakGlass: true } },
    },
    take: 300,
  })
  const byUser = new Map<
    string,
    { userId: string; name: string; email: string | null; phone: string | null; mfaRequired: boolean; isBreakGlass: boolean; roles: string[] }
  >()
  for (const a of assignments) {
    let entry = byUser.get(a.user.id)
    if (!entry) {
      entry = {
        userId: a.user.id,
        name: a.user.name,
        email: a.user.email,
        phone: a.user.phone,
        mfaRequired: a.user.mfaRequired,
        isBreakGlass: a.user.isBreakGlass,
        roles: [],
      }
      byUser.set(a.user.id, entry)
    }
    entry.roles.push(a.roleId)
  }
  const staff = [...byUser.values()]

  // Enrollment state per staff user (one query, then match).
  const enrollments = await db.mfaEnrollment.findMany({
    where: { userId: { in: staff.map((s) => s.userId) } },
    select: { userId: true, confirmedAt: true },
  })
  const enrolled = new Set(enrollments.filter((e) => e.confirmedAt).map((e) => e.userId))

  const staffOverview = await Promise.all(
    staff.map(async (s) => ({
      ...s,
      mfaEnrolled: enrolled.has(s.userId),
      mfaRequiredEffective: s.mfaRequired || (await mfaRequiredForUser(s.userId)),
    }))
  )
  return NextResponse.json({ policy, staff: staffOverview })
}

export async function PUT(req: NextRequest) {
  try {
    const csrf = assertSameOrigin(req)
    if (csrf) return csrf

    const { user, error } = await requireAdmin('staff.manage')
    if (error) return error

    // Sensitive action — step-up MFA freshness window (6.7.5).
    const su = await requireStepUpMfa()
    if (su.error) return su.error

    const parsed = policySchema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: 'Invalid policy payload' }, { status: 400 })

    const policy = await setMfaPlatformPolicy(
      { id: user!.id, name: user!.name },
      { requireForStaff: parsed.data.requireForStaff }
    )
    return NextResponse.json({ policy })
  } catch (err) {
    console.error('admin security PUT error', err)
    return NextResponse.json({ error: 'Failed to save policy' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const csrf = assertSameOrigin(req)
    if (csrf) return csrf

    const { user, error } = await requireAdmin('staff.manage')
    if (error) return error

    const su = await requireStepUpMfa()
    if (su.error) return su.error

    const rl = enforceRateLimit(req, 'adminStaffMfa', { limit: 30, windowMs: 60_000 }, user!.id)
    if (rl) return rl

    const parsed = staffToggleSchema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

    const target = await db.user.findUnique({
      where: { id: parsed.data.userId },
      select: { id: true, name: true, email: true },
    })
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    // 6.11: requirement flip + audit row commit atomically.
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: target.id }, data: { mfaRequired: parsed.data.required } })
      await recordAuditTx(tx, {
        actorId: user!.id,
        actorType: 'ADMIN',
        action: 'MFA_ACCOUNT_REQUIREMENT_CHANGED',
        entityType: 'User',
        entityId: target.id,
        summary: `MFA requirement for ${target.email ?? target.name} set to ${parsed.data.required}`,
        metadata: { required: parsed.data.required },
      })
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof MfaServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin security POST error', err)
    return NextResponse.json({ error: 'Failed to update staff MFA requirement' }, { status: 500 })
  }
}
