import { db } from '@/lib/db'
import type { Prisma, OrganizationMember } from '@prisma/client'

// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL ACTIVE-MEMBERSHIP RESOLVER (lastplan v5 6.4 / M2) + the
// last-active-owner invariant (H2).
//
//  A membership is ACTIVE iff the OrganizationMember row exists AND
//  User.status = 'ACTIVE' AND Organization.status = 'ACTIVE'. This predicate
//  lives HERE and nowhere else — no service invents its own interpretation
//  (a grep for 'isActiveMembership' outside this file must stay empty; the
//  guard-lint sweep in 6.4.4 checks exactly that).
//
//  The last-active-owner invariant: removing or demoting the LAST active
//  OWNER of an organization fails closed unless another active owner is
//  assigned first (grant-new → then remove/demote is the atomic-swap order
//  the admin console must use). A seller organization (Phase 7 7.0) must
//  never be left ownerless.
// ─────────────────────────────────────────────────────────────────────────────

export class MembershipError extends Error {
  status: number
  constructor(message: string, status = 409) {
    super(message)
    this.status = status
  }
}

type Tx = Prisma.TransactionClient
type DbLike = Tx | typeof db

/** The one true predicate (M2). Uses the caller's transaction when given. */
export async function isActiveMembership(
  userId: string,
  organizationId: string,
  tx: DbLike = db
): Promise<boolean> {
  const member = await tx.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    include: { user: { select: { status: true } }, organization: { select: { status: true } } },
  })
  if (!member) return false
  return member.user.status === 'ACTIVE' && member.organization.status === 'ACTIVE'
}

/** Hard requirement for org-scoped role assignment (6.4.1). */
export async function requireActiveMembership(
  userId: string,
  organizationId: string,
  tx: DbLike = db
): Promise<void> {
  if (!(await isActiveMembership(userId, organizationId, tx))) {
    throw new MembershipError(
      'That account is not an active member of the target organization (membership missing, user suspended, or organization suspended/pending).',
      403
    )
  }
}

/** Active members of an org (the M2 predicate applied to the roster). */
export async function activeMembers(
  organizationId: string,
  tx: DbLike = db
): Promise<OrganizationMember[]> {
  const members = await tx.organizationMember.findMany({
    where: {
      organizationId,
      user: { status: 'ACTIVE' },
      organization: { status: 'ACTIVE' },
    },
  })
  return members
}

/** Count active OWNERs, optionally excluding the member being removed/demoted. */
export async function countActiveOwners(
  organizationId: string,
  opts: { excludingUserId?: string } = {},
  tx: DbLike = db
): Promise<number> {
  const members = await tx.organizationMember.findMany({
    where: {
      organizationId,
      role: 'OWNER',
      user: { status: 'ACTIVE' },
      organization: { status: 'ACTIVE' },
    },
    select: { userId: true },
  })
  return members.filter((m) => m.userId !== opts.excludingUserId).length
}

/**
 * The last-active-owner invariant (H2). Call BEFORE removing a membership or
 * revoking/demoting an owner-role assignment. Fails closed with an actionable
 * message when the change would leave the organization ownerless.
 */
export async function assertNotLastActiveOwner(
  organizationId: string,
  opts: { excludingUserId?: string } = {},
  tx: DbLike = db
): Promise<void> {
  const remaining = await countActiveOwners(organizationId, opts, tx)
  if (remaining === 0) {
    throw new MembershipError(
      'This is the last active owner of the organization. Assign another active owner FIRST (grant the Owner role to another member), then repeat this change — an organization must never be left ownerless.',
      409
    )
  }
}

/** True when the member is an ACTIVE owner (convenience for guards). */
export async function isActiveOwner(
  userId: string,
  organizationId: string,
  tx: DbLike = db
): Promise<boolean> {
  const member = await tx.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { role: true },
    include: { user: { select: { status: true } }, organization: { select: { status: true } } },
  })
  if (!member || member.role !== 'OWNER') return false
  return member.user.status === 'ACTIVE' && member.organization.status === 'ACTIVE'
}
