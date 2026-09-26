import { NextResponse } from 'next/server'
import { getSessionUser, toSessionUser } from '@/lib/auth'
import type { ApplicantProfileDTO } from '@/lib/types'

// GET /api/auth/me — session restore. The base `user` shape is unchanged
// (the store's setUser ignores extra sibling keys). FIN-6 additionally reads
// the additive `applicant` block — the User applicant-profile scalars
// (FINANCIER_SCHEMA §3.1, DP-14) rendered read-only by the financing wizard's
// step 1 (single entry — the profile is never copied into requests, R-2).
function toApplicantProfile(user: {
  phone: string | null
  whatsappNumber: string | null
  dateOfBirth: Date | null
  gender: string | null
  maritalStatus: string | null
  nationality: string | null
  identityType: string | null
  identityNumber: string | null
  residenceStreet: string | null
  residenceCity: string | null
  residenceDistrict: string | null
  residenceType: string | null
}): ApplicantProfileDTO {
  return {
    phone: user.phone,
    whatsappNumber: user.whatsappNumber,
    dateOfBirth: user.dateOfBirth ? user.dateOfBirth.toISOString() : null,
    gender: user.gender,
    maritalStatus: user.maritalStatus,
    nationality: user.nationality,
    identityType: user.identityType,
    identityNumber: user.identityNumber,
    residenceStreet: user.residenceStreet,
    residenceCity: user.residenceCity,
    residenceDistrict: user.residenceDistrict,
    residenceType: user.residenceType,
  }
}

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ user: null, applicant: null })
  return NextResponse.json({ user: toSessionUser(user), applicant: toApplicantProfile(user) })
}
