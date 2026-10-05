import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser, markCurrentSessionMfaSatisfied } from '@/lib/auth'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { recordAudit } from '@/server/modules/audit/service'
import {
  MfaServiceError,
  confirmEnrollment,
  disableMfa,
  mfaStatus,
  regenerateBackupCodes,
  startEnrollment,
  verifyMfaCode,
} from '@/server/modules/mfa/service'

/**
 * Phase 6 (lastplan v5 6.7) — self-service MFA endpoints.
 *   GET  /api/auth/mfa                  → { enrolled, required, backupCodesRemaining }
 *   POST /api/auth/mfa                  → { action: 'start' | 'confirm' | 'disable' | 'regenerate-backup-codes' | 'step-up', code?, password? }
 *
 *  • start     → { secret, otpauthUri } — the raw secret is displayed ONCE.
 *  • confirm   → { backupCodes[] } — one-time display.
 *  • disable   → password re-verification; refused while required by policy.
 *  • step-up   → verifies a fresh code and re-opens the 5-minute freshness
 *                window for sensitive actions on THIS session (6.7.5).
 */

const actionSchema = z.object({
  action: z.enum(['start', 'confirm', 'disable', 'regenerate-backup-codes', 'step-up']),
  code: z.string().trim().max(20).optional(),
  password: z.string().max(200).optional(),
})

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Please sign in first' }, { status: 401 })
  return NextResponse.json(await mfaStatus(user.id))
}

export async function POST(req: NextRequest) {
  try {
    const csrf = assertSameOrigin(req)
    if (csrf) return csrf

    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Please sign in first' }, { status: 401 })

    // Code attempts are brute-forceable — rate-limit per account.
    const rl = enforceRateLimit(req, 'mfa', { limit: 12, windowMs: 5 * 60_000 }, user.id)
    if (rl) return rl

    const parsed = actionSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    const { action, code, password } = parsed.data

    try {
      switch (action) {
        case 'start': {
          const label = user.email ?? user.phone ?? user.id
          const result = await startEnrollment(user.id, label)
          return NextResponse.json(result)
        }
        case 'confirm': {
          if (!code) return NextResponse.json({ error: 'Enter the 6-digit code' }, { status: 400 })
          const result = await confirmEnrollment(user.id, code)
          return NextResponse.json(result)
        }
        case 'disable': {
          if (!password) return NextResponse.json({ error: 'Enter your password' }, { status: 400 })
          await disableMfa(user.id, password)
          return NextResponse.json({ ok: true })
        }
        case 'regenerate-backup-codes': {
          if (!password) return NextResponse.json({ error: 'Enter your password' }, { status: 400 })
          const result = await regenerateBackupCodes(user.id, password)
          return NextResponse.json(result)
        }
        case 'step-up': {
          if (!code) return NextResponse.json({ error: 'Enter the 6-digit code' }, { status: 400 })
          const verify = await verifyMfaCode(user.id, code)
          if (!verify.ok) {
            await recordAudit({
              actorId: user.id,
              actorType: 'USER',
              action: 'MFA_STEP_UP_FAILED',
              entityType: 'User',
              entityId: user.id,
              summary: 'Failed step-up MFA verification',
              metadata: { reason: verify.reason },
            })
            return NextResponse.json(
              { error: 'That code is not valid — codes rotate every 30 seconds.', code: 'MFA_INVALID_CODE' },
              { status: 401 }
            )
          }
          const marked = await markCurrentSessionMfaSatisfied()
          if (!marked) {
            return NextResponse.json(
              { error: 'Session could not be confirmed — please sign in again.', code: 'MFA_SESSION_MISSING' },
              { status: 401 }
            )
          }
          await recordAudit({
            actorId: user.id,
            actorType: 'USER',
            action: 'MFA_STEP_UP_SUCCEEDED',
            entityType: 'User',
            entityId: user.id,
            summary: 'Step-up MFA verified (freshness window re-opened)',
          })
          return NextResponse.json({ ok: true })
        }
      }
    } catch (err) {
      if (err instanceof MfaServiceError) {
        return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
      }
      throw err
    }
  } catch (err) {
    console.error('mfa route error', err)
    return NextResponse.json({ error: 'MFA action failed' }, { status: 500 })
  }
}
