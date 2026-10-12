import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { hashPassword, setSessionCookie, toSessionUser } from '@/lib/auth'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { recordAudit, recordAuditTx } from '@/server/modules/audit/service'
import { buildSessionRbac, claimInvitationTx } from '@/server/modules/rbac/service'
import { claimOrgInvitationTx } from '@/server/modules/org-rbac/service'
import { appBaseUrl, issueEmailVerificationToken } from '@/lib/auth-tokens'
import { emailVerificationEmail } from '@/lib/emails/auth-emails'
import { sendMail } from '@/lib/mailer'

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(60),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(100),
  // B2C/B2B2C model: individuals register as BUYERs only. Selling belongs to
  // COMPANY organizations (shared-catalog offers) — the legacy personal
  // SELLER signup is retired.
  role: z.enum(['BUYER']).optional().default('BUYER'),
  storeName: z.string().max(60).optional().nullable(),
  // RBAC Phase 2: staff / org-member invitation token — when valid, the
  // invited role is granted to the freshly created account (invitation marked
  // ACCEPTED). Org invitations also create the OrganizationMember row.
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
    const { name, email, password, inviteToken } = parsed.data

    const existing = await db.user.findUnique({ where: { email: email.toLowerCase() } })
    if (existing) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })
    }

    // ATOMIC invitation claim + account creation (RBAC lifecycle): the claim,
    // the user, the membership and the role assignment commit in ONE
    // transaction — an invitation can no longer be consumed by a registration
    // that subsequently fails, and a concurrent double-claim aborts cleanly.
    // A provided token that matches NO pending invitation is a hard 400 (no
    // silent token drops — the user knows the invite is unusable).
    class InvalidInvitationError extends Error {}
    let txResult: {
      user: { id: string; name: string; email: string; role: string; sessionVersion: number }
      invite: { roleId: string; roleName: string } | null
      orgInvite: { roleId: string; roleKey: string; roleName: string; organizationId: string } | null
    }
    try {
      txResult = await db.$transaction(
        async (tx) => {
          const invite = inviteToken ? await claimInvitationTx(tx, email, inviteToken) : null
          const orgInvite = inviteToken && !invite ? await claimOrgInvitationTx(tx, email, inviteToken) : null
          if (inviteToken && !invite && !orgInvite) {
            throw new InvalidInvitationError()
          }

          const user = await tx.user.create({
            data: {
              name,
              email: email.toLowerCase(),
              password: hashPassword(password),
              role: 'BUYER',
            },
          })

          if (invite) {
            await tx.userRole.create({
              data: { userId: user.id, roleId: invite.roleId, organizationId: '' },
            })
            await recordAuditTx(tx, {
              actorId: user.id,
              actorType: 'USER',
              action: 'ROLE_ASSIGNED',
              entityType: 'User',
              entityId: user.id,
              summary: `Invited staff joined: role "${invite.roleName}" granted to ${user.email}`,
              metadata: { roleId: invite.roleId, via: 'invitation' },
            })
          }

          if (orgInvite) {
            // Organization member joins via invitation: membership + role assignment.
            await tx.organizationMember.create({
              data: { organizationId: orgInvite.organizationId, userId: user.id, role: 'VIEWER' },
            })
            await tx.userRole.create({
              data: { userId: user.id, roleId: orgInvite.roleId, organizationId: orgInvite.organizationId },
            })
            await recordAuditTx(tx, {
              actorId: user.id,
              actorType: 'USER',
              action: 'ORG_JOINED_VIA_INVITATION',
              entityType: 'Organization',
              entityId: orgInvite.organizationId,
              summary: `${user.email} joined via invitation with role "${orgInvite.roleName}"`,
              metadata: { roleId: orgInvite.roleId, roleKey: orgInvite.roleKey },
            })
          }

          return {
            user: {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
              sessionVersion: user.sessionVersion,
            },
            invite,
            orgInvite,
          }
        },
        { timeout: 15000 }
      )
    } catch (err) {
      if (err instanceof InvalidInvitationError) {
        return NextResponse.json(
          {
            error:
              'This invitation link is invalid, expired, revoked, or belongs to a different email address. Ask for a fresh invitation.',
            code: 'INVITATION_INVALID',
          },
          { status: 400 }
        )
      }
      throw err
    }
    const { user, invite, orgInvite } = txResult

    await recordAudit({
      actorId: user.id,
      actorType: 'USER',
      action: 'USER_REGISTERED',
      entityType: 'User',
      entityId: user.id,
      summary: `New buyer registered: ${user.email}`,
    })

    // AUTHSEC-1: auto-enroll the new account in email verification. The
    // welcome link goes out fire-and-forget — registration itself must never
    // fail because a mail provider hiccuped.
    try {
      const { raw } = await issueEmailVerificationToken(user.id)
      const verifyUrl = `${appBaseUrl()}/?view=verify-email&token=${raw}`
      const mail = emailVerificationEmail({ name: user.name, verifyUrl })
      void sendMail({ to: user.email, ...mail }).catch((err) => {
        console.error(`[auth] welcome verification mail failed for user ${user.id}:`, err)
      })
    } catch (err) {
      console.error(`[auth] verification token issue failed for user ${user.id}:`, err)
    }

    await setSessionCookie(user.id, user.sessionVersion)
    const rbac = await buildSessionRbac(user)
    return NextResponse.json({ user: toSessionUser(user, rbac) }, { status: 201 })
  } catch (err) {
    console.error('register error', err)
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 })
  }
}
