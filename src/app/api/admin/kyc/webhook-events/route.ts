import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/server/guards'
import { enforceRateLimit } from '@/lib/http'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN · KYC WEBHOOK EVENT LOG (Phase 12.4) — the immutable receive log.
//
// GET /api/admin/kyc/webhook-events?limit=100&providerKey=mock
//
// Every delivery attempt lands here (signature-valid or not): eventType,
// signature/replay flags, the raw payload and its case link. The console's
// forensic view. financing.documents.verify.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { user, error } = await requireAdmin('financing.documents.verify')
  if (error) return error
  const rl = enforceRateLimit(req, 'admin:kyc-webhook-events', { limit: 240, windowMs: 60_000 }, user.id)
  if (rl) return rl

  const sp = req.nextUrl.searchParams
  const limit = Math.min(200, Math.max(1, Number(sp.get('limit')) || 100))
  const providerKey = sp.get('providerKey')?.trim() || undefined

  const rows = await db.kycWebhookEvent.findMany({
    where: providerKey ? { providerKey } : {},
    orderBy: { receivedAt: 'desc' },
    take: limit,
    include: { case: { select: { id: true, docType: true, status: true } } },
  })

  return NextResponse.json({
    events: rows.map((r) => ({
      id: r.id,
      eventId: r.eventId,
      providerKey: r.providerKey,
      eventType: r.eventType,
      caseId: r.caseId,
      caseDocType: r.case?.docType ?? null,
      caseStatus: r.case?.status ?? null,
      payload: r.payload,
      signatureValid: r.signatureValid,
      replayed: r.replayed,
      nonce: r.nonce,
      receivedAt: r.receivedAt.toISOString(),
      processedAt: r.processedAt?.toISOString() ?? null,
    })),
    total: await db.kycWebhookEvent.count(providerKey ? { where: { providerKey } } : undefined),
  })
}
