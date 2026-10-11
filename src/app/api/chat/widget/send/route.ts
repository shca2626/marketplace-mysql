import { NextRequest, NextResponse } from 'next/server'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { WidgetError, sendWidgetMessage, widgetSendSchema } from '@/server/modules/whatsapp/widget'

// POST /api/chat/widget/send — visitor message (public, rate-limited per
// token). Appends the IN bubble, runs the chatbot auto-reply in-process when
// the thread has auto-reply on, and mirrors the message best-effort to the
// support phone.
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  try {
    const parsed = widgetSendSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const rl = enforceRateLimit(req, 'chatWidgetSend', RATE_LIMITS.chatWidgetSend, parsed.data.token)
    if (rl) return rl

    const result = await sendWidgetMessage(parsed.data.token, parsed.data.body)
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    if (err instanceof WidgetError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('widget send POST error', err)
    return NextResponse.json({ error: 'Failed to send the message — try again' }, { status: 500 })
  }
}
