import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { getStorefrontSettings, saveStorefrontSettings, getAllSlides } from '@/lib/settings/server'
import { DEFAULT_STOREFRONT_SETTINGS } from '@/lib/settings/schema'

// /api/admin/settings — platform configuration management (ADMIN only).
// GET  → full settings + ALL slides (incl. inactive) for the settings forms.
// PUT  → validate + persist the settings document (zod-strict).

export async function GET() {
  const guard = await requireAdmin('storefront.manage')
  if (guard.error) return guard.error
  try {
    const [settings, slides] = await Promise.all([getStorefrontSettings(), getAllSlides()])
    return NextResponse.json({ settings, slides, defaults: DEFAULT_STOREFRONT_SETTINGS })
  } catch (err) {
    console.error('[api/admin/settings GET] failed', err)
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const guard = await requireAdmin('storefront.manage')
  if (guard.error) return guard.error

  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const rl = enforceRateLimit(req, 'admin:settings', { limit: 20, windowMs: 60_000 })
  if (rl) return rl

  try {
    const body = await req.json()
    const settings = await saveStorefrontSettings(body)
    return NextResponse.json({ settings })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid settings', details: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`) },
        { status: 400 }
      )
    }
    console.error('[api/admin/settings PUT] failed', err)
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }
}
