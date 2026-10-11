import { db } from '@/lib/db'
import { recordAudit } from '@/server/modules/audit/service'
import { emitNotifications } from '@/server/modules/notifications/service'
import { FinancingError, iso } from './shared'

/**
 * SHARIA CERTIFICATIONS (lastplan v5 §10.3) — the scholar-attestation
 * register per financier institution.
 *
 *   • Expiry status is COMPUTED at read time: VALID (>30d left) |
 *     EXPIRING_SOON (≤30d, ≥0) | EXPIRED (<now).
 *   • REMINDER EMISSION is idempotent and lives inside the list call
 *     (read-mostly side effect, documented): a certification entering
 *     EXPIRING_SOON / EXPIRED whose reminderSentAt is null or older than
 *     30 days fans a notification out to the org's OWNER/ADMIN staff and
 *     stamps reminderSentAt = now. A second consecutive list call never
 *     re-emits (the stamp is the idempotency key). Staff mutations
 *     (upsert/delete) reset nothing — the reminder cycle follows the row's
 *     own clock.
 *   • Mutations are OWNER/ADMIN-only (the membership role guard pattern
 *     from agreements.ts — DP-1) and audited.
 */

// ── DTOs ────────────────────────────────────────────────────────────────────

export type CertificationExpiryStatus = 'VALID' | 'EXPIRING_SOON' | 'EXPIRED'

export interface ShariaCertificationDTO {
  id: string
  scholarName: string
  scholarInstitution: string
  certificateRef: string
  scope: string | null
  issuedAt: string
  expiresAt: string
  reminderSentAt: string | null
  documentUrl: string | null
  createdAt: string
  updatedAt: string
  expiryStatus: CertificationExpiryStatus
  daysToExpiry: number
}

export interface CertificationListResult {
  certifications: ShariaCertificationDTO[]
  /** Certifications a reminder was emitted for on THIS call (UI toasts it). */
  remindersEmitted: { id: string; scholarName: string; certificateRef: string; expiresAt: string }[]
}

