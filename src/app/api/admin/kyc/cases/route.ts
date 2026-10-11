import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/server/guards'
import { enforceRateLimit } from '@/lib/http'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN · KYC CASE QUEUE (Phase 12.4).
//
// GET /api/admin/kyc/cases?status=OPEN|ALL|PENDING|SUBMITTED|APPROVED|REJECTED|PROVIDER_ERROR|MANUAL_QUEUE|CANCELLED
//
// The OPEN filter (default) is the work queue: SUBMITTED (in provider flight),
// PROVIDER_ERROR (failure semantics — the provider leg failed, a human must
// look) and MANUAL_QUEUE (PROVIDER_THEN_MANUAL second look). financing.documents.verify.
// ─────────────────────────────────────────────────────────────────────────────

const OPEN_STATUSES = ['PENDING', 'SUBMITTED', 'PROVIDER_ERROR', 'MANUAL_QUEUE'] as const
const ALL_STATUSES = [...OPEN_STATUSES, 'APPROVED', 'REJECTED', 'CANCELLED'] as const

export async function GET(req: NextRequest) {
  const { user, error } = await requireAdmin('financing.documents.verify')
  if (error) return error
  const rl = enforceRateLimit(req, 'admin:kyc-cases', { limit: 240, windowMs: 60_000 }, user.id)
  if (rl) return rl

  const sp = req.nextUrl.searchParams
  const statusParam = (sp.get('status') ?? 'OPEN').toUpperCase()
  const limit = Math.min(200, Math.max(1, Number(sp.get('limit')) || 100))

  const where =
    statusParam === 'ALL'
      ? {}
      : statusParam === 'OPEN'
        ? { status: { in: [...OPEN_STATUSES] } }
        : ALL_STATUSES.includes(statusParam as (typeof ALL_STATUSES)[number])
          ? { status: statusParam }
          : { status: { in: [...OPEN_STATUSES] } }

  const rows = await db.kycCase.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      document: {
        select: {
          id: true,
          title: true,
          status: true,
          userId: true,
          organizationId: true,
          user: { select: { name: true, email: true } },
        },
      },
      decidedBy: { select: { name: true } },
    },
  })

  return NextResponse.json({
    cases: rows.map((r) => ({
      id: r.id,
      documentId: r.documentId,
      docType: r.docType,
      documentTitle: r.document.title,
      documentStatus: r.document.status,
      ownerName: r.document.user.name,
      ownerEmail: r.document.user.email,
      ownerUserId: r.document.userId,
      organizationId: r.document.organizationId,
      providerKey: r.providerKey,
      status: r.status,
      providerCaseRef: r.providerCaseRef,
      submittedAt: r.submittedAt?.toISOString() ?? null,
      decisionAt: r.decisionAt?.toISOString() ?? null,
      decidedBy: r.decidedBy?.name ?? null,
      errorDetail: r.errorDetail,
      transmittedFields: r.transmittedFields,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    counts: {
      open: await db.kycCase.count({ where: { status: { in: [...OPEN_STATUSES] } } }),
      total: await db.kycCase.count(),
    },
  })
}
