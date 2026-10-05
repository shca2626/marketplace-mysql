import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { waServiceAction, waServiceStatus } from '@/server/modules/whatsapp/send'

// ─────────────────────────────────────────────────────────────────────────────
// /api/whatsapp/session — bridge session passthrough
//   GET  — { session } status (up / connected / phone / since / qr)
//   POST — { action: 'connect' | 'logout' } forwarded to the bridge
// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  const { error } = await requireAdmin('storefront.manage')
  if (error) return error
  const session = await waServiceStatus()
  return NextResponse.json({ session })
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin('storefront.manage')
  if (error) return error
  try {
    const body = (await req.json()) as { action?: string }
    if (body.action !== 'connect' && body.action !== 'logout') {
      return NextResponse.json({ error: 'action must be "connect" or "logout"' }, { status: 400 })
    }
    const result = await waServiceAction(body.action)
    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? 'Bridge action failed' }, { status: 502 })
    }
    return NextResponse.json({ result })
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}
