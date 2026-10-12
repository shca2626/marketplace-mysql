import { db } from '@/lib/db'
import { recordAudit } from '@/server/modules/audit/service'
import { FinancingError, requireFinancierContext } from './shared'
import { sameCity } from './analytics'

// ─────────────────────────────────────────────────────────────────────────────
// UNDERWRITING LIMITS (Phase 10 — lastplan v5 §10.7).
//
// The limit matrix: one UnderwritingLimit row per deterministic scopeKey —
//   "org"                       → the whole institution
//   "org:user:<uid>"            → one underwriter, institution-wide
//   "branch:<bid>"              → one branch
//   "branch:<bid>:user:<uid>"   → one underwriter at one branch
// Resolution is most-specific-wins (branch:user → org:user → branch → org);
// no row at any level = unlimited. ENFORCED when offers are created/sent
// (offers.ts calls assertOfferWithinUnderwritingLimit before any write).
// Only institution OWNER/ADMIN members may set limits; every change is
// audited.
// ─────────────────────────────────────────────────────────────────────────────

// ── DTOs ────────────────────────────────────────────────────────────────────

export type LimitScopeInput = 'ORG' | 'BRANCH' | 'USER'

export interface UnderwritingLimitDTO {
  id: string
  /** Resolved display scope (derives from branch/user presence). */
  scope: 'ORG' | 'BRANCH' | 'USER' | 'BRANCH_USER'
  scopeKey: string
  branchId: string | null
  branchName: string | null
  userId: string | null
  userName: string | null
  userEmail: string | null
  maxAmount: number
  currency: string
  updatedAt: string
  updatedByName: string | null
}

export interface EffectiveLimit {
  maxAmount: number
  currency: string
  scopeKey: string
}

export interface SetLimitInput {
  scope: LimitScopeInput
  branchId?: string | null
  userId?: string | null
  maxAmount: number
  currency?: string
}

// ── Guards ──────────────────────────────────────────────────────────────────

async function requireInstitutionAdmin(userId: string) {
  const ctx = await requireFinancierContext(userId, 'financier.offers.manage')
  const me = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: ctx.organizationId, userId } },
    select: { role: true },
  })
  if (!me || (me.role !== 'OWNER' && me.role !== 'ADMIN')) {
    throw new FinancingError('Only institution owners and admins can manage underwriting limits', 403)
  }
  return ctx
}

/** The user must be staff of this institution (org member or financier.* role). */
async function assertTargetUserIsStaff(organizationId: string, targetUserId: string): Promise<void> {
  const [member, role] = await Promise.all([
    db.organizationMember.findFirst({ where: { organizationId, userId: targetUserId } }),
    db.userRole.findFirst({
      where: { userId: targetUserId, organizationId, role: { key: { startsWith: 'financier.' } } },
    }),
  ])
  if (!member && !role) {
    throw new FinancingError('That user is not staff of this institution', 404)
  }
}

// ── Scope keys (deterministic — the unique column) ───────────────────────────

function buildScopeKey(input: SetLimitInput): string {
  const branchId = input.branchId?.trim() || null
  const userId = input.userId?.trim() || null
  if (input.scope === 'ORG') {
    if (branchId || userId) throw new FinancingError('An org-wide limit takes no branch or user')
    return 'org'
  }
  if (input.scope === 'BRANCH') {
    if (!branchId) throw new FinancingError('Pick a branch for a branch limit')
    if (userId) throw new FinancingError('A branch limit cannot target a single user — use a user limit with a branch')
    return `branch:${branchId}`
  }
  // USER
  if (!userId) throw new FinancingError('Pick a staff member for a user limit')
  return branchId ? `branch:${branchId}:user:${userId}` : `org:user:${userId}`
}

// ── Views ────────────────────────────────────────────────────────────────────

export async function listLimits(staffUserId: string): Promise<UnderwritingLimitDTO[]> {
  const ctx = await requireFinancierContext(staffUserId, 'financier.offers.manage')
  const rows = await db.underwritingLimit.findMany({
    where: { financierProfileId: ctx.financierProfileId },
    include: {
      branch: { select: { name: true } },
      user: { select: { name: true, email: true } },
      updatedBy: { select: { name: true } },
    },
    orderBy: [{ branchId: 'asc' }, { userId: 'asc' }],
  })
  return rows.map(serializeLimit)
}

function serializeLimit(row: {
  id: string
  scopeKey: string
  branchId: string | null
  userId: string | null
  maxAmount: number
  currency: string
  updatedAt: Date
  branch?: { name: string } | null
  user?: { name: string; email: string | null } | null
  updatedBy?: { name: string } | null
}): UnderwritingLimitDTO {
  return {
    id: row.id,
    scope: row.branchId && row.userId ? 'BRANCH_USER' : row.branchId ? 'BRANCH' : row.userId ? 'USER' : 'ORG',
    scopeKey: row.scopeKey,
    branchId: row.branchId,
    branchName: row.branch?.name ?? null,
    userId: row.userId,
    userName: row.user?.name ?? null,
    userEmail: row.user?.email ?? null,
    maxAmount: row.maxAmount,
    currency: row.currency,
    updatedAt: row.updatedAt.toISOString(),
    updatedByName: row.updatedBy?.name ?? null,
  }
}

