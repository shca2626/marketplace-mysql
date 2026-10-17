import { db } from '@/lib/db'
import { recordAuditTx } from '@/server/modules/audit/service'
import { emitNotifications } from '@/server/modules/notifications/service'

// ─────────────────────────────────────────────────────────────────────────────
// NETW-1: company follows — the lightweight actor-network edge between any
// authenticated user (buyer, merchant member, financier staff…) and a COMPANY.
//
// The follow is the fan-out primitive for the buyer-side Following console and
// the company-side Audience tab; the org never learns more than the follower's
// public identity (name + member org), and followers only ever see the org's
// public storefront stats.
//
// INVARIANTS
//   • the target must be an ACTIVE COMPANY organization (financier institutions
//     are not followable — their surface is the financing hub)
//   • a member of the org itself cannot follow it (self-follow is noise)
//   • one follow per (user, org) — the unique index enforces it
//   • every mutation writes its audit row in the SAME transaction
// ─────────────────────────────────────────────────────────────────────────────

export class FollowError extends Error {
  status: number
  code?: string
  constructor(message: string, status = 400, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface FollowedOrgDTO {
  orgId: string
  name: string
  slug: string
  verified: boolean
  memberSince: string
  activeListings: number
  followerCount: number
  followedAt: string
}

export interface FollowerDTO {
  userId: string
  name: string
  role: string // account role (BUYER/SELLER)
  memberOrgName: string | null // the follower's own company, when they have one
  followedAt: string
}

export interface OrgAudienceDTO {
  total: number
  newThisWeek: number
  followers: FollowerDTO[]
}

// ── follow / unfollow ────────────────────────────────────────────────────────

export async function followOrg(userId: string, orgId: string): Promise<{ followed: true }> {
  const target = (orgId || '').trim()
  if (!target) throw new FollowError('A company to follow is required', 400)

  const org = await db.organization.findUnique({
    where: { id: target },
    select: { id: true, name: true, orgType: true, status: true },
  })
  if (!org) throw new FollowError('That company does not exist', 404, 'ORG_NOT_FOUND')
  if (org.orgType !== 'COMPANY') throw new FollowError('Only companies can be followed', 400, 'NOT_A_COMPANY')
  if (org.status !== 'ACTIVE') throw new FollowError('That company is not currently active', 400, 'ORG_NOT_ACTIVE')

  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: target, userId } },
    select: { id: true },
  })
  if (membership) throw new FollowError('You already belong to this company', 400, 'SELF_FOLLOW')

  const existing = await db.companyFollow.findUnique({
    where: { userId_orgId: { userId, orgId: target } },
    select: { id: true },
  })
  if (existing) throw new FollowError('You already follow this company', 409, 'ALREADY_FOLLOWING')

  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true } })
  if (!user) throw new FollowError('Account not found', 404)

  await db.$transaction(async (tx) => {
    await tx.companyFollow.create({ data: { userId, orgId: target } })
    await recordAuditTx(tx, {
      actorId: userId,
      actorType: 'USER',
      action: 'COMPANY_FOLLOWED',
      entityType: 'Organization',
      entityId: target,
      summary: `${user.name} started following ${org.name}`,
      metadata: { orgId: target },
    })
  })

  // Fire-and-forget: tell the company's owners/admins (capped)
  const notifiees = await db.organizationMember.findMany({
    where: { organizationId: target, role: { in: ['OWNER', 'ADMIN'] } },
    select: { userId: true },
    take: 10,
  })
  if (notifiees.length > 0) {
    await emitNotifications(
      notifiees.map((n) => ({
        userId: n.userId,
        type: 'NEW_FOLLOWER' as const,
        title: 'New company follower',
        body: `${user.name} is now following ${org.name}.`,
        linkView: 'business' as const,
      }))
    )
  }
  return { followed: true }
}

