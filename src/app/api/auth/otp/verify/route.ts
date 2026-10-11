import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { normalizeYemeniPhone } from '@/lib/phone'
import { verifyOtp } from '@/server/modules/otp/service'

/**
 * Phase 3 — verify a phone OTP. On success returns a short-lived signed
 * `otpToken` (possession proof) that /api/auth/register (REGISTER) and
 * /api/auth/reset-password (RESET) require. The proof is single-purpose and
 * expires in 10 minutes; the underlying code is burned on use.
 */
const verifySchema = z.object({
  phone: z.string().min(9).max(20),
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  purpose: z.enum(['REGISTER', 'RESET']),
})

export async function POST(req: NextRequest) {
  try {
    const csrf = assertSameOrigin(req)
    if (csrf) return csrf
    const rl = enforceRateLimit(req, 'otpVerify', RATE_LIMITS.otpVerify)
    if (rl) return rl

    const body = await req.json()
    const parsed = verifySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }

    const phone = normalizeYemeniPhone(parsed.data.phone)
    if (!phone) {
      return NextResponse.json({ error: 'Invalid phone number.' }, { status: 400 })
    }

    if (parsed.data.purpose === 'RESET') {
      // A code can only exist for a real account (request route enforces it);
      // verifying with no matching live account burns nothing.
      const existing = await db.user.findUnique({ where: { phone }, select: { id: true } })
      if (!existing) {
        return NextResponse.json({ error: 'This code has expired. Request a new one.' }, { status: 400 })
      }
    }

    const result = await verifyOtp({ phone, code: parsed.data.code, purpose: parsed.data.purpose })
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({
      ok: true,
      otpToken: result.proofToken,
      otpTokenExpiresAt: result.proofExpiresAt.toISOString(),
    })
  } catch (err) {
    console.error('otp verify error', err)
    return NextResponse.json({ error: 'Verification failed — please try again.' }, { status: 500 })
  }
}