// ── Set (upsert by scopeKey) ─────────────────────────────────────────────────

export async function setLimit(staffUserId: string, input: SetLimitInput): Promise<UnderwritingLimitDTO[]> {
  const ctx = await requireInstitutionAdmin(staffUserId)

  if (!Number.isFinite(input.maxAmount) || input.maxAmount <= 0) {
    throw new FinancingError('Maximum amount must be a positive number')
  }
  const currency = (input.currency ?? 'YER').toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) throw new FinancingError('Currency must be a 3-letter code')

  const branchId = input.branchId?.trim() || null
  const targetUserId = input.userId?.trim() || null

  if (branchId) {
    const branch = await db.financierBranch.findFirst({
      where: { id: branchId, financierProfileId: ctx.financierProfileId },
      select: { id: true },
    })
    if (!branch) throw new FinancingError('Branch not found for your institution', 404)
  }
  if (targetUserId) {
    await assertTargetUserIsStaff(ctx.organizationId, targetUserId)
  }

  const scopeKey = buildScopeKey({ ...input, branchId, userId: targetUserId })

  const row = await db.underwritingLimit.upsert({
    where: { scopeKey },
    create: {
      financierProfileId: ctx.financierProfileId,
      scopeKey,
      branchId,
      userId: targetUserId,
      maxAmount: input.maxAmount,
      currency,
      updatedById: staffUserId,
    },
    update: {
      maxAmount: input.maxAmount,
      currency,
      updatedById: staffUserId,
    },
    include: {
      branch: { select: { name: true } },
      user: { select: { name: true, email: true } },
      updatedBy: { select: { name: true } },
    },
  })

  await recordAudit({
    actorId: staffUserId,
    actorType: 'USER',
    action: 'UNDERWRITING_LIMIT_SET',
    entityType: 'UnderwritingLimit',
    entityId: row.id,
    summary: `Underwriting limit ${scopeKey} set to ${input.maxAmount.toLocaleString()} ${currency}`,
    metadata: { scopeKey, maxAmount: input.maxAmount, currency },
  })

  return listLimits(staffUserId)
}

// ── Resolution (most-specific-wins) + offer enforcement ───────────────────────

/**
 * The effective limit for an underwriter (optionally at a branch):
 * branch:user → org:user → branch → org. Null = unlimited.
 */
export async function resolveEffectiveLimit(
  financierProfileId: string,
  userId: string,
  branchId?: string | null
): Promise<EffectiveLimit | null> {
  const user = userId?.trim()
  const branch = branchId?.trim()
  const keys: string[] = []
  if (branch && user) keys.push(`branch:${branch}:user:${user}`)
  if (user) keys.push(`org:user:${user}`)
  if (branch) keys.push(`branch:${branch}`)
  keys.push('org')

  const rows = await db.underwritingLimit.findMany({
    where: { financierProfileId, scopeKey: { in: keys } },
    select: { scopeKey: true, maxAmount: true, currency: true },
  })
  for (const key of keys) {
    const hit = rows.find((r) => r.scopeKey === key)
    if (hit) return { maxAmount: hit.maxAmount, currency: hit.currency, scopeKey: key }
  }
  return null
}

/**
 * THE enforcement hook called from offers.ts before an offer is created or
 * sent. The branch context of an offer is the request's activity city: when it
 * matches an active branch of the financier (case-insensitive), that branch's
 * limit applies on top of the user/org levels.
 */
export async function assertOfferWithinUnderwritingLimit(
  actingUserId: string,
  request: {
    activityCity: string | null
    service: { financierProfile: { id: string } }
  },
  amount: number
): Promise<void> {
  const profileId = request.service.financierProfile.id

  let branchId: string | null = null
  if (request.activityCity) {
    // The branch set is small (one institution's locations) — load and match
    // cities in code so apostrophe variants and casing can never split a match.
    const branches = await db.financierBranch.findMany({
      where: { financierProfileId: profileId, isActive: true },
      select: { id: true, city: true },
      take: 200,
    })
    branchId = branches.find((b) => sameCity(b.city, request.activityCity))?.id ?? null
  }

  const limit = await resolveEffectiveLimit(profileId, actingUserId, branchId)
  if (limit && amount > limit.maxAmount) {
    throw new FinancingError(
      `EXCEEDS_UNDERWRITING_LIMIT: this offer (${amount.toLocaleString()}) exceeds the effective underwriting limit of ${limit.maxAmount.toLocaleString()} ${limit.currency}${branchId ? ' for this branch' : ''}. Raise the limit or reduce the amount.`,
      403
    )
  }
}
