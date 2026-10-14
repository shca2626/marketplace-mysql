import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { financingError, readJson } from '@/lib/financing-api'
import { replaceDocument } from '@/server/modules/financing/documents'

// POST /api/financing/documents/[id]/replace — the vault's replace flow
// (DP-27): the old version is soft-deleted (isActive=false — history
// preserved) and the new same-type version re-enters verification as
// PENDING. Thin route over the FIN-2 service function (no route existed —
// FIN-6's documents center needs it).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error

  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const rl = enforceRateLimit(req, 'upload', RATE_LIMITS.upload, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const body = (await readJson(req)) as { mediaId: string; documentType?: string; title?: string | null; issuedAt?: string | null; expiresAt?: string | null }
    if (!body?.mediaId) {
      return NextResponse.json({ error: 'mediaId of the new upload is required' }, { status: 400 })
    }
    const document = await replaceDocument(user.id, id, body)
    return NextResponse.json({ document }, { status: 201 })
  } catch (err) {
    return financingError(err, 'replace the document')
  }
}
