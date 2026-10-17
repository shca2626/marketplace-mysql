import { db } from '@/lib/db'
import { recordAuditTx } from '@/server/modules/audit/service'
import { emitNotification } from '@/server/modules/notifications/service'

// ─────────────────────────────────────────────────────────────────────────────
// NETW-1: referral program — every registered user gets ONE shareable code.
// New registrations (customer fast path + company wizard step 1) can carry a
// referral code; the claim is server-verified inside the registration
// transaction and stamps User.referredById. The referrer sees counts and the
// recent join list in Account → Referrals.
//
// INVARIANTS
//   • codes are generated from an unambiguous 8-char alphabet, unique-enforced
//   • a code can only be claimed ONCE per new account (referredById is set at
//     creation time only; it can never be edited afterwards)
//   • the referrer can never be the new user themselves
//   • claim failure is ATTRIBUTION-ONLY: registration never fails because a
//     code was wrong — an invalid code is surfaced as a soft warning
//     (INVALID code → user created unattributed) EXCEPT on the register API
//     where an explicit bad code returns 400 before the account is created
// ─────────────────────────────────────────────────────────────────────────────

export class ReferralError extends Error {
  status: number
  code?: string
  constructor(message: string, status = 400, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no I, O, 0, 1 — read-aloud safe
export const CODE_LENGTH = 8

export interface ReferralDTO {
  code: string
  shareUrl: string
  stats: {
    total: number
    buyers: number
    sellers: number
    last30Days: number
  }
  recent: {
    name: string
    role: string
    joinedAt: string
  }[]
}

function randomCode(): string {
  let out = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return out
}

/** Get-or-create the user's referral code (idempotent). */
export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const existing = await db.referralCode.findUnique({ where: { userId }, select: { code: true } })
  if (existing) return existing.code

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode()
    try {
      const row = await db.referralCode.create({ data: { userId, code } })
      return row.code
    } catch {
      // unique collision — retry with a fresh code
    }
  }
  throw new ReferralError('Could not allocate a referral code — please retry', 500, 'CODE_ALLOC_FAILED')
}

/** The full referral surface for the Account console. */
export async function getMyReferral(userId: string): Promise<ReferralDTO> {
  const code = await getOrCreateReferralCode(userId)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const referred = await db.user.findMany({
    where: { referredById: userId },
    orderBy: { createdAt: 'desc' },
    select: { name: true, role: true, createdAt: true },
    take: 20,
  })

  return {
    code,
    shareUrl: `/?ref=${code}`,
    stats: {
      total: referred.length,
      buyers: referred.filter((r) => r.role === 'BUYER').length,
      sellers: referred.filter((r) => r.role === 'SELLER').length,
      last30Days: referred.filter((r) => r.createdAt >= thirtyDaysAgo).length,
    },
    recent: referred.slice(0, 10).map((r) => ({
      name: r.name,
      role: r.role,
      joinedAt: r.createdAt.toISOString(),
    })),
  }
}

/** Validate a referral code and return the referrer's id (pre-registration
 *  check — hard 400 on the API when an explicitly provided code is invalid). */
export async function resolveReferralCode(code: string): Promise<{ referrerId: string; referrerName: string }> {
  const normalized = (code || '').trim().toUpperCase()
  if (!normalized || normalized.length > 24) throw new ReferralError('Invalid referral code', 400, 'CODE_INVALID')
  const row = await db.referralCode.findUnique({
    where: { code: normalized },
    select: { userId: true, user: { select: { name: true, status: true } } },
  })
  if (!row) throw new ReferralError('That referral code does not exist', 400, 'CODE_NOT_FOUND')
  if (row.user.status !== 'ACTIVE') throw new ReferralError('That referral code is no longer active', 400, 'CODE_INACTIVE')
  return { referrerId: row.userId, referrerName: row.user.name }
}

/** Transactional claim — runs INSIDE the registration transaction after the
 *  user row exists: stamps User.referredById + writes the USER_REFERRED audit
 *  row atomically. Returns nothing; the referrer is notified post-commit. */
export async function claimReferralTx(
  tx: Parameters<typeof recordAuditTx>[0],
  newUser: { id: string; name: string },
  referrer: { referrerId: string }
): Promise<void> {
  if (referrer.referrerId === newUser.id) {
    throw new ReferralError('You cannot use your own referral code', 400, 'SELF_REFERRAL')
  }
  await tx.user.update({ where: { id: newUser.id }, data: { referredById: referrer.referrerId } })
  await recordAuditTx(tx, {
    actorId: newUser.id,
    actorType: 'USER',
    action: 'USER_REFERRED',
    entityType: 'User',
    entityId: newUser.id,
    summary: `${newUser.name} joined via a referral code`,
    metadata: { referrerId: referrer.referrerId },
  })
}

/** Post-commit notification to the referrer (fire-and-forget, best-effort). */
export async function notifyReferrerJoined(
  referrer: { referrerId: string },
  newUser: { name: string }
): Promise<void> {
  await emitNotification({
    userId: referrer.referrerId,
    type: 'REFERRAL_JOINED',
    title: 'Someone joined with your code',
    body: `${newUser.name} just signed up on Vendora using your referral code.`,
    linkView: 'account',
  })
}
