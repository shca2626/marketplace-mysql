import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser } from '@/lib/auth'
import { markAllNotificationsRead, markNotificationRead } from '@/server/modules/notifications/service'
import { assertSameOrigin } from '@/lib/http'

const bodySchema = z.union([
  z.object({ id: z.string().min(1) }),
  z.object({ all: z.literal(true) }),
])

export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let parsed: z.infer<typeof bodySchema>
  try {
    parsed = bodySchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'Expected { id } or { all: true }' }, { status: 400 })
  }

  if ('all' in parsed) {
    await markAllNotificationsRead(user.id)
    return NextResponse.json({ ok: true })
  }
  await markNotificationRead(user.id, parsed.id)
  return NextResponse.json({ ok: true })
}
