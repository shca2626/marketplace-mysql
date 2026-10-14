import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { financingError, readJson } from '@/lib/financing-api'
import { verifyDocument } from '@/server/modules/financing/documents'

// POST /api/admin/financing/documents/[id]/verify — the platform's
// verify-once verdict on a vault document (body: { status: VERIFIED |
// REJECTED, note? } — REJECTED requires a note).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin('financing.documents.verify')
  if (error) return error

  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const rl = enforceRateLimit(req, 'productWrite', RATE_LIMITS.productWrite, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const body = (await readJson(req)) as { status?: string; verdict?: string; note?: string | null }
    const document = await verifyDocument({ id: user.id, role: user.role }, id, body)
    return NextResponse.json({ document })
  } catch (err) {
    return financingError(err, 'verify the document')
  }
}
