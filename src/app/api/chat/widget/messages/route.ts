import { NextRequest, NextResponse } from 'next/server'
import { enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { WidgetError, listWidgetMessages } from '@/server/modules/whatsapp/widget'

// GET /api/chat/widget/messages?token=&afterId= — incremental widget poll:
// every message in the session newer than afterId (the widget passes the last
// id it rendered). 404 on an unknown/expired token so the widget can restart.
export async function GET(req: NextRequest) {
  try {
    const token = (req.nextUrl.searchParams.get('token') ?? '').trim()
    if (token.length !== 64) {
      return NextResponse.json({ error: 'A valid chat token is required' }, { status: 400 })
    }
    const afterId = (req.nextUrl.searchParams.get('afterId') ?? '').trim()

    const rl = enforceRateLimit(req, 'chatWidgetPoll', RATE_LIMITS.chatWidgetPoll, token)
    if (rl) return rl

    const messages = await listWidgetMessages(token, afterId)
    return NextResponse.json({ messages })
  } catch (err) {
    if (err instanceof WidgetError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('widget messages GET error', err)
    return NextResponse.json({ error: 'Failed to load the conversation' }, { status: 500 })
  }
}