export async function unfollowOrg(userId: string, orgId: string): Promise<{ followed: false }> {
  const existing = await db.companyFollow.findUnique({
    where: { userId_orgId: { userId, orgId } },
    select: { id: true },
  })
  if (!existing) throw new FollowError('You do not follow that company', 404, 'NOT_FOLLOWING')

  await db.$transaction(async (tx) => {
    await tx.companyFollow.delete({ where: { id: existing.id } })
    await recordAuditTx(tx, {
      actorId: userId,
      actorType: 'USER',
      action: 'COMPANY_UNFOLLOWED',
      entityType: 'Organization',
      entityId: orgId,
      summary: 'Unfollowed a company',
      metadata: { orgId },
    })
  })
  return { followed: false }
}

// ── buyer-side: the Following console ─────────────────────────────────────────

export async function listFollowing(userId: string): Promise<FollowedOrgDTO[]> {
  const follows = await db.companyFollow.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      createdAt: true,
      org: {
        select: {
          id: true,
          name: true,
          slug: true,
          verifiedAt: true,
          createdAt: true,
          status: true,
          products: { where: { status: 'ACTIVE' }, select: { id: true } },
          _count: { select: { companyFollowers: true } },
        },
      },
    },
  })

  return follows.map((f) => ({
    orgId: f.org.id,
    name: f.org.name,
    slug: f.org.slug,
    verified: Boolean(f.org.verifiedAt) && f.org.status === 'ACTIVE',
    memberSince: f.org.createdAt.toISOString(),
    activeListings: f.org.products.length,
    followerCount: f.org._count.companyFollowers,
    followedAt: f.createdAt.toISOString(),
  }))
}

// ── company-side: the Audience tab ────────────────────────────────────────────

export async function listFollowers(orgId: string): Promise<OrgAudienceDTO> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const followers = await db.companyFollow.findMany({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
          role: true,
          memberships: {
            where: { organization: { orgType: 'COMPANY' } },
            select: { organization: { select: { name: true } } },
            take: 1,
          },
        },
      },
    },
  })

  return {
    total: followers.length,
    newThisWeek: followers.filter((f) => f.createdAt >= weekAgo).length,
    followers: followers.map((f) => ({
      userId: f.user.id,
      name: f.user.name,
      role: f.user.role,
      memberOrgName: f.user.memberships[0]?.organization.name ?? null,
      followedAt: f.createdAt.toISOString(),
    })),
  }
}

// ── store-view integration: public follow state for a seller's storefront ────

/** Resolve the COMPANY org behind a legacy seller-user storefront and return
 *  the public follow context (count + whether the viewer follows). */
export async function storeFollowState(
  sellerUserId: string,
  viewerId: string | null
): Promise<{ orgId: string; orgName: string; followerCount: number; viewerFollows: boolean } | null> {
  // The storefront is seller-user keyed; the org is the product-owning company.
  const product = await db.product.findFirst({
    where: { sellerId: sellerUserId },
    select: { organizationId: true },
  })
  let orgId = product?.organizationId ?? null
  if (!orgId) {
    // Sellers without published products: fall back to their COMPANY membership
    const membership = await db.organizationMember.findFirst({
      where: { userId: sellerUserId, organization: { orgType: 'COMPANY' } },
      select: { organizationId: true },
    })
    orgId = membership?.organizationId ?? null
  }
  if (!orgId) return null

  const [org, followerCount] = await Promise.all([
    db.organization.findUnique({ where: { id: orgId }, select: { id: true, name: true } }),
    db.companyFollow.count({ where: { orgId } }),
  ])
  if (!org) return null

  let viewerFollows = false
  if (viewerId) {
    const row = await db.companyFollow.findUnique({
      where: { userId_orgId: { userId: viewerId, orgId } },
      select: { id: true },
    })
    viewerFollows = Boolean(row)
  }
  return { orgId: org.id, orgName: org.name, followerCount, viewerFollows }
}

// ── membership guard for org-side surfaces ──────────────────────────────────

export async function assertOrgViewer(userId: string, organizationId: string): Promise<void> {
  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { id: true },
  })
  if (!membership) throw new FollowError('Not a member of that organization', 403, 'NOT_MEMBER')
}
