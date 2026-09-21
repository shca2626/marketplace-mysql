import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import {
  getAdminPayload,
  savePanel,
  deleteOverride,
  validateScope,
  SettingsServiceError,
} from '@/server/modules/settings/service'

// /api/admin/rfq-settings — scoped RFQ configuration (ADMIN only).
// GET  ?scopeType=&scopeId= → effective values for a scope + all overrides +
//      the org/category/type pickers.
// PUT  { key, scopeType, scopeId, value } → validate, diff, persist + history.
// DELETE ?key=&scopeType=&scopeId= → remove an override (falls back to broader scope).

function scopeFromQuery(url: URL) {
  return { scopeType: url.searchParams.get('scopeType') ?? 'PLATFORM', scopeId: url.searchParams.get('scopeId') ?? '' }
}

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error
  try {
    const url = new URL(req.url)
    const q = scopeFromQuery(url)
    // A scope type with no target yet is valid for READING: the admin is
    // mid-selection and needs the org/category pickers the payload carries.
    // The form stays disabled until the target is chosen.
    const scope =
      q.scopeType !== 'PLATFORM' && !q.scopeId
        ? { scopeType: q.scopeType as 'PLATFORM', scopeId: '' }
        : await validateScope(q.scopeType, q.scopeId)
    const payload = await getAdminPayload(scope)
    return NextResponse.json(payload)
  } catch (err) {
    if (err instanceof SettingsServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin rfq-settings GET error', err)
    return NextResponse.json({ error: 'Failed to load RFQ settings' }, { status: 500 })
  }
}

const saveSchema = z.object({
  key: z.string().trim().min(1).max(64),
  scopeType: z.enum(['PLATFORM', 'ORG_TYPE', 'ORG', 'CATEGORY', 'REGION']).default('PLATFORM'),
  scopeId: z.string().trim().max(64).default(''),
  value: z.record(z.string(), z.unknown()),
})

export async function PUT(req: NextRequest) {
  const { user, error } = await requireAdmin()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:rfq-settings', { limit: 60, windowMs: 60_000 })
  if (rl) return rl

  try {
    const body = await req.json()
    const parsed = saveSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    const scope = await validateScope(parsed.data.scopeType, parsed.data.scopeId)
    const value = await savePanel({ key: parsed.data.key, scope, value: parsed.data.value, userId: user.id })
    return NextResponse.json({ value })
  } catch (err) {
    if (err instanceof SettingsServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin rfq-settings PUT error', err)
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const { user, error } = await requireAdmin()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  try {
    const url = new URL(req.url)
    const key = url.searchParams.get('key')
    if (!key) return NextResponse.json({ error: 'Missing panel key' }, { status: 400 })
    const scope = await validateScope(url.searchParams.get('scopeType') ?? 'PLATFORM', url.searchParams.get('scopeId') ?? '')
    await deleteOverride(key, scope, user.id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof SettingsServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin rfq-settings DELETE error', err)
    return NextResponse.json({ error: 'Failed to remove override' }, { status: 500 })
  }
}
