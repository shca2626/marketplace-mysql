import { createHash, randomBytes } from 'crypto'
import { db } from '@/lib/db'

/**
 * AUTHSEC-1 — single-use, hashed, expiring auth tokens (password reset +
 * email verification).
 * ─────────────────────────────────────────────────────────────────────────────
 * Design rules:
 *   • Raw token = 32 random bytes hex — exists ONLY inside the emailed link.
 *   • DB stores sha256(raw) — a DB leak cannot be replayed against users.
 *   • Single-use: consuming stamps usedAt; issuing deletes previous valid
 *     tokens for the user (no parallel reset links floating around).
 *   • Password reset: 60 min TTL. Email verification: 48 h TTL.
 */

const RESET_TTL_MS = 60 * 60 * 1000 // 60 minutes
const VERIFY_TTL_MS = 48 * 60 * 60 * 1000 // 48 hours

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export interface IssuedToken {
  raw: string
  expiresAt: Date
}

/** Mint a password-reset token (invalidates previous ones for this user). */
export async function issuePasswordResetToken(userId: string): Promise<IssuedToken> {
  const raw = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + RESET_TTL_MS)
  await db.passwordResetToken.deleteMany({ where: { userId, usedAt: null } })
  await db.passwordResetToken.create({
    data: { userId, tokenHash: sha256(raw), expiresAt },
  })
  return { raw, expiresAt }
}

/**
 * Validate + burn a password-reset token. Returns the owning user id or null
 * (unknown / already used / expired). Burning is idempotent-safe: the stamp
 * happens before the caller mutates anything.
 */
export async function consumePasswordResetToken(raw: string): Promise<string | null> {
  const row = await db.passwordResetToken.findUnique({ where: { tokenHash: sha256(raw) } })
  if (!row || row.usedAt || row.expiresAt < new Date()) return null
  await db.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } })
  return row.userId
}

/** Mint an email-verification token (invalidates previous ones for this user). */
export async function issueEmailVerificationToken(userId: string): Promise<IssuedToken> {
  const raw = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + VERIFY_TTL_MS)
  await db.emailVerificationToken.deleteMany({ where: { userId, usedAt: null } })
  await db.emailVerificationToken.create({
    data: { userId, tokenHash: sha256(raw), expiresAt },
  })
  return { raw, expiresAt }
}

/** Validate + burn an email-verification token → owning user id, or null. */
export async function consumeEmailVerificationToken(raw: string): Promise<string | null> {
  const row = await db.emailVerificationToken.findUnique({ where: { tokenHash: sha256(raw) } })
  if (!row || row.usedAt || row.expiresAt < new Date()) return null
  await db.emailVerificationToken.update({ where: { id: row.id }, data: { usedAt: new Date() } })
  return row.userId
}

/**
 * Invalidate every live session for a user — used after a password reset and
 * by the explicit "sign out everywhere" action. Legacy (v1) tokens die too:
 * their implicit version 0 stops matching the bumped epoch.
 */
export async function bumpSessionVersion(userId: string): Promise<number> {
  const user = await db.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  })
  return user.sessionVersion
}

/** Base URL for links inside auth emails (APP_URL env; dev default localhost). */
export function appBaseUrl(): string {
  const raw = process.env.APP_URL || 'http://localhost:3000'
  return raw.replace(/\/+$/, '')
}
