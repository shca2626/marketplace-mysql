import { randomBytes } from 'crypto'
import { db } from '@/lib/db'
import { decryptSecret, encryptSecret } from '@/lib/secret-box'
import { buildOtpauthUri, generateTotpSecret, verifyTotp } from '@/lib/totp'
import { hashPassword, verifyPassword } from '@/lib/auth'
import { recordAudit } from '@/server/modules/audit/service'

// ─────────────────────────────────────────────────────────────────────────────
// MFA SERVICE — TOTP enrollment, backup codes, requirement derivation,
// step-up freshness (lastplan v5 6.7).
//
//  • TOTP secrets are AES-256-GCM encrypted at rest (MFA_ENCRYPTION_KEY —
//    never the DB credential). Plaintext exists only in memory during
//    enrollment/verification; it is never stored, never logged.
//  • Backup codes: 8 single-use codes, salted scrypt hashes, replay rejected.
//  • mfaRequiredForUser derives from ACTUAL role assignments — adding a
//    privileged role turns the requirement on automatically (6.7.4); the
//    user can never disable while required.
//  • Step-up freshness: session-registry mfaSatisfiedAt within a window
//    (default 5 minutes) — see requireStepUpMfa in server/guards.ts.
// ─────────────────────────────────────────────────────────────────────────────

export const MFA_STEPUP_WINDOW_MS = Number(process.env.MFA_STEPUP_WINDOW_MS ?? 5 * 60 * 1000)

/** Permissions that make MFA mandatory for the holder's account (6.7.1). */
export const MFA_TRIGGER_PERMISSIONS: readonly string[] = Object.freeze([
  'rbac.manage',
  'rbac.roles.create',
  'rbac.roles.update',
  'rbac.roles.delete',
  'staff.manage',
  'staff.invite',
  'payouts.manage',
  'payments.capture',
  'financing.documents.verify',
  'orgs.verify',
  'vendors.verify',
  'disputes.resolve',
  'modules.manage',
  'financier.agreements.manage',
  'financier.accreditations.manage',
])

const POLICY_KEY = 'security-mfa'
export interface MfaPlatformPolicy {
  /** Platform policy: every platform staff account must enroll. */
  requireForStaff: boolean
}

const DEFAULT_POLICY: MfaPlatformPolicy = { requireForStaff: true }

export class MfaServiceError extends Error {
  status: number
  code?: string
  constructor(message: string, status = 400, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

// ── platform policy ────────────────────────────────────────────────────────

export async function getMfaPlatformPolicy(): Promise<MfaPlatformPolicy> {
  const row = await db.platformSetting.findUnique({ where: { key: POLICY_KEY } })
  if (!row) return { ...DEFAULT_POLICY }
  try {
    const parsed = JSON.parse(row.value) as Partial<MfaPlatformPolicy>
    return { requireForStaff: parsed.requireForStaff ?? DEFAULT_POLICY.requireForStaff }
  } catch {
    return { ...DEFAULT_POLICY }
  }
}

export async function setMfaPlatformPolicy(
  actor: { id: string; name: string },
  policy: MfaPlatformPolicy
): Promise<MfaPlatformPolicy> {
  await db.platformSetting.upsert({
    where: { key: POLICY_KEY },
    update: { value: JSON.stringify(policy) },
    create: { key: POLICY_KEY, value: JSON.stringify(policy) },
  })
  await recordAudit({
    actorId: actor.id,
    actorType: 'ADMIN',
    action: 'MFA_PLATFORM_POLICY_CHANGED',
    entityType: 'PlatformSetting',
    entityId: POLICY_KEY,
    summary: `MFA platform policy set to requireForStaff=${policy.requireForStaff}`,
    metadata: { ...policy },
  })
  return policy
}

// ── enrollment ─────────────────────────────────────────────────────────────

export interface EnrollmentStartResult {
  /** The base32 secret — displayed ONCE (QR + manual entry), never stored raw. */
  secret: string
  otpauthUri: string
}

export async function startEnrollment(userId: string, accountLabel: string): Promise<EnrollmentStartResult> {
  const existing = await db.mfaEnrollment.findUnique({ where: { userId } })
  if (existing?.confirmedAt) {
    throw new MfaServiceError('MFA is already enrolled for this account', 409, 'MFA_ALREADY_ENROLLED')
  }
  const secret = generateTotpSecret()
  const secretEnc = encryptSecret(secret)
  if (existing) {
    // Restart an unconfirmed enrollment with a fresh secret.
    await db.mfaEnrollment.update({
      where: { userId },
      data: { secretEnc, lastTotpStep: null },
    })
  } else {
    await db.mfaEnrollment.create({ data: { userId, secretEnc } })
  }
  return { secret, otpauthUri: buildOtpauthUri({ secret, account: accountLabel }) }
}

export async function confirmEnrollment(
  userId: string,
  code: string
): Promise<{ backupCodes: string[] }> {
  const enrollment = await db.mfaEnrollment.findUnique({ where: { userId } })
  if (!enrollment) throw new MfaServiceError('No MFA enrollment in progress', 404, 'MFA_NO_ENROLLMENT')
  if (enrollment.confirmedAt) throw new MfaServiceError('MFA is already enrolled', 409, 'MFA_ALREADY_ENROLLED')

  const secret = decryptSecret(enrollment.secretEnc)
  const check = verifyTotp(secret, code)
  if (!check.valid) throw new MfaServiceError('That code is not valid yet — check your authenticator clock and try again', 400, 'MFA_INVALID_CODE')

  const backupCodes = await db.$transaction(async (tx) => {
    await tx.mfaEnrollment.update({
      where: { userId },
      data: { confirmedAt: new Date(), lastTotpStep: check.step },
    })
    await tx.mfaBackupCode.deleteMany({ where: { enrollmentId: enrollment.id } })
    const codes = generateBackupCodes()
    await tx.mfaBackupCode.createMany({
      data: codes.map((code2) => ({ enrollmentId: enrollment.id, codeHash: hashPassword(code2) })),
    })
    return codes
  })

  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'MFA_ENROLLED',
    entityType: 'MfaEnrollment',
    entityId: enrollment.id,
    summary: 'MFA enrolled (TOTP confirmed, backup codes issued)',
  })
  return { backupCodes }
}

