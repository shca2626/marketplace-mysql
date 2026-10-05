import { NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { listChatThreads } from '@/server/modules/whatsapp/chats'

// GET /api/admin/whatsapp/chats — the unified conversation inbox: WhatsApp
// threads from the paired line + website widget chats, newest activity first.
export async function GET() {
  const { error } = await requireAdmin('whatsapp.manage')
  if (error) return error
  try {
    const { threads, totalUnread } = await listChatThreads()
    return NextResponse.json({ threads, totalUnread })
  } catch (err) {
    console.error('admin whatsapp chats GET error', err)
    return NextResponse.json({ error: 'Failed to load chats' }, { status: 500 })
  }
}
