import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { hashPassword, setSessionCookie, toSessionUser } from '@/lib/auth'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { recordAudit } from '@/server/modules/audit/service'
import { appBaseUrl, issueEmailVerificationToken } from '@/lib/auth-tokens'
import { emailVerificationEmail } from '@/lib/emails/auth-emails'
import { sendMail } from '@/lib/mailer'

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(60),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(100),
  role: z.enum(['BUYER', 'SELLER']).optional().default('BUYER'),
  storeName: z.string().max(60).optional().nullable(),
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
    const { name, email, password, role, storeName } = parsed.data

    const existing = await db.user.findUnique({ where: { email: email.toLowerCase() } })
    if (existing) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })
    }

    const user = await db.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        password: hashPassword(password),
        role,
        storeName: role === 'SELLER' ? storeName || `${name}'s Store` : null,
      },
    })

    await recordAudit({
      actorId: user.id,
      actorType: 'USER',
      action: 'USER_REGISTERED',
      entityType: 'User',
      entityId: user.id,
      summary: `New ${role.toLowerCase()} registered: ${user.email}`,
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
    return NextResponse.json({ user: toSessionUser(user) }, { status: 201 })
  } catch (err) {
    console.error('register error', err)
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 })
  }
}