export async function disableMfa(userId: string, password: string): Promise<void> {
  const enrollment = await db.mfaEnrollment.findUnique({ where: { userId } })
  if (!enrollment?.confirmedAt) throw new MfaServiceError('MFA is not enrolled', 404, 'MFA_NOT_ENROLLED')
  const user = await db.user.findUnique({ where: { id: userId }, select: { password: true } })
  if (!user || !verifyPassword(password, user.password)) {
    throw new MfaServiceError('Password incorrect', 403, 'MFA_BAD_PASSWORD')
  }
  if (await mfaRequiredForUser(userId)) {
    throw new MfaServiceError(
      'MFA is required for your account (platform policy or one of your roles) — it cannot be disabled. Contact a platform administrator if you believe this is a mistake.',
      403,
      'MFA_REQUIRED_BY_POLICY'
    )
  }
  await db.mfaEnrollment.delete({ where: { userId } })
  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'MFA_DISABLED',
    entityType: 'MfaEnrollment',
    entityId: enrollment.id,
    summary: 'MFA disabled (not required by policy — password re-verified)',
  })
}

export async function regenerateBackupCodes(
  userId: string,
  password: string
): Promise<{ backupCodes: string[] }> {
  const enrollment = await db.mfaEnrollment.findUnique({ where: { userId } })
  if (!enrollment?.confirmedAt) throw new MfaServiceError('MFA is not enrolled', 404, 'MFA_NOT_ENROLLED')
  const user = await db.user.findUnique({ where: { id: userId }, select: { password: true } })
  if (!user || !verifyPassword(password, user.password)) {
    throw new MfaServiceError('Password incorrect', 403, 'MFA_BAD_PASSWORD')
  }
  // Password re-verification replaces step-up here (either factor + knowledge).
  const backupCodes = await db.$transaction(async (tx) => {
    await tx.mfaBackupCode.deleteMany({ where: { enrollmentId: enrollment.id } })
    const codes = generateBackupCodes()
    await tx.mfaBackupCode.createMany({
      data: codes.map((code2) => ({ enrollmentId: enrollment.id, codeHash: hashPassword(code2) })),
    })
    return codes
  })
  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'MFA_BACKUP_CODES_REGENERATED',
    entityType: 'MfaEnrollment',
    entityId: enrollment.id,
    summary: 'MFA backup codes regenerated (previous set invalidated)',
  })
  return { backupCodes }
}

