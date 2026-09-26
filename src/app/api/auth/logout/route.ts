import { NextRequest, NextResponse } from 'next/server'
import { clearSessionCookie } from '@/lib/auth'
import { assertSameOrigin } from '@/lib/http'

export async function POST(req: NextRequest) {
  // Unsafe method on an auth route — block cross-site logout (CSRF nuisance vector)
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  await clearSessionCookie()
  return NextResponse.json({ ok: true })
}
