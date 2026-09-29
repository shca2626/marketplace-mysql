import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import type { SessionUser } from '@/lib/types'

// SEC-01 hardening: never silently fall back to a known constant in production.
// A missing/short AUTH_SECRET throws at module load (fail-fast) instead of
// issuing session cookies signed with a publicly-known key.
const DEV_FALLBACK_SECRET = 'vendora-dev-secret'
function loadSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (secret && secret.length >= 32) return secret
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[auth] FATAL: AUTH_SECRET is missing or too short (<32 chars). ' +
        'Generate one with `openssl rand -hex 32` and set it in the environment. ' +
        'Refusing to sign session cookies with a weak secret.'
    )
  }
  return DEV_FALLBACK_SECRET
}
const SECRET = loadSecret()
export const SESSION_COOKIE = 'vendora_session'
const MAX_AGE = 60 * 60 * 24 * 30 // 30 days

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  try {
    const hashBuf = Buffer.from(hash, 'hex')
    const testBuf = scryptSync(password, salt, 64)
    return hashBuf.length === testBuf.length && timingSafeEqual(hashBuf, testBuf)
  } catch {
    return false
  }
}

function sign(value: string): string {
  return createHmac('sha256', SECRET).update(value).digest('hex')
}

export interface SessionPayload {
  userId: string
  /** Session-epoch check — must match User.sessionVersion or the token is dead. */
  version: number
}

/**
 * AUTHSEC-1: stateless tokens now carry the user's sessionVersion epoch.
 * Token format v2: `${userId}.${version}.${exp}.${sig}` (4 dot-parts).
 * Legacy v1 tokens (`${userId}.${exp}.${sig}`, 3 parts) resolve with version 0
 * so existing sessions survive the deploy; the first bump retires them all.
 */
export function createSessionToken(userId: string, sessionVersion = 0): string {
  const payload = `${userId}.${sessionVersion}.${Date.now() + MAX_AGE * 1000}`
  return `${payload}.${sign(payload)}`
}

export function parseSessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 4 && parts.length !== 3) return null
  const legacy = parts.length === 3
  const userId = parts[0]
  const version = legacy ? 0 : Number(parts[1])
  const exp = parts[legacy ? 1 : 2]
  const sig = parts[legacy ? 2 : 3]
  if (!userId || !Number.isFinite(version) || version < 0) return null
  const payload = legacy ? `${userId}.${exp}` : `${userId}.${version}.${exp}`
  const expected = sign(payload)
  if (sig.length !== expected.length) return null
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  } catch {
    return null
  }
  if (Number(exp) < Date.now()) return null
  return { userId, version }
}

export async function getSessionUser() {
  const cookieStore = await cookies()
  const payload = parseSessionToken(cookieStore.get(SESSION_COOKIE)?.value)
  if (!payload) return null
  const user = await db.user.findUnique({ where: { id: payload.userId } })
  // Suspended accounts are globally locked out: their session stops resolving
  // (they effectively sign out everywhere). Admins can reactivate from the
  // vendor management console.
  if (!user || user.status === 'SUSPENDED') return null
  // AUTHSEC-1: a bumped sessionVersion (password reset, sign-out-everywhere)
  // kills every token minted before the bump.
  if (user.sessionVersion !== payload.version) return null
  return user
}

export function toSessionUser(user: {
  id: string
  name: string
  email: string
  role: string
  image?: string | null
  storeName?: string | null
  storeBio?: string | null
  createdAt?: Date
  emailVerifiedAt?: Date | null
}): SessionUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role === 'SELLER' ? 'SELLER' : user.role === 'ADMIN' ? 'ADMIN' : 'BUYER',
    image: user.image ?? null,
    storeName: user.storeName ?? null,
    storeBio: user.storeBio ?? null,
    createdAt: user.createdAt ? user.createdAt.toISOString() : undefined,
    emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
  }
}

export async function setSessionCookie(userId: string, sessionVersion = 0) {
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, createSessionToken(userId, sessionVersion), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production', // SEC-02: secure cookies in production
    path: '/',
    maxAge: MAX_AGE,
  })
}

export async function clearSessionCookie() {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}
