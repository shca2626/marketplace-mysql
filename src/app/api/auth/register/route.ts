import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { hashPassword, setSessionCookie, toSessionUser } from '@/lib/auth'
import { assertSameOrigin, clientIp, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { recordAudit } from '@/server/modules/audit/service'
import { buildSessionRbac, consumeInvitation } from '@/server/modules/rbac/service'
import { appBaseUrl, issueEmailVerificationToken } from '@/lib/auth-tokens'
import { emailVerificationEmail } from '@/lib/emails/auth-emails'
import { sendMail } from '@/lib/mailer'
import { normalizeYemeniPhone } from '@/lib/phone'
import { verifyOtpProof } from '@/server/modules/otp/service'

/**
 * PHASE 3 — phone-first registration.
 *   REQUIRED: Yemeni mobile + WhatsApp OTP possession proof (otpToken) + password
 *   OPTIONAL: email (receipts/recovery; verified when provided)
 * The customer fast path ends at L1 (phone verified). Merchant/Dealer company
 * registration and financier applications use their own dedicated doors.
 */
const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(60),
  phone: z.string().min(9, 'Phone number is required').max(20),
  otpToken: z.string().min(20, 'Phone verification is required').max(200),
  password: z.string().min(6, 'Password must be at least 6 characters').max(100),
  email: z.string().email('Invalid email address').optional().nullable(),
  role: z.enum(['BUYER', 'SELLER']).optional().default('BUYER'),
  storeName: z.string().max(60).optional().nullable(),
  merchantType: z
    .enum(['EXCLUSIVE_AGENT', 'AUTHORIZED_AGENT', 'DISTRIBUTOR', 'WHOLESALER', 'RETAILER'])
    .optional()
    .nullable(),
  // RBAC Phase 2: staff invitations are email-bound — an invited platform
  // staff member must register with the invited email + any phone.
  inviteToken: z.string().min(10).max(128).optional(),
})

export async function POST(req: NextRequest) {
  try {
    // CSRF + per-IP creation throttling (account-farming damping)
    const csrf = assertSameOrigin(req)
    if (csrf) return csrf
    const rl = enforceRateLimit(req, 'register', RATE_LIMITS.register)
    if (rl) return rl

    const body = await req.json()
    const parsed = registerSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const { name, password, role, storeName, merchantType, inviteToken } = parsed.data

    // ── Phone: Yemeni mobile, verified via OTP ──
    const phone = normalizeYemeniPhone(parsed.data.phone)
    if (!phone) {
      return NextResponse.json(
        { error: 'Enter a valid Yemeni mobile number — 9 digits starting with 70, 71, 73, 77 or 78.' },
        { status: 400 }
      )
    }
    if (!verifyOtpProof(parsed.data.otpToken, phone, 'REGISTER')) {
      return NextResponse.json(
        { error: 'Phone verification is missing or expired — request a new code and try again.' },
        { status: 400 }
      )
    }

    // ── Email: optional, but unique when present ──
    const email = parsed.data.email?.toLowerCase().trim() || null
    if (email) {
      const existing = await db.user.findUnique({ where: { email } })
      if (existing) {
        return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })
      }
    }

    const phoneTaken = await db.user.findUnique({ where: { phone }, select: { id: true } })
    if (phoneTaken) {
      return NextResponse.json(
        { error: 'This phone number is already registered. Sign in instead.' },
        { status: 409 }
      )
    }

    // Validate the staff invitation (if any) BEFORE creating the account.
    // Invitations are email-bound — a token without an email cannot match.
    const invite = inviteToken && email ? await consumeInvitation(email, inviteToken) : null

    const user = await db.user.create({
      data: {
        name,
        email,
        phone, // unique — verified by the OTP proof above
        phoneVerifiedAt: new Date(), // L1 evidence
        kycLevel: 1, // L1: phone-verified account
        password: hashPassword(password),
        role,
        merchantType: merchantType ?? null,
        storeName: role === 'SELLER' ? storeName || `${name}'s Store` : null,
      },
    })

    if (invite) {
      await db.userRole.create({
        data: { userId: user.id, roleId: invite.roleId, organizationId: invite.organizationId },
      })
      // Phase 5 — ORG-scoped invitations (institution staff): the invitee also
      // becomes a VIEWER member of the organization so the console gate's
      // membership+role path picks them up.
      if (invite.organizationId) {
        await db.organizationMember.create({
          data: { userId: user.id, organizationId: invite.organizationId, role: 'VIEWER' },
        })
      }
      await recordAudit({
        actorId: user.id,
        actorType: 'USER',
        action: 'ROLE_ASSIGNED',
        entityType: 'User',
        entityId: user.id,
        summary: `Invited staff joined: role "${invite.roleName}" granted to ${email}`,
        metadata: {
          roleId: invite.roleId,
          via: 'invitation',
          organizationId: invite.organizationId || undefined,
        },
      })
    }

    await recordAudit({
      actorId: user.id,
      actorType: 'USER',
      action: 'USER_REGISTERED',
      entityType: 'User',
      entityId: user.id,
      summary: `New ${role.toLowerCase()} registered: ${phone}${email ? ` (${email})` : ' (no email)'}`,
      metadata: { phone, kycLevel: 1 },
    })

    // Email verification — only enrolled when an email was provided.
    if (email) {
      try {
        const { raw } = await issueEmailVerificationToken(user.id)
        const verifyUrl = `${appBaseUrl()}/?view=verify-email&token=${raw}`
        const mail = emailVerificationEmail({ name: user.name, verifyUrl })
        void sendMail({ to: email, ...mail }).catch((err) => {
          console.error(`[auth] welcome verification mail failed for user ${user.id}:`, err)
        })
      } catch (err) {
        console.error(`[auth] verification token issue failed for user ${user.id}:`, err)
      }
    }

    await setSessionCookie(user.id, user.sessionVersion, {
      userAgent: req.headers.get('user-agent'),
      ip: clientIp(req),
    })
    const rbac = await buildSessionRbac(user)
    return NextResponse.json({ user: toSessionUser(user, rbac) }, { status: 201 })
  } catch (err) {
    console.error('register error', err)
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 })
  }
}
