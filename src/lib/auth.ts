import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { sha256Hex } from '@/lib/secret-box'
import type { SessionUser } from '@/lib/types'
import type { SessionRegistry, User } from '@prisma/client'

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

// ── Session registry throttle (6.7.7): lastUsedAt updates at most once per
// interval per session — every request must not turn into a DB write.
const LAST_USED_THROTTLE_MS = 5 * 60 * 1000

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

// ── Session registry (Phase 6, 6.7.7) ───────────────────────────────────────
// Every issued session token gets a row keyed by SHA-256 of the cookie value.
// A revoked row kills that single session server-side; the sessionVersion
// bump remains the all-kill. mfaSatisfiedAt carries step-up freshness (6.7.5).

export interface RegisteredSession {
  user: User
  session: SessionRegistry | null // null = pre-registry token (grandfathered; dies on the next version bump)
}

async function loadSessionContext(): Promise<RegisteredSession | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  const payload = parseSessionToken(token)
  if (!payload || !token) return null
  const user = await db.user.findUnique({ where: { id: payload.userId } })
  // Suspended accounts are globally locked out: their session stops resolving
  // (they effectively sign out everywhere). Admins can reactivate from the
  // vendor management console.
  if (!user || user.status === 'SUSPENDED') return null
  // AUTHSEC-1: a bumped sessionVersion (password reset, sign-out-everywhere)
  // kills every token minted before the bump.
  if (user.sessionVersion !== payload.version) return null

  // Registry: single-session revocation + throttled lastUsedAt.
  const tokenHash = sha256Hex(token)
  const session = await db.sessionRegistry.findUnique({ where: { tokenHash } })
  if (session?.revokedAt) return null
  if (session && Date.now() - session.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS) {
    void db.sessionRegistry
      .update({ where: { tokenHash }, data: { lastUsedAt: new Date() } })
      .catch((err) => console.error('[auth] lastUsedAt touch failed:', err))
  }
  return { user, session: session ?? null }
}

/**
 * Per-request cached session context — guards and handlers can call freely;
 * the registry is read at most once per request.
 */
export const getSessionContext = cache(loadSessionContext)

export async function getSessionUser() {
  const ctx = await getSessionContext()
  return ctx?.user ?? null
}

/** Create the registry row for a freshly issued token (login/register). */
export async function registerSession(
  userId: string,
  token: string,
  meta: { userAgent?: string | null; ip?: string | null; mfaSatisfied?: boolean } = {}
): Promise<SessionRegistry> {
  return db.sessionRegistry.create({
    data: {
      userId,
      tokenHash: sha256Hex(token),
      userAgent: meta.userAgent?.slice(0, 400) ?? null,
      ip: meta.ip?.slice(0, 64) ?? null,
      ...(meta.mfaSatisfied ? { mfaSatisfiedAt: new Date() } : {}),
    },
  })
}

/** Revoke the session backing a raw token (logout / user self-revoke). */
export async function revokeSessionByToken(token: string | undefined | null, reason: string): Promise<void> {
  if (!token) return
  await db.sessionRegistry.updateMany({
    where: { tokenHash: sha256Hex(token), revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason.slice(0, 120) },
  })
}

/** Revoke every active registry row for a user (admin action). */
export async function revokeAllUserSessions(userId: string, reason: string): Promise<number> {
  const res = await db.sessionRegistry.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason.slice(0, 120) },
  })
  return res.count
}

/** Mark the current session's step-up window as satisfied (fresh MFA event). */
export async function markCurrentSessionMfaSatisfied(): Promise<boolean> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return false
  const res = await db.sessionRegistry.updateMany({
    where: { tokenHash: sha256Hex(token), revokedAt: null },
    data: { mfaSatisfiedAt: new Date() },
  })
  return res.count === 1
}

/** The raw current cookie value (needed by logout to revoke exactly this session). */
export async function currentSessionToken(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(SESSION_COOKIE)?.value ?? null
}

export function toSessionUser(
  user: {
    id: string
    name: string
    email: string | null
    phone?: string | null
    phoneVerifiedAt?: Date | null
    kycLevel?: number | null
    merchantType?: string | null
    role: string
    image?: string | null
    storeName?: string | null
    storeBio?: string | null
    storeCover?: string | null
    createdAt?: Date
    emailVerifiedAt?: Date | null
    mfaRequired?: boolean
    isBreakGlass?: boolean
  },
  rbac?: {
    permissions: string[]
    isPlatformStaff: boolean
    /** Phase 5 — module activation state (personal + per-org). */
    modules?: {
      personal: string[]
      orgs: Record<string, string[]>
    }
  }
) {
  return {
    id: user.id,
    name: user.name,
    email: user.email ?? null,
    // Phase 3: phone-first identity — the primary identifier for new accounts.
    phone: user.phone ?? null,
    phoneVerifiedAt: user.phoneVerifiedAt ? user.phoneVerifiedAt.toISOString() : null,
    kycLevel: user.kycLevel ?? 0,
    merchantType: user.merchantType ?? null,
    // Safe display handle for headers/account menus — email when present, else phone.
    displayContact: user.email ?? user.phone ?? '',
    // Phase 6 (6.2): User.role is DATA (badge display), never an
    // authorization fact — access derives from RBAC assignments only.
    role: user.role === 'SELLER' ? 'SELLER' : user.role === 'ADMIN' ? 'ADMIN' : 'BUYER',
    image: user.image ?? null,
    storeName: user.storeName ?? null,
    storeBio: user.storeBio ?? null,
    // STAB-8: curated storefront cover id — persisted on the seller profile.
    storeCover: user.storeCover ?? null,
    createdAt: user.createdAt ? user.createdAt.toISOString() : undefined,
    emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
    // RBAC (Phase 2): effective platform permissions + console-access flag.
    // Phase 6: RBAC-only — even legacy ADMIN accounts get their permissions
    // from their platform.super-admin assignment (seeded by scripts/seed-rbac.ts).
    permissions: rbac?.permissions ?? [],
    isPlatformStaff: rbac?.isPlatformStaff ?? false,
    // Phase 5 — module activation state through scope chains.
    modules: rbac?.modules
      ? { personal: rbac.modules.personal, orgs: rbac.modules.orgs }
      : undefined,
    // Phase 6 — MFA hints for the security settings surface.
    mfaRequired: user.mfaRequired ?? false,
    isBreakGlass: user.isBreakGlass ?? false,
  }
}

/**
 * Issue + persist a session: sets the cookie and registers the row.
 * Returns the raw token (callers needing the registry row use registerSession).
 */
export async function setSessionCookie(
  userId: string,
  sessionVersion = 0,
  registry?: { userAgent?: string | null; ip?: string | null; mfaSatisfied?: boolean }
): Promise<string> {
  const token = createSessionToken(userId, sessionVersion)
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production', // SEC-02: secure cookies in production
    path: '/',
    maxAge: MAX_AGE,
  })
  if (registry) {
    await registerSession(userId, token, registry).catch((err) =>
      console.error('[auth] session registry insert failed:', err)
    )
  }
  return token
}

export async function clearSessionCookie() {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}

/**
 * TENANT-AUDIT M-3: logout also clears the tenant-selection cookies so the
 * next user on a shared browser never starts pre-switched into the previous
 * user's institution. The fin_org id was membership-validated on every read
 * anyway (fail-safe), but the pre-selection itself is cross-user residue.
 */
export async function clearWorkspaceCookies() {
  const cookieStore = await cookies()
  cookieStore.delete('fin_org')
}
