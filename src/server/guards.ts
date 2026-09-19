import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'

/**
 * Route-level authorization helpers.
 * Returns the session user, or a ready-to-return error response.
 */

export async function requireUser(): Promise<
  { user: { id: string; role: string; name: string; email: string }; error: null } | { user: null; error: NextResponse }
> {
  const user = await getSessionUser()
  if (!user) {
    return { user: null, error: NextResponse.json({ error: 'Please sign in first' }, { status: 401 }) }
  }
  return { user: { id: user.id, role: user.role, name: user.name, email: user.email }, error: null }
}

export async function requireAdmin(): Promise<
  { user: { id: string; role: string; name: string; email: string }; error: null } | { user: null; error: NextResponse }
> {
  const result = await requireUser()
  if (result.error) return result
  if (result.user!.role !== 'ADMIN') {
    return { user: null, error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) }
  }
  return result
}
