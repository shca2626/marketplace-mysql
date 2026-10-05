import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { WidgetError, createWidgetSession, widgetSessionSchema } from '@/server/modules/whatsapp/widget'

// POST /api/chat/widget/session — open a webchat session (public). A logged-in
// storefront user's identity is reused; a phone that matches an account links
// the thread to it; everyone else chats as a named visitor. Returns the
// unguessable token the widget keeps polling with.
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const rl = enforceRateLimit(req, 'chatWidgetSession', RATE_LIMITS.chatWidgetSession)
  if (rl) return rl

  try {
    const parsed = widgetSessionSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    // Optional auth — signed-in users get their name/phone/userId on the thread.
    const sessionUser = await getSessionUser()

    const session = await createWidgetSession(
      parsed.data,
      sessionUser ? { id: sessionUser.id, name: sessionUser.name, phone: sessionUser.phone } : null
    )
    return NextResponse.json(session, { status: 201 })
  } catch (err) {
    if (err instanceof WidgetError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('widget session POST error', err)
    return NextResponse.json({ error: 'Failed to start the chat — try again' }, { status: 500 })
  }
}
