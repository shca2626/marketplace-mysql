import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { hashPassword, getSessionUser, setSessionCookie, toSessionUser } from '@/lib/auth'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { recordAudit } from '@/server/modules/audit/service'
import { buildSessionRbac } from '@/server/modules/rbac/service'
import { emitNotification } from '@/server/modules/notifications/service'
import { normalizeYemeniPhone } from '@/lib/phone'
import { verifyOtpProof } from '@/server/modules/otp/service'

/**
 * PHASE 3 — FINANCIER application door. Application-only, admin-approved:
 * NO instant self-serve financier capabilities. What this endpoint does:
 *
 *   · (when not signed in) creates the contact's user account — Yemeni
 *     phone + WhatsApp-OTP possession proof + password, exactly like the
 *     customer fast path — and signs them in as a plain BUYER.
 *   · creates the institution Organization (BANK | MFI | EWALLET) with
 *     status PENDING_VERIFICATION, plus the FinancierProfile facts that map
 *     cleanly (license, regulator, contacts, about).
 *   · adds the applicant as OWNER (one user owns one organization).
 *   · emits an audit record + the "Application received" notification.
 *
 * What it deliberately does NOT do: verify the org, raise kycLevel, activate
 * services or grant any console privilege — the public services catalog only
 * lists institutions whose org is ACTIVE, and the admin verifies the org via
 * the existing admin console (Organizations → verify). License expiry / CBY
 * registration / intended services land in Organization.notes + audit
 * metadata for the reviewing admin (no schema fields exist for them).
 */

const schema = z.object({
  legalName: z.string().trim().min(2, 'Institution legal name must be at least 2 characters').max(160),
  legalNameEn: z.string().trim().min(2).max(160).optional(),
  orgType: z.enum(['BANK', 'MFI', 'EWALLET']),
  licenseNumber: z.string().trim().max(80).optional(),
  licenseExpiry: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'License expiry must be a date')
    .optional(),
  cbyRegistrationNumber: z.string().trim().max(80).optional(),
  governorate: z.string().trim().max(60).optional(),
  website: z
    .string()
    .trim()
    .max(255)
    .optional()
    .transform((v) => (v ? (/^https?:\/\//i.test(v) ? v : `https://${v}`) : undefined))
    .refine((v) => !v || /^https?:\/\/.+\..+/i.test(v), 'Website must be a valid URL'),
  // Contact person — when the caller is signed in these are ignored in favor
  // of the session account (its phone was OTP-verified at registration).
  contactName: z.string().trim().min(2, 'Contact person name must be at least 2 characters').max(60),
  contactPhone: z.string().max(20).optional(),
  otpToken: z.string().max(200).optional(),
  password: z.string().min(6, 'Password must be at least 6 characters').max(100).optional(),
  contactEmail: z
    .string()
    .email('Contact email is not a valid address')
    .optional()
    .transform((v) => (v ? v.toLowerCase() : undefined)),
  services: z.array(z.string().trim().min(2).max(80)).max(15).optional(),
  description: z.string().trim().max(4000).optional(),
  acceptsTerms: z.literal(true, { message: 'Confirm you are authorized to apply on behalf of the institution' }),
})

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'org'
  )
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base)
  let suffix = 1
  while (await db.organization.findUnique({ where: { slug } })) {
    suffix += 1
    slug = `${slugify(base)}-${suffix}`
  }
  return slug
}

