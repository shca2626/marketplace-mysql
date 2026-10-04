import { db } from '@/lib/db'
import { emitNotification } from '@/server/modules/notifications/service'
import { userHasPlatformPermission } from '@/server/modules/rbac/service'

/**
 * KYC LEVEL ENGINE (Phase 3 — single source of truth, computed once, read
 * everywhere). Levels are DERIVED from verifiable evidence, never manually set:
 *
 *   L0 — Registered            (account exists)
 *   L1 — Phone verified         (User.phoneVerifiedAt set by the OTP flow)
 *   L2 — Identity verified      (≥1 VERIFIED AccountDocument of an IDENTITY
 *                                type: NATIONAL_ID | PASSPORT | RESIDENCE_PERMIT)
 *   L3 — Business verified      (L2 AND (member of an ACTIVE org whose own
 *                                kycLevel ≥3 OR ≥2 distinct VERIFIED business
 *                                doc types on the user/org vault))
 *
 * Organization KYB: kycLevel 3 once the org has ≥1 VERIFIED business doc
 * (COMMERCIAL_REG | BUSINESS_LICENSE) — wired into the admin org verify flow.
 *
 * Every recompute is monotonic BY DEFINITION (it derives from what is currently
 * verified), so it can also *decrease* when evidence is revoked (docs
 * soft-deleted, org suspended) — that is intentional: the level mirrors
 * reality. Persistence: User.kycLevel / Organization.kycLevel.
 */

export const KYC_LEVEL_LABELS = ['Registered', 'Phone verified', 'Identity verified', 'Business verified'] as const

export const IDENTITY_DOC_TYPES = ['NATIONAL_ID', 'PASSPORT', 'RESIDENCE_PERMIT'] as const

export const BUSINESS_DOC_TYPES = [
  'COMMERCIAL_REG',
  'BUSINESS_LICENSE',
  'TAX_CARD',
  'FINANCIAL_STATEMENT',
  'BANK_STATEMENT',
  'FEASIBILITY_STUDY',
] as const

/** The docs that flip an organization to KYB level 3. */
const ORG_BUSINESS_DOC_TYPES = ['COMMERCIAL_REG', 'BUSINESS_LICENSE'] as const

export interface KycStatusDTO {
  kycLevel: number
  levelLabel: string
  missingForNext: string[]
  verifiedBadges: string[]
}

function labelFor(level: number): string {
  return KYC_LEVEL_LABELS[Math.max(0, Math.min(3, level))]
}

/** Compute (without persisting) a user's KYC level from live evidence. */
export async function computeUserKycLevel(userId: string): Promise<number> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { phoneVerifiedAt: true },
  })
  if (!user) return 0

  // L1 — phone verified via OTP
  let level = user.phoneVerifiedAt ? 1 : 0
  if (level < 1) return level

  // L2 — ≥1 VERIFIED identity document in the user's vault (personal or
  // org-scoped — evidence is evidence; the vault owner uploaded it)
  const identityDoc = await db.accountDocument.findFirst({
    where: {
      userId,
      isActive: true,
      status: 'VERIFIED',
      documentType: { in: [...IDENTITY_DOC_TYPES] },
    },
    select: { id: true },
  })
  if (!identityDoc) return level
  level = 2

  // L3 — (a) member (OWNER/ADMIN) of an ACTIVE org that itself is business
  // verified (org kycLevel ≥3), or (b) ≥2 distinct VERIFIED business doc types
  const verifiedOrg = await db.organizationMember.findFirst({
    where: {
      userId,
      role: { in: ['OWNER', 'ADMIN'] },
      organization: { status: 'ACTIVE', kycLevel: { gte: 3 } },
    },
    select: { id: true },
  })
  if (verifiedOrg) return 3

  const businessDocs = await db.accountDocument.findMany({
    where: {
      userId,
      isActive: true,
      status: 'VERIFIED',
      documentType: { in: [...BUSINESS_DOC_TYPES] },
    },
    select: { documentType: true },
    distinct: ['documentType'],
  })
  if (businessDocs.length >= 2) return 3
  return level
}

/** Recompute + persist User.kycLevel. Returns the new level. */
export async function recomputeUserKycLevel(userId: string): Promise<number> {
  const previous = await db.user
    .findUnique({ where: { id: userId }, select: { kycLevel: true } })
    .then((u) => u?.kycLevel ?? 0)
  const level = await computeUserKycLevel(userId)
  try {
    await db.user.update({ where: { id: userId }, data: { kycLevel: level } })
  } catch (err) {
    // Persistence failure must never break the business action that triggered
    // the recompute — the level is still derivable on demand.
    console.error('[kyc] user level persist failed:', userId, err instanceof Error ? err.message : err)
  }
  if (level !== previous) {
    await notifyKycLevelIfChanged(userId, previous, level)
  }
  return level
}

/**
 * Compute an organization's KYB level: 3 when it holds ≥1 VERIFIED business
 * doc (COMMERCIAL_REG | BUSINESS_LICENSE). Otherwise 0 — orgs don't have
 * phones; identity lives with the members.
 */
