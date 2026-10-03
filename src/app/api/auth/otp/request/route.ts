import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { assertSameOrigin, clientIp, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { normalizeYemeniPhone } from '@/lib/phone'
import { issueOtp, sweepOtps } from '@/server/modules/otp/service'

/**
 * Phase 3 — request a phone verification code (WhatsApp-delivered).
 * Purposes:
 *   REGISTER — the phone must NOT belong to an existing account (409).
 *   RESET    — the phone MUST belong to an existing, non-suspended account;
 *              the response stays uniform (ok) either way — no enumeration.
 */
const requestSchema = z.object({
  phone: z.string().min(9, 'Enter your phone number').max(20),
  purpose: z.enum(['REGISTER', 'RESET']),
})

export async function POST(req: NextRequest) {
  try {
    const csrf = assertSameOrigin(req)
    if (csrf) return csrf
    const rl = enforceRateLimit(req, 'otpRequest', RATE_LIMITS.otpRequest)
    if (rl) return rl

    const body = await req.json()
    const parsed = requestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }

    const phone = normalizeYemeniPhone(parsed.data.phone)
    if (!phone) {
      return NextResponse.json(
        { error: 'Enter a valid Yemeni mobile number — 9 digits starting with 70, 71, 73, 77 or 78.' },
        { status: 400 }
      )
    }

    const existing = await db.user.findUnique({ where: { phone }, select: { id: true, status: true } })
    if (parsed.data.purpose === 'REGISTER' && existing) {
      return NextResponse.json(
        { error: 'This phone number is already registered. Sign in instead, or reset your password.' },
        { status: 409 }
      )
    }
    if (parsed.data.purpose === 'RESET') {
      // Uniform ok — never reveal whether the number has an account.
      if (!existing || existing.status === 'SUSPENDED') {
        return NextResponse.json({
          ok: true,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          resendAfterSec: 60,
        })
      }
    }

    const result = await issueOtp({ phone, purpose: parsed.data.purpose, ip: clientIp(req), userId: existing?.id ?? null })
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status, headers: result.retryAfterSec ? { 'Retry-After': String(result.retryAfterSec) } : undefined }
      )
    }

    void sweepOtps() // opportunistic housekeeping
    return NextResponse.json({
      ok: true,
      expiresAt: result.expiresAt.toISOString(),
      resendAfterSec: result.resendAfterSec,
    })
  } catch (err) {
    console.error('otp request error', err)
    return NextResponse.json({ error: 'Could not send the code — please try again.' }, { status: 500 })
  }
}
