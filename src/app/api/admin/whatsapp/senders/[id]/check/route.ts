import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin } from '@/lib/http'
import {
  checkSenderPairing,
  WhatsAppAdminError,
} from '@/server/modules/whatsapp/admin'

// POST /api/admin/whatsapp/senders/[id]/check — poll live pairing state for one
// sender (the pairing dialog calls this every 3s). Reconciles a stale row when
// the service reports the line connected.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { error } = await requireAdmin('whatsapp.view')
  if (error) return error
  try {
    const { id } = await ctx.params
    const result = await checkSenderPairing(id)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof WhatsAppAdminError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin whatsapp check error', err)
    return NextResponse.json({ error: 'Failed to check pairing status' }, { status: 500 })
  }
}
