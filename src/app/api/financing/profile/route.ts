import { NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { db } from '@/lib/db'
import { iso } from '@/server/modules/financing/types'

// GET /api/financing/profile — the signed-in user's applicant profile (the
// DP-14 User additive scalars). Read-only; powers the wizard's step-1 profile
// review. (/api/auth/me intentionally returns the lean SessionUser shape —
// this route is the financing-scoped read that does not touch the auth surface.)

export async function GET() {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const profile = await db.user.findUnique({
      where: { id: user.id },
      select: {
        name: true,
        email: true,
        phone: true,
        whatsappNumber: true,
        dateOfBirth: true,
        gender: true,
        maritalStatus: true,
        nationality: true,
        identityType: true,
        identityNumber: true,
        residenceStreet: true,
        residenceCity: true,
        residenceDistrict: true,
        residenceType: true,
        verifiedAt: true,
      },
    })
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    return NextResponse.json({
      profile: {
        ...profile,
        dateOfBirth: iso(profile.dateOfBirth),
        verifiedAt: iso(profile.verifiedAt),
      },
    })
  } catch (err) {
    console.error('financing profile GET error', err)
    return NextResponse.json({ error: 'Failed to load the applicant profile' }, { status: 500 })
  }
}
