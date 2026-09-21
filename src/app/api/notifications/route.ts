import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { listNotifications } from '@/server/modules/notifications/service'

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limit = Number(req.nextUrl.searchParams.get('limit')) || 20
  const data = await listNotifications(user.id, limit)
  return NextResponse.json(data)
}
