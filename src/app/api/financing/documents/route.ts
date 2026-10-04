import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { financingError, readJson } from '@/lib/financing-api'
import { createDocument, listVault } from '@/server/modules/financing/documents'

// /api/financing/documents — the universal document vault (DP-27: every user
// and organization; verify once, reuse everywhere).
// GET  → my vault (personal docs + docs of organizations I administer).
// POST → file a document against an uploaded MediaAsset (starts PENDING).

export async function GET(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const includeInactive = req.nextUrl.searchParams.get('includeInactive') === 'true'
    const documents = await listVault(user, { includeInactive })
    return NextResponse.json({ documents })
  } catch (err) {
    return financingError(err, 'load your document vault')
  }
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error

  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const rl = enforceRateLimit(req, 'upload', RATE_LIMITS.upload, user.id)
  if (rl) return rl

  try {
    const document = await createDocument(user, await readJson(req))
    return NextResponse.json({ document }, { status: 201 })
  } catch (err) {
    return financingError(err, 'file the document')
  }
}
