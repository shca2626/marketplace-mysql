import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { rollbackChange, SettingsServiceError } from '@/server/modules/settings/service'

// /api/admin/rfq-settings/history/rollback — restore the previous value of a
// logged change (ADMIN only). The rollback itself is logged + audited.

const rollbackSchema = z.object({ changeId: z.string().trim().min(1).max(64) })

export async function POST(req: NextRequest) {
  const { user, error } = await requireAdmin('rfq.settings.manage')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:settings-rollback', { limit: 30, windowMs: 60_000 })
  if (rl) return rl

  try {
    const parsed = rollbackSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'A change to roll back is required' }, { status: 400 })
    }
    const change = await rollbackChange(parsed.data.changeId, user.id)
    return NextResponse.json({ change })
  } catch (err) {
    if (err instanceof SettingsServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('rfq-settings rollback POST error', err)
    return NextResponse.json({ error: 'Failed to roll back change' }, { status: 500 })
  }
}
