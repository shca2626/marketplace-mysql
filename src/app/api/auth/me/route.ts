import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSessionUser, toSessionUser } from '@/lib/auth'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { recordAudit } from '@/server/modules/audit/service'
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

// ── PATCH /api/auth/me — profile self-service (BUY-211) ──────────────────────
// The signed-in user edits their own contact scalars: name, phone, whatsapp.
// Email is intentionally NOT editable here: it is the login identity and its
// ownership must be (re-)proven through the verification flow — changing it
// silently would strand an unverified login. A clear 400 explains this.
// Phone-family field: undefined = not sent (leave untouched), '' = clear,
// otherwise validated. A plain transform would map undefined → null and wipe
// fields the caller never mentioned — preprocess keeps the distinction.
const phoneField = z.preprocess(
  (v) => (v === '' ? null : v),
  z
    .string()
    .trim()
    .max(20, 'Phone number is too long')
    .regex(/^\+?[0-9\s\-()]{6,20}$/, 'Enter a valid phone number (6–20 digits, optional leading +)')
    .nullable()
    .optional()
)

const patchSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be at most 100 characters')
    .optional(),
  phone: phoneField,
  whatsappNumber: phoneField,
})

export async function PATCH(req: NextRequest) {
  try {
    const csrf = assertSameOrigin(req)
    if (csrf) return csrf

    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Please sign in first' }, { status: 401 })

    // Per-user policy: the actor is authenticated — profile edits are cheap
    // but should not be hammerable (form spam / scraping damping).
    const rl = enforceRateLimit(req, 'profileUpdate', { limit: 20, windowMs: 10 * 60_000 }, user.id)
    if (rl) return rl

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 })
    }

    if (body && typeof body === 'object' && 'email' in body) {
      const attempted = (body as Record<string, unknown>).email
      if (typeof attempted === 'string' && attempted.trim().toLowerCase() !== user.email) {
        return NextResponse.json(
          {
            error:
              'Email cannot be changed here — it is your sign-in identity. Contact support to migrate your account to a new email address.',
          },
          { status: 400 }
        )
      }
    }

    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const { name, phone, whatsappNumber } = parsed.data
    if (name === undefined && phone === undefined && whatsappNumber === undefined) {
      return NextResponse.json({ error: 'Nothing to update — send name, phone or whatsappNumber' }, { status: 400 })
    }

    const updated = await db.user.update({
      where: { id: user.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(whatsappNumber !== undefined ? { whatsappNumber } : {}),
      },
    })

    await recordAudit({
      actorId: user.id,
      actorType: 'USER',
      action: 'USER_PROFILE_UPDATED',
      entityType: 'User',
      entityId: user.id,
      summary: `Profile updated: ${updated.email}`,
      metadata: {
        fields: [
          ...(name !== undefined ? ['name'] : []),
          ...(phone !== undefined ? ['phone'] : []),
          ...(whatsappNumber !== undefined ? ['whatsappNumber'] : []),
        ],
      },
    })

    // Same shape as GET so the client can swap its cached /me payload 1:1.
    return NextResponse.json({ user: toSessionUser(updated), applicant: toApplicantProfile(updated) })
  } catch (err) {
    console.error('me PATCH error', err)
    return NextResponse.json({ error: 'Could not update your profile' }, { status: 500 })
  }
}