export interface CertificationInput {
  scholarName: string
  scholarInstitution: string
  certificateRef: string
  scope?: string | null
  issuedAt: string
  expiresAt: string
  documentUrl?: string | null
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Days from now until expiry (negative = already past). */
function daysUntil(expiresAt: Date): number {
  return Math.floor((expiresAt.getTime() - Date.now()) / 86_400_000)
}

function expiryStatus(days: number): CertificationExpiryStatus {
  if (days < 0) return 'EXPIRED'
  if (days <= 30) return 'EXPIRING_SOON'
  return 'VALID'
}

/** Resolve the financier profile behind an org (404 when the org has none). */
async function profileForOrg(financierOrgId: string) {
  const profile = await db.financierProfile.findUnique({
    where: { organizationId: financierOrgId },
    select: { id: true, organization: { select: { name: true } } },
  })
  if (!profile) throw new FinancingError('Financier profile not found for this organization', 404)
  return profile
}

/** OWNER/ADMIN membership guard for the org owning the certification (DP-1). */
async function assertCertStaffAccess(userId: string, financierOrgId: string): Promise<void> {
  const membership = await db.organizationMember.findFirst({
    where: { userId, organizationId: financierOrgId, role: { in: ['OWNER', 'ADMIN'] } },
  })
  if (!membership) throw new FinancingError('Financier staff access required', 403)
}

function serializeCert(
  c: {
    id: string
    scholarName: string
    scholarInstitution: string
    certificateRef: string
    scope: string | null
    issuedAt: Date
    expiresAt: Date
    reminderSentAt: Date | null
    documentUrl: string | null
    createdAt: Date
    updatedAt: Date
  }
): ShariaCertificationDTO {
  const days = daysUntil(c.expiresAt)
  return {
    id: c.id,
    scholarName: c.scholarName,
    scholarInstitution: c.scholarInstitution,
    certificateRef: c.certificateRef,
    scope: c.scope,
    issuedAt: c.issuedAt.toISOString(),
    expiresAt: c.expiresAt.toISOString(),
    reminderSentAt: iso(c.reminderSentAt),
    documentUrl: c.documentUrl,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    expiryStatus: expiryStatus(days),
    daysToExpiry: days,
  }
}

// ── Views ───────────────────────────────────────────────────────────────────

/**
 * List the org's certifications with computed expiry status. Entering the
 * reminder window (≤30d or past) emits ONE idempotent reminder per row per
 * 30 days to the org's OWNER/ADMIN staff (stamped via reminderSentAt).
 */
export async function listCertifications(financierOrgId: string): Promise<CertificationListResult> {
  const profile = await profileForOrg(financierOrgId)
  const rows = await db.shariaCertification.findMany({
    where: { financierProfileId: profile.id },
    orderBy: { expiresAt: 'asc' },
  })

  // Idempotent reminder sweep — read-mostly side effect (documented above).
  const now = new Date()
  const due = rows.filter((r) => {
    const days = daysUntil(r.expiresAt)
    if (days > 30) return false // VALID — no reminder
    const last = r.reminderSentAt?.getTime() ?? 0
    return now.getTime() - last > 30 * 86_400_000 // null/older-than-30d
  })
  if (due.length > 0) {
    const staff = await db.organizationMember.findMany({
      where: { organizationId: financierOrgId, role: { in: ['OWNER', 'ADMIN'] } },
      select: { userId: true },
    })
    for (const cert of due) {
      const expired = daysUntil(cert.expiresAt) < 0
      await emitNotifications(
        staff.map((s) => ({
          userId: s.userId,
          type: 'DOCUMENT_EXPIRING' as const,
          title: expired
            ? `Sharia certification expired — ${cert.scholarInstitution}`
            : `Sharia certification expires soon — ${cert.scholarInstitution}`,
          body: expired
            ? `Certification ${cert.certificateRef} (Scholar ${cert.scholarName}) has expired. Renew it to keep the institution's Sharia compliance current.`
            : `Certification ${cert.certificateRef} (Scholar ${cert.scholarName}) expires in ${daysUntil(cert.expiresAt)} day(s). Renew it before it lapses.`,
          linkView: 'financier' as const,
          linkId: cert.id,
        }))
      )
      await db.shariaCertification.update({
        where: { id: cert.id },
        data: { reminderSentAt: now },
      })
    }
  }

  return {
    certifications: rows.map((r) => serializeCert(r)),
    remindersEmitted: due.map((d) => ({
      id: d.id,
      scholarName: d.scholarName,
      certificateRef: d.certificateRef,
      expiresAt: d.expiresAt.toISOString(),
    })),
  }
}

// ── Mutations (OWNER/ADMIN staff, audited) ──────────────────────────────────

function validateInput(input: CertificationInput): { issuedAt: Date; expiresAt: Date } {
  const issuedAt = new Date(input.issuedAt)
  const expiresAt = new Date(input.expiresAt)
  if (Number.isNaN(issuedAt.getTime())) throw new FinancingError('Invalid issue date')
  if (Number.isNaN(expiresAt.getTime())) throw new FinancingError('Invalid expiry date')
  if (expiresAt.getTime() <= issuedAt.getTime()) {
    throw new FinancingError('The expiry date must be after the issue date')
  }
  return { issuedAt, expiresAt }
}

/** Create or update (by id) a certification row. Upsert on (profile, ref) is
 *  resolved by id: a PUT with an existing id updates that row; POST creates. */
export async function upsertCertification(
  staffUserId: string,
  financierOrgId: string,
  id: string | null,
  input: CertificationInput
): Promise<ShariaCertificationDTO> {
  await assertCertStaffAccess(staffUserId, financierOrgId)
  const profile = await profileForOrg(financierOrgId)
  const dates = validateInput(input)

  const data = {
    scholarName: input.scholarName.trim(),
    scholarInstitution: input.scholarInstitution.trim(),
    certificateRef: input.certificateRef.trim(),
    scope: input.scope?.trim() || null,
    issuedAt: dates.issuedAt,
    expiresAt: dates.expiresAt,
    documentUrl: input.documentUrl?.trim() || null,
  }
  if (!data.scholarName) throw new FinancingError('Scholar name is required')
  if (!data.scholarInstitution) throw new FinancingError('Scholar institution is required')
  if (!data.certificateRef) throw new FinancingError('Certificate reference is required')

  let row
  if (id) {
    const existing = await db.shariaCertification.findUnique({
      where: { id },
      select: { id: true, financierProfileId: true, certificateRef: true },
    })
    if (!existing) throw new FinancingError('Certification not found', 404)
    if (existing.financierProfileId !== profile.id) {
      throw new FinancingError('Financier staff access required', 403)
    }
    try {
      row = await db.shariaCertification.update({ where: { id }, data })
    } catch {
      throw new FinancingError('A certification with that reference already exists', 409)
    }
  } else {
    try {
      row = await db.shariaCertification.create({
        data: { ...data, financierProfileId: profile.id },
      })
    } catch {
      throw new FinancingError('A certification with that reference already exists', 409)
    }
  }

  await recordAudit({
    actorId: staffUserId,
    actorType: 'USER',
    action: 'SHARIA_CERT_SAVED',
    entityType: 'ShariaCertification',
    entityId: row.id,
    summary: `${id ? 'Updated' : 'Recorded'} Sharia certification ${row.certificateRef} (${row.scholarInstitution})`,
    metadata: { financierOrgId, certificateRef: row.certificateRef, expiresAt: row.expiresAt.toISOString() },
  })
  return serializeCert(row)
}

export async function deleteCertification(
  staffUserId: string,
  financierOrgId: string,
  id: string
): Promise<{ ok: true }> {
  await assertCertStaffAccess(staffUserId, financierOrgId)
  const profile = await profileForOrg(financierOrgId)
  const existing = await db.shariaCertification.findUnique({
    where: { id },
    select: { id: true, financierProfileId: true, certificateRef: true, scholarInstitution: true },
  })
  if (!existing) throw new FinancingError('Certification not found', 404)
  if (existing.financierProfileId !== profile.id) {
    throw new FinancingError('Financier staff access required', 403)
  }
  await db.shariaCertification.delete({ where: { id } })
  await recordAudit({
    actorId: staffUserId,
    actorType: 'USER',
    action: 'SHARIA_CERT_DELETED',
    entityType: 'ShariaCertification',
    entityId: id,
    summary: `Deleted Sharia certification ${existing.certificateRef} (${existing.scholarInstitution})`,
    metadata: { financierOrgId, certificateRef: existing.certificateRef },
  })
  return { ok: true }
}
