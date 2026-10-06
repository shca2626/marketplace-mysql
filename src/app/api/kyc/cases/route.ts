import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/server/guards'

// ─────────────────────────────────────────────────────────────────────────────
// USER · MY KYC CASES (Phase 12.4) — the caller's own provider-case status.
//
// GET /api/kyc/cases — every KycCase on documents the caller owns:
// docType, case status, submitted/decision timestamps. This is the buyer-side
// evidence surface for provider processing (the financing documents center
// remains the primary UI — this API is the documented contract).
// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  const { user, error } = await requireUser()
  if (error) return error

  const rows = await db.kycCase.findMany({
    where: { document: { userId: user.id } },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { document: { select: { title: true, status: true } } },
  })

  return NextResponse.json({
    cases: rows.map((r) => ({
      id: r.id,
      docType: r.docType,
      documentTitle: r.document.title,
      documentStatus: r.document.status,
      providerKey: r.providerKey,
      status: r.status,
      submittedAt: r.submittedAt?.toISOString() ?? null,
      decisionAt: r.decisionAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  })
}