// ── verification (login + step-up) ───────────────────────────────────────────

export interface VerifyResult {
  ok: boolean
  via?: 'TOTP' | 'BACKUP_CODE'
  reason?: string
}

/**
 * Verify a code against the user's MFA enrollment — TOTP (with replay guard)
 * or a single-use backup code. Backup-code use is audited; replay rejected.
 */
export async function verifyMfaCode(userId: string, code: string): Promise<VerifyResult> {
  const enrollment = await db.mfaEnrollment.findUnique({ where: { userId } })
  if (!enrollment?.confirmedAt) return { ok: false, reason: 'not-enrolled' }
  const normalized = (code ?? '').trim()
  if (!normalized) return { ok: false, reason: 'empty' }

  // TOTP first (the common path).
  const secret = decryptSecret(enrollment.secretEnc)
  const check = verifyTotp(secret, normalized)
  if (check.valid) {
    // RFC 6238 §5.2: never accept the same time-step twice.
    if (enrollment.lastTotpStep !== null && check.step <= enrollment.lastTotpStep) {
      return { ok: false, reason: 'replayed-code' }
    }
    await db.mfaEnrollment.update({
      where: { userId },
      data: { lastTotpStep: check.step },
    })
    return { ok: true, via: 'TOTP' }
  }

  // Backup code: single-use, hashed, flip usedAt atomically.
  const candidates = await db.mfaBackupCode.findMany({
    where: { enrollmentId: enrollment.id, usedAt: null },
  })
  for (const candidate of candidates) {
    if (verifyPassword(normalized.toUpperCase(), candidate.codeHash)) {
      const flipped = await db.mfaBackupCode.updateMany({
        where: { id: candidate.id, usedAt: null },
        data: { usedAt: new Date() },
      })
      if (flipped.count === 1) {
        await recordAudit({
          actorId: userId,
          actorType: 'USER',
          action: 'MFA_BACKUP_CODE_USED',
          entityType: 'MfaEnrollment',
          entityId: enrollment.id,
          summary: 'MFA passed with a backup code (single-use)',
        })
        return { ok: true, via: 'BACKUP_CODE' }
      }
      // count === 0 → concurrent replay attempt; keep rejecting.
    }
  }
  return { ok: false, reason: 'invalid-code' }
}

export async function isMfaEnrolled(userId: string): Promise<boolean> {
  const enrollment = await db.mfaEnrollment.findUnique({
    where: { userId },
    select: { confirmedAt: true },
  })
  return Boolean(enrollment?.confirmedAt)
}

// ── requirement derivation (6.7.4 — not self-weakenable) ───────────────────

export async function mfaRequiredForUser(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { mfaRequired: true },
  })
  if (!user) return false
  // Admin-set per-account requirement always wins.
  if (user.mfaRequired) return true
  // Any effective role (platform OR org scope) carrying a trigger permission.
  const assignments = await db.userRole.findMany({
    where: { userId, role: { permissions: { some: { permissionKey: { in: [...MFA_TRIGGER_PERMISSIONS] } } } } },
    select: { id: true },
    take: 1,
  })
  if (assignments.length > 0) return true
  // Platform policy: every platform staff account.
  const policy = await getMfaPlatformPolicy()
  if (policy.requireForStaff) {
    const staff = await db.userRole.findFirst({
      where: { userId, organizationId: '' },
      select: { id: true },
    })
    if (staff) return true
  }
  return false
}

/** Quick status object for settings screens. */
export async function mfaStatus(userId: string): Promise<{
  enrolled: boolean
  required: boolean
  backupCodesRemaining: number
}> {
  const enrollment = await db.mfaEnrollment.findUnique({
    where: { userId },
    include: { _count: { select: { backupCodes: { where: { usedAt: null } } } } },
  })
  return {
    enrolled: Boolean(enrollment?.confirmedAt),
    required: await mfaRequiredForUser(userId),
    backupCodesRemaining: enrollment?._count.backupCodes ?? 0,
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────

/** 8 single-use backup codes, transcript-safe alphabet, 4-4 grouped (KB3M-P7XA). */
function generateBackupCodes(count = 8): string[] {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // no I,L,O,0,1
  const codes: string[] = []
  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(8)
    let raw = ''
    for (const b of bytes) raw += alphabet[b % alphabet.length]
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}`)
  }
  return codes
}
