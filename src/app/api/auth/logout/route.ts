import { NextRequest, NextResponse } from 'next/server'
import { clearSessionCookie, currentSessionToken, revokeSessionByToken } from '@/lib/auth'
import { assertSameOrigin } from '@/lib/http'

export async function POST(req: NextRequest) {
  // Unsafe method on an auth route — block cross-site logout (CSRF nuisance vector)
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  // Phase 6 (6.7.7): revoke the registry row for THIS session before clearing
  // the cookie — the token dies server-side too, not just in this browser.
  await revokeSessionByToken(await currentSessionToken(), 'LOGOUT')
  await clearSessionCookie()
  return NextResponse.json({ ok: true })
}
