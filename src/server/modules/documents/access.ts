import { db } from '@/lib/db'
import { isActiveMembership } from '@/server/membership'
import { userHasPlatformPermission } from '@/server/modules/rbac/service'
import { documentSensitivity, type DocumentSensitivity } from './sensitivity'

// ─────────────────────────────────────────────────────────────────────────────
// Document access resolver — 6.6.3 (least privilege) on the 6.8 matrix.
// ONE resolver, used by EVERY surface that gates vault documents:
//   • POST /api/documents/[id]/access   (URL issuance)
//   • GET  /api/vault/[documentId]      (proxy retrieval — re-checked there)
//   • getAccountDocument service reads
//
// Policy, in order:
//   1. OWNER              — doc.userId === user.id
//   2. PLATFORM_REVIEWER  — RBAC permission financing.documents.verify
//   3. ORG_MEMBER         — active member of doc.organizationId AND the
//                           sensitivity class is ORG_INTERNAL. Identity and
//                           financial evidence NEVER opens to plain members.
//   4. FINANCIER_SCOPE    — staff (OWNER/ADMIN member) of a financier org
//                           that is reviewing a request this document is
//                           attached to (checklist submission or loose
//                           attachment). Mere financier membership is NOT
//                           enough — 6.6.3's review-scope requirement.
// Denied otherwise.
// ─────────────────────────────────────────────────────────────────────────────

export type DocumentAccessBasis = 'OWNER' | 'PLATFORM_REVIEWER' | 'ORG_MEMBER' | 'FINANCIER_SCOPE'

export interface DocumentAccessDecision {
  allowed: boolean
  basis: DocumentAccessBasis | null
  sensitivity: DocumentSensitivity
}

export interface DocumentAccessSubject {
  /** AccountDocument id (needed for financier-scope attachment lookups). */
  id: string
  userId: string
  organizationId: string | null
  documentType: string
}

export async function canAccessAccountDocument(
  userId: string,
  doc: DocumentAccessSubject
): Promise<DocumentAccessDecision> {
  const sensitivity = documentSensitivity(doc.documentType)

  // 1) Owner — always.
  if (doc.userId === userId) {
    return { allowed: true, basis: 'OWNER', sensitivity }
  }

  // 2) Platform staff per permission (RBAC — no legacy ADMIN bypass remains).
  if (await userHasPlatformPermission(userId, 'financing.documents.verify')) {
    return { allowed: true, basis: 'PLATFORM_REVIEWER', sensitivity }
  }

  // 3) Org members — ORG_INTERNAL class only (the member-vs-identity-doc
  //    denial for SENSITIVE_* classes is the 6.10 negative case).
  if (doc.organizationId && (sensitivity === 'ORG_INTERNAL' || sensitivity === 'PUBLIC')) {
    if (await isActiveMembership(userId, doc.organizationId)) {
      return { allowed: true, basis: 'ORG_MEMBER', sensitivity }
    }
  }

  // 4) Financier review scope — the user is OWNER/ADMIN of a financier org
  //    behind a service the document's parent request targets.
  if (await isDocumentInFinancierScope(userId, doc.id)) {
    return { allowed: true, basis: 'FINANCIER_SCOPE', sensitivity }
  }

  return { allowed: false, basis: null, sensitivity }
}

/**
 * Financier-scope predicate (6.6.3): "financier access tied to a specific
 * application or review scope — not mere financier membership".
 *
 * TENANT-AUDIT F-02: the predicate now enforces the R-4 platform gate — only
 * requests the platform actually FORWARDED (forwardedAt set) back a
 * document for the target institution's staff. A DRAFT / never-forwarded
 * request's attachments are the applicant's private material until the
 * platform gate completes. The staff membership check also applies the M2
 * ACTIVE predicate (user + organization ACTIVE) — suspended institutions
 * and suspended staff lose document scope.
 *
 * Resolves the requests the document backs (RequirementSubmission checklist
 * rows + RequestAttachment loose rows), then checks whether any of those
 * requests' FinancierService → FinancierProfile → Organization is one the
 * caller is an OWNER/ADMIN member of.
 */
async function isDocumentInFinancierScope(userId: string, documentId: string): Promise<boolean> {
  const finIds: string[] = []
  const accIds: string[] = []

  const rows = await db.requirementSubmission.findMany({
    where: { accountDocumentId: documentId },
    select: { financingRequestId: true, accreditationRequestId: true },
  })
  for (const r of rows) {
    if (r.financingRequestId) finIds.push(r.financingRequestId)
    if (r.accreditationRequestId) accIds.push(r.accreditationRequestId)
  }

  const attachments = await db.requestAttachment.findMany({
    where: { accountDocumentId: documentId },
    select: { parentType: true, parentId: true },
  })
  for (const a of attachments) {
    if (a.parentType === 'FINANCING_REQUEST') finIds.push(a.parentId)
    else if (a.parentType === 'ACCREDITATION_REQUEST') accIds.push(a.parentId)
  }

  if (finIds.length === 0 && accIds.length === 0) return false

  // Financier orgs behind those requests' services — ONLY for requests the
  // platform gate actually forwarded to the institution (R-4 parity with
  // the request-list boundary in financing/requests.ts).
  const orgIds = new Set<string>()
  if (finIds.length > 0) {
    const reqs = await db.financingRequest.findMany({
      where: { id: { in: finIds }, forwardedAt: { not: null } },
      select: { service: { select: { financierProfile: { select: { organizationId: true } } } } },
    })
    for (const r of reqs) orgIds.add(r.service.financierProfile.organizationId)
  }
  if (accIds.length > 0) {
    const reqs = await db.accreditationRequest.findMany({
      where: { id: { in: accIds }, forwardedAt: { not: null } },
      select: { service: { select: { financierProfile: { select: { organizationId: true } } } } },
    })
    for (const r of reqs) orgIds.add(r.service.financierProfile.organizationId)
  }
  if (orgIds.size === 0) return false

  // Caller must be OWNER/ADMIN of one of those financier orgs (M2 ACTIVE).
  const membership = await db.organizationMember.findFirst({
    where: {
      userId,
      organizationId: { in: [...orgIds] },
      role: { in: ['OWNER', 'ADMIN'] },
      user: { status: 'ACTIVE' },
      organization: { status: 'ACTIVE' },
    },
    select: { id: true },
  })
  return !!membership
}