export async function computeOrgKycLevel(organizationId: string): Promise<number> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { status: true },
  })
  if (!org || org.status !== 'ACTIVE') return 0

  const businessDoc = await db.accountDocument.findFirst({
    where: {
      organizationId,
      isActive: true,
      status: 'VERIFIED',
      documentType: { in: [...ORG_BUSINESS_DOC_TYPES] },
    },
    select: { id: true },
  })
  return businessDoc ? 3 : 0
}

/** Recompute + persist Organization.kycLevel (and set verifiedAt when newly ≥3). */
export async function recomputeOrgKycLevel(organizationId: string): Promise<number> {
  const level = await computeOrgKycLevel(organizationId)
  try {
    const org = await db.organization.update({
      where: { id: organizationId },
      data: { kycLevel: level, ...(level >= 3 ? { verifiedAt: new Date() } : {}) },
      select: { name: true },
    })
    if (level >= 3) {
      // Bump every OWNER/ADMIN member's own user level (their L3 hinges on
      // the org being business-verified).
      const members = await db.organizationMember.findMany({
        where: { organizationId, role: { in: ['OWNER', 'ADMIN'] } },
        select: { userId: true },
      })
      await Promise.all(members.map((m) => recomputeUserKycLevel(m.userId)))
      console.log(`[kyc] org "${org.name}" → level ${level} (${members.length} owner/admin members recomputed)`)
    }
  } catch (err) {
    console.error('[kyc] org level persist failed:', organizationId, err instanceof Error ? err.message : err)
  }
  return level
}

/**
 * Human hints for what stands between the user and the next level — powers
 * the account console stepper and the publish gate guidance.
 */
export async function getKycStatus(userId: string): Promise<KycStatusDTO> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { phoneVerifiedAt: true, phone: true },
  })
  if (!user) {
    return { kycLevel: 0, levelLabel: labelFor(0), missingForNext: [], verifiedBadges: [] }
  }

  const level = await computeUserKycLevel(userId)
  const missingForNext: string[] = []
  const verifiedBadges: string[] = []

  if (user.phoneVerifiedAt) verifiedBadges.push('Phone verified')
  if (level >= 2) verifiedBadges.push('Identity verified')
  if (level >= 3) verifiedBadges.push('Business verified')

  if (level === 0) {
    missingForNext.push('Verify your phone number (WhatsApp code) to reach level 1')
  } else if (level === 1) {
    missingForNext.push(
      'Upload a national ID, passport or residence permit — once platform-verified you reach level 2'
    )
  } else if (level === 2) {
    const verifiedBusinessTypes = await db.accountDocument.findMany({
      where: {
        userId,
        isActive: true,
        status: 'VERIFIED',
        documentType: { in: [...BUSINESS_DOC_TYPES] },
      },
      select: { documentType: true },
      distinct: ['documentType'],
    })
    const orgs = await db.organizationMember.findMany({
      where: { userId, role: { in: ['OWNER', 'ADMIN'] }, organization: { status: 'ACTIVE' } },
      select: { organization: { select: { name: true } } },
    })
    if (verifiedBusinessTypes.length >= 2 || orgs.length > 0) {
      missingForNext.push('Business evidence is in review — levels update the moment documents are verified')
    } else {
      missingForNext.push(
        'Get verified as a business: join a verified organization, or upload 2+ business documents (commercial registration, business license, tax card…)'
      )
    }
  }

  return {
    kycLevel: level,
    levelLabel: labelFor(level),
    missingForNext,
    verifiedBadges,
  }
}

/**
 * Enforcement gate — publishing products requires identity verification (L2).
 * Shared by POST /api/products and PUT /api/products/[id] so the rule lives
 * exactly once. Admins are exempt (platform moderation can publish anything).
 */
export const KYC_PUBLISH_REQUIRED_LEVEL = 2

export const KYC_PUBLISH_GATE_MESSAGE =
  'Verify your identity to publish products — upload a national ID or passport in Account → Verification (KYC level 2).'

export async function assertSellerCanPublish(user: { id: string; role: string }): Promise<void> {
  // Phase 6 (6.2 sweep): platform override via RBAC (catalog staff), not the role badge.
  if (await userHasPlatformPermission(user.id, 'catalog.products.moderate')) return
  const level = await computeUserKycLevel(user.id)
  if (level < KYC_PUBLISH_REQUIRED_LEVEL) {
    throw Object.assign(new Error(KYC_PUBLISH_GATE_MESSAGE), { status: 403 })
  }
}

/**
 * Notify a user their KYC level changed (fired by the recompute hook so the
 * "you can now publish" moment is visible in the bell). Only fires on level
 * increases to L2+ — recomputes that don't move the needle stay silent.
 */
export async function notifyKycLevelIfChanged(
  userId: string,
  previousLevel: number,
  newLevel: number
): Promise<void> {
  if (newLevel <= previousLevel || newLevel < 2) return
  await emitNotification({
    userId,
    type: 'KYC_LEVEL_UP',
    title: `Verification upgraded — ${labelFor(newLevel)}`,
    body:
      newLevel >= 3
        ? 'Your business is verified. Buyers see the Certified business badge on your store.'
        : 'Your identity is verified — you can now publish products on the marketplace.',
    linkView: 'account',
    linkId: null,
  })
}