export async function POST(req: NextRequest) {
  try {
    const csrf = assertSameOrigin(req)
    if (csrf) return csrf

    const rl = enforceRateLimit(req, 'register-financier', RATE_LIMITS.financierRegister)
    if (rl) return rl

    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const input = parsed.data

    // ── The applicant account ──
    let applicantId: string
    let applicantPhone: string | null = null
    const sessionUser = await getSessionUser()
    if (sessionUser) {
      applicantId = sessionUser.id
      applicantPhone = sessionUser.phone ?? null
    } else {
      // Phone + OTP possession proof is REQUIRED to create the account.
      if (!input.contactPhone || !input.otpToken || !input.password) {
        return NextResponse.json(
          { error: 'Contact phone, WhatsApp code verification and a password are required for the applicant account.' },
          { status: 400 }
        )
      }
      const phone = normalizeYemeniPhone(input.contactPhone)
      if (!phone) {
        return NextResponse.json(
          { error: 'Enter a valid Yemeni mobile number — 9 digits starting with 70, 71, 73, 77 or 78.' },
          { status: 400 }
        )
      }
      if (!verifyOtpProof(input.otpToken, phone, 'REGISTER')) {
        return NextResponse.json(
          { error: 'Phone verification is missing or expired — request a new code and try again.' },
          { status: 400 }
        )
      }
      const phoneTaken = await db.user.findFirst({ where: { phone }, select: { id: true } })
      if (phoneTaken) {
        return NextResponse.json(
          { error: 'This phone number is already registered. Sign in first, then file the application.' },
          { status: 409 }
        )
      }
      if (input.contactEmail) {
        const emailTaken = await db.user.findUnique({ where: { email: input.contactEmail }, select: { id: true } })
        if (emailTaken) {
          return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })
        }
      }
      // User.email is NOT NULL in this schema — phone-first applicants get a
      // deterministic placeholder until KYC collects a real address (unique per
      // phone; the login door is phone+OTP so the placeholder never surfaces).
      const email = input.contactEmail ?? `${phone}@financier.vendora.local`
      const createdUser = await db.user.create({
        data: {
          name: input.contactName,
          email,
          phone,
          phoneVerifiedAt: new Date(),
          kycLevel: 1,
          password: hashPassword(input.password),
          role: 'BUYER',
        },
      })
      await recordAudit({
        actorId: createdUser.id,
        actorType: 'USER',
        action: 'USER_REGISTERED',
        entityType: 'User',
        entityId: createdUser.id,
        summary: `New financier applicant registered: ${phone}`,
        metadata: { phone, kycLevel: 1, via: 'financier-door' },
      })
      await setSessionCookie(createdUser.id, createdUser.sessionVersion)
      applicantId = createdUser.id
      applicantPhone = phone
    }

    // One user owns one organization — a financier applicant who already owns
    // a company must use a different owner account (org types never mix).
    const existingMembership = await db.organizationMember.findFirst({
      where: { userId: applicantId, role: 'OWNER' },
      select: { organization: { select: { id: true, name: true, orgType: true } } },
    })
    if (existingMembership) {
      return NextResponse.json(
        {
          error:
            existingMembership.organization.orgType === 'COMPANY'
              ? 'This account already owns a company. Financier applications need a separate owner account.'
              : 'An application from this account is already on file for an institution.',
        },
        { status: 409 }
      )
    }

    const slug = await uniqueSlug(input.legalName)
    const licenseExpiryNote = input.licenseExpiry ? `License expires: ${input.licenseExpiry}.` : null
    const cbyNote = input.cbyRegistrationNumber ? `CBY registration: ${input.cbyRegistrationNumber}.` : null
    const servicesNote = input.services?.length ? `Intended services: ${input.services.join(', ')}.` : null
    const notes = [licenseExpiryNote, cbyNote, servicesNote].filter(Boolean).join(' ') || null

    const org = await db.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
          name: input.legalName,
          slug,
          legalName: input.legalNameEn || input.legalName,
          orgType: input.orgType,
          status: 'PENDING_VERIFICATION',
          website: input.website ?? null,
          billingAddress: input.governorate ?? null,
          notes,
          members: { create: { userId: applicantId, role: 'OWNER' } },
          financierProfile: {
            create: {
              licenseNumber: input.licenseNumber || null,
              regulator: input.licenseNumber || input.cbyRegistrationNumber ? 'Central Bank of Yemen' : null,
              contactEmail: input.contactEmail ?? null,
              contactPhone: input.contactPhone ? normalizeYemeniPhone(input.contactPhone) : null,
              about: input.description || null,
            },
          },
        },
        include: { financierProfile: { select: { id: true } } },
      })
      return created
    })

    await recordAudit({
      actorId: applicantId,
      actorType: 'USER',
      action: 'ORG_REGISTERED_FINANCIER',
      entityType: 'Organization',
      entityId: org.id,
      summary: `Financier application filed: "${org.name}" (${input.orgType}) — pending Vendora review`,
      metadata: {
        orgId: org.id,
        orgType: input.orgType,
        legalNameEn: input.legalNameEn ?? null,
        licenseNumber: input.licenseNumber ?? null,
        licenseExpiry: input.licenseExpiry ?? null,
        cbyRegistrationNumber: input.cbyRegistrationNumber ?? null,
        governorate: input.governorate ?? null,
        website: input.website ?? null,
        services: input.services ?? [],
      },
    })

    await emitNotification({
      userId: applicantId,
      type: 'APPLICATION_RECEIVED',
      title: 'Application received',
      body: 'Vendora will review and activate your institution — we’ll contact you on WhatsApp/email once it’s live.',
      linkView: 'business',
      linkId: org.id,
    })

    // Fresh session user so the client can sync (the account may have just
    // been created by this request).
    const applicantUser = await db.user.findUniqueOrThrow({ where: { id: applicantId } })
    const rbac = await buildSessionRbac(applicantUser)
    return NextResponse.json(
      {
        organization: {
          id: org.id,
          name: org.name,
          slug: org.slug,
          orgType: org.orgType,
          legalName: org.legalName,
          status: org.status,
        },
        user: toSessionUser(applicantUser, rbac),
      },
      { status: 201 }
    )
  } catch (err) {
    console.error('register financier error', err)
    return NextResponse.json({ error: 'Financier application failed' }, { status: 500 })
  }
}
