import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { listHistory, validateScope, SettingsServiceError } from '@/server/modules/settings/service'

// /api/admin/rfq-settings/history — the settings change log (ADMIN only).
// GET ?key=&scopeType=&scopeId=&limit= → newest-first change rows.

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin('rfq.settings.manage')
  if (error) return error
  try {
    const url = new URL(req.url)
    const key = url.searchParams.get('key') ?? undefined
    const scopeTypeRaw = url.searchParams.get('scopeType')
    const scopeIdRaw = url.searchParams.get('scopeId')
    const limit = Number(url.searchParams.get('limit') ?? 50)
    const scope = scopeTypeRaw ? await validateScope(scopeTypeRaw, scopeIdRaw ?? '') : undefined
    const changes = await listHistory({ key: key || undefined, scope, limit })
    return NextResponse.json({ changes })
  } catch (err) {
    if (err instanceof SettingsServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('rfq-settings history GET error', err)
    return NextResponse.json({ error: 'Failed to load history' }, { status: 500 })
  }
}
